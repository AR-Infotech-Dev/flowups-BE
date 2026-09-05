import { env } from "#config/env.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { buildTablePayload } from "#shared/utils/tablePayload.js";
import { createFeedbackToken } from "#modules/feedback/feedback.controller.js";
import { createCustomerContactIfMissing } from "#modules/customer/customer.model.js";
import { hasActiveWorkLog } from "./amcticket-work-logs.controller.js";
import { MODULE_TABLE, TICKET_SEARCH_COLUMNS, TICKET_STATUS_CLOSE } from "./amcticket.constants.js";
import { customColumns, defaultColumns } from "./amcticket.filter.js";
import {
  changeTicketStatus,
  countTickets,
  createTicket,
  deleteTickets,
  getAdminName,
  getCategoryName,
  getTicketAssigneeStatusSnapshot,
  getTicketById,
  getTicketRecord,
  getTicketVisibilityRows,
  listTickets,
  setTicketFeedbackToken,
  updateTicket,
} from "./amcticket.model.js";
import {
  emitNotification,
  getAssigneeHistoryExistsSql,
  isAdmin,
  isSuperAdmin,
  prepareTicketBody,
  resolveTicketActiveAmc,
  sendEmailToClient,
} from "./amcticket.utils.js";
import { generateTicketNumber } from "./amcticket-number.helper.js";
import { ticketValidationRules } from "./amcticket.validation.js";

