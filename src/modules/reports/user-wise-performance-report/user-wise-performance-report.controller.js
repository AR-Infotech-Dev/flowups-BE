
import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import { getSummary } from "../performance-report/performance-report.controller.js";
import { buildReportPagination, CLOSED_TICKET_STATUS as CLOSED_STATUS, getReportPagination, sendExcelDownload, buildUserWiseExcelAttachment, } from "../report.utils.js";

const getUserwiseTickets = async ({
  companyId,
  body,
  user,
  isExport = false,
}) => {
  const {
    page: currentPage,
    limit: safeLimit,
    offset,
  } = getReportPagination({
    page: body.page,
    limit: body.limit,
  });

  const searchText = String(body.searchText || "").trim();

  // USER WHERE

  const userWhere = [
    "u.company_id = ?",
  ];

  const userValues = [companyId];

  if (searchText) {
    userWhere.push(
      "(u.name LIKE ? OR u.email LIKE ? OR u.contactNo LIKE ?)"
    );

    const value = `%${searchText}%`;

    userValues.push(value, value, value);
  }

  // --------------------------------------------------
  // TICKET JOIN
  // --------------------------------------------------
  const ticketJoin = [
    "t.assignee = u.adminID",
    "t.status = 'active'",
    "t.company_id = u.company_id",
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

  const userWhereSql = userWhere.join(" AND ");
  const ticketJoinSql = ticketJoin.join(" AND ");

  const paginationSql = isExport
    ? ""
    : `LIMIT ${safeLimit} OFFSET ${offset}`;

  // QUERIES
 
  const [
    companyRows,
    countRows,
    summaryRows,
    userRows,
  ] = await Promise.all([

    // COMPANY
    
    query(
      `
        SELECT
          company_id,
          company_name
        FROM ${DB_PREFIX}company_master
        WHERE company_id = ?
        LIMIT 1
      `,
      [companyId]
    ),

   // USER COUNT
   
    query(
      `
        SELECT COUNT(*) AS total
        FROM ${DB_PREFIX}admin u
        WHERE ${userWhereSql}
      `,
      userValues
    ),

    // SUMMARY
  
    query(
      `
        SELECT
          COUNT(DISTINCT u.adminID) AS total_users,

          COUNT(
            DISTINCT CASE
              WHEN t.ticket_id IS NOT NULL
              THEN u.adminID
            END
          ) AS users_with_tickets,

          COUNT(
            DISTINCT CASE
              WHEN t.ticket_id IS NULL
              THEN u.adminID
            END
          ) AS users_without_tickets,

          COUNT(t.ticket_id) AS total_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status = 205
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS open_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status IN (206, 210)
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS in_progress_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status = ?
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS closed_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_id IS NOT NULL
                  AND t.due_date < CURRENT_DATE
                  AND t.ticket_status <> ?
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS overdue_tickets

        FROM ${DB_PREFIX}admin u

        LEFT JOIN ${DB_PREFIX}tickets t
          ON ${ticketJoinSql}

        WHERE ${userWhereSql}
      `,
      [
        CLOSED_STATUS,
        CLOSED_STATUS,
        ...ticketValues,
        ...userValues,
      ]
    ),

    // -----------------------------------------------
    // USER LIST
    // -----------------------------------------------
    query(
      `
        SELECT
          u.adminID AS user_id,
          u.name AS user_name,
          u.contactNo AS contact_no,
          u.email,

          COUNT(t.ticket_id) AS total_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status = 205
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS open_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status IN (206, 210)
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS in_progress_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_status = ?
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS closed_tickets,

          COALESCE(
            SUM(
              CASE
                WHEN t.ticket_id IS NOT NULL
                  AND t.due_date < CURRENT_DATE
                  AND t.ticket_status <> ?
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS overdue_tickets,

          MAX(t.created_date) AS last_ticket_date,

          SUBSTRING_INDEX(
            GROUP_CONCAT(
              t.ticket_no
              ORDER BY t.created_date DESC, t.ticket_id DESC
            ),
            ',',
            1
          ) AS last_ticket_no,

          SUBSTRING_INDEX(
            GROUP_CONCAT(
              ticketStatus.categoryName
              ORDER BY t.created_date DESC, t.ticket_id DESC
            ),
            ',',
            1
          ) AS last_ticket_status

        FROM ${DB_PREFIX}admin u

        LEFT JOIN ${DB_PREFIX}tickets t
          ON ${ticketJoinSql}

        LEFT JOIN ${DB_PREFIX}categories ticketStatus
          ON ticketStatus.category_id = t.ticket_status

        WHERE ${userWhereSql}

        GROUP BY
          u.adminID,
          u.name,
          u.contactNo,
          u.email

        ORDER BY
          total_tickets DESC,
          u.name ASC

        ${paginationSql}
      `,
      [
        CLOSED_STATUS,
        CLOSED_STATUS,
        ...ticketValues,
        ...userValues,
      ]
    ),
  ]);
  console.log("🔥 USER ROWS:", userRows);
  console.log("🔥 COUNT ROWS:", countRows);
  console.log("🔥 SUMMARY ROWS:", summaryRows);
  const total = Number(countRows[0]?.total || 0);
  const usersWithSummary = await Promise.all(
    userRows.map(async (userRow) => {
      const userSummaryBody = {
        ...body,
        user_id: userRow.user_id,
      };

      const summary = await getSummary({
        body: userSummaryBody,
        user,
      });

      console.log(
        `🔥 SUMMARY FOR USER ${userRow.user_id} - ${userRow.user_name}:`,
        summary
      );

      return {
        ...userRow,
        ...summary,
      };
    })
  );
  console.log('usersWithSummary : ', usersWithSummary);

  return {
    company: companyRows[0] || {
      company_id: companyId,
    },

    summary: summaryRows[0] || {},

    users: usersWithSummary || [],

    total,

    pagination: !isExport
      ? buildReportPagination({
        page: currentPage,
        limit: safeLimit,
        offset,
        total,
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
export const companyUserTicketReport = async (req, res) => {
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
   const report = await getUserwiseTickets({ companyId, body, user: req.user, isExport: false, });
   return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: report,
    });
  } catch (error) {
    console.error("❌ COMPANY USER REPORT ERROR:", error);
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
export const exportUserwiseReportExcel = async (req, res) => {
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

    const {
      company,
      users,
      filters,
      summary,
    } = await getUserwiseTickets({
      companyId,
      body,
      isExport: true,
    });

    console.log({
      company,
      users,
      filters,
      summary,
    });
    const attachment = await buildUserWiseExcelAttachment({
      company,
      users,
      filters,
      summary,
    });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.log(error);
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
export const list = companyUserTicketReport;
export const exportExcel = exportUserwiseReportExcel;
