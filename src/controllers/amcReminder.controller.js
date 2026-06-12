import { DB_PREFIX, query } from "../config/database.js";
import * as CommonModel from "../models/common.model.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { sendEmail } from "../utils/email.js";
import { renderTemplate } from "../utils/templateMaker.js"
import { env } from "../config/env.js";
import crypto from "crypto";
import {
  buildExcelAttachment,
  buildSheetSpacerRow,
  buildSideBySideRows,
  excelFormat
} from "../utils/excel.utils.js";

const LIMIT = 10;
const createVisitToken = () => {
  return crypto.randomBytes(32).toString("hex");
};
const isSuperAdmin = (user = {}) => String(user.role_slug || "").toLowerCase() === "super_admin";
const isAdmin = (user = {}) => String(user.role_slug || "").toLowerCase() === "admin";

const MODULE_TABLE = "tickets";
const DEFAULT_TICKET_STATUS_OPEN = 205;
const DEFAULT_TICKET_STATUS_CLOSE = 208;

const normalizeOrderBy = (value = "remaining_call_count") => {
  const allowed = new Set([
    "name",
    "email",
    "mobile_no",
    "company_name",
    "amc_start_date",
    "amc_end_date",
    "support_call_count",
    "exp_call_count",
    "expected_call_count",
    "done_amc_call_count",
    "remaining_call_count",
    "amc_ticket_count",
    "amc_visit_scheduled_count",
    "amc_visited_count",
    "last_reminder_sent_at",
    "reminder_count",
  ]);

  return allowed.has(String(value)) ? String(value) : "remaining_call_count";
};
const normalizeOrder = (value = "DESC") => String(value).toUpperCase() === "ASC" ? "ASC" : "DESC";
const normalizeTicketAddOns = (value = []) => {
  if (typeof value === "string") {
    try {
      return normalizeTicketAddOns(JSON.parse(value));
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "object" && item !== null) {
        return String(item.name || item.add_on_name || item.label || item.value || "").trim();
      }

      return String(item || "").trim();
    })
    .filter(Boolean);
};
const prepareTicketBody = (source = {}) => ({
  ...source,
  ...(Object.prototype.hasOwnProperty.call(source, "product_add_ons")
    ? { product_add_ons: JSON.stringify(normalizeTicketAddOns(source.product_add_ons)) }
    : {}),
});
const formatDate = (value = null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const ensureReminderTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS ${DB_PREFIX}amc_reminder_logs (
      reminder_id INT NOT NULL AUTO_INCREMENT,
      customer_id INT NOT NULL,
      company_id INT NULL,
      sent_by INT NULL,
      sent_at DATETIME NOT NULL,
      include_report ENUM('yes','no') NOT NULL DEFAULT 'no',
      recipient_email VARCHAR(255) NULL,
      email_subject VARCHAR(255) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'sent',
      error_message TEXT NULL,
      PRIMARY KEY (reminder_id),
      INDEX idx_amc_reminder_customer (customer_id),
      INDEX idx_amc_reminder_sent_at (sent_at)
    )
  `);
};
const buildBaseWhere = ({ user = {}, searchText = "", filters = [] } = {}) => {
  const where = ["c.is_amc = 'yes'"];
  const values = [];
  const having = [];
  const havingValues = [];

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("c.company_id = ?");
    values.push(user.company_id);
  }

  if (!isAdmin(user) && !isSuperAdmin(user)) {
    where.push("c.responsible_person = ?");

    values.push(user.adminID);
  }

  if (searchText) {
    where.push("(c.name LIKE ? OR c.email LIKE ? OR c.mobile_no LIKE ? OR c.company_name LIKE ?)");
    values.push(`%${searchText}%`, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`);
  }

  filters.forEach(({ field, condition, value }) => {
    const columnMap = {
      name: "c.name",
      email: "c.email",
      mobile_no: "c.mobile_no",
      company_name: "c.company_name",
      amc_end_date: "c.amc_end_date",
      exp_call_count: "c.exp_call_count",
      expected_call_count: "c.exp_call_count",
    };
    const countColumnMap = {
      done_amc_call_count: "COALESCE(ac.done_amc_call_count, 0)",
      remaining_call_count: "GREATEST(COALESCE(c.exp_call_count, 0) - COALESCE(ac.done_amc_call_count, 0), 0)",
      amc_ticket_count: "COALESCE(atc.amc_ticket_count, 0)",
      amc_visit_scheduled_count: "COALESCE(avc.amc_visit_scheduled_count, 0)",
      amc_visited_count: "COALESCE(avc.amc_visited_count, 0)",
    };
    const column = columnMap[field];
    const countColumn = countColumnMap[field];
    if (!column && !countColumn) return;

    switch (condition) {
      case "equal_to":
        if (value === undefined || value === null || value === "") return;
        if (countColumn) {
          having.push(`${countColumn} = ?`);
          havingValues.push(value);
        } else {
          where.push(`${column} = ?`);
          values.push(value);
        }
        break;
      case "contains":
      case "is_in":
        if (value === undefined || value === null || value === "") return;
        if (countColumn) {
          having.push(`CAST(${countColumn} AS CHAR) LIKE ?`);
          havingValues.push(`%${value}%`);
        } else {
          where.push(`${column} LIKE ?`);
          values.push(`%${value}%`);
        }
        break;
      case "date_range": {
        const dates = String(value || "").split("/");
        if (dates.length === 2) {
          where.push(`DATE(${column}) BETWEEN ? AND ?`);
          values.push(dates[0], dates[1]);
        }
        break;
      }
      default:
        break;
    }
  });

  return { where, values, having, havingValues };
};
const getSupportCallRows = async (customerId, amcStartDate, amcEndDate) => {
  const where = ["t.client_id = ?"];
  const values = [customerId];

  if (amcStartDate && amcEndDate) {
    where.push("DATE(t.created_date) BETWEEN DATE(?) AND DATE(?)");
    values.push(amcStartDate, amcEndDate);
  }
  return query(
    `
      SELECT
        t.ticket_no,
        t.ticket_status AS ticket_status_id,
        DATE_FORMAT(t.created_date, '%d %M %Y') AS created_date,
        DATE_FORMAT(t.due_date, '%d %M %Y') AS due_date,
        qt.categoryName AS query_type,
        ts.categoryName AS ticket_status,
        tp.categoryName AS ticket_priority,
        a.name AS assignee,
        t.description
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}categories qt ON t.query_type = qt.category_id
      LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
      LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
      LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
      WHERE ${where.join(" AND ")}
      ORDER BY t.created_date ASC
    `,
    values
  );
};
const getTicket = async (ticketId = null) => {
  if (!ticketId) return null;
  return await CommonModel.getSpecificDetails(
    "tickets",
    "ticket_id, ticket_no, client_id, assignee, company_id, created_by, status",
    { ticket_id: ticketId }
  );
};
const buildReportAttachment = async (customer = {}, supportRows = []) => {
  const isResolvedStatus = (row = {}) => {
    const statusId = String(row.ticket_status_id || "").trim();
    const statusName = String(row.ticket_status || "").trim().toLowerCase();
    return (
      statusId === "208" ||
      statusName.includes("resolve") ||
      statusName.includes("closed") ||
      statusName.includes("complete")
    );
  };
  const spreadsheetColumnCount = 10;
  const totalCalls = supportRows.length;
  const resolvedCalls = supportRows.filter(isResolvedStatus).length;
  const pendingCalls = Math.max(0, totalCalls - resolvedCalls);
  const htmlBody = await renderTemplate(
    "amcSupport",
    "excel",
    {
      spreadsheetColumnCount,
      customerName: customer.name || "-",
      spacerRow1: await buildSheetSpacerRow(18, spreadsheetColumnCount),
      spacerRow2: await buildSheetSpacerRow(28, spreadsheetColumnCount),
      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: {
          total_calls: totalCalls,
          resolved_calls: resolvedCalls,
          pending_calls: pendingCalls,
        },
        rightTitle: "Report Details",
        rightData: {
          customer: customer.name || "-",
          amc_start_date: formatDate(customer.amc_start_date),
          amc_expiry_date: formatDate(customer.amc_end_date),
          generated_on: formatDate(new Date()),
        },
        gapCols: 2,
        labelColspan: 2,
        valueColspan: 2,
      }),
      hasSupportRows: supportRows.length > 0,
      supportRows: supportRows.map(
        (row, index) => ({
          srNo: index + 1,
          ticket_no: row.ticket_no || "-",
          created_date: row.created_date || "-",
          due_date: row.due_date || "-",
          query_type: row.query_type || "-",
          ticket_status: row.ticket_status || "-",
          ticket_priority: row.ticket_priority || "-",
          assignee: row.assignee || "-",
          statusClass: isResolvedStatus(row)
            ? "excel-status-closed"
            : "excel-status-open",
        })
      ),
    }
  );
  const html = await excelFormat(htmlBody);
  return buildExcelAttachment({
    filename: `AMC-Support-Report-${customer.name || "customer"}.xls`,
    html: html,
  });
};
const insertReminderLog = async ({ customer, user, includeReport, subject, status = "sent", errorMessage = null }) => {
  await query(
    `
      INSERT INTO ${DB_PREFIX}amc_reminder_logs
      (customer_id, company_id, sent_by, sent_at, include_report, recipient_email, email_subject, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      customer.customer_id,
      customer.company_id || user.company_id || null,
      user.adminID || null,
      toMysqlDateTime(),
      includeReport ? "yes" : "no",
      customer.email || "",
      subject,
      status,
      errorMessage,
    ]
  );
};
const hasReminderSentToday = async (customerId) => {
  const rows = await query(
    `
      SELECT reminder_id
      FROM ${DB_PREFIX}amc_reminder_logs
      WHERE customer_id = ?
        AND status = 'sent'
        AND DATE(sent_at) = CURDATE()
      LIMIT 1
    `,
    [customerId]
  );

  return rows.length > 0;
};
const notifyVisitScheduled = async ({ ticket = {}, visit = {}, visitId = null } = {}) => {
  const rows = await query(
    `
        SELECT
            t.ticket_id,
            t.ticket_no,
            t.company_id,
            t.created_by,
            t.assignee,
            DATE_FORMAT(t.created_date, '%d %M %Y') AS created_date,
            DATE_FORMAT(t.due_date, '%d %M %Y') AS due_date,
            c.name AS clientName,
            c.email,
            qt.categoryName AS query_type,
            ts.categoryName AS ticket_status,
            tp.categoryName AS ticket_priority,
            a.name AS assignedTo
        FROM ${DB_PREFIX}tickets t
        LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
        LEFT JOIN ${DB_PREFIX}categories qt ON t.query_type = qt.category_id
        LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
        LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
        LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
        WHERE t.ticket_id = ?
        LIMIT 1
        `,
    [ticket.ticket_id]
  );
  const details = rows?.[0] || {};
  const visitDateTime = formatDate(visit.visit_scheduled_at);
  const title = "AMC Visit Scheduled";
  const body = `AMC Visit scheduled for ticket ${details.ticket_no || ticket.ticket_no || ticket.ticket_id} on ${visitDateTime}.`;

  // emitNotification(details.assignee, { title, body, type: "visit", ticket_id: ticket.ticket_id, visit_id: visitId });
  // if (details.created_by && Number(details.created_by) !== Number(details.assignee)) { emitNotification(details.created_by, { title, body, type: "visit", ticket_id: ticket.ticket_id, visit_id: visitId }); }
  // if (!details.email) return { email_sent: false };

  const visit_token = createVisitToken();
  await CommonModel.updateMasterDetails({ table: 'ticket_visits', data: { visit_token }, where: { visit_id: visitId }, });
  const visit_mark_url = `${env.appFEUrl}/mark_visit/${visitId}/${visit_token}`;
  const html = await renderTemplate("ticketNotification", "email", {
    clientName: details.clientName || "Customer",
    ticketNo: details.ticket_no || ticket.ticket_id,
    subject: "AMC Visit Scheduled",
    createdDate: details.created_date || "-",
    dueDate: details.due_date || "-",
    assignedTo: details.assignedTo || "-",
    message: `Your amc visit has been scheduled on ${visitDateTime}.${visit.visit_details ? `\n Details: ${visit.visit_details}` : ""}.${details.assignedTo ? `\n Visitor : ${details.assignedTo}` : ""}`,
    category: details.query_type || "-",
    status: details.ticket_status || "-",
    priority: details.ticket_priority || "-",
    appName: env?.appName || "Support System",
    redirectUrl: visit_mark_url,
    redirectUrlText: 'Mark as Visited'
  });

  const emailResult = await sendEmail({
    to: details.email,
    subject: `AMC Visit Scheduled - ${details.ticket_no || `Ticket #${ticket.ticket_id}`}`,
    html,
    text: "",
    company_id: details.company_id || ticket.company_id,
  });

  return { email_sent: Boolean(emailResult?.success) };
};

export const createAmcCall = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId || req.body.client_id;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    const customerRows = await query(
      `
        SELECT customer_id, name, mobile_no, contact_person, company_id, is_amc
        FROM ${DB_PREFIX}customer
        WHERE customer_id = ?
          AND is_amc = 'yes'
          ${!isSuperAdmin(req.user) && req.user.company_id ? "AND company_id = ?" : ""}
        LIMIT 1
      `,
      !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId]
    );
    const customer = customerRows[0];

    if (!customer) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "AMC customer not found" });
    }

    const nextId = await CommonModel.getNextID(MODULE_TABLE, "ticket_id");
    const today = new Date().toISOString().split("T")[0];
    const source = prepareTicketBody({
      ...req.body,
      client_id: customer.customer_id,
      contact_person: req.body.contact_person || customer.contact_person || customer.name || "",
      contact_no: req.body.contact_no || customer.mobile_no || "",
      description: req.body.description || `AMC call created for ${customer.name || "customer"}.`,
      assignee: req.body.assignee || req.user.adminID || null,
      start_date: req.body.start_date || today,
      due_date: req.body.due_date || today,
      ticket_status: DEFAULT_TICKET_STATUS_CLOSE,
      active_amc: "y",
      call_direction: "out",
      amc_call: "y",
      ticket_no: `TKT-${nextId}`,
      company_id: customer.company_id || req.user.company_id || null,
      created_by: req.user.adminID,
      created_date: toMysqlDateTime(),
      status: "active",
    });

    const data = await buildTablePayload(MODULE_TABLE, source);
    const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });

    return successResponse(res, {
      code: 1001,
      httpStatus: 201,
      message: "AMC call ticket created successfully.",
      data: {
        insertId: result.insertId,
        ticket_id: result.insertId,
        ticket_no: data.ticket_no,
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const createAmcVisit = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId || req.body.client_id;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    if (!req.body.visit_scheduled_at) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "visit_scheduled_at is required" });
    }

    const customerRows = await query(
      `
        SELECT customer_id, name, mobile_no, contact_person, company_id, is_amc, responsible_person
        FROM ${DB_PREFIX}customer
        WHERE customer_id = ?
          AND is_amc = 'yes'
          ${!isSuperAdmin(req.user) && req.user.company_id ? "AND company_id = ?" : ""}
        LIMIT 1
      `,
      !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId]
    );
    const customer = customerRows[0];

    if (!customer) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "AMC customer not found" });
    }

    const nextId = await CommonModel.getNextID(MODULE_TABLE, "ticket_id");
    const today = new Date().toISOString().split("T")[0];
    const assignee = req.body.employee_id || req.body.assignee || customer.responsible_person || req.user.adminID || null;
    const ticketSource = prepareTicketBody({
      ...req.body,
      client_id: customer.customer_id,
      contact_person: req.body.contact_person || customer.contact_person || customer.name || "",
      contact_no: req.body.contact_no || customer.mobile_no || "",
      description: req.body.description || req.body.visit_details || `AMC visit scheduled for ${customer.name || "customer"}.`,
      assignee,
      start_date: req.body.start_date || today,
      due_date: req.body.due_date || today,
      ticket_status: req.body.ticket_status || DEFAULT_TICKET_STATUS_OPEN,
      active_amc: "y",
      call_direction: "out",
      amc_call: "n",
      visit_required: "y",
      ticket_no: `TKT-${nextId}`,
      company_id: customer.company_id || req.user.company_id || null,
      created_by: req.user.adminID,
      created_date: toMysqlDateTime(),
      status: "active",
    });

    const ticketData = await buildTablePayload(MODULE_TABLE, ticketSource);
    const ticketResult = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data: ticketData });
    const ticketId = ticketResult.insertId;
    const ticket = await getTicket(ticketId);

    const visitData = await buildTablePayload("ticket_visits", {
      ticket_id: ticketId,
      employee_id: assignee,
      company_id: ticketData.company_id,
      visit_scheduled_at: req.body.visit_scheduled_at,
      visit_details: req.body.visit_details || ticketData.description || "",
      visit_status: "scheduled",
      created_by: req.user.adminID,
      created_date: toMysqlDateTime(),
      status: "active",
    });
    const visitResult = await CommonModel.saveMasterDetails({ table: "ticket_visits", data: visitData });
    const visitId = visitResult.insertId;

    notifyVisitScheduled({ ticket, visit: visitData, visitId, })
      .catch((error) => {
        console.log("Visit notification error :", error.message);
      });

    return successResponse(res, {
      code: 1001,
      httpStatus: 201,
      message: "AMC visit scheduled successfully.",
      data: {
        ticket_id: ticketId,
        ticket_no: ticketData.ticket_no,
        visit_id: visitId,
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const activity = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId || req.body.client_id;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    const companyScope = !isSuperAdmin(req.user) && req.user.company_id ? "AND c.company_id = ?" : "";
    const scopeValues = !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId];
    const customerRows = await query(
      `
        SELECT c.customer_id, c.name, c.email, c.mobile_no, c.company_name, c.company_id, c.is_amc
        FROM ${DB_PREFIX}customer c
        WHERE c.customer_id = ?
          AND c.is_amc = 'yes'
          ${companyScope}
        LIMIT 1
      `,
      scopeValues
    );
    const customer = customerRows[0];

    if (!customer) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "AMC customer not found" });
    }

    const ticketScope = !isSuperAdmin(req.user) && req.user.company_id ? "AND t.company_id = ?" : "";
    const ticketValues = !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId];

    const calls = await query(
      `
        SELECT
          t.ticket_id,
          t.ticket_no,
          t.description,
          t.created_date,
          t.due_date,
          qs.categoryName AS query_type,
          ts.categoryName AS ticket_status,
          tp.categoryName AS ticket_priority,
          a.name AS assignee_name
        FROM ${DB_PREFIX}tickets t
        LEFT JOIN ${DB_PREFIX}categories qs ON t.query_type = qs.category_id
        LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
        LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
        LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
        WHERE t.client_id = ?
          AND t.status = 'active'
          AND t.amc_call = 'y'
          AND t.call_direction = 'out'
          ${ticketScope}
        ORDER BY t.created_date DESC, t.ticket_id DESC
      `,
      ticketValues
    );

    // const tickets = await query(
    //   `
    //     SELECT
    //       t.ticket_id,
    //       t.ticket_no,
    //       t.description,
    //       t.created_date,
    //       t.due_date,
    //       t.amc_call,
    //       t.call_direction,
    //       qs.categoryName AS query_type,
    //       ts.categoryName AS ticket_status,
    //       tp.categoryName AS ticket_priority,
    //       a.name AS assignee_name
    //     FROM ${DB_PREFIX}tickets t
    //     LEFT JOIN ${DB_PREFIX}categories qs ON t.query_type = qs.category_id
    //     LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
    //     LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
    //     LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
    //     WHERE t.client_id = ?
    //       AND t.status = 'active'
    //       AND t.active_amc = 'y'
    //       ${ticketScope}
    //     ORDER BY t.created_date DESC, t.ticket_id DESC
    //   `,
    //   ticketValues
    // );

    const visits = await query(
      `
        SELECT
          v.visit_id,
          v.ticket_id,
          t.ticket_no,
          v.visit_scheduled_at,
          v.visited_at,
          v.visit_details,
          v.visit_status,
          v.created_date,
          a.name AS employee_name
        FROM ${DB_PREFIX}ticket_visits v
        INNER JOIN ${DB_PREFIX}tickets t ON v.ticket_id = t.ticket_id
        LEFT JOIN ${DB_PREFIX}admin a ON v.employee_id = a.adminID
        WHERE t.client_id = ?
          AND t.status = 'active'
          AND t.active_amc = 'y'
          AND v.status = 'active'
          ${ticketScope}
        ORDER BY v.visit_scheduled_at DESC, v.visit_id DESC
      `,
      ticketValues
    );

    const reminders = await query(
      `
        SELECT reminder_id, sent_at, include_report, recipient_email, email_subject, status, error_message
        FROM ${DB_PREFIX}amc_reminder_logs
        WHERE customer_id = ?
        ORDER BY sent_at DESC, reminder_id DESC
      `,
      [customerId]
    );

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        customer,
        calls,
        visits,
        // tickets,
        reminders,
        counts: {
          calls: calls.length,
          visits: visits.length,
          visited: visits.filter((visit) => String(visit.visit_status || "").toLowerCase() === "visited").length,
          // tickets: tickets.length,
          reminders: reminders.length,
        },
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const list = async (req, res) => {
  try {
    const {
      page = 1,
      searchText = "",
      filters = [],
      order_by,
      orderBy,
      order = "DESC",
    } = req.body;
    const currentPage = Number(page) || 1;
    const start = Math.max(0, (currentPage - 1) * LIMIT);
    const safeLimit = Number(LIMIT) || 10;
    const safeStart = Number(start) || 0;
    const selectedOrderBy = normalizeOrderBy(order_by || orderBy || "remaining_call_count");
    const selectedOrder = normalizeOrder(order);
    const { where, values, having, havingValues } = buildBaseWhere({ user: req.user, searchText, filters });
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const havingSql = having.length ? `HAVING ${having.join(" AND ")}` : "";

    const joinSql = `
        LEFT JOIN ( SELECT c2.customer_id, COUNT(t.ticket_id) AS support_call_count FROM ${DB_PREFIX}customer c2 LEFT JOIN ${DB_PREFIX}tickets t ON t.client_id = c2.customer_id AND DATE(t.created_date) BETWEEN DATE(c2.amc_start_date) AND DATE(c2.amc_end_date) GROUP BY c2.customer_id ) sc ON sc.customer_id = c.customer_id
        LEFT JOIN ( SELECT client_id AS customer_id, COUNT(ticket_id) AS done_amc_call_count FROM ${DB_PREFIX}tickets WHERE amc_call = 'y' AND call_direction = 'out' AND status = 'active' AND created_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) GROUP BY client_id ) ac ON ac.customer_id = c.customer_id
        LEFT JOIN ( SELECT client_id AS customer_id, COUNT(ticket_id) AS amc_ticket_count FROM ${DB_PREFIX}tickets WHERE active_amc = 'y' AND status = 'active' GROUP BY client_id ) atc ON atc.customer_id = c.customer_id
        LEFT JOIN ( SELECT t.client_id AS customer_id, COUNT(CASE WHEN v.visit_status = 'scheduled' THEN 1 END) AS amc_visit_scheduled_count, COUNT(CASE WHEN v.visit_status = 'visited' THEN 1 END) AS amc_visited_count FROM ${DB_PREFIX}ticket_visits v INNER JOIN ${DB_PREFIX}tickets t ON v.ticket_id = t.ticket_id WHERE t.active_amc = 'y' AND t.status = 'active' AND v.status = 'active' GROUP BY t.client_id ) avc ON avc.customer_id = c.customer_id
        LEFT JOIN ( SELECT customer_id, MAX(sent_at) AS last_reminder_sent_at, COUNT(*) AS reminder_count, SUBSTRING_INDEX(GROUP_CONCAT(include_report ORDER BY sent_at DESC), ',', 1) AS last_reminder_include_report FROM ${DB_PREFIX}amc_reminder_logs WHERE status = 'sent' GROUP BY customer_id ) rl ON rl.customer_id = c.customer_id
        LEFT JOIN ( SELECT customer_id, MAX(reminder_id) AS reminder_id FROM ${DB_PREFIX}amc_reminder_logs WHERE status = 'sent' AND DATE(sent_at) = CURDATE() GROUP BY customer_id ) today_rl ON today_rl.customer_id = c.customer_id
    `;

    const countRows = await query(
      `
        SELECT COUNT(*) AS total FROM (
          SELECT c.customer_id, c.exp_call_count AS expected_call_count, COALESCE(ac.done_amc_call_count, 0) AS done_amc_call_count, GREATEST(COALESCE(c.exp_call_count, 0) - COALESCE(ac.done_amc_call_count, 0), 0) AS remaining_call_count, COALESCE(atc.amc_ticket_count, 0) AS amc_ticket_count, COALESCE(avc.amc_visit_scheduled_count, 0) AS amc_visit_scheduled_count, COALESCE(avc.amc_visited_count, 0) AS amc_visited_count
          FROM ${DB_PREFIX}customer c
          ${joinSql}
          ${whereSql}
          ${havingSql}
        ) amc_count_rows
      `,
      [...values, ...havingValues]
    );
    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / LIMIT);
    const end = Math.min(start + LIMIT, total);
    const rows = await query(
      `
        SELECT c.customer_id, c.name, c.email, c.mobile_no, c.contact_person, c.company_name, c.company_id, c.is_amc, c.amc_term_period, c.amc_start_date, c.amc_end_date, c.exp_call_count, c.exp_call_count AS expected_call_count, DATEDIFF(c.amc_end_date, CURDATE()) AS days_until_expiry, COALESCE(sc.support_call_count, 0) AS support_call_count, COALESCE(ac.done_amc_call_count, 0) AS done_amc_call_count, GREATEST(COALESCE(c.exp_call_count, 0) - COALESCE(ac.done_amc_call_count, 0), 0) AS remaining_call_count, COALESCE(atc.amc_ticket_count, 0) AS amc_ticket_count, COALESCE(avc.amc_visit_scheduled_count, 0) AS amc_visit_scheduled_count, COALESCE(avc.amc_visited_count, 0) AS amc_visited_count, rl.last_reminder_sent_at, COALESCE(rl.reminder_count, 0) AS reminder_count, rl.last_reminder_include_report, CASE WHEN today_rl.reminder_id IS NULL THEN 0 ELSE 1 END AS sent_today
        FROM ${DB_PREFIX}customer c
        ${joinSql}
        ${whereSql}
        ${havingSql}
        ORDER BY ${["support_call_count", "expected_call_count", "done_amc_call_count", "remaining_call_count", "amc_ticket_count", "amc_visit_scheduled_count", "amc_visited_count", "last_reminder_sent_at"].includes(selectedOrderBy) ? selectedOrderBy : selectedOrderBy === "exp_call_count" ? "c.exp_call_count" : `c.${selectedOrderBy}`} ${selectedOrder}
        LIMIT ${safeLimit} OFFSET ${safeStart}
      `,
      [...values, ...havingValues]
    );

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: rows,
        pagination: {
          total,
          page: currentPage,
          limit: LIMIT,
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

export const sendReminder = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    const includeReport = req.body.include_report === true || req.body.includeReport === true;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    const customerRows = await query(
      `
        SELECT customer_id, name, email, mobile_no, company_name, company_id, is_amc, amc_start_date, amc_end_date
        FROM ${DB_PREFIX}customer
        WHERE customer_id = ?
          AND is_amc = 'yes'
          ${!isSuperAdmin(req.user) && req.user.company_id ? "AND company_id = ?" : ""}
        LIMIT 1
      `,
      !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId]
    );
    const customer = customerRows[0];

    if (!customer) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "AMC customer not found" });
    }

    if (!customer.email) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer email not found" });
    }

    if (await hasReminderSentToday(customer.customer_id)) {
      return failureResponse(res, {
        code: 2000,
        httpStatus: 409,
        message: "Reminder already sent today for this customer.",
      });
    }

    const supportRows = await getSupportCallRows(customer.customer_id, customer.amc_start_date, customer.amc_end_date);
    const subject = `AMC renewal reminder - ${customer.name || "Customer"}`;
    const html = await renderTemplate("amcRenewalReminder", "email", {
      customerName: customer.name || "Customer",
      amcStartDate: formatDate(customer.amc_start_date),
      amcEndDate: formatDate(customer.amc_end_date),
      supportCallCount: supportRows.length,
    });
    const attachment = await buildReportAttachment(customer, supportRows);
    const attachments = includeReport ? [attachment] : [];
    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      text: "",
      company_id: customer.company_id,
      attachments,
    });

    if (!result.success) {
      await insertReminderLog({
        customer,
        user: req.user,
        includeReport,
        subject,
        status: "failed",
        errorMessage: result.error || result.message || "Email sending failed",
      });

      return failureResponse(res, {
        code: 2008,
        httpStatus: 500,
        message: result.error || "Email sending failed",
      });
    }

    await insertReminderLog({ customer, user: req.user, includeReport, subject });

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "AMC reminder sent successfully.",
      data: {
        data: {
          customer_id: customer.customer_id,
          include_report: includeReport,
          support_call_count: supportRows.length,
        },
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
