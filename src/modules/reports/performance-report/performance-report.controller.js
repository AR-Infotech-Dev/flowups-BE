import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { buildPerformanceExcelAttachment } from "#shared/utils/report.utils.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import {
  buildReportPagination,
  CLOSED_TICKET_STATUS as CLOSED_STATUS,
  getReportPagination,
  normalizeReportOrder as normalizeOrder,
  sendExcelDownload,
} from "../report.utils.js";

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


export const getSummary = async ({ body, user }) => {
  const { whereSql, values } = buildTicketWhere({ body, user });
  const delegatedWhere = [
    "h.field_name = 'assignee'",
    "h.action_type = 'reassigned'",
  ];
  const delegatedValues = [];
  const generatedWhere = ["t.status = 'active'"];
  const generatedValues = [];

  if (body.user_id) {
    delegatedWhere.push("h.old_value = ?", "h.changed_by = ?");
    delegatedValues.push(String(body.user_id), body.user_id);

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
  const { page: currentPage, limit: safeLimit, offset: start } = getReportPagination({
    page,
    limit,
    defaultLimit: 10,
  });
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
    pagination: buildReportPagination({ page: currentPage, limit: safeLimit, offset: start, total }),
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
    `SELECT
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
    COALESCE(workLogs.resolution_time_seconds, 0) AS resolution_time_seconds,
    COALESCE(workLogs.work_logs, JSON_ARRAY()) AS work_logs,
    COALESCE(ticketHistory.history, JSON_ARRAY()) AS history

  FROM ${DB_PREFIX}tickets t

  LEFT JOIN ${DB_PREFIX}customer c
    ON t.client_id = c.customer_id

  LEFT JOIN ${DB_PREFIX}categories priority
    ON t.ticket_priority = priority.category_id

  LEFT JOIN ${DB_PREFIX}categories status
    ON t.ticket_status = status.category_id

  LEFT JOIN ${DB_PREFIX}categories queryType
    ON t.query_type = queryType.category_id

  LEFT JOIN ${DB_PREFIX}admin assignee
    ON t.assignee = assignee.adminID

  LEFT JOIN (
    SELECT
      twl.ticket_id,

      ROUND(
        SUM(COALESCE(twl.spent_minutes, 0)),
        2
      ) AS resolution_time,

      SUM(
        CASE
          WHEN twl.work_start_at IS NOT NULL
            AND twl.work_end_at IS NOT NULL
          THEN TIMESTAMPDIFF(
            SECOND,
            twl.work_start_at,
            twl.work_end_at
          )
          ELSE ROUND(COALESCE(twl.spent_minutes, 0) * 60)
        END
      ) AS resolution_time_seconds,

      JSON_ARRAYAGG(
        JSON_OBJECT(
          'work_log_id', twl.work_log_id,
          'employee_id', twl.employee_id,
          'employee_name', tlcb.name,
          'work_start_at', twl.work_start_at,
          'work_end_at', twl.work_end_at,
          'spent_minutes', COALESCE(twl.spent_minutes, 0),
          'work_details', twl.work_details,
          'work_status', twl.work_status,
          'created_date', twl.created_date
        )
      ) AS work_logs

    FROM ${DB_PREFIX}ticket_work_logs twl

    LEFT JOIN ${DB_PREFIX}admin tlcb
      ON twl.employee_id = tlcb.adminID

    WHERE twl.status = 'active'

    GROUP BY twl.ticket_id
  ) workLogs
    ON workLogs.ticket_id = t.ticket_id

  LEFT JOIN (
    SELECT
      th.ticket_id,

      JSON_ARRAYAGG(
        JSON_OBJECT(
          'action_type', th.action_type,
          'field_name', th.field_name,
          'old_value', th.old_value,
          'old_label',
            CASE
              WHEN th.field_name IN (
                'ticket_status',
                'ticket_priority',
                'query_type'
              )
                THEN COALESCE(c_old.categoryName, th.old_value)

              WHEN th.field_name IN (
                'assignee',
                'changed_by'
              )
                THEN COALESCE(a_old.name, th.old_value)

              ELSE th.old_value
            END,

          'new_value', th.new_value,
          'new_label',
            CASE
              WHEN th.field_name IN (
                'ticket_status',
                'ticket_priority',
                'query_type'
              )
                THEN COALESCE(c_new.categoryName, th.new_value)

              WHEN th.field_name IN (
                'assignee',
                'changed_by'
              )
                THEN COALESCE(a_new.name, th.new_value)

              ELSE th.new_value
            END,

          'changed_by', th.changed_by,
          'changed_by_name', cb.name,
          'created_date', th.created_date,
          'comment', th.comment
        )
      ) AS history

    FROM ${DB_PREFIX}ticket_history th

    LEFT JOIN ${DB_PREFIX}admin cb
      ON th.changed_by = cb.adminID

    LEFT JOIN ${DB_PREFIX}categories c_old
      ON th.field_name IN (
        'ticket_status',
        'ticket_priority',
        'query_type'
      )
      AND CAST(th.old_value AS UNSIGNED) = c_old.category_id

    LEFT JOIN ${DB_PREFIX}categories c_new
      ON th.field_name IN (
        'ticket_status',
        'ticket_priority',
        'query_type'
      )
      AND CAST(th.new_value AS UNSIGNED) = c_new.category_id

    LEFT JOIN ${DB_PREFIX}admin a_old
      ON th.field_name IN (
        'assignee',
        'changed_by'
      )
      AND CAST(th.old_value AS UNSIGNED) = a_old.adminID

    LEFT JOIN ${DB_PREFIX}admin a_new
      ON th.field_name IN (
        'assignee',
        'changed_by'
      )
      AND CAST(th.new_value AS UNSIGNED) = a_new.adminID
      GROUP BY th.ticket_id 
      ORDER BY MAX(th.history_id) DESC
  ) ticketHistory
    ON ticketHistory.ticket_id = t.ticket_id

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
    const attachment = await buildPerformanceExcelAttachment({ filters: body, summary, tickets, user: userDetails });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.error("error : ", error);

    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const list = userPerformance;
export const exportExcel = exportUserPerformanceExcel;
