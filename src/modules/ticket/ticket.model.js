import * as CommonModel from "#shared/models/common.model.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { MODULE_TABLE } from "./ticket.constants.js";
import { customColumns, defaultColumns } from "./ticket.filter.js";

export const getTicketById = (ticketId) => CommonModel.getMasterDetails(MODULE_TABLE, "*", { ticket_id: ticketId });

export const createTicket = (data) => CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });

export const updateTicket = (ticketId, data) => CommonModel.updateMasterDetails({ table: MODULE_TABLE, data, where: { ticket_id: ticketId } });

export const deleteTickets = (ids = []) => CommonModel.deleteMasterDetails({ table: MODULE_TABLE, where: { ticket_id: ids } });

export const changeTicketStatus = (ids = [], status = "Y") => CommonModel.changeMasterStatus(MODULE_TABLE, status, ids);

export const getNextTicketId = () => CommonModel.getNextID(MODULE_TABLE, "ticket_id");

export const getTicketAssigneeStatusSnapshot = (ticketId) =>
  CommonModel.getMasterDetails(MODULE_TABLE, "assignee AS old_assignee, ticket_status AS old_ticket_status, due_date AS old_due_date", { ticket_id: ticketId });

export const getTicketRecord = (ticketId, select = "*") => CommonModel.getSpecificDetails(MODULE_TABLE, select, { ticket_id: ticketId });

export const getAdminName = (adminID) => CommonModel.getSpecificDetails("admin", "name", { adminID });

export const getCustomerAmcFields = (customerId) =>
  CommonModel.getSpecificDetails("customer", "is_amc, amc_start_date, amc_end_date, amc_term_period", { customer_id: customerId });

export const countTickets = ({ where, values, join, other }) =>
  CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });

export const listTickets = ({ select, where, values, join, other, limit, start }) =>
  CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other });

export const getTicketNotificationDetails = async (ticketId) => {
  const filterData = prepareFilterData({ default_columns: defaultColumns, custom_columns: customColumns });
  const { where, values, join, other } = filterData;
  const select = `
    t.ticket_no,
    t.company_id,
    DATE_FORMAT(t.created_date, '%d %M %Y') AS created_date,
    DATE_FORMAT(t.due_date, '%d %M %Y') AS due_date,
    a.name AS assignedTo,
    cs.name AS clientName,
    cs.email,
    cs.mobile_no,
    cs.wa_no,
    cat.categoryName AS ticket_priority,
    ca.categoryName AS ticket_status,
    ct.categoryName AS query_type
  `;

  where.push("ticket_id = ?");
  values.push(ticketId);

  const rows = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other });
  return rows?.[0] || null;
};

export const setTicketFeedbackToken = (ticketId, feedbackToken) =>
  CommonModel.updateMasterDetails({ table: MODULE_TABLE, data: { feedback_token: feedbackToken }, where: { ticket_id: ticketId } });
