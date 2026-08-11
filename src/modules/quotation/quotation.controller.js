import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { customColumns, defaultColumns, QUOTATION_SEARCH_COLUMNS, MODULE_TABLE } from "./quotation.filter.js";
import {
  buildQuotationNumber,
  calculateQuotationTotals,
  prepareQuotationLines,
  quotationValidationRules,
  validateQuotationLines,
} from "./quotation.utils.js";
import {
  createQuotationDetails,
  createQuotationLines,
  deleteQuotationDetails,
  deleteQuotationLines,
  getNextQuotationId,
  getQuotationDetails,
  getQuotationLines,
  replaceQuotationLines,
  updateQuotationDetails,
} from "./quotation.model.js";
import { env } from "#config/env.js";
import { isSuperAdminRole } from "#shared/utils/role.utils.js";
import { createLead, updateLead } from "#modules/leads/leads.model.js";

const getLeadStatusFromQuotation = (quotationStatus) => {
  if (quotationStatus === "draft") return "new";
  if (quotationStatus === "sent") return "quotation_sent";
  return null;
};

const resolveQuotationLead = async ({ data, lines, user, existingLeadId = null }) => {
  if (data.lead_id || existingLeadId) return data.lead_id || existingLeadId;
  if (!data.customer_id) return null;

  const customerRows = await CommonModel.getMasterDetails("customer", "*", { customer_id: data.customer_id });
  const customer = customerRows[0];
  if (!customer) return null;

  const result = await createLead({
    customer_id: customer.customer_id,
    company_id: user.company_id,
    name: customer.name,
    company_name: customer.company_name || null,
    contact_person: customer.contact_person || null,
    mobile_no: customer.mobile_no || "",
    email: customer.email || null,
    requirement: lines.map((line) => line.product_name).filter(Boolean).join(", "),
    lead_source: "call",
    lead_status: getLeadStatusFromQuotation(data.quotation_status) || "new",
    status: "active",
    created_by: user.adminID,
    created_date: toMysqlDateTime(),
  });
  return result.insertId;
};


// ======================================================
// LIST CUSTOMERS
// ======================================================
export const list = async (req, res) => {
  try {
    const { page = 1, searchText = "", getAll = "N", order_by = "created_date", order = "DESC", filters = [], } = req.body;
    const limit = env.perPage;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: {
        orderBy: order_by,
        order,
        searchColumns: QUOTATION_SEARCH_COLUMNS,
      },
      default_columns: defaultColumns,
      custom_columns: customColumns,
    });

    const { select, where, values, join, other } = filterData;
    console.log(' select : ',select);
    
    other.freeTextSearch = searchText;
    other.searchColumns = QUOTATION_SEARCH_COLUMNS;

    // FILTER DATA ACCORDING TO COMPANY ID
    if (!isSuperAdminRole(req.user) && req.user.company_id) {
      where.push("t.company_id = ?");
      values.push(req.user.company_id);
    }

    const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other, });
    const totalPages = Math.ceil(total / limit);
    const end = Math.min(start + limit, total);
    const quotationList = getAll === "Y"
      ? await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other, })
      : await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other, });


    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: quotationList,
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
export const create = async (req, res) => {
  let createdQuotationId = null;

  try {
    const validation = validateBody(req.body, quotationValidationRules);
    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }
    const data = validation.data;
    if (!data.customer_id && !data.lead_id) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Customer or lead is required" });
    }
    const preparedLines = prepareQuotationLines(req.body.items);
    const lineValidationError = validateQuotationLines(preparedLines);
    if (lineValidationError) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: lineValidationError,
      });
    }

    const nextQuotationId = await getNextQuotationId();
    const totals = calculateQuotationTotals(preparedLines);
    const leadId = await resolveQuotationLead({ data, lines: preparedLines, user: req.user });
    if (!leadId) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer or lead not found" });
    const details = {
      ...data,
      ...totals,
      lead_id: leadId,
      quotation_no: buildQuotationNumber(nextQuotationId),
      quotation_status: data.quotation_status || "draft",
      company_id: req.user.company_id,
      created_by: req.user.adminID,
      created_date: toMysqlDateTime(),
    };

    const detailsResult = await createQuotationDetails(details);
    createdQuotationId = detailsResult.insertId;
    const lines = preparedLines.map(({ gross, discount, ...line }) => line);
    await createQuotationLines(createdQuotationId, lines);
    const leadStatus = getLeadStatusFromQuotation(details.quotation_status);
    if (leadStatus) {
      await updateLead(leadId, { lead_status: leadStatus, modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    }

    return successResponse(res, {
      code: 1001,
      httpStatus: 201,
      data: {
        quotation_id: createdQuotationId,
        quotation_no: details.quotation_no,
      },
    });
  } catch (error) {
    if (createdQuotationId) {
      try {
        await deleteQuotationLines(createdQuotationId);
        await deleteQuotationDetails(createdQuotationId);
      } catch (cleanupError) {
        console.error("Unable to clean up incomplete quotation", cleanupError);
      }
    }

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
export const read = async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const { id: quotation_id = null } = req.params;
    if (!quotation_id) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }
    
    const details = await getQuotationDetails(quotation_id);

    if (!details.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const quotationData = details[0];
    const items = await getQuotationLines(quotation_id);

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          ...quotationData,
          items,
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
export const update = async (req, res) => {
  try {
    const { id: quotation_id = null } = req.params;
    if (!quotation_id) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const existingDetails = await getQuotationDetails(quotation_id);
    if (!existingDetails.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const validation = validateBody(req.body, quotationValidationRules);
    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }

    if (!validation.data.customer_id && !validation.data.lead_id && !existingDetails[0].lead_id) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Customer or lead is required" });
    }

    const preparedLines = prepareQuotationLines(req.body.items);
    const lineValidationError = validateQuotationLines(preparedLines);
    if (lineValidationError) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: lineValidationError,
      });
    }

    const totals = calculateQuotationTotals(preparedLines);
    const leadId = await resolveQuotationLead({ data: validation.data, lines: preparedLines, user: req.user, existingLeadId: existingDetails[0].lead_id });
    const details = {
      ...validation.data,
      ...totals,
      lead_id: leadId,
      quotation_status: validation.data.quotation_status || existingDetails[0].quotation_status,
      modified_by: req.user.adminID,
      modified_date: toMysqlDateTime(),
    };
    const lines = preparedLines.map(({ gross, discount, ...line }) => line);

    await updateQuotationDetails(quotation_id, details);
    await replaceQuotationLines(quotation_id, lines);
    const leadStatus = getLeadStatusFromQuotation(details.quotation_status);
    if (leadId && leadStatus) {
      await updateLead(leadId, { lead_status: leadStatus, modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    }

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      data: {
        quotation_id: Number(quotation_id),
        quotation_no: existingDetails[0].quotation_no,
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
