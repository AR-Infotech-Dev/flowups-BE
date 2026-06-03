import { DB_PREFIX, query } from "../config/database.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";
import { buildReportAttachment, buildSupportReportTemplate, parseJsonArray, isActiveAMC, } from "../utils/report.utils.js";
import { sendEmail } from "../utils/email.js";
import { toMysqlDateTime } from "../utils/dateTime.js";


const CLOSED_STATUS = "208";
const SUPER_ROLE_SLUGS = new Set(["super_admin", "superadmin", "administrator"]);

const isSuperAdmin = (user = {}) => SUPER_ROLE_SLUGS.has(String(user.role_slug || "").toLowerCase());

const normalizeOrder = (value = "DESC") => String(value).toUpperCase() === "ASC" ? "ASC" : "DESC";

const getTicketOrderColumn = (value = "created_date") => {
  const map = {
    ticket_no: "t.ticket_no",
    customer_name: "c.name",
    ticket_priority: "priority.categoryName",
    ticket_status: "status.categoryName",
    assigned_date: "t.created_date",
    created_date: "t.created_date",
    due_date: "t.due_date",
    resolution_time: "resolution_time",
  };

  return map[value] || "t.created_date";
};

const buildTicketWhere = ({ body = {}, user = {}, includeSearch = false } = {}) => {
  const {
    user_id = "",
    from_date = "",
    to_date = "",
    company_id = "",
    ticket_status = "",
    searchText = "",
  } = body;
  const where = ["t.status = 'active'"];
  const values = [];

  if (user_id) {
    where.push("t.assignee = ?");
    values.push(user_id);
  }

  if (from_date) {
    where.push("DATE(t.created_date) >= ?");
    values.push(from_date);
  }

  if (to_date) {
    where.push("DATE(t.created_date) <= ?");
    values.push(to_date);
  }

  if (company_id) {
    where.push("t.company_id = ?");
    values.push(company_id);
  } else if (!isSuperAdmin(user) && user.company_id) {
    where.push("t.company_id = ?");
    values.push(user.company_id);
  }

  if (ticket_status) {
    where.push("t.ticket_status = ?");
    values.push(ticket_status);
  }

  if (includeSearch && searchText) {
    where.push("(t.ticket_no LIKE ? OR c.name LIKE ? OR t.contact_person LIKE ? OR t.contact_no LIKE ?)");
    values.push(`%${searchText}%`, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values,
  };
};

const getUserDetails = async (userId = "") => {
  if (!userId) return {};

  const rows = await query(
    `
      SELECT adminID, name, email, userName, roleID
      FROM ${DB_PREFIX}admin
      WHERE adminID = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || {};
};


const getCustomerReportWhere = ({ body = {}, user = {} } = {}) => {
  const { customer_id = "", from_date = "" } = body;
  const where = ["t.status = 'active'", "t.client_id = ?"];
  const values = [customer_id];

  if (from_date) {
    where.push("DATE(COALESCE(t.start_date, t.created_date)) >= ?");
    values.push(from_date);
  }

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("t.company_id = ?");
    values.push(user.company_id);
  }

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    values,
  };
};

const getCustomerReportCustomer = async ({ customerId, user }) => {
  const where = ["c.customer_id = ?"];
  const values = [customerId];

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("(c.company_id = ? OR c.company_id IS NULL)");
    values.push(user.company_id);
  }

  const rows = await query(
    `
      SELECT
        c.customer_id,
        c.name,
        c.email,
        c.mobile_no,
        c.wa_no,
        c.contact_person,
        c.company_name,
        c.is_amc,
        c.amc_start_date,
        c.amc_end_date,
        c.customer_products,
        c.created_date
      FROM ${DB_PREFIX}customer c
      WHERE ${where.join(" AND ")}
      LIMIT 1
    `,
    values
  );

  const customer = rows[0] || {};
  return {
    ...customer,
    customer_products: parseJsonArray(customer.customer_products),
  };
};

const getCustomerReportSummary = async ({ body, user }) => {
  const { whereSql, values } = getCustomerReportWhere({ body, user });
  const rows = await query(
    `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END), 0) AS resolved,
        COALESCE(SUM(CASE WHEN t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS overdue
      FROM ${DB_PREFIX}tickets t
      ${whereSql}
    `,
    [CLOSED_STATUS, CLOSED_STATUS, CLOSED_STATUS, ...values]
  );

  const summary = rows[0] || {};
  return {
    total: Number(summary.total || 0),
    resolved: Number(summary.resolved || 0),
    pending: Number(summary.pending || 0),
    overdue: Number(summary.overdue || 0),
  };
};

const getCustomerReportTickets = async ({ body, user }) => {
  const { whereSql, values } = getCustomerReportWhere({ body, user });

  return query(
    `
      SELECT
        t.ticket_id,
        t.ticket_no,
        t.description,
        t.created_date,
        t.start_date,
        t.due_date,
        t.contact_person,
        t.contact_no,
        t.product_serial_number,
        t.product_name,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        CASE
          WHEN t.ticket_status = ? THEN COALESCE(TIMESTAMPDIFF(HOUR, t.created_date, COALESCE(cl.closed_at, t.modified_date)), 0)
          ELSE ''
        END AS resolution_time
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}categories priority ON t.ticket_priority = priority.category_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      LEFT JOIN ${DB_PREFIX}categories queryType ON t.query_type = queryType.category_id
      LEFT JOIN ${DB_PREFIX}admin assignee ON t.assignee = assignee.adminID
      LEFT JOIN (
        SELECT ticket_id, MIN(created_date) AS closed_at
        FROM ${DB_PREFIX}ticket_history
        WHERE field_name = 'ticket_status'
          AND new_value = ?
        GROUP BY ticket_id
      ) cl ON cl.ticket_id = t.ticket_id
      ${whereSql}
      ORDER BY COALESCE(t.start_date, t.created_date) DESC, t.ticket_id DESC
    `,
    [CLOSED_STATUS, CLOSED_STATUS, ...values]
  );
};

const getSummary = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  const delegatedWhere = ["h.field_name = 'assignee'"];
  const delegatedValues = [];

  if (body.user_id) {
    delegatedWhere.push("h.changed_by = ?");
    delegatedValues.push(body.user_id);
  }

  if (body.from_date) {
    delegatedWhere.push("DATE(h.created_date) >= ?");
    delegatedValues.push(body.from_date);
  }

  if (body.to_date) {
    delegatedWhere.push("DATE(h.created_date) <= ?");
    delegatedValues.push(body.to_date);
  }

  if (body.company_id) {
    delegatedWhere.push("t.company_id = ?");
    delegatedValues.push(body.company_id);
  } else if (!isSuperAdmin(user) && user.company_id) {
    delegatedWhere.push("t.company_id = ?");
    delegatedValues.push(user.company_id);
  }

  const [rows, delegatedRows] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*) AS assigned,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END), 0) AS closed,
        COALESCE(SUM(CASE WHEN t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS overdue,
        COALESCE(ROUND(AVG(CASE WHEN t.ticket_status = ? THEN TIMESTAMPDIFF(HOUR, t.created_date, COALESCE(cl.closed_at, t.modified_date)) END), 1), 0) AS avg_resolution_time
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN (
        SELECT ticket_id, MIN(created_date) AS closed_at
        FROM ${DB_PREFIX}ticket_history
        WHERE field_name = 'ticket_status'
          AND new_value = ?
        GROUP BY ticket_id
      ) cl ON cl.ticket_id = t.ticket_id
      ${whereSql}
    `,
      [CLOSED_STATUS, CLOSED_STATUS, CLOSED_STATUS, CLOSED_STATUS, CLOSED_STATUS, ...values]
    ),
    query(
      `
        SELECT COUNT(DISTINCT h.ticket_id) AS delegated
        FROM ${DB_PREFIX}ticket_history h
        INNER JOIN ${DB_PREFIX}tickets t ON h.ticket_id = t.ticket_id
        WHERE ${delegatedWhere.join(" AND ")}
      `,
      delegatedValues
    ),
  ]);
  const summary = rows[0] || {};
  const assigned = Number(summary.assigned || 0);
  const closed = Number(summary.closed || 0);
  const overdue = Number(summary.overdue || 0);
  const delegated = Number(delegatedRows[0]?.delegated || 0);
  const closeRate = assigned ? (closed / assigned) * 100 : 0;
  const penalty = overdue * 4;

  return {
    assigned,
    closed,
    pending: Number(summary.pending || 0),
    delegated,
    overdue,
    avg_resolution_time: Number(summary.avg_resolution_time || 0),
    productivity_score: Math.max(0, Math.min(100, Math.round(closeRate - penalty))),
  };
};

