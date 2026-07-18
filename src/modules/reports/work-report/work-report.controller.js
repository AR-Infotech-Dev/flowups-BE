import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import {
  buildReportPagination,
  getReportPagination,
  normalizeReportOrder,
} from "../report.utils.js";

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

export const workReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      order_by = "work_start_at",
      order = "DESC",
    } = req.body;
    const { page: currentPage, limit: safeLimit, offset } = getReportPagination({
      page,
      limit,
      defaultLimit: 10,
    });
    const safeOrder = normalizeReportOrder(order);
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
        pagination: buildReportPagination({ page: currentPage, limit: safeLimit, offset, total }),
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


export const list = workReport;

