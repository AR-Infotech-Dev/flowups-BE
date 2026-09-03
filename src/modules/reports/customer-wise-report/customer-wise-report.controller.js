import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { buildCustomerWiseExcelAttachment } from "#shared/utils/report.utils.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import {
  buildReportPagination,
  CLOSED_TICKET_STATUS as CLOSED_STATUS,
  getReportPagination,
  sendExcelDownload,
} from "../report.utils.js";

const getCustomerwiseTickets = async ({ companyId, body, isExport = false, }) => {
  const { page: currentPage, limit: safeLimit, offset } = getReportPagination({
    page: body.page,
    limit: body.limit,
  });
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
        COALESCE(SUM( CASE WHEN t.ticket_id IS NOT NULL AND t.due_date < CURRENT_DATE AND t.ticket_status <> ? THEN 1 ELSE 0 END ),0) AS overdue_tickets
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
          COALESCE(SUM( CASE WHEN t.ticket_id IS NOT NULL AND t.due_date<CURRENT_DATE AND t.ticket_status<>? THEN 1 ELSE 0 END ),0) overdue_tickets,
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
    pagination: !isExport
      ? buildReportPagination({
        page: currentPage,
        limit: safeLimit,
        offset,
        total: Number(countRows[0]?.total || 0),
      })
      : {},
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

export const list = companyCustomerTicketReport;
export const exportExcel = exportCustomerwiseReportExcel;
