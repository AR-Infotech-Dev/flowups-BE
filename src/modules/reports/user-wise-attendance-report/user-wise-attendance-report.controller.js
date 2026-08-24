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
  const fromDate = body.from_date || "";
  const toDate = body.to_date || "";
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

  if (fromDate) {
    attendanceJoin.push(
      "DATE(l.created_date)>=?"
    );
    attendanceValues.push(
      fromDate
    );
  }

  if (toDate) {
    attendanceJoin.push(
      "DATE(l.created_date)<=?"
    );
    attendanceValues.push(toDate);
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
        COUNT(DISTINCT CASE WHEN l.event_type = 'signin' THEN DATE(l.created_date) END) AS present_days,
        COALESCE(SUM(CASE WHEN l.event_type = 'signin' THEN 1 ELSE 0 END), 0) AS total_signin,
        COALESCE(SUM(CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END), 0) AS total_signout,
        MAX(l.created_date) AS last_activity,
        SUBSTRING_INDEX(GROUP_CONCAT(l.event_type ORDER BY l.created_date DESC, l.log_id DESC), ',', 1) AS last_event,
        SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(l.location, '') ORDER BY l.created_date DESC, l.log_id DESC), ',', 1) AS last_location
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

  const userIds = userRows.map((user) => Number(user.user_id)).filter(Boolean);
  const userAttendanceMap = new Map(userIds.map((userId) => [String(userId), []]));

  if (userIds.length) {
    const placeholders = userIds.map(() => "?").join(",");
    const dayWhere = [
      "l.company_id=?",
      `l.adminID IN (${placeholders})`,
    ];
    const dayValues = [companyId, ...userIds];

    if (fromDate) {
      dayWhere.push("DATE(l.created_date)>=?");
      dayValues.push(fromDate);
    }

    if (toDate) {
      dayWhere.push("DATE(l.created_date)<=?");
      dayValues.push(toDate);
    }

    const locationSql = `NULLIF(COALESCE(NULLIF(l.location, ''), CONCAT_WS(', ', NULLIF(l.latitude, ''), NULLIF(l.longitude, ''))), '')`;
    const dayRows = await query(
      `SELECT
        l.adminID AS user_id,
        DATE(l.created_date) AS attendance_date,
        MIN(CASE WHEN l.event_type = 'signin' THEN l.created_date END) AS sign_in_at,
        MAX(CASE WHEN l.event_type = 'signout' THEN l.created_date END) AS sign_out_at,
        SUM(CASE WHEN l.event_type = 'signin' THEN 1 ELSE 0 END) AS sign_in_count,
        SUM(CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END) AS sign_out_count,
        SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN l.event_type = 'signin' THEN ${locationSql} END ORDER BY l.created_date ASC, l.log_id ASC SEPARATOR '||'), '||', 1) AS sign_in_location,
        SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN l.event_type = 'signout' THEN ${locationSql} END ORDER BY l.created_date DESC, l.log_id DESC SEPARATOR '||'), '||', 1) AS sign_out_location,
        CASE
          WHEN MIN(CASE WHEN l.event_type = 'signin' THEN l.created_date END) IS NOT NULL
           AND MAX(CASE WHEN l.event_type = 'signout' THEN l.created_date END) IS NOT NULL
          THEN GREATEST(TIMESTAMPDIFF(SECOND,
            MIN(CASE WHEN l.event_type = 'signin' THEN l.created_date END),
            MAX(CASE WHEN l.event_type = 'signout' THEN l.created_date END)
          ), 0)
          ELSE NULL
        END AS work_seconds
      FROM ${DB_PREFIX}user_location_logs l
      WHERE ${dayWhere.join(" AND ")}
      GROUP BY l.adminID, DATE(l.created_date)
      ORDER BY attendance_date ASC`,
      dayValues
    );

    dayRows.forEach((row) => {
      const signInDate = row.sign_in_at ? new Date(row.sign_in_at) : null;
      const signInMinutes = signInDate && !Number.isNaN(signInDate.getTime()) ? signInDate.getHours() * 60 + signInDate.getMinutes() : null;
      const isLate = signInMinutes !== null && signInMinutes > 10 * 60;
      const attendanceStatus = row.sign_in_at && row.sign_out_at
        ? "complete"
        : row.sign_in_at
          ? "missing_sign_out"
          : "missing_sign_in";

      userAttendanceMap.get(String(row.user_id))?.push({
        ...row,
        status: row.sign_in_at ? (isLate ? "late" : "present") : "absent",
        attendance_status: attendanceStatus,
      });
    });
  }

  const users = userRows.map((user) => ({
    ...user,
    attendance_days: userAttendanceMap.get(String(user.user_id)) || [],
  }));

  return {
    company: companyRows[0] || { company_id: companyId },
    summary: summaryRows[0] || {},
    users,
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
      from_date: fromDate,
      to_date: toDate,
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

    if (!isSuperAdmin(req.user) && !companyId) {
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
    const attachment = await buildUserWiseAttendanceExcelAttachment({ company, users, filters, summary });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    console.log(error);
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const list = companyUserAttendanceReport;
export const exportExcel = exportUserWiseAttendanceExcel;


