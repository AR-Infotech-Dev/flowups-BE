import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { buildReportAttachment, buildSupportReportTemplate, buildPerformanceExcelAttachment, buildCustomerWiseExcelAttachment, parseJsonArray, isActiveAMC, formatDate, stripHtml, } from "#shared/utils/report.utils.js";
import { sendEmail } from "#shared/utils/email.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";


const CLOSED_STATUS = "208";

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

const getWorkReportOrderColumn = (value = "work_start_at") => {
  const map = {
    work_start_at: "wl.work_start_at",
    created_date: "wl.created_date",
    spent_minutes: "spent_minutes",
    employee_name: "a.name",
    ticket_no: "t.ticket_no",
    client_name: "c.name",
    company_name: "cm.company_name",
  };

  return map[value] || "wl.work_start_at";
};

const WORK_LOG_SPENT_MINUTES_SQL = `
  ROUND(
    CASE
      WHEN wl.work_start_at IS NOT NULL AND wl.work_end_at IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, wl.work_start_at, wl.work_end_at) / 60
      ELSE COALESCE(wl.spent_minutes, 0)
    END,
    2
  )
`;

const buildWorkReportWhere = ({ body = {}, user = {}, includeSearch = false } = {}) => {
  const {
    user_id = "",
    from_date = "",
    to_date = "",
    company_id = "",
    ticket_id = "",
    searchText = "",
  } = body;
  const where = ["wl.status = 'active'"];
  const values = [];

  if (user_id) {
    where.push("wl.employee_id = ?");
    values.push(user_id);
  }

  if (ticket_id) {
    where.push("wl.ticket_id = ?");
    values.push(ticket_id);
  }

  if (from_date) {
    where.push("DATE(wl.work_start_at) >= ?");
    values.push(from_date);
  }

  if (to_date) {
    where.push("DATE(wl.work_start_at) <= ?");
    values.push(to_date);
  }

  if (company_id) {
    where.push("wl.company_id = ?");
    values.push(company_id);
  } else if (!isSuperAdmin(user) && user.company_id) {
    where.push("wl.company_id = ?");
    values.push(user.company_id);
  }

  if (includeSearch && searchText) {
    where.push("(t.ticket_no LIKE ? OR c.name LIKE ? OR a.name LIKE ? OR wl.work_details LIKE ?)");
    values.push(`%${searchText}%`, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values,
  };
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
  const { customer_id = "", from_date = "", to_date = "" } = body;
  const where = ["t.status = 'active'", "t.client_id = ?"];
  const values = [customer_id];

  if (from_date) {
    where.push("DATE(COALESCE(t.start_date, t.created_date)) >= ?");
    values.push(from_date);
  }
  if (to_date) {
    where.push("DATE(COALESCE(t.start_date, t.created_date)) <= ?");
    values.push(to_date);
  }

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("t.company_id = ?");
    values.push(user.company_id);
  }
  // NOT THAT AMC CALLS 
  where.push("t.amc_call = ?");
  values.push('n');
  where.push("t.call_direction = ?");
  values.push('in');
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
        c.company_id,
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
        t.modified_by,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        resolver.name AS resolver_name,
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
        SELECT h.ticket_id, h.created_date AS closed_at, h.changed_by AS resolved_by
        FROM ${DB_PREFIX}ticket_history h
        INNER JOIN (
          SELECT ticket_id, MIN(history_id) AS history_id
          FROM ${DB_PREFIX}ticket_history
          WHERE field_name = 'ticket_status'
            AND new_value = ?
          GROUP BY ticket_id
        ) first_close ON first_close.history_id = h.history_id
      ) cl ON cl.ticket_id = t.ticket_id
      LEFT JOIN ${DB_PREFIX}admin resolver ON cl.resolved_by = resolver.adminID
      ${whereSql}
      ORDER BY COALESCE(t.start_date, t.created_date) DESC, t.ticket_id DESC
    `,
    [CLOSED_STATUS, CLOSED_STATUS, ...values]
  );
};

export const getSummary = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  const delegatedWhere = ["h.field_name = 'assignee'"];
  const delegatedValues = [];
  const generatedWhere = ["t.status = 'active'"];
  const generatedValues = [];

  if (body.user_id) {
    delegatedWhere.push("h.changed_by = ?");
    delegatedValues.push(body.user_id);

    generatedWhere.push("t.created_by = ?");
    generatedValues.push(body.user_id);
  }

  if (body.from_date) {
    delegatedWhere.push("DATE(h.created_date) >= ?");
    delegatedValues.push(body.from_date);

    generatedWhere.push("DATE(t.created_date) >= ?");
    generatedValues.push(body.from_date);
  }

  if (body.to_date) {
    delegatedWhere.push("DATE(h.created_date) <= ?");
    delegatedValues.push(body.to_date);

    generatedWhere.push("DATE(t.created_date) <= ?");
    generatedValues.push(body.to_date);
  }

  if (body.company_id) {
    delegatedWhere.push("t.company_id = ?");
    delegatedValues.push(body.company_id);

    generatedWhere.push("t.company_id = ?");
    generatedValues.push(body.company_id);
  } else if (!isSuperAdmin(user) && user.company_id) {
    delegatedWhere.push("t.company_id = ?");
    delegatedValues.push(user.company_id);

    generatedWhere.push("t.company_id = ?");
    generatedValues.push(user.company_id);
  }

  if (body.ticket_status) {
    generatedWhere.push("t.ticket_status = ?");
    generatedValues.push(body.ticket_status);
  }

  const [rows, delegatedRows, generatedRows] = await Promise.all([
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
      ` SELECT COUNT(DISTINCT h.ticket_id) AS delegated FROM ${DB_PREFIX}ticket_history h INNER JOIN ${DB_PREFIX}tickets t ON h.ticket_id = t.ticket_id WHERE ${delegatedWhere.join(" AND ")} `,
      delegatedValues
    ),
    query(
      ` SELECT COUNT(*) AS generated_tickets FROM ${DB_PREFIX}tickets t WHERE ${generatedWhere.join(" AND ")} `,
      generatedValues
    ),
  ]);
  const summary = rows[0] || {};
  const assigned = Number(summary.assigned || 0);
  const closed = Number(summary.closed || 0);
  const overdue = Number(summary.overdue || 0);
  const delegated = Number(delegatedRows[0]?.delegated || 0);
  const generated = Number(generatedRows[0]?.generated_tickets || 0);
  const closeRate = assigned ? (closed / assigned) * 100 : 0;
  const penalty = overdue * 4;

  return {
    assigned,
    generated,
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
        t.description,
        t.created_date,
        t.created_date AS assigned_date,
        t.start_date,
        t.due_date,
        t.contact_person,
        t.contact_no,
        t.product_name,
        t.product_serial_number,
        t.product_add_ons,
        t.expected_minutes,
        t.amc_call,
        t.call_direction,
        c.name AS customer_name,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        COALESCE(workLogs.resolution_time, 0) AS resolution_time,
        COALESCE(workLogs.resolution_time_seconds, 0) AS resolution_time_seconds
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      LEFT JOIN ${DB_PREFIX}categories priority ON t.ticket_priority = priority.category_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      LEFT JOIN ${DB_PREFIX}categories queryType ON t.query_type = queryType.category_id
      LEFT JOIN ${DB_PREFIX}admin assignee ON t.assignee = assignee.adminID
      LEFT JOIN (
        SELECT
          ticket_id,
          ROUND(SUM(COALESCE(spent_minutes, 0)), 2) AS resolution_time,
          SUM(
            CASE
              WHEN work_start_at IS NOT NULL AND work_end_at IS NOT NULL
                THEN TIMESTAMPDIFF(SECOND, work_start_at, work_end_at)
              ELSE ROUND(COALESCE(spent_minutes, 0) * 60)
            END
          ) AS resolution_time_seconds
        FROM ${DB_PREFIX}ticket_work_logs
        WHERE status = 'active'
        GROUP BY ticket_id
      ) workLogs ON workLogs.ticket_id = t.ticket_id
      ${whereSql}
      ORDER BY ${orderColumn} ${selectedOrder}
      LIMIT ${safeLimit} OFFSET ${start}
    `,
    values
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

