import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { validateBody } from "../utils/bodyValidator.js";
import { query, DB_PREFIX } from "../config/database.js";
import * as XLSX from "xlsx";
const MODULE_TABLE = "customer";
const isSuperAdmin = (user = {}) => {
  return String(user.role_slug || "").toLowerCase() === "super_admin";
};
const default_columns = {};
const custom_columns = {
  company_id: {
    table: "company_master",
    alias: "dc",
    column: "company_name",
    key2: "company_id",
    select: "",
  },
  created_by: {
    table: "admin",
    alias: "ad",
    column: "name",
    key2: "adminID",
    select: "",
  },
  modified_by: {
    table: "admin",
    alias: "am",
    column: "name",
    key2: "adminID",
    select: "",
  },
};

const customerValidationRules = {
  customer_id: { label: "Customer ID", type: "number" },
  name: { label: "Name", required: true },
  email: { label: "Email", type: "email" },
  mobile_no: { label: "Mobile Number" },
  contact_person: { label: "Contact Person" },
  wa_no: { label: "WhatsApp Number" },
  address: { label: "Address" },
  pan_number: { label: "PAN Number" },
  gst_number: { label: "GST Number" },
  company_id: { label: "Company", type: "number" },
  product_ids: { label: "Products" },
  customer_products: { label: "Customer Products" },
  is_amc: { label: "Is AMC" },
  amc_term_period: { label: "Term Period" },
  amc_start_date: { label: "AMC Start Date", type: "date" },
  amc_end_date: { label: "AMC End Date", type: "date" },
  created_by: { label: "Created By", type: "number" },
  modified_by: { label: "Modified By", type: "number" },
};

// ======================================================
// LIST CUSTOMERS
// ======================================================
export const list = async (req, res) => {
  try {
    const { page = 1, searchText = "", getAll = "N", orderBy = "created_date", order = "DESC", filters = [], } = req.body;
    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: {
        orderBy,
        order,
        searchColumns: [
          "name",
          "email",
          "mobile_no",
          "company_name",
          "pan_number",
        ],
      },
      default_columns,
      custom_columns,
    });

    const { select, where, values, join, other } = filterData;
    other.freeTextSearch = searchText;
    other.searchColumns = ["t.name", "t.email", "t.mobile_no", "t.company_name", "t.pan_number",];

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

        const result = await CommonModel.saveMasterDetails({
          table: MODULE_TABLE,
          data,
        });

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

        const result = await CommonModel.updateMasterDetails({
          table: MODULE_TABLE,
          data,
          where: { customer_id },
        });

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

        const details = await CommonModel.getMasterDetails(
          MODULE_TABLE,
          "*",
          { customer_id }
        );

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

    await CommonModel.deleteMasterDetails({
      table: MODULE_TABLE,
      where: { customer_id: ids },
    });

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
const CUSTOMER_IMPORT_COLUMNS = [
  { label: "Customer Name", key: "name", required: true, sample: "ABC Traders" },
  { label: "Contact Person", key: "contact_person", sample: "Rakesh Dhumal" },
  { label: "Mobile No", key: "mobile_no", required: true, sample: "9876543210" },
  { label: "Email", key: "email", sample: "customer@example.com" },
  { label: "WhatsApp No", key: "wa_no", sample: "9876543210" },
  { label: "PAN Number", key: "pan_number", sample: "ABCDE1234F" },
  { label: "GST Number", key: "gst_number", sample: "27ABCDE1234F1Z5" },
  { label: "Company Name", key: "company_name", sample: "ABC Inc" },
  { label: "Billing Name", key: "billing_name", sample: "ABC Inc" },
  { label: "Address", key: "address", sample: "Pune, Maharashtra" },
  { label: "Billing Address", key: "billing_address", sample: "Pune, Maharashtra" },
  { label: "Mailing Address", key: "mailing_address", sample: "Pune, Maharashtra" },
  { label: "Is AMC", key: "is_amc", sample: "yes" },
  { label: "AMC Term Period", key: "amc_term_period", sample: "yearly" },
  { label: "AMC Start Date", key: "amc_start_date", sample: "2026-04-02" },
  { label: "AMC End Date", key: "amc_end_date", sample: "2027-04-01" },
  { label: "Product IDs", key: "product_ids", sample: "1,2" },
  { label: "Serial Numbers", key: "serial_numbers", sample: "SR-001,SR-002" },
];

const normalizeHeader = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const IMPORT_HEADER_MAP = CUSTOMER_IMPORT_COLUMNS.reduce((map, column) => {
  map[normalizeHeader(column.label)] = column.key;
  map[normalizeHeader(column.key)] = column.key;
  return map;
}, {});

const getCellValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeYesNo = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "y", "1", "true", "amc"].includes(normalized)) return "yes";
  if (["no", "n", "0", "false", "non amc", "non-amc"].includes(normalized)) return "no";
  return normalized || "no";
};

const normalizeTermPeriod = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["4", "4_month", "4month", "4_months"].includes(normalized)) return "4_month";
  if (["6", "6_month", "6month", "6_months"].includes(normalized)) return "6_month";
  if (["year", "yearly", "annual", "1_year"].includes(normalized)) return "yearly";
  return normalized || null;
};

const normalizeImportDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = String(value).trim();
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().split("T")[0];
  return text;
};

const buildCustomerProductsFromImport = (productIdsValue, serialNumbersValue) => {
  const productIds = normalizeProductIds(productIdsValue);
  const serialNumbers = normalizeProductIds(serialNumbersValue);

  return productIds.map((product_id, index) => ({
    product_id,
    product_name: "",
    serial_number: serialNumbers[index] || "",
  }));
};

const rowLooksEmpty = (row = []) => row.every((cell) => getCellValue(cell) === "");

const rowLooksLikeTemplateKeyRow = (data = {}) =>
  String(data.name || "").toLowerCase() === "name" ||
  String(data.mobile_no || "").toLowerCase() === "mobile_no";

const rowLooksLikeSampleRow = (data = {}) =>
  String(data.name || "") === "ABC Traders" &&
  String(data.mobile_no || "") === "9876543210";

const findImportHeaderIndex = (rows = []) =>
  rows.findIndex((row) => {
    const keys = row.map((cell) => IMPORT_HEADER_MAP[normalizeHeader(cell)]).filter(Boolean);
    return keys.includes("name") && keys.includes("mobile_no");
  });

const buildImportDataFromRow = (headers = [], row = []) => {
  const data = {};

  headers.forEach((header, index) => {
    const key = IMPORT_HEADER_MAP[normalizeHeader(header)];
    if (!key) return;
    data[key] = getCellValue(row[index]);
  });

  return data;
};

const buildCustomerPayloadFromImport = (rowData = {}, user = {}) => {
  const customerProducts = buildCustomerProductsFromImport(rowData.product_ids, rowData.serial_numbers);
  const payload = {
    name: rowData.name,
    contact_person: rowData.contact_person || null,
    mobile_no: rowData.mobile_no,
    email: rowData.email || null,
    wa_no: rowData.wa_no || null,
    address: rowData.address || null,
    pan_number: rowData.pan_number || null,
    gst_number: rowData.gst_number || null,
    company_name: rowData.company_name || null,
    billing_name: rowData.billing_name || null,
    billing_address: rowData.billing_address || null,
    mailing_address: rowData.mailing_address || null,
    is_amc: normalizeYesNo(rowData.is_amc),
    amc_term_period: normalizeTermPeriod(rowData.amc_term_period),
    amc_start_date: normalizeImportDate(rowData.amc_start_date),
    amc_end_date: normalizeImportDate(rowData.amc_end_date),
    customer_products: JSON.stringify(customerProducts),
    created_by: user.adminID || null,
    company_id: user.company_id || rowData.company_id || null,
    created_date: toMysqlDateTime(),
  };

  if (payload.is_amc !== "yes") {
    payload.amc_term_period = null;
    payload.amc_start_date = null;
    payload.amc_end_date = null;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === "") payload[key] = null;
  });

  return payload;
};

const getCustomerTableColumns = async () => {
  const rows = await query(`SHOW COLUMNS FROM ${DB_PREFIX}${MODULE_TABLE}`);
  return new Set(rows.map((row) => row.Field));
};

const filterPayloadByColumns = (payload = {}, columns = new Set()) =>
  Object.entries(payload).reduce((data, [key, value]) => {
    if (columns.has(key)) {
      data[key] = value;
    }
    return data;
  }, {});
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

      const insertPayload = filterPayloadByColumns(payload, tableColumns);

      await CommonModel.saveMasterDetails({
        table: MODULE_TABLE,
        data: insertPayload,
      });

      inserted += 1;
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

const normalizeProductIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeCustomerProducts = (value) => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeCustomerProducts(parsed);
    } catch {
      return normalizeProductIds(value).map((product_id) => ({ product_id, serial_number: "" }));
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return {
            product_id: item.product_id,
            product_name: item.product_name || "",
            serial_number: item.serial_number || "",
          };
        }

        return {
          product_id: item,
          product_name: "",
          serial_number: "",
        };
      })
      .filter((item) => item.product_id);
  }

  return [];
};

const parseCustomerProducts = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

