import { renderTemplate } from "#shared/utils/templateMaker.js";
import {
  buildSheetSpacerRow,
  buildSideBySideRows,
  excelFormat,
} from "#shared/utils/excel.utils.js";

export const CLOSED_TICKET_STATUS = "208";

export const normalizeReportOrder = (value = "DESC") =>
  String(value).toUpperCase() === "ASC" ? "ASC" : "DESC";

export const getReportPagination = ({ page = 1, limit, defaultLimit = 20, maxLimit = 100 } = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), maxLimit);

  return {
    page: currentPage,
    limit: safeLimit,
    offset: (currentPage - 1) * safeLimit,
  };
};

export const buildReportPagination = ({ page, limit, offset, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  start: total === 0 ? 0 : offset + 1,
  end: Math.min(offset + limit, total),
});

export const safeReportFileName = (value = "report") =>
  String(value || "report")
    .replace(/[^a-z0-9-_.]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "report";

export const sendExcelDownload = (res, attachment = {}) => {
  const fileName = safeReportFileName(attachment.filename || "report.xls");
  const content = Buffer.from(String(attachment.content || ""), "utf8");

  res.attachment(fileName);
  res.setHeader("Content-Type", `${attachment.contentType || "application/vnd.ms-excel"}; charset=utf-8`);
  res.setHeader("Content-Length", content.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(content);
};
export const formatDateTime = (value) => {
  if (!value) return "-";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
export const buildUserWiseExcelAttachment = async ({
  company = {},
  users = [],
  filters = {},
  summary = {},
}) => {
  const spreadsheetColumnCount = 13;

  const details = {
    "Company ID": company.company_id || "-",
    "Company Name": company.company_name || "-",
    "From Date": filters.from_date || "-",
    "To Date": filters.to_date || "-",
  };

  const summaryDetails = {
    "Total Users": Number(summary.total_users) || Number(0),
    "Users With Tickets": summary.users_with_tickets || 0,
    "Users Without Tickets": summary.users_without_tickets || 0,
    "Total Tickets": summary.total_tickets || 0,
    "Open": summary.open_tickets || 0,
    "Closed": summary.closed_tickets || 0,
    "In Progress": summary.in_progress_tickets || 0,
    "Overdue": summary.overdue_tickets || 0,
  };

  const htmlBody = await renderTemplate(
    "userwisePerformanceReport",
    "excel",
    {
      spreadsheetColumnCount,

      reportTitle: "User Wise Performance Report",

      spacerRow: await buildSheetSpacerRow(
        18,
        spreadsheetColumnCount
      ),

      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: summaryDetails,
        rightTitle: "Report Details",
        rightData: details,
        gapCols: 7,
        labelColspan: 1,
        valueColspan: 2,
      }),

      hasUserRows: users.length > 0,

      userRows: users.map((row, index) => ({
        srNo: index + 1,

        user_name: row.user_name || "-",

        total_tickets: row.total_tickets ?? 0,

        generated: row.generated ?? 0,

        open_tickets: row.open_tickets ?? 0,

        pending: row.pending ?? 0,

        delegated: row.delegated ?? 0,

        in_progress_tickets:
          row.in_progress_tickets ?? 0,

        closed_tickets:
          row.closed_tickets ?? 0,

        overdue_tickets:
          row.overdue_tickets ?? 0,

        productivity_score:
          row.productivity_score != null
            ? `${row.productivity_score}%`
            : "0%",

        last_ticket_no:
          row.last_ticket_no || "-",

        last_ticket_status:
          row.last_ticket_status || "-",

        last_ticket_date:
          formatDateTime(row.last_ticket_date),
      })),
    }
  );

  return {
    filename: `User-wise-report${company.company_name
        ? "-" + company.company_name
        : ""
      }.xls`,

    content: await excelFormat(htmlBody),

    contentType: "application/vnd.ms-excel",
  };
};
