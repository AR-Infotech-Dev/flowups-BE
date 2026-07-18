import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { buildSheetSpacerRow, buildSideBySideRows, excelFormat } from "#shared/utils/excel.utils.js";
import { formatDate } from "#shared/utils/report.utils.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import { renderTemplate } from "#shared/utils/templateMaker.js";
import { buildReportPagination, getReportPagination, sendExcelDownload } from "../report.utils.js";

const validateFilters = (body = {}) => {
  if (!Number(body.user_id)) return "User is required.";
  if (body.from_date && body.to_date && body.from_date > body.to_date) return "From date cannot be after to date.";
  return "";
};

const formatTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const formatDuration = (value) => {
  const seconds = Math.max(Number(value) || 0, 0);
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.round(seconds % 60)}s`;
};

const getAttendanceData = async ({ req, body = {}, isExport = false }) => {
  const userId = Number(body.user_id);
  const companyId = !isSuperAdmin(req.user) ? req.user.company_id : body.company_id;
  const { page, limit, offset } = getReportPagination({ page: body.page, limit: body.limit });
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
    `SELECT a.adminID AS user_id, a.name AS user_name, a.email, a.userName AS username,
            a.company_id, cm.company_name
       FROM ${DB_PREFIX}admin a
       LEFT JOIN ${DB_PREFIX}company_master cm ON cm.company_id = a.company_id
      WHERE ${userWhere.join(" AND ")}
      LIMIT 1`,
    userValues
  );
  if (!userRows.length) {
    const error = new Error("User not found.");
    error.httpStatus = 404;
    throw error;
  }

  const locationSql = `NULLIF(COALESCE(NULLIF(l.location, ''), CONCAT_WS(', ', NULLIF(l.latitude, ''), NULLIF(l.longitude, ''))), '')`;
  const dailySql = `
    SELECT DATE(l.created_date) AS attendance_date,
      MIN(CASE WHEN l.event_type = 'signin' THEN l.created_date END) AS sign_in_at,
      MAX(CASE WHEN l.event_type = 'signout' THEN l.created_date END) AS sign_out_at,
      SUM(CASE WHEN l.event_type = 'signin' THEN 1 ELSE 0 END) AS sign_in_count,
      SUM(CASE WHEN l.event_type = 'signout' THEN 1 ELSE 0 END) AS sign_out_count,
      SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN l.event_type = 'signin' THEN ${locationSql} END ORDER BY l.created_date ASC, l.log_id ASC SEPARATOR '||'), '||', 1) AS sign_in_location,
      SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN l.event_type = 'signout' THEN ${locationSql} END ORDER BY l.created_date DESC, l.log_id DESC SEPARATOR '||'), '||', 1) AS sign_out_location
    FROM ${DB_PREFIX}user_location_logs l
    WHERE ${where.join(" AND ")}
    GROUP BY DATE(l.created_date)`;

  const attendanceSql = `
    SELECT daily.*,
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
    ${isExport ? "" : `LIMIT ${limit} OFFSET ${offset}`}`;

  const [countRows, summaryRows, attendance] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM (${dailySql}) daily`, values),
    query(`SELECT COUNT(*) AS total_days,
      COALESCE(SUM(daily.sign_in_at IS NOT NULL), 0) AS present_days,
      COALESCE(SUM(daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL), 0) AS completed_days,
      COALESCE(SUM(daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NULL), 0) AS missing_sign_out,
      COALESCE(SUM(CASE WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, daily.sign_in_at, daily.sign_out_at), 0) ELSE 0 END), 0) AS total_work_seconds,
      COALESCE(ROUND(AVG(CASE WHEN daily.sign_in_at IS NOT NULL AND daily.sign_out_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, daily.sign_in_at, daily.sign_out_at), 0) END)), 0) AS average_work_seconds
      FROM (${dailySql}) daily`, values),
    query(attendanceSql, values),
  ]);

  const total = Number(countRows[0]?.total || 0);
  const user = userRows[0];
  return {
    user,
    company: { company_id: user.company_id, company_name: user.company_name },
    summary: summaryRows[0] || {},
    attendance,
    filters: { user_id: String(userId), company_id: String(companyId || ""), from_date: body.from_date || "", to_date: body.to_date || "" },
    pagination: isExport ? {} : buildReportPagination({ page, limit, offset, total }),
  };
};

const buildAttendanceExcelAttachment = async ({ user, company, summary, attendance, filters }) => {
  const spreadsheetColumnCount = 8;
  const htmlBody = await renderTemplate("attendanceReport", "excel", {
    spreadsheetColumnCount,
    reportTitle: "User Attendance Report",
    spacerRow: await buildSheetSpacerRow(18, spreadsheetColumnCount),
    summarySection: await buildSideBySideRows({
      leftTitle: "Summary",
      leftData: {
        "Logged Days": summary.total_days || 0,
        "Present Days": summary.present_days || 0,
        "Complete Days": summary.completed_days || 0,
        "Missing Sign Out": summary.missing_sign_out || 0,
        "Total Work Time": formatDuration(summary.total_work_seconds),
        "Average / Day": formatDuration(summary.average_work_seconds),
      },
      rightTitle: "Report Details",
      rightData: {
        User: user.user_name || "-",
        Company: company.company_name || "-",
        "From Date": filters.from_date || "-",
        "To Date": filters.to_date || "-",
      },
      gapCols: 2,
      labelColspan: 1,
      valueColspan: 2,
    }),
    hasRows: attendance.length > 0,
    rows: attendance.map((row, index) => ({
      srNo: index + 1,
      date: formatDate(row.attendance_date),
      signIn: formatTime(row.sign_in_at),
      signInLocation: row.sign_in_location || "-",
      signOut: formatTime(row.sign_out_at),
      signOutLocation: row.sign_out_location || "-",
      workDuration: row.work_seconds === null ? "-" : formatDuration(row.work_seconds),
      status: row.attendance_status || "-",
    })),
  });
  return {
    filename: `Attendance-Report-${user.user_name || "User"}.xls`,
    content: await excelFormat(htmlBody),
    contentType: "application/vnd.ms-excel",
  };
};

const handleError = (res, error) => failureResponse(res, {
  code: error.httpStatus === 404 ? 2004 : 2008,
  httpStatus: error.httpStatus || 500,
  message: error.message,
});

export const userAttendanceReport = async (req, res) => {
  try {
    const body = req.body || {};
    const message = validateFilters(body);
    if (message) return failureResponse(res, { code: 2001, httpStatus: 400, message });
    const report = await getAttendanceData({ req, body });
    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: report } });
  } catch (error) {
    return handleError(res, error);
  }
};

export const exportAttendanceExcel = async (req, res) => {
  try {
    const body = req.body || {};
    const message = validateFilters(body);
    if (message) return failureResponse(res, { code: 2001, httpStatus: 400, message });
    const report = await getAttendanceData({ req, body, isExport: true });
    return sendExcelDownload(res, await buildAttendanceExcelAttachment(report));
  } catch (error) {
    return handleError(res, error);
  }
};

export const list = userAttendanceReport;
export const exportExcel = exportAttendanceExcel;