const getMonthlyProductivity = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  return query(
    `
      SELECT
        DATE_FORMAT(t.created_date, '%b %Y') AS label,
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END), 0) AS closed,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END), 0) AS value
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      ${whereSql}
      GROUP BY YEAR(t.created_date), MONTH(t.created_date), DATE_FORMAT(t.created_date, '%b %Y')
      ORDER BY YEAR(t.created_date), MONTH(t.created_date)
    `,
    [CLOSED_STATUS, CLOSED_STATUS, ...values]
  );
};

const getStatusDistribution = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  return query(
    `
      SELECT
        COALESCE(status.categoryName, 'Unknown') AS label,
        COUNT(*) AS value,
        status.cat_color AS color
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      ${whereSql}
      GROUP BY status.categoryName, status.cat_color
      ORDER BY value DESC
    `,
    values
  );
};

const getDailyClosureTrend = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  return query(
    `
      SELECT
        DATE_FORMAT(cl.closed_at, '%d %b') AS label,
        COUNT(*) AS value
      FROM ${DB_PREFIX}tickets t
      INNER JOIN (
        SELECT ticket_id, MIN(created_date) AS closed_at
        FROM ${DB_PREFIX}ticket_history
        WHERE field_name = 'ticket_status'
          AND new_value = ?
        GROUP BY ticket_id
      ) cl ON cl.ticket_id = t.ticket_id
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      ${whereSql}
      GROUP BY DATE(cl.closed_at), DATE_FORMAT(cl.closed_at, '%d %b')
      ORDER BY DATE(cl.closed_at)
    `,
    [CLOSED_STATUS, ...values]
  );
};