const getPerformanceTicketsForExport = async ({ body, user }) => {
  const {
    order_by = "created_date",
    order = "DESC",
  } = body;
  const selectedOrder = normalizeOrder(order);
  const orderColumn = getTicketOrderColumn(order_by);
  const { whereSql, values } = buildTicketWhere({ body, user, includeSearch: true });

  return query(
    `
      SELECT
        t.ticket_id,
        t.ticket_no,
        t.description,
        t.created_date,
        t.created_date AS assigned_date,
        t.start_date,
        t.due_date,
        t.contact_person,
        t.contact_no,
        t.product_name,
        t.product_serial_number,
        t.product_add_ons,
        t.expected_minutes,
        t.amc_call,
        t.call_direction,
        c.name AS customer_name,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        COALESCE(workLogs.resolution_time, 0) AS resolution_time,
        COALESCE(workLogs.resolution_time_seconds, 0) AS resolution_time_seconds
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      LEFT JOIN ${DB_PREFIX}categories priority ON t.ticket_priority = priority.category_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      LEFT JOIN ${DB_PREFIX}categories queryType ON t.query_type = queryType.category_id
      LEFT JOIN ${DB_PREFIX}admin assignee ON t.assignee = assignee.adminID
      LEFT JOIN (
        SELECT
          ticket_id,
          ROUND(SUM(COALESCE(spent_minutes, 0)), 2) AS resolution_time,
          SUM(
            CASE
              WHEN work_start_at IS NOT NULL AND work_end_at IS NOT NULL
                THEN TIMESTAMPDIFF(SECOND, work_start_at, work_end_at)
              ELSE ROUND(COALESCE(spent_minutes, 0) * 60)
            END
          ) AS resolution_time_seconds
        FROM ${DB_PREFIX}ticket_work_logs
        WHERE status = 'active'
        GROUP BY ticket_id
      ) workLogs ON workLogs.ticket_id = t.ticket_id
      ${whereSql}
      ORDER BY ${orderColumn} ${selectedOrder}
    `,
    values
  );
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

export const workReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      order_by = "work_start_at",
      order = "DESC",
    } = req.body;
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const currentPage = Math.max(Number(page) || 1, 1);
    const offset = (currentPage - 1) * safeLimit;
    const safeOrder = normalizeOrder(order);
    const orderColumn = getWorkReportOrderColumn(order_by);
    const { whereSql, values } = buildWorkReportWhere({ body: req.body, user: req.user, includeSearch: true });
    const baseFrom = `
      FROM ${DB_PREFIX}ticket_work_logs wl
      LEFT JOIN ${DB_PREFIX}tickets t ON wl.ticket_id = t.ticket_id
      LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
      LEFT JOIN ${DB_PREFIX}admin a ON wl.employee_id = a.adminID
      LEFT JOIN ${DB_PREFIX}company_master cm ON wl.company_id = cm.company_id
    `;

    const rows = await query(
      `
      SELECT
        wl.work_log_id,
        wl.ticket_id,
        wl.employee_id,
        wl.company_id,
        wl.work_start_at,
        ${WORK_LOG_SPENT_MINUTES_SQL} AS spent_minutes,
        wl.work_details,
        wl.work_status,
        wl.created_date,
        DATE_FORMAT(wl.work_start_at, '%d-%m-%Y') AS work_date,
        DATE_FORMAT(wl.work_start_at, '%h:%i %p') AS work_time,
        t.ticket_no,
        t.expected_minutes,
        c.name AS client_name,
        a.name AS employee_name,
        cm.company_name
      ${baseFrom}
      ${whereSql}
      ORDER BY ${orderColumn} ${safeOrder}
      LIMIT ${safeLimit} OFFSET ${offset}
      `,
      values
    );

    const countRows = await query(
      `
      SELECT COUNT(*) AS total
      ${baseFrom}
      ${whereSql}
      `,
      values
    );
    const total = Number(countRows?.[0]?.total || 0);

    const summaryRows = await query(
      `
      SELECT
        COUNT(*) AS total_logs,
        COALESCE(SUM(${WORK_LOG_SPENT_MINUTES_SQL}), 0) AS total_minutes,
        COUNT(DISTINCT wl.employee_id) AS employee_count,
        COUNT(DISTINCT wl.ticket_id) AS ticket_count
      ${baseFrom}
      ${whereSql}
      `,
      values
    );

    const companyRows = await query(
      `
      SELECT
        wl.company_id,
        COALESCE(cm.company_name, '-') AS company_name,
        COUNT(*) AS total_logs,
        COALESCE(SUM(${WORK_LOG_SPENT_MINUTES_SQL}), 0) AS total_minutes
      ${baseFrom}
      ${whereSql}
      GROUP BY wl.company_id, cm.company_name
      ORDER BY total_minutes DESC
      `,
      values
    );

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: rows,
        summary: summaryRows?.[0] || {},
        company_summary: companyRows,
        pagination: {
          total,
          page: currentPage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
          start: total === 0 ? 0 : offset + 1,
          end: Math.min(offset + safeLimit, total),
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

const getCustomerwiseTickets = async ({ companyId, body, isExport = false, }) => {
  const currentPage = Math.max(Number(body.page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
  const offset = (currentPage - 1) * safeLimit;
  const searchText = String(body.searchText || "").trim();
  const customerWhere = [
    "c.status = 'active'",
    "c.company_id = ?",
  ];
  const customerValues = [companyId];
  const ticketJoin = [
    "t.client_id = c.customer_id",
    "t.status = 'active'",
    "t.company_id = c.company_id",
  ];
  const ticketValues = [];
  if (body.from_date) {
    ticketJoin.push("DATE(t.created_date) >= ?");
    ticketValues.push(body.from_date);
  }

  if (body.to_date) {
    ticketJoin.push("DATE(t.created_date) <= ?");
    ticketValues.push(body.to_date);
  }

  if (searchText) {
    customerWhere.push(
      "(c.name LIKE ? OR c.email LIKE ? OR c.mobile_no LIKE ?)"
    );

    const value = `%${searchText}%`;

    customerValues.push(value, value, value);
  }

  const joinSql = ticketJoin.join(" AND ");
  const whereSql = customerWhere.join(" AND ");

  const paginationSql = isExport
    ? ""
    : `LIMIT ${safeLimit} OFFSET ${offset}`;

  const [companyRows, countRows, summaryRows, customerRows,] = await Promise.all([query(
    `SELECT company_id, company_name
       FROM ${DB_PREFIX}company_master
       WHERE company_id = ?
       LIMIT 1`,
    [companyId]
  ),

  query(
    `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}customer c
       WHERE ${whereSql}`,
    customerValues
  ),

  query(
    `
      SELECT
        COUNT(DISTINCT c.customer_id) AS total_customers,
        COUNT(DISTINCT CASE WHEN t.ticket_id IS NOT NULL THEN c.customer_id END) AS customers_with_tickets,
        COUNT(DISTINCT CASE WHEN t.ticket_id IS NULL THEN c.customer_id END) AS customers_without_tickets,
        COUNT(t.ticket_id) AS total_tickets,
        COALESCE(SUM(CASE WHEN t.ticket_status = 205 THEN 1 ELSE 0 END),0) AS open_tickets,
        COALESCE(SUM(CASE WHEN t.ticket_status IN (206,210) THEN 1 ELSE 0 END),0) AS in_progress_tickets,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END),0) AS closed_tickets,
        COALESCE(SUM(
            CASE
                WHEN t.ticket_id IS NOT NULL
                AND t.due_date < CURRENT_DATE
                AND t.ticket_status <> ?
                THEN 1
                ELSE 0
            END
        ),0) AS overdue_tickets
      FROM ${DB_PREFIX}customer c
      LEFT JOIN ${DB_PREFIX}tickets t
      ON ${joinSql}
      WHERE ${whereSql}
      `,
    [CLOSED_STATUS, CLOSED_STATUS, ...ticketValues, ...customerValues]
  ),

  query(
    `
      SELECT
          c.customer_id,
          c.name AS customer_name,
          c.contact_person,
          c.mobile_no,
          c.email,
          c.is_amc,
          COUNT(t.ticket_id) total_tickets,
          COALESCE(SUM(CASE WHEN t.ticket_status=205 THEN 1 ELSE 0 END),0) open_tickets,
          COALESCE(SUM(CASE WHEN t.ticket_status IN (206,210) THEN 1 ELSE 0 END),0) in_progress_tickets,
          COALESCE(SUM(CASE WHEN t.ticket_status=? THEN 1 ELSE 0 END),0) closed_tickets,
          COALESCE(SUM(
              CASE
                  WHEN t.ticket_id IS NOT NULL
                  AND t.due_date<CURRENT_DATE
                  AND t.ticket_status<>?
                  THEN 1
                  ELSE 0
              END
          ),0) overdue_tickets,
          MAX(t.created_date) last_ticket_date,
          SUBSTRING_INDEX(
              GROUP_CONCAT(t.ticket_no ORDER BY t.created_date DESC,t.ticket_id DESC),
              ',',1
          ) last_ticket_no,

          SUBSTRING_INDEX(
              GROUP_CONCAT(ticketStatus.categoryName ORDER BY t.created_date DESC,t.ticket_id DESC),
              ',',1
          ) last_ticket_status
      FROM ${DB_PREFIX}customer c
      LEFT JOIN ${DB_PREFIX}tickets t
      ON ${joinSql}
      LEFT JOIN ${DB_PREFIX}categories ticketStatus
      ON ticketStatus.category_id=t.ticket_status
      WHERE ${whereSql}
      GROUP BY
      c.customer_id,
      c.name,
      c.contact_person,
      c.mobile_no,
      c.email,
      c.is_amc
      ORDER BY total_tickets DESC,c.name ASC
      ${paginationSql}
      `,
    [CLOSED_STATUS, CLOSED_STATUS, ...ticketValues, ...customerValues]
  ),
  ]);

  return {
    company: companyRows[0] || { company_id: companyId },
    summary: summaryRows[0] || {},
    customers: customerRows,
    total: Number(countRows[0]?.total || 0),
    pagination: !isExport ? {
      page: currentPage,
      limit: safeLimit,
      total: Number(countRows[0]?.total || 0),
      totalPages: Math.ceil(Number(countRows[0]?.total || 0) / safeLimit),
      start:
        Number(countRows[0]?.total || 0) === 0 ? 0 : offset + 1,
      end: Math.min(offset + safeLimit, Number(countRows[0]?.total || 0)),
    } : {},
    filters: {
      company_id: String(companyId),
      from_date: body.from_date || "",
      to_date: body.to_date || "",
      searchText,
    },
  };
};
export const companyCustomerTicketReport = async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = !isSuperAdmin(req.user)
      ? req.user.company_id
      : body.company_id;
    console.log('companyId : ', companyId);

    if (!companyId) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Company is required.",
      });
    }

    const report = await getCustomerwiseTickets({ companyId, body, isExport: false, });
    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: report
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