export const list = async (req, res) => {
  try {
    const { viewAll, client_id = null, page = 1, order_by = "ticket_id", order = "DESC", searchText = "", getAll = "N", ticket_status = null, filters = [] } = req.body;
    const limit = env.perPage || 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;
    const userId = Number(req.user.adminID || 0);
    const effectiveFilters = ticket_status
      ? filters.filter((filter) => filter?.field !== "ticket_status")
      : filters;
    const filterData = prepareFilterData({
      filters: effectiveFilters,
      searchText,
      other: { orderBy: order_by, order: order, searchColumns: TICKET_SEARCH_COLUMNS },
      default_columns: defaultColumns,
      custom_columns: customColumns,
    });
    const { select, where, values, join, other } = filterData;

    if (client_id) {
      where.push("t.client_id = ?");
      values.push(client_id);
    }
    if (ticket_status) {
      where.push("t.ticket_status = ?");
      values.push(ticket_status);
    }



    if (req.own_db_enabled == "no" && !isSuperAdmin(req.user) && req.user.company_id) {
      where.push("t.company_id = ?");
      values.push(req.user.company_id);
    }

    where.push("t.amc_call = ?");
    values.push("y");
    where.push("t.call_direction = ?");
    values.push("out");

    const shouldFilterByAssignee = !isSuperAdmin(req.user) && !(isAdmin(req.user) && (viewAll === "Y" || getAll === "Y")) && userId;
    if (shouldFilterByAssignee) {
      where.push(`(t.assignee = ? OR t.created_by = ? OR ${getAssigneeHistoryExistsSql(userId, "(h.new_value = ? OR h.old_value = ? OR h.changed_by = ?)")})`);
      values.push(userId, userId, String(userId), String(userId), userId);
    }
    const needsJoinedCount = Boolean(searchText) || effectiveFilters.some((filter) => ['ticket_priority', 'ticket_status', 'query_type', 'assignee', 'client_id', 'company_id', 'modified_by', 'created_by'].includes(filter?.field));
    const total = await countTickets({ where, values, join: needsJoinedCount ? join : [], other });
    const totalPages = Math.ceil(total / limit);
    const end = Math.min(start + limit, total);
    const rows = getAll === "Y"
      ? await listTickets({ select, where, values, join, other })
      : await listTickets({ select, where, values, join, other, limit, start });

    if (shouldFilterByAssignee && rows.length) {
      const historyRows = await getTicketVisibilityRows(rows.map((row) => row.ticket_id), userId);
      const historyByTicket = new Map();
      historyRows.forEach((history) => {
        const list = historyByTicket.get(history.ticket_id) || [];
        list.push(history);
        historyByTicket.set(history.ticket_id, list);
      });

      rows.forEach((row) => {
        const ticketHistory = historyByTicket.get(row.ticket_id) || [];
        const delegated = ticketHistory.some((history) => Number(history.new_value || 0) === userId);
        const reassigned = ticketHistory.some((history) => Number(history.old_value || 0) === userId || Number(history.changed_by || 0) === userId);
        row.delegation_flag = delegated ? "delegated" : reassigned ? "reassigned" : "";
        row.is_delegated = delegated ? "Y" : "N";
        row.is_reassigned = reassigned ? "Y" : "N";
        row.visibility_reason = Number(row.created_by || 0) === userId ? "created" : Number(row.assignee || 0) === userId ? "assigned" : delegated ? "delegated" : reassigned ? "reassigned" : "company";
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: rows,
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
    console.error(error);
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const getTicketDetails = async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const { id: ticket_id = null } = req.params;

    switch (method) {
      case "PUT":
        return await createTicketDetails(req, res);
      case "POST":
        return await updateTicketDetails(req, res, ticket_id);
      case "GET":
        return await readTicketDetails(res, ticket_id);
      default:
        return failureResponse(res, { code: 2000, httpStatus: 405 });
    }
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const changeStatus = async (req, res) => {
  try {
    const { action = "", ids = [], status = "Y" } = req.body;

    switch (action.trim().toLowerCase()) {
      case "delete":
        await deleteTickets(ids);
        return successResponse(res, { code: 1003, httpStatus: 200, data: [] });
      case "changestatus":
        await changeTicketStatus(ids, status);
        return successResponse(res, { code: 1002, httpStatus: 200, data: [] });
      default:
        return failureResponse(res, { code: 2000, httpStatus: 400 });
    }
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id: ticket_id = null } = req.params;
    if (!ticket_id) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const [oldDetails = {}] = await getTicketAssigneeStatusSnapshot(ticket_id);

    const data = await buildTablePayload(MODULE_TABLE, {
      ticket_status: Number(req.body.ticket_status),
      modified_by: req.user.adminID,
      modified_date: toMysqlDateTime(),
    });

    await updateTicket(ticket_id, data);
    await notifyTicketUpdates(ticket_id, data, oldDetails);

    return successResponse(res, { code: 1002, httpStatus: 200, data: [] });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

const createTicketDetails = async (req, res) => {
  const validation = validateBody(req.body, ticketValidationRules);
  if (!validation.isValid) {
    return failureResponse(res, { code: 2001, httpStatus: 400, message: validation.message });
  }

  const shouldSaveContact = req.body.save_contact === true || String(req.body.save_contact || "").toLowerCase() === "true";
  const newContact = shouldSaveContact
    ? {
      ...(req.body.contact_details || {}),
      name: req.body.contact_details?.name || req.body.contact_person || "",
      mobile_no: req.body.contact_details?.mobile_no || req.body.contact_no || "",
    }
    : null;

  if (shouldSaveContact) {
    const mobileNo = String(newContact.mobile_no || "").replace(/\D/g, "");
    if (!String(newContact.name || "").trim()) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Contact name is required to add new contact" });
    }
    if (!/^[0-9]\d{9}$/.test(mobileNo)) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Enter valid 10-digit contact number" });
    }
    if (newContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newContact.email).trim())) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Invalid contact email address" });
    }
    newContact.mobile_no = mobileNo;
  }

  const companyId = req.user.company_id || req.body.company_id || null;
  const ticketNo = await generateTicketNumber({ companyId });
  const active_amc = await resolveTicketActiveAmc(req.body.client_id);
  const data = await buildTablePayload(MODULE_TABLE, {
    ...prepareTicketBody(req.body),
    active_amc,
    created_by: req.user.adminID,
    created_date: toMysqlDateTime(),
    ticket_no: ticketNo,
    company_id: companyId,
  });

  const result = await createTicket(data);

  if (shouldSaveContact) {
    await createCustomerContactIfMissing({
      customerId: data.client_id,
      contact: newContact,
      user: req.user,
    });
  }

  if (data.assignee && Number(data.assignee) !== Number(data.created_by)) {
    emitNotification(data.assignee, {
      title: "New Ticket Assigned created",
      body: `Ticket #${data.ticket_no} has been assigned to you.`,
    });
  }

  await sendEmailToClient(result.insertId, "Your Call is Registered", "Your support ticket has been successfully created. Our team will review it shortly.");

  return successResponse(res, { code: 1001, httpStatus: 201, data: { insertId: result.insertId } });
};

const updateTicketDetails = async (req, res, ticket_id = null) => {
  if (!ticket_id) return failureResponse(res, { code: 2004, httpStatus: 404 });

  const validation = validateBody(req.body, ticketValidationRules);
  if (!validation.isValid) {
    return failureResponse(res, { code: 2001, httpStatus: 400, message: validation.message });
  }

  const active_amc = req.body.client_id ? await resolveTicketActiveAmc(req.body.client_id) : undefined;
  const data = await buildTablePayload(MODULE_TABLE, {
    ...prepareTicketBody(req.body),
    active_amc,
    modified_by: req.user.adminID,
    modified_date: toMysqlDateTime(),
  });

  const [oldDetails = {}] = await getTicketAssigneeStatusSnapshot(ticket_id);

  if (data?.assignee && Number(oldDetails.old_assignee) !== Number(data.assignee)) {
    const activeWorkLog = await hasActiveWorkLog(ticket_id);
    if (activeWorkLog) {
      return failureResponse(res, {
        code: 2000,
        httpStatus: 409,
        message: "Ticket work is already started. End the active work before reassigning.",
      });
    }
  }

  await updateTicket(ticket_id, data);

  await notifyTicketUpdates(ticket_id, data, oldDetails);

  return successResponse(res, { code: 1002, httpStatus: 200, data: [] });
};

const readTicketDetails = async (res, ticket_id = null) => {
  if (!ticket_id) return failureResponse(res, { code: 2004, httpStatus: 404 });

  const details = await getTicketById(ticket_id);
  if (!details.length) return failureResponse(res, { code: 2004, httpStatus: 404 });

  return successResponse(res, { code: 1004, httpStatus: 200, data: { data: details[0] } });
};

export const notifyTicketUpdates = async (ticket_id, data = {}, oldDetails = {}) => {
  const modifiedBy = await getAdminName(data.modified_by);
  const assignee = data.assignee ? await getAdminName(data.assignee) : null;
  const ticket_status_cat = data.ticket_status ? await getCategoryName(data.ticket_status) : null;
  const old_ticket_status_cat = oldDetails.ticket_status ? await getCategoryName(oldDetails.ticket_status) : null;

  if (data?.assignee && Number(oldDetails.old_assignee) !== Number(data.assignee)) {
    emitNotification(data.assignee, {
      title: "New Ticket Assigned",
      body: `Ticket #${data.ticket_no} has been assigned to you by ${modifiedBy?.name || "-"}.`,
    });

    if (Number(data.assignee) !== Number(data.created_by)) {
      emitNotification(data.created_by, {
        title: "New Ticket Assigned",
        body: `Ticket #${data.ticket_no} has been assigned to ${assignee?.name || "-"}. created by you`,
      });
    }

    await sendEmailToClient(ticket_id, "Assignee is Updated", "We would like to inform you that the service engineer for your support ticket has been updated.");
  }
  if (data?.ticket_status && oldDetails.old_ticket_status !== data.ticket_status) {
    if (parseInt(data.ticket_status) === parseInt(TICKET_STATUS_CLOSE)) {
      await closeTicketWithFeedback(ticket_id, data.modified_by, data.ticket_no);
    } else {
      const cb = data.created_by || oldDetails.created_by;
      const tn = data.ticket_no || oldDetails.ticket_no;

      emitNotification(data.created_by || oldDetails.created_by, {
        title: "Ticket Status Changed",
        body: `Ticket #${tn}'s status has been changed by ${modifiedBy?.name || "-"} to ${ticket_status_cat?.name || "-"}.`,
      });

      await sendEmailToClient(ticket_id, "Ticket Status is Changed", "We would like to inform you that the status of your for your support ticket has been updated.");
    }
  }

  if (data?.due_date && oldDetails.old_due_date !== data.due_date) {
    emitNotification(data.created_by, {
      title: "Ticket Due Date Updated",
      body: `Your ticket #${data.ticket_no} has been change to ${data.due_date}`,
    });

    await sendEmailToClient(ticket_id, "Due Date for your service ticket is changed! ", "We would like to inform you that due date has been changed for your support ticket.");
  }
};
// Notification On Ticket Close
const closeTicketWithFeedback = async (ticket_id, modifiedById, ticketNo = "") => {
  const feedbackToken = createFeedbackToken();
  const modifiedBy = await getAdminName(modifiedById);
  const ticket = await getTicketRecord(ticket_id, "*");
  const feedbackUrl = `${env.appFEUrl}/feedback/${ticket_id}/${feedbackToken}`;

  await setTicketFeedbackToken(ticket_id, feedbackToken);

  emitNotification(ticket?.created_by, {
    title: "Ticket Closed",
    body: `Your ticket #${ticketNo || ticket?.ticket_no || ticket_id} has been closed by ${modifiedBy?.name || ""}`,
  });

  await sendEmailToClient(ticket_id, "Ticket is Closed !", "We would like to inform you that your support ticket has been closed.", feedbackUrl);
};