const getTickets = async ({ body, user }) => {
  const {
    page = 1,
    limit = 10,
    order_by = "created_date",
    order = "DESC",
  } = body;
  const currentPage = Number(page) || 1;
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const start = Math.max(0, (currentPage - 1) * safeLimit);
  const selectedOrder = normalizeOrder(order);
  const orderColumn = getTicketOrderColumn(order_by);
  const { whereSql, values } = buildTicketWhere({ body, user, includeSearch: true });

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      ${whereSql}
    `,
    values
  );
  const total = Number(countRows[0]?.total || 0);
  const totalPages = Math.ceil(total / safeLimit);
  const rows = await query(
    `
      SELECT
        t.ticket_id,
        t.ticket_no,
        t.created_date,
        t.created_date AS assigned_date,
        t.due_date,
        t.contact_person,
        t.contact_no,
        c.name AS customer_name,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        CASE
          WHEN t.ticket_status = ? THEN COALESCE(TIMESTAMPDIFF(HOUR, t.created_date, COALESCE(cl.closed_at, t.modified_date)), 0)
          ELSE ''
        END AS resolution_time
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      LEFT JOIN ${DB_PREFIX}categories priority ON t.ticket_priority = priority.category_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      LEFT JOIN ${DB_PREFIX}categories queryType ON t.query_type = queryType.category_id
      LEFT JOIN ${DB_PREFIX}admin assignee ON t.assignee = assignee.adminID
      LEFT JOIN (
        SELECT ticket_id, MIN(created_date) AS closed_at
        FROM ${DB_PREFIX}ticket_history
        WHERE field_name = 'ticket_status'
          AND new_value = ?
        GROUP BY ticket_id
      ) cl ON cl.ticket_id = t.ticket_id
      ${whereSql}
      ORDER BY ${orderColumn} ${selectedOrder}
      LIMIT ${safeLimit} OFFSET ${start}
    `,
    [CLOSED_STATUS, CLOSED_STATUS, ...values]
  );

  return {
    rows,
    pagination: {
      page: currentPage,
      limit: safeLimit,
      total,
      totalPages,
      start: total === 0 ? 0 : start + 1,
      end: Math.min(start + safeLimit, total),
    },
  };
};

const getActivities = async ({ body, user }) => {
  const { user_id = "", from_date = "", to_date = "", company_id = "" } = body;
  const where = ["1 = 1"];
  const values = [];

  if (user_id) {
    where.push("(h.changed_by = ? OR t.assignee = ?)");
    values.push(user_id, user_id);
  }

  if (from_date) {
    where.push("DATE(h.created_date) >= ?");
    values.push(from_date);
  }

  if (to_date) {
    where.push("DATE(h.created_date) <= ?");
    values.push(to_date);
  }

  if (company_id) {
    where.push("t.company_id = ?");
    values.push(company_id);
  } else if (!isSuperAdmin(user) && user.company_id) {
    where.push("t.company_id = ?");
    values.push(user.company_id);
  }

  return query(
    `
      SELECT
        h.history_id AS id,
        h.ticket_id,
        h.action_type,
        h.field_name,
        h.created_date,
        h.created_date AS created_at,
        cb.name AS changed_by_name,
        t.ticket_no,
        CASE
          WHEN h.field_name = 'ticket_status' THEN CONCAT('Ticket ', t.ticket_no, ' status changed from ', COALESCE(oldStatus.categoryName, h.old_value, '-'), ' to ', COALESCE(newStatus.categoryName, h.new_value, '-'))
          WHEN h.field_name = 'assignee' THEN CONCAT('Ticket ', t.ticket_no, ' reassigned from ', COALESCE(oldAssignee.name, h.old_value, '-'), ' to ', COALESCE(newAssignee.name, h.new_value, '-'))
          ELSE COALESCE(h.comment, CONCAT('Ticket ', t.ticket_no, ' ', COALESCE(h.action_type, 'updated')))
        END AS message
      FROM ${DB_PREFIX}ticket_history h
      LEFT JOIN ${DB_PREFIX}tickets t ON h.ticket_id = t.ticket_id
      LEFT JOIN ${DB_PREFIX}admin cb ON h.changed_by = cb.adminID
      LEFT JOIN ${DB_PREFIX}categories oldStatus ON h.old_value = oldStatus.category_id
      LEFT JOIN ${DB_PREFIX}categories newStatus ON h.new_value = newStatus.category_id
      LEFT JOIN ${DB_PREFIX}admin oldAssignee ON h.old_value = oldAssignee.adminID
      LEFT JOIN ${DB_PREFIX}admin newAssignee ON h.new_value = newAssignee.adminID
      WHERE ${where.join(" AND ")}
      ORDER BY h.created_date DESC
      LIMIT 12
    `,
    values
  );
};

export const userPerformance = async (req, res) => {
  try {
    const body = req.body || {};
    const [userDetails, summary, monthlyProductivity, ticketStatusDistribution, dailyClosureTrend, ticketResult, activities] =
      await Promise.all([
        getUserDetails(body.user_id),
        getSummary({ body, user: req.user }),
        getMonthlyProductivity({ body, user: req.user }),
        getStatusDistribution({ body, user: req.user }),
        getDailyClosureTrend({ body, user: req.user }),
        getTickets({ body, user: req.user }),
        getActivities({ body, user: req.user }),
      ]);

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          user: userDetails,
          summary,
          charts: {
            monthlyProductivity,
            ticketStatusDistribution,
            dailyClosureTrend,
            pendingVsClosed: {
              pending: summary.pending,
              closed: summary.closed,
            },
          },
          tickets: ticketResult.rows,
          activities,
          pagination: ticketResult.pagination,
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

export const customerReport = async (req, res) => {
  try {
    const body = req.body || {};
    const customerId = body.customer_id || body.customerId;

    if (!customerId) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 400,
        message: "Customer id is required.",
      });
    }

    const normalizedBody = {
      ...body,
      customer_id: customerId,
    };

    const [customer, summary, tickets] = await Promise.all([
      getCustomerReportCustomer({ customerId, user: req.user }),
      getCustomerReportSummary({ body: normalizedBody, user: req.user }),
      getCustomerReportTickets({ body: normalizedBody, user: req.user }),
    ]);

    if (!customer?.customer_id) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 404,
        message: "Customer not found.",
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          customer,
          products: customer.customer_products || [],
          summary,
          tickets,
          filters: {
            customer_id: customerId,
            from_date: body.from_date || "",
          },
        },
      },
    });
  } catch (error) {
    console.log(error);

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const sendReport = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    // const includeReport = req.body.include_report === true || req.body.includeReport === true;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }
    const normalizedBody = {
      ...req.body,
      customer_id: customerId,
    };

    const [customer, summary, tickets] = await Promise.all([
      getCustomerReportCustomer({ customerId, user: req.user }),
      getCustomerReportSummary({ body: normalizedBody, user: req.user }),
      getCustomerReportTickets({ body: normalizedBody, user: req.user }),
    ]);

    if (!customer?.customer_id) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer not found" });
    }

    if (!customer.email) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer email not found" });
    }
    const products = customer.customer_products || [];
    const supportRows = tickets;
    const subject = `Support Report - ${customer.name || "Customer"}`;
    const html = buildSupportReportTemplate({ customer, supportCallCount: supportRows.length ,summary,products});
    const attachments = [buildReportAttachment({ customer, summary, supportRows,  })];
    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      text: "",
      company_id: customer.company_id,
      attachments,
    });

    if (!result.success) {
      // await insertReminderLog({
      //   customer,
      //   user: req.user,
      //   includeReport,
      //   subject,
      //   status: "failed",
      //   errorMessage: result.error || result.message || "Email sending failed",
      // });

      return failureResponse(res, {
        code: 2008,
        httpStatus: 500,
        message: result.error || "Email sending failed",
      });
    }

    // await insertReminderLog({ customer, user: req.user, includeReport, subject });

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Support report sent successfully.",
      data: {
        data: {
          customer_id: customer.customer_id,
          support_call_count: supportRows.length,
        },
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
