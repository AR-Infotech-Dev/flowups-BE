import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { buildUserWiseAttendanceExcelAttachment } from "#shared/utils/report.utils.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import {
  buildReportPagination,
  getReportPagination,
  sendExcelDownload,
} from "../report.utils.js";

const getUserWiseAttendance = async ({ companyId, body, isExport = false, }) => {
  const { page: currentPage, limit: safeLimit, offset } = getReportPagination({
    page: body.page,
    limit: body.limit,
  });
  const searchText = String(body.searchText || "").trim();
  const userWhere = [
    "a.company_id=?"
  ];
  const userValues = [companyId];
  const attendanceJoin = [
    "l.adminID=a.adminID",
    "l.status='active'",
    "l.company_id=a.company_id"
  ];
  const attendanceValues = [];
  if (body.from_date) {
    attendanceJoin.push(
      "DATE(l.created_date)>=?"
    );
    attendanceValues.push(
      body.from_date
    );
  }

  if (body.to_date) {
    attendanceJoin.push(
      "DATE(l.created_date)<=?"
    );
    attendanceValues.push(body.to_date);
  }

  if (searchText) {
    userWhere.push(
      "(a.name LIKE ? OR a.email LIKE ? OR a.userName LIKE ?)"
    );

    const value = `%${searchText}%`;

    userValues.push(value, value, value);
  }

  const joinSql = attendanceJoin.join(" AND ");
  const whereSql = userWhere.join(" AND ");

  const paginationSql = isExport ? "" : `LIMIT ${safeLimit} OFFSET ${offset}`;

  const [companyRows, countRows, summaryRows, userRows,] = await Promise.all([
    query(
      `SELECT company_id, company_name
       FROM ${DB_PREFIX}company_master
       WHERE company_id = ?
       LIMIT 1`,
      [companyId]
    ),

    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}admin a
       WHERE ${whereSql}`,
      userValues
    ),

    query(
      `SELECT 
        COUNT(DISTINCT a.adminID) AS total_users,
        COUNT(DISTINCT CASE WHEN l.event_type = 'signin' THEN a.adminID END) AS signed_in_users,
        COUNT(DISTINCT CASE WHEN l.event_type = 'signout' THEN a.adminID END) AS signed_out_users,
        COUNT(l.log_id) AS total_logs,
        COALESCE(SUM( CASE  WHEN l.event_type = 'signin'  THEN 1 ELSE 0 END),0) AS total_signins,
        COALESCE(SUM( CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END ),0) AS total_signouts
      FROM ${DB_PREFIX}admin a
      LEFT JOIN ${DB_PREFIX}user_location_logs l
      ON ${joinSql}
      WHERE ${whereSql}`,
      [...attendanceValues, ...userValues]
    ),

    query(
      `SELECT
        a.adminID AS user_id,
        a.name AS user_name,
        a.userName AS username,
        a.email,
        a.contactNo,
        COUNT(l.log_id) AS total_logs,
        COALESCE(SUM(CASE WHEN l.created_date IS NOT NULL THEN 1 ELSE 0 END), 0) AS present_days,
        COALESCE( SUM( CASE WHEN l.event_type = 'signin' THEN 1 ELSE 0 END ),0 ) AS total_signin,
        COALESCE( SUM( CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END ),0 ) AS total_signout,
        MAX(l.created_date) AS last_activity,
        SUBSTRING_INDEX( GROUP_CONCAT( l.event_type ORDER BY l.created_date DESC, l.log_id DESC ), ',', 1 ) AS last_event,
        SUBSTRING_INDEX( GROUP_CONCAT( l.location ORDER BY l.created_date DESC, l.log_id DESC ), ',', 1 ) AS last_location
      FROM ${DB_PREFIX}admin a
      LEFT JOIN ${DB_PREFIX}user_location_logs l ON ${joinSql}
      WHERE ${whereSql}
    GROUP BY a.adminID, a.name, a.userName, a.email, a.contactNo
    ORDER BY total_logs DESC, a.name ASC
    ${paginationSql}
  `,
      [...attendanceValues, ...userValues]
    ),
  ]);

  return {
    company: companyRows[0] || { company_id: companyId },
    summary: summaryRows[0] || {},
    users: userRows,
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
export const companyUserAttendanceReport = async (req, res) => {
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

    const report = await getUserWiseAttendance({ companyId, body, isExport: false, });
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

export const exportUserWiseAttendanceExcel = async (req, res) => {
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
      summary
    }
      =
      await getUserWiseAttendance({
        companyId,
        body,
        isExport: true,
      });
    console.log({
      company,
      users,
      filters,
      summary
    });
    const attachment = await buildUserWiseAttendanceExcelAttachment({ company, users, filters, summary });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.log(error);
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const list = companyUserAttendanceReport;
export const exportExcel = exportUserWiseAttendanceExcel;


