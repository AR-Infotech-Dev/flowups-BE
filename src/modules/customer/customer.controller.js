import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_SEARCH_COLUMNS, MODULE_TABLE } from "./customer.constants.js";
import { customColumns, defaultColumns } from "./customer.filter.js";
import { customerValidationRules } from "./customer.validation.js";
import {
  createCustomer,
  createCustomersBulk,
  deleteCustomers,
  findExistingCustomerDuplicateKeys,
  getCustomerById,
  getCustomerTableColumns,
  updateCustomer,
} from "./customer.model.js";
import {
  buildCustomerPayloadFromImport,
  buildImportDataFromRow,
  filterPayloadByColumns,
  findImportHeaderIndex,
  isSuperAdmin,
  normalizeCustomerProducts,
  parseCustomerProducts,
  rowLooksEmpty,
  rowLooksLikeSampleRow,
  rowLooksLikeTemplateKeyRow,
} from "./customer.utils.js";
import * as XLSX from "xlsx";

const buildCustomerDuplicateKey = ({ name = "", email = "", company_id = null } = {}) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedName || !normalizedEmail) {
    return "";
  }

  return `${company_id ?? "no-company"}::${normalizedName}::${normalizedEmail}`;
};

// ======================================================
// LIST CUSTOMERS
// ======================================================
export const list = async (req, res) => {
  try {
    const { page = 1, searchText = "", getAll = "N", order_by = "created_date", order = "DESC", filters = [], } = req.body;
    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: {
        orderBy : order_by,
        order,
        searchColumns: CUSTOMER_SEARCH_COLUMNS,
      },
      default_columns: defaultColumns,
      custom_columns: customColumns,
    });

    const { select, where, values, join, other } = filterData;
    other.freeTextSearch = searchText;
    other.searchColumns = CUSTOMER_SEARCH_COLUMNS;

    // FILTER DATA ACCORDING TO COMPANY ID
    if (!isSuperAdmin(req.user) && req.user.company_id) {
      where.push("t.company_id = ?");
      values.push(req.user.company_id);
    }

    const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other, });
    const totalPages = Math.ceil(total / limit);
    const end = Math.min(start + limit, total);
    let customerDetails = [];

    if (getAll === "Y") {
      customerDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other, });
    } else {
      customerDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other, });
    }
    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: customerDetails,
        pagination: {
          total,
          page: currentPage,
          limit,
          totalPages,
          start: total === 0 ? 0 : start + 1,
          end,
        },
      },
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// ======================================================
// CREATE / UPDATE / GET SINGLE
// ======================================================
export const getCustomerDetails = async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const { id: customer_id = null } = req.params;

    switch (method) {
      case "PUT": {
        const validation = validateBody(req.body, customerValidationRules);
        if (!validation.isValid) {
          return failureResponse(res, {
            code: 2001,
            httpStatus: 400,
            message: validation.message,
          });
        }

        const data = validation.data;
        delete data.product_ids;
        data.customer_products = JSON.stringify(normalizeCustomerProducts(req.body.customer_products ?? req.body.product_ids));
        data.created_by = req.user.adminID;
        data.company_id = req.user.company_id;
        data.created_date = toMysqlDateTime();

        const result = await createCustomer(data);

        return successResponse(res, {
          code: 1001,
          httpStatus: 201,
          data: {
            insertId: result.insertId,
          },
        });
      }

      case "POST": {
        if (!customer_id) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        const validation = validateBody(req.body, customerValidationRules);
        if (!validation.isValid) {
          return failureResponse(res, {
            code: 2001,
            httpStatus: 400,
            message: validation.message,
          });
        }

        const data = validation.data;
        delete data.customer_id;
        delete data.product_ids;
        data.customer_products = JSON.stringify(normalizeCustomerProducts(req.body.customer_products ?? req.body.product_ids));
        delete data.created_by;
        data.modified_by = req.user.adminID;

        const result = await updateCustomer(customer_id, data);

        if (!result.affectedRows) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        return successResponse(res, {
          code: 1002,
          httpStatus: 200,
          data: [],
        });
      }

      case "GET": {
        if (!customer_id) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        const details = await getCustomerById(customer_id);

        if (!details.length) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        const customerData = details[0];
        const products = parseCustomerProducts(customerData.customer_products);
        customerData.product_ids = products.map((product) => product.product_id);
        customerData.customer_products = products;
        customerData.products = products;

        return successResponse(res, {
          code: 1004,
          httpStatus: 200,
          data: {
            data: customerData,
          },
        });
      }

      default:
        return failureResponse(res, {
          code: 2000,
          httpStatus: 405,
        });
    }
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// ======================================================
// DELETE
// ======================================================
export const changeStatus = async (req, res) => {
  try {
    const { action = "", ids = [] } = req.body;

    if (action.trim().toLowerCase() !== "delete") {
      return failureResponse(res, {
        code: 2000,
        httpStatus: 400,
        message: "Invalid action",
      });
    }

    if (!Array.isArray(ids) || !ids.length) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "ids are required",
      });
    }

    await deleteCustomers(ids);

    return successResponse(res, {
      code: 1003,
      httpStatus: 200,
      data: [],
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// ======================================================
// CUSTOMER IMPORT TEMPLATE
// ======================================================
export const downloadImportTemplate = async (req, res) => {
  try {
    const headerRow = CUSTOMER_IMPORT_COLUMNS.map((column) => `${column.label}${column.required ? " *" : ""}`);
    const keyRow = CUSTOMER_IMPORT_COLUMNS.map((column) => column.key);
    const sampleRow = CUSTOMER_IMPORT_COLUMNS.map((column) => column.sample || "");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Customer Import Template"],
      ["Required columns are marked with *. Keep the header row unchanged."],
      headerRow,
      keyRow,
      sampleRow,
    ]);

    sheet["!cols"] = CUSTOMER_IMPORT_COLUMNS.map(() => ({ wch: 22 }));
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: CUSTOMER_IMPORT_COLUMNS.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: CUSTOMER_IMPORT_COLUMNS.length - 1 } },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=customer-import-template.xlsx");
    return res.send(buffer);
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
// ======================================================
// IMPORT CUSTOMERS
// ======================================================
export const importCustomers = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Customer Excel file is required",
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;

    if (!sheet) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Excel sheet not found",
      });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const headerIndex = findImportHeaderIndex(rows);

    if (headerIndex === -1) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Template header not found. Please use the customer import template.",
      });
    }

    const headers = rows[headerIndex];
    const tableColumns = await getCustomerTableColumns();
    const errors = [];
    const validRows = [];
    const importDuplicateKeys = new Set();
    let inserted = 0;
    let skipped = 0;

    for (let index = headerIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;

      if (rowLooksEmpty(row)) {
        continue;
      }

      const rowData = buildImportDataFromRow(headers, row);

      if (rowLooksLikeTemplateKeyRow(rowData) || rowLooksLikeSampleRow(rowData)) {
        skipped += 1;
        continue;
      }

      if (!rowData.name || !rowData.mobile_no) {
        skipped += 1;
        errors.push({ row: rowNumber, message: "Customer Name and Mobile No are required" });
        continue;
      }

      const payload = buildCustomerPayloadFromImport(rowData, req.user);
      const validation = validateBody(payload, customerValidationRules);

      if (!validation.isValid) {
        skipped += 1;
        errors.push({ row: rowNumber, message: validation.message });
        continue;
      }

      validRows.push({
        rowNumber,
        payload,
      });
    }

    const existingDuplicateKeys = await findExistingCustomerDuplicateKeys(validRows.map((row) => row.payload));
    const rowsToInsert = [];

    validRows.forEach(({ rowNumber, payload }) => {
      const duplicateKey = buildCustomerDuplicateKey(payload);
      if (duplicateKey) {
        if (importDuplicateKeys.has(duplicateKey)) {
          skipped += 1;
          errors.push({ row: rowNumber, message: "Duplicate customer skipped from import file. Same Customer Name and Email already exists in this file." });
          return;
        }

        if (existingDuplicateKeys.has(duplicateKey)) {
          skipped += 1;
          errors.push({ row: rowNumber, message: "Duplicate customer skipped. Same Customer Name and Email already exists." });
          return;
        }

        importDuplicateKeys.add(duplicateKey);
      }

      const insertPayload = filterPayloadByColumns(payload, tableColumns);
      rowsToInsert.push(insertPayload);
    });

    if (rowsToInsert.length) {
      inserted = await createCustomersBulk(rowsToInsert);
    }

    return successResponse(res, {
      code: 1001,
      httpStatus: 200,
      message: inserted ? "Customers imported successfully." : "No customers imported.",
      data: {
        inserted,
        skipped,
        errors,
      },
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
