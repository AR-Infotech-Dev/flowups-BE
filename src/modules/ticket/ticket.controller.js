import { env } from "#config/env.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { buildTablePayload } from "#shared/utils/tablePayload.js";
import { createFeedbackToken } from "#modules/feedback/feedback.controller.js";
import { hasActiveWorkLog } from "./ticket-work-logs.controller.js";
import { MODULE_TABLE, TICKET_SEARCH_COLUMNS, TICKET_STATUS_CLOSE } from "./ticket.constants.js";
import { customColumns, defaultColumns } from "./ticket.filter.js";
import {
  changeTicketStatus,
  countTickets,
  createTicket,
  deleteTickets,
  getAdminName,
  getNextTicketId,
  getTicketAssigneeStatusSnapshot,
  getTicketById,
  getTicketRecord,
  listTickets,
  setTicketFeedbackToken,
  updateTicket,
} from "./ticket.model.js";
import {
  emitNotification,
  getAssigneeHistoryExistsSql,
  getTicketVisibilitySelect,
  isAdmin,
  isSuperAdmin,
  prepareTicketBody,
  resolveTicketActiveAmc,
  sendEmailToClient,
} from "./ticket.utils.js";
import { ticketValidationRules } from "./ticket.validation.js";

export const list = async (req, res) => {
  try {
    const { viewAll, client_id = null, page = 1, searchText = "", getAll = "N", ticket_status = null, filters = [] } = req.body;
    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;
    const userId = Number(req.user.adminID || 0);
    const effectiveFilters = ticket_status
      ? filters.filter((filter) => filter?.field !== "ticket_status")
      : filters;
    const filterData = prepareFilterData({
      filters: effectiveFilters,
      searchText,
      other: { orderBy: "ticket_id", order: "DESC", searchColumns: TICKET_SEARCH_COLUMNS },
      default_columns: defaultColumns,
      custom_columns: customColumns,
    });
    const { select, where, values, join, other } = filterData;
    const visibilitySelect = getTicketVisibilitySelect(userId);

    if (client_id) {
      where.push("t.client_id = ?");
      values.push(client_id);
    }
    if (ticket_status) {
      where.push("t.ticket_status = ?");
      values.push(ticket_status);
    }

    if (!isSuperAdmin(req.user) && req.user.company_id) {
      where.push("t.company_id = ?");
      values.push(req.user.company_id);
    }

    where.push("t.amc_call = ?");
    values.push("n");
    where.push("t.call_direction = ?");
    values.push("in");

    const shouldFilterByAssignee = !isSuperAdmin(req.user) && !(isAdmin(req.user) && (viewAll === "Y" || getAll === "Y")) && userId;
    if (shouldFilterByAssignee) {
      where.push(`(t.assignee = ? OR t.created_by = ? OR ${getAssigneeHistoryExistsSql(userId, "(h.new_value = ? OR h.old_value = ? OR h.changed_by = ?)")})`);
      values.push(userId, userId, userId, userId, userId);
    }

    const total = await countTickets({ where, values, join, other });
    const totalPages = Math.ceil(total / limit);
    const end = Math.min(start + limit, total);

    const rows = getAll === "Y"
      ? await listTickets({ select: `${select}${visibilitySelect}`, where, values, join, other })
      : await listTickets({ select: `${select}${visibilitySelect}`, where, values, join, other, limit, start });

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

    const data = await buildTablePayload(MODULE_TABLE, {
      ticket_status: Number(req.body.ticket_status),
      modified_by: req.user.adminID,
      modified_date: toMysqlDateTime(),
    });

    await updateTicket(ticket_id, data);

    if (data?.ticket_status && data.ticket_status === Number(TICKET_STATUS_CLOSE)) {
      await closeTicketWithFeedback(ticket_id, data.modified_by);
    }

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

  const nextId = await getNextTicketId();
  const active_amc = await resolveTicketActiveAmc(req.body.client_id);
  const data = await buildTablePayload(MODULE_TABLE, {
    ...prepareTicketBody(req.body),
    active_amc,
    created_by: req.user.adminID,
    created_date: toMysqlDateTime(),
    ticket_no: `TKT-${nextId}`,
    company_id: req.user.company_id,
  });

  const result = await createTicket(data);

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

const notifyTicketUpdates = async (ticket_id, data = {}, oldDetails = {}) => {
  const modifiedBy = await getAdminName(data.modified_by);
  const assignee = data.assignee ? await getAdminName(data.assignee) : null;

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

  if (data?.ticket_status && oldDetails.old_ticket_status !== data.ticket_status && data.ticket_status === TICKET_STATUS_CLOSE) {
    await closeTicketWithFeedback(ticket_id, data.modified_by, data.ticket_no);
  }

  if (data?.due_date && oldDetails.old_due_date !== data.due_date) {
    emitNotification(data.created_by, {
      title: "Ticket Due Date Updated",
      body: `Your ticket #${data.ticket_no} has been change to ${data.due_date}`,
    });

    await sendEmailToClient(ticket_id, "Due Date for your service ticket is changed! ", "We would like to inform you that due date has been changed for your support ticket.");
  }
};

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