export const userAttendanceReport = async (req, res) => {
  try {
    const body = req.body || {};
    const userId = Number(body.user_id);

    if (!userId) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "User is required.",
      });
    }

    if (body.from_date && body.to_date && body.from_date > body.to_date) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "From date cannot be after to date.",
      });
    }

    const currentPage = Math.max(Number(body.page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const offset = (currentPage - 1) * safeLimit;
    const companyId = !isSuperAdmin(req.user) ? req.user.company_id : body.company_id;
    // Sign-out logs are intentionally stored with status "inactive".
    const where = ["l.adminID = ?"];
    const values = [userId];

    if (companyId) {
      where.push("l.company_id = ?");
      values.push(companyId);
    }

    if (body.from_date) {
      where.push("DATE(l.created_date) >= ?");
      values.push(body.from_date);
    }

    if (body.to_date) {
      where.push("DATE(l.created_date) <= ?");
      values.push(body.to_date);
    }

    const userWhere = ["a.adminID = ?"];
    const userValues = [userId];
    if (companyId) {
      userWhere.push("a.company_id = ?");
      userValues.push(companyId);
    }

    const userRows = await query(
      `
        SELECT
          a.adminID AS user_id,
          a.name AS user_name,
          a.email,
          a.userName AS username,
          a.company_id,
          cm.company_name
        FROM ${DB_PREFIX}admin a
        LEFT JOIN ${DB_PREFIX}company_master cm ON cm.company_id = a.company_id
        WHERE ${userWhere.join(" AND ")}
        LIMIT 1
      `,
      userValues
    );

    if (!userRows.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found.",
      });
    }

    const locationSql = `
      NULLIF(
        COALESCE(
          NULLIF(l.location, ''),
          CONCAT_WS(', ', NULLIF(l.latitude, ''), NULLIF(l.longitude, ''))
        ),
        ''
      )
    `;
    const dailySql = `
      SELECT
        DATE(l.created_date) AS attendance_date,
        MIN(CASE WHEN l.event_type = 'signin' THEN l.created_date END) AS sign_in_at,
        MAX(CASE WHEN l.event_type = 'signout' THEN l.created_date END) AS sign_out_at,
        SUM(CASE WHEN l.event_type = 'signin' THEN 1 ELSE 0 END) AS sign_in_count,
        SUM(CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END) AS sign_out_count,
        SUBSTRING_INDEX(
          GROUP_CONCAT(CASE WHEN l.event_type = 'signin' THEN ${locationSql} END ORDER BY l.created_date ASC, l.log_id ASC SEPARATOR '||'),
          '||',
          1
        ) AS sign_in_location,
        SUBSTRING_INDEX(
          GROUP_CONCAT(CASE WHEN l.event_type = 'signout' THEN ${locationSql} END ORDER BY l.created_date DESC, l.log_id DESC SEPARATOR '||'),
          '||',
          1
        ) AS sign_out_location
      FROM ${DB_PREFIX}user_location_logs l
      WHERE ${where.join(" AND ")}
      GROUP BY DATE(l.created_date)
    `;

    const [countRows, summaryRows, attendanceRows] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM (${dailySql}) daily`, values),
      query(
        `
          SELECT
            COUNT(*) AS total_days,
            COALESCE(SUM(CASE WHEN daily.sign_in_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS present_days,
            COALESCE(SUM(CASE WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_days,
            COALESCE(SUM(CASE WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NULL THEN 1 ELSE 0 END), 0) AS missing_sign_out,
            COALESCE(SUM(CASE
              WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL
                THEN GREATEST(TIMESTAMPDIFF(SECOND, daily.sign_in_at, daily.sign_out_at), 0)
              ELSE 0
            END), 0) AS total_work_seconds,
            COALESCE(ROUND(AVG(CASE
              WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL
                THEN GREATEST(TIMESTAMPDIFF(SECOND, daily.sign_in_at, daily.sign_out_at), 0)
            END)), 0) AS average_work_seconds
          FROM (${dailySql}) daily
        `,
        values
      ),
      query(
        `
          SELECT
            daily.*,
            CASE
              WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL THEN 'Complete'
              WHEN daily.sign_in_at IS NOT NULL THEN 'Missing Sign Out'
              ELSE 'Missing Sign In'
            END AS attendance_status,
            CASE
              WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL
                THEN GREATEST(TIMESTAMPDIFF(SECOND, daily.sign_in_at, daily.sign_out_at), 0)
              ELSE NULL
            END AS work_seconds
          FROM (${dailySql}) daily
          ORDER BY daily.attendance_date DESC
          LIMIT ${safeLimit} OFFSET ${offset}
        `,
        values
      ),
    ]);

    const total = Number(countRows[0]?.total || 0);

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          user: userRows[0],
          company: {
            company_id: userRows[0].company_id,
            company_name: userRows[0].company_name,
          },
          summary: summaryRows[0] || {},
          attendance: attendanceRows,
          filters: {
            user_id: String(userId),
            company_id: String(companyId || ""),
            from_date: body.from_date || "",
            to_date: body.to_date || "",
          },
          pagination: {
            page: currentPage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit),
            start: total === 0 ? 0 : offset + 1,
            end: Math.min(offset + safeLimit, total),
          },
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

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatFilterLabel = (key = "") =>
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getTicketValue = (ticket = {}, keys = []) => {
  const key = keys.find((item) => ticket[item] !== undefined && ticket[item] !== null && ticket[item] !== "");
  return key ? ticket[key] : "";
};

const safeFileName = (value = "report") =>
  String(value || "report")
    .replace(/[^a-z0-9-_.]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "report";

const sendExcelDownload = (res, attachment) => {
  const fileName = safeFileName(attachment.filename || "report.xls");
  const content = Buffer.from(String(attachment.content || ""), "utf8");

  res.attachment(fileName);
  res.setHeader("Content-Type", `${attachment.contentType || "application/vnd.ms-excel"}; charset=utf-8`);
  res.setHeader("Content-Length", content.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(content);
};

const performanceSummaryLabels = {
  assigned: "Total Assigned Tickets",
  generated: "Generated Tickets",
  closed: "Closed Tickets",
  pending: "Pending Tickets",
  delegated: "Delegated Tickets",
  overdue: "Overdue Tickets",
  avg_resolution_time: "Average Resolution Time (hrs)",
  productivity_score: "Productivity Score",
};

const performanceTicketColumns = [
  ["Sr No", []],
  ["Ticket Number", ["ticket_no", "ticketNo", "ticket_number", "ticket_id"]],
  ["Customer Name", ["customer_name", "customerName", "client_name", "client_id", "name"]],
  ["Priority", ["priority_name", "ticket_priority_name", "ticket_priority", "priority"]],
  ["Ticket Status", ["status_name", "ticket_status_name", "ticket_status", "status"]],
  ["Assigned Date", ["assigned_date", "created_date", "start_date"]],
  ["Due Date", ["due_date", "dueDate"]],
  ["Resolution Time", ["resolution_time", "resolutionTime", "resolve_time"]],
];

const getStatusExcelClass = (value = "") => {
  const status = String(value || "").toLowerCase();
  if (status.includes("closed") || status.includes("resolved") || status === CLOSED_STATUS) return "excel-status-closed";
  if (status.includes("progress")) return "excel-status-progress";
  return "excel-status-open";
};

export const exportCustomerReportExcel = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
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

    const attachment = await buildReportAttachment({ customer, summary, supportRows: tickets });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
export const exportUserPerformanceExcel = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.user_id) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "user_id is required" });
    }

    const [userDetails, summary, tickets] = await Promise.all([
      getUserDetails(body.user_id),
      getSummary({ body, user: req.user }),
      getPerformanceTicketsForExport({ body, user: req.user }),
    ]);
    // console.log(tickets);
    console.log(summary);

    const attachment = await buildPerformanceExcelAttachment({ filters: body, summary, tickets, user: userDetails });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.log("error : ", error);

    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
export const exportCustomerwiseReportExcel = async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = !isSuperAdmin(req.user)
      ? req.user.company_id
      : body.company_id;

    if (!companyId) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Company is required.",
      });
    }
    const {company, customers, filters, summary} = await getCustomerwiseTickets({ companyId, body, isExport: true, });
    console.log({company, customers, filters, summary});
    const attachment = await buildCustomerWiseExcelAttachment({ company, customers, filters, summary });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.log(error);
    
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const sendReport = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
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
    const html = await buildSupportReportTemplate({ customer, supportCallCount: supportRows.length, summary, products });
    const attachments = [await buildReportAttachment({ customer, summary, supportRows, })];
    // SEND EMAIL To Customer 
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
