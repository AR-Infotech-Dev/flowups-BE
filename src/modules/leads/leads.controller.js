import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { buildTablePayload } from "#shared/utils/tablePayload.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { isSuperAdminRole } from "#shared/utils/role.utils.js";
import { env } from "#config/env.js";
import { customColumns, defaultColumns, LEAD_SEARCH_COLUMNS, MODULE_TABLE } from "./leads.constants.js";
import { createLead, deleteLeads, getLeadById, updateLead } from "./leads.model.js";
import { leadValidationRules, validateLeadEnums } from "./leads.utils.js";

export const list = async (req, res) => {
  try {
    const { page = 1, searchText = "", order_by = "created_date", order = "DESC", filters = [] } = req.body;
    const limit = env.perPage, currentPage = Number(page) || 1, start = (currentPage - 1) * limit;
    const filterData = prepareFilterData({ filters, searchText, other: { orderBy: order_by, order, searchColumns: LEAD_SEARCH_COLUMNS }, default_columns: defaultColumns, custom_columns: customColumns });
    const { select, where, values, join, other } = filterData;
    other.freeTextSearch = searchText; other.searchColumns = LEAD_SEARCH_COLUMNS;
    if (!isSuperAdminRole(req.user) && req.user.company_id) { where.push("t.company_id = ?"); values.push(req.user.company_id); }
    const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });
    const rows = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other });
    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: rows, pagination: { total, page: currentPage, limit, totalPages: Math.ceil(total / limit), start: total ? start + 1 : 0, end: Math.min(start + limit, total) } } });
  } catch (error) { return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message }); }
};

const validateLead = (body) => {
  const result = validateBody(body, leadValidationRules);
  if (!result.isValid) return result;
  const message = validateLeadEnums(result.data);
  return message ? { isValid: false, message, data: {} } : result;
};

export const create = async (req, res) => {
  try {
    const validation = validateLead(req.body);
    if (!validation.isValid) return failureResponse(res, { code: 2001, httpStatus: 400, message: validation.message });
    const data = await buildTablePayload(MODULE_TABLE, { ...validation.data, lead_source: validation.data.lead_source || "call", lead_status: validation.data.lead_status || "new", status: validation.data.status || "active", company_id: req.user.company_id || null, created_by: req.user.adminID, created_date: toMysqlDateTime() });
    const result = await createLead(data);
    return successResponse(res, { code: 1001, httpStatus: 201, data: { lead_id: result.insertId, insertId: result.insertId } });
  } catch (error) { return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message }); }
};

export const read = async (req, res) => {
  try {
    const rows = await getLeadById(req.params.id);
    if (!rows.length) return failureResponse(res, { code: 2004, httpStatus: 404 });
    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: rows[0] } });
  } catch (error) { return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message }); }
};

export const update = async (req, res) => {
  try {
    const leadId = req.params.id;
    if (!leadId) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const validation = validateLead(req.body);
    if (!validation.isValid) return failureResponse(res, { code: 2001, httpStatus: 400, message: validation.message });
    const data = await buildTablePayload(MODULE_TABLE, { ...validation.data, modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    const result = await updateLead(leadId, data);
    if (!result.affectedRows) return failureResponse(res, { code: 2004, httpStatus: 404 });
    return successResponse(res, { code: 1002, httpStatus: 200, data: { lead_id: Number(leadId) } });
  } catch (error) { return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message }); }
};

export const remove = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Select at least one lead" });
    await deleteLeads(ids);
    return successResponse(res, { code: 1003, httpStatus: 200, data: { ids } });
  } catch (error) { return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message }); }
};
