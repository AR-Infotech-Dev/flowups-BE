import { DB_PREFIX, query } from "../config/database.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { sendEmail } from "../utils/email.js";
import { AMC_RENEWAL_REMINDER } from "../utils/emailtemplates.js";

const LIMIT = 10;

const isSuperAdmin = (user = {}) => String(user.role_slug || "").toLowerCase() === "super_admin";

const normalizeOrderBy = (value = "amc_end_date") => {
  const allowed = new Set([
    "name",
    "email",
    "mobile_no",
    "company_name",
    "amc_start_date",
    "amc_end_date",
    "support_call_count",
    "last_reminder_sent_at",
    "reminder_count",
  ]);

  return allowed.has(String(value)) ? String(value) : "amc_end_date";
};

const normalizeOrder = (value = "ASC") => String(value).toUpperCase() === "DESC" ? "DESC" : "ASC";

const formatDate = (value = null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("c.company_id = ?");
    values.push(user.company_id);
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
    };
    const column = columnMap[field];
    if (!column) return;

    switch (condition) {
      case "equal_to":
        if (value === undefined || value === null || value === "") return;
        where.push(`${column} = ?`);
        values.push(value);
        break;
      case "contains":
      case "is_in":
        if (value === undefined || value === null || value === "") return;
        where.push(`${column} LIKE ?`);
        values.push(`%${value}%`);
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

  return { where, values };
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

const buildReportAttachment = (customer = {}, supportRows = []) => {
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

  const totalCalls = supportRows.length;
  const resolvedCalls = supportRows.filter(isResolvedStatus).length;
  const pendingCalls = Math.max(0, totalCalls - resolvedCalls);
  const rows = supportRows.length
    ? supportRows.map((row, index) => {
      const resolved = isResolvedStatus(row);

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(row.ticket_no || "-")}</td>
          <td>${escapeHtml(row.created_date || "-")}</td>
          <td>${escapeHtml(row.due_date || "-")}</td>
          <td>${escapeHtml(row.query_type || "-")}</td>
          <td class="${resolved ? "status-resolved" : "status-pending"}">${escapeHtml(row.ticket_status || "-")}</td>
          <td>${escapeHtml(row.ticket_priority || "-")}</td>
          <td>${escapeHtml(row.assignee || "-")}</td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="8" class="empty">No support calls found for this AMC period.</td></tr>`;

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: #172033; }
          h2 { margin: 0 0 6px; color: #003b7d; font-size: 20px; }
          .muted { color: #64748b; font-size: 12px; }
          .summary { margin: 16px 0; border-collapse: collapse; width: 100%; }
          .summary td { border: 1px solid #dbeafe; padding: 10px 14px; font-size: 13px; }
          .summary-label { background: #eff6ff; color: #475569; font-weight: 700; }
          .summary-value { font-weight: 800; color: #0f172a; }
          .metric-total { background: #e0f2fe; color: #075985; }
          .metric-resolved { background: #dcfce7; color: #166534; }
          .metric-pending { background: #fef3c7; color: #92400e; }
          table.report { border-collapse: collapse; width: 100%; margin-top: 12px; }
          .report th { background: #003b7d; color: #ffffff; border: 1px solid #003b7d; padding: 9px 8px; font-size: 12px; text-align: left; }
          .report td { border: 1px solid #dbe3ef; padding: 8px; font-size: 12px; vertical-align: top; }
          .report tr:nth-child(even) td { background: #f8fbff; }
          .center { text-align: center; }
          .status-resolved { color: #166534; background: #dcfce7; font-weight: 700; }
          .status-pending { color: #92400e; background: #fef3c7; font-weight: 700; }
          .empty { text-align: center; color: #64748b; background: #f8fbff; }
        </style>
      </head>
      <body>
        <h2>AMC Support Report</h2>
        <div class="muted">Generated for ${escapeHtml(customer.name || "Customer")}</div>

        <table class="summary" cellspacing="0" cellpadding="0">
          <tr>
            <td class="summary-label">Customer</td>
            <td class="summary-value">${escapeHtml(customer.name || "-")}</td>
            <td class="summary-label">Company</td>
            <td class="summary-value">${escapeHtml(customer.company_name || "-")}</td>
          </tr>
          <tr>
            <td class="summary-label">AMC Start</td>
            <td class="summary-value">${escapeHtml(formatDate(customer.amc_start_date))}</td>
            <td class="summary-label">AMC Expiry</td>
            <td class="summary-value">${escapeHtml(formatDate(customer.amc_end_date))}</td>
          </tr>
          <tr>
            <td class="summary-label metric-total">Total Calls</td>
            <td class="summary-value metric-total">${totalCalls}</td>
            <td class="summary-label metric-resolved">Resolved</td>
            <td class="summary-value metric-resolved">${resolvedCalls}</td>
          </tr>
          <tr>
            <td class="summary-label metric-pending">Pending</td>
            <td class="summary-value metric-pending">${pendingCalls}</td>
            <td class="summary-label">Report Type</td>
            <td class="summary-value">AMC Period Support Summary</td>
          </tr>
        </table>

        <table class="report" cellspacing="0" cellpadding="0">
          <thead>
            <tr>
              <th style="width:45px;text-align:center;background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Sr No</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Ticket No</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Created Date</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Due Date</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Query Type</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Status</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Priority</th>
              <th style="background:#003b7d;color:#ffffff;border:1px solid #003b7d;">Assignee</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;

  return {
    filename: `AMC-Support-Report-${customer.customer_id}.xls`,
    content: html,
    contentType: "application/vnd.ms-excel",
  };
};

const insertReminderLog = async ({ customer, user, includeReport, subject, status = "sent", errorMessage = null }) => {
  // await ensureReminderTable();
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
  // await ensureReminderTable();

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

export const list = async (req, res) => {
  try {
    await ensureReminderTable();

    const {
      page = 1,
      searchText = "",
      filters = [],
      order_by,
      orderBy,
      order = "ASC",
    } = req.body;
    const currentPage = Number(page) || 1;
    const start = Math.max(0, (currentPage - 1) * LIMIT);
    const safeLimit = Number(LIMIT) || 10;
    const safeStart = Number(start) || 0;
    const selectedOrderBy = normalizeOrderBy(order_by || orderBy || "amc_end_date");
    const selectedOrder = normalizeOrder(order);
    const { where, values } = buildBaseWhere({ user: req.user, searchText, filters });
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await query(
      `
        SELECT COUNT(*) AS total
        FROM ${DB_PREFIX}customer c
        ${whereSql}
      `,
      values
    );
    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / LIMIT);
    const end = Math.min(start + LIMIT, total);

    const rows = await query(
      `
        SELECT
          c.customer_id,
          c.name,
          c.email,
          c.mobile_no,
          c.contact_person,
          c.company_name,
          c.company_id,
          c.is_amc,
          c.amc_term_period,
          c.amc_start_date,
          c.amc_end_date,
          DATEDIFF(c.amc_end_date, CURDATE()) AS days_until_expiry,
          COALESCE(sc.support_call_count, 0) AS support_call_count,
          rl.last_reminder_sent_at,
          COALESCE(rl.reminder_count, 0) AS reminder_count,
          rl.last_reminder_include_report,
          CASE WHEN today_rl.reminder_id IS NULL THEN 0 ELSE 1 END AS sent_today
        FROM ${DB_PREFIX}customer c
        LEFT JOIN (
          SELECT c2.customer_id, COUNT(t.ticket_id) AS support_call_count
          FROM ${DB_PREFIX}customer c2
          LEFT JOIN ${DB_PREFIX}tickets t
            ON t.client_id = c2.customer_id
           AND DATE(t.created_date) BETWEEN DATE(c2.amc_start_date) AND DATE(c2.amc_end_date)
          GROUP BY c2.customer_id
        ) sc ON sc.customer_id = c.customer_id
        LEFT JOIN (
          SELECT
            customer_id,
            MAX(sent_at) AS last_reminder_sent_at,
            COUNT(*) AS reminder_count,
            SUBSTRING_INDEX(GROUP_CONCAT(include_report ORDER BY sent_at DESC), ',', 1) AS last_reminder_include_report
          FROM ${DB_PREFIX}amc_reminder_logs
          WHERE status = 'sent'
          GROUP BY customer_id
        ) rl ON rl.customer_id = c.customer_id
        LEFT JOIN (
          SELECT customer_id, MAX(reminder_id) AS reminder_id
          FROM ${DB_PREFIX}amc_reminder_logs
          WHERE status = 'sent'
            AND DATE(sent_at) = CURDATE()
          GROUP BY customer_id
        ) today_rl ON today_rl.customer_id = c.customer_id
        ${whereSql}
        ORDER BY ${selectedOrderBy === "support_call_count" ? "support_call_count" : selectedOrderBy === "last_reminder_sent_at" ? "last_reminder_sent_at" : `c.${selectedOrderBy}`} ${selectedOrder}
        LIMIT ${safeLimit} OFFSET ${safeStart}
      `,
      values
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
    const html = AMC_RENEWAL_REMINDER({
      customerName: escapeHtml(customer.name || "Customer"),
      amcStartDate: escapeHtml(formatDate(customer.amc_start_date)),
      amcEndDate: escapeHtml(formatDate(customer.amc_end_date)),
      supportCallCount: supportRows.length,
    });
    const attachments = includeReport ? [buildReportAttachment(customer, supportRows)] : [];
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
