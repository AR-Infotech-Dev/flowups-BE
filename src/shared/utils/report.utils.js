import { env } from "#config/env.js";
export const CLOSED_STATUS = "208";
import {
  buildSheetSpacerRow,
  buildSideBySideRows,
  excelFormat
} from "./excel.utils.js";
import { renderTemplate } from "./templateMaker.js"
import { formatHistoryForExcel } from "../../modules/reports/performance-report/ticketHistory.utils.js"
import { formatWorkLogsForExcel } from "../../modules/reports/performance-report/worklogs.utils.js"
export const formatDate = (value = null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
export const stripHtml = (value = "") => String(value || "").replace(/<[^>]*>/g, "");
export const isResolvedStatus = (row = {}) => {
  const statusId = String(row.ticket_status_id || row.ticket_status || "").trim();
  const statusName = String(row.ticket_status || "").trim().toLowerCase();

  return (
    statusId === CLOSED_STATUS ||
    statusName.includes("resolve") ||
    statusName.includes("closed") ||
    statusName.includes("complete")
  );
};
export const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
};
export const isActiveAMC = (customer = {}) => {
  const amcEndDate = customer?.amc_end_date
    ? new Date(customer.amc_end_date)
    : null;

  return (
    String(customer?.is_amc || "").toLowerCase() === "yes" &&
    amcEndDate &&
    amcEndDate >= new Date()
  );
};
export const buildSupportReportTemplate = async ({ customer = {}, supportCallCount = 0, summary = {}, products = [], }) => {
  return renderTemplate(
    "customerReport",
    "email",
    {
      customerName: customer.name || "Customer",
      companyName: env?.appName || "Support System",
      logoUrl: "https://sathiconnect.flowups.in/assets/sathi-connect-logo.png",
      amcStartDate: formatDate(customer.amc_start_date),
      amcEndDate: formatDate(customer.amc_end_date),
      supportCallCount,
      isActiveAMC: isActiveAMC(customer),
      summaryCards: [
        {
          label: "Total Tickets",
          value: summary.total || 0,
          bg: "#eff6ff",
          color: "#0f172a",
        },
        {
          label: "Resolved",
          value: summary.resolved || 0,
          bg: "#ecfdf5",
          color: "#166534",
        },
        {
          label: "Pending",
          value: summary.pending || 0,
          bg: "#fff7ed",
          color: "#c2410c",
        },
        {
          label: "Overdue",
          value: summary.overdue || 0,
          bg: "#fef2f2",
          color: "#dc2626",
        },
      ],
      products,
    }
  );
};
export const buildReportAttachment = async ({ customer = {}, summary = {}, supportRows = [], }) => {
  const spreadsheetColumnCount = 9;
  const activeAMC = isActiveAMC(customer);
  const htmlBody = await renderTemplate(
    "customerReport",
    "excel",
    {
      spreadsheetColumnCount,
      reportTitle: activeAMC
        ? "AMC Customer Support Report"
        : "Customer Support Report",
      spacerRow: await buildSheetSpacerRow(18, spreadsheetColumnCount),
      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: summary,
        rightTitle: activeAMC
          ? "Report Details"
          : "",
        rightData: activeAMC
          ? {
            customer: customer.name || "-",
            amc_start_date: formatDate(customer.amc_start_date),
            amc_expiry_date: formatDate(customer.amc_end_date),
            generated_on: formatDate(new Date()),
          }
          : null,
        gapCols: 3,
        labelColspan: 1,
        valueColspan: 2,
      }),
      hasSupportRows: supportRows.length > 0,
      supportRows: supportRows.map(
        (row, index) => ({
          srNo: index + 1,
          ticket_no: row.ticket_no || "-",
          created_date: row.created_date || "-",
          due_date: row.due_date || "-",
          query_type: row.query_type || "-",
          ticket_status: row.ticket_status || "-",
          ticket_priority: row.ticket_priority || "-",
          assignee: row.assignee_name || "-",
          resolver: row.resolver_name || "-",
          statusClass: isResolvedStatus(row)
            ? "excel-status-closed"
            : "excel-status-open",
        })
      ),
    }
  );

  return {
    filename: `Customer-Report-${customer.name || "customer"}.xls`,
    content: await excelFormat(htmlBody),
    contentType: "application/vnd.ms-excel",
  };
};
// buildPerformanceExcelAttachment({ filters, summary, tickets, user: userDetails })
export const buildPerformanceExcelAttachment = async ({ filters = {}, summary = {}, tickets = [], user = {} }) => {
  const userName = user.name || user.userName || user.email || filters.user_name || "Selected User";

  const spreadsheetColumnCount = 11;
  const formatResolutionDuration = (ticket = {}) => {
    const totalSeconds = Number.isFinite(Number(ticket.resolution_time_seconds))
      ? Math.max(0, Math.round(Number(ticket.resolution_time_seconds)))
      : Math.max(0, Math.round(Number(ticket.resolution_time || 0) * 60));
    return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} sec`;
  };
  const details = {
    'User Name': filters.user_name || '-',
    'Order By': filters.order_by || '-',
    'Order': filters.order || '-',
    'From Date': filters.from_date || '-',
    'To Date': filters.to_date || '-',
  }
  const summaryDetails = {
    "Assigned": summary.assigned || 0,
    "Generated": summary.generated || 0,
    "Closed": summary.closed || 0,
    "Pending": summary.pending || 0,
    "Delegated": summary.delegated || 0,
    "Overdue": summary.overdue || 0,
    "Productivity Score": summary.productivity_score || 0,
    "Avg Resolution Time": summary.avg_resolution_time || 0,
  }
  const htmlBody = await renderTemplate(
    "userPerformanceReport",
    "excel",
    {
      spreadsheetColumnCount,
      reportTitle: "User Performance Report",
      user: user,
      spacerRow: await buildSheetSpacerRow(18, spreadsheetColumnCount),
      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: summaryDetails,
        rightTitle: "Report Details",
        rightData: details,
        gapCols: 5,
        labelColspan: 1,
        valueColspan: 2,
      }),
      hasSupportRows: tickets.length > 0,
      supportRows: tickets.map(
        (row, index) => {
          return ({
            srNo: Number(index + 1),
            ticket_no: row.ticket_no || "-",
            customer_name: row.customer_name || "-",
            created_date: formatDate(row.created_date) || "-",
            ticket_priority: row.ticket_priority || "-",
            ticket_status: row.ticket_status || "-",
            assigned_date: formatDate(row.assigned_date) || "-",
            due_date: formatDate(row.due_date) || "-",
            call_direction: row.call_direction === "in" ? "Incomming" : "Outgoing",
            resolution_time: formatResolutionDuration(row) || "-",
            work_logs: formatWorkLogsForExcel(row.work_logs || []),
            history: formatHistoryForExcel(row.history || [])
          })
        }
      ),
    }
  );
  return {
    filename: `Perfonrmance-Report-${filters.user_name || "User"}.xls`,
    content: await excelFormat(htmlBody),
    contentType: "application/vnd.ms-excel",
  };
};
export const buildCustomerWiseExcelAttachment = async ({ company = {}, customers = [], filters = {}, summary = {} }) => {
  const spreadsheetColumnCount = 9;
  const details = {
    'Company ID': company.company_id || '-',
    'Company Name': company.company_name || '-',
    'From Date': filters.from_date || '-',
    'To Date': filters.to_date || '-',
  }
  const summaryDetails = {
    "Total Customers": summary.total_customers || 0,
    "Total Tickets": summary.total_tickets || 0,
    "Customer With Tickets": summary.customers_with_tickets || 0,
    "Customer Without Tickets": summary.customers_without_tickets || 0,
    "Open": summary.open_tickets || 0,
    "Closed": summary.closed_tickets || 0,
    "In Progress": summary.in_progress_tickets || 0,
    "Overdue": summary.overdue_tickets || 0,
  }
  const htmlBody = await renderTemplate(
    "customerwiseReport",
    "excel",
    {
      spreadsheetColumnCount,
      reportTitle: "Customer Wise Report",
      spacerRow: await buildSheetSpacerRow(18, spreadsheetColumnCount),
      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: summaryDetails,
        rightTitle: "Report Details",
        rightData: details,
        gapCols: 3,
        labelColspan: 1,
        valueColspan: 2,
      }),
      hasSupportRows: customers.length > 0,
      supportRows: customers.map(
        (row, index) => ({
          srNo: index + 1,
          customer_name: row.customer_name || "-",
          contact_person: row.contact_person || "-",
          mobile_no: row.mobile_no || "-",
          total_tickets: row.total_tickets || "0",
          open_tickets: row.open_tickets || "0",
          in_progress_tickets: row.in_progress_tickets || "0",
          closed_tickets: row.closed_tickets || "0",
          overdue_tickets: row.overdue_tickets || "0",
          last_ticket_no: row.last_ticket_no || "-",
          last_ticket_status: row.last_ticket_status || "-",
          last_ticket_date: formatDate(row.last_ticket_date) || "-",
        })
      ),
    }
  );

  return {
    filename: `Customer-wise-report${company.company_name ? "-" + company.company_name : ""}.xls`,
    content: await excelFormat(htmlBody),
    contentType: "application/vnd.ms-excel",
  };
};
const toDateKey = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildAttendanceDateColumns = (fromDate, toDate) => {
  if (!fromDate || !toDate) return [];
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const columns = [];
  for (let cursor = start; cursor <= end && columns.length < 62; cursor = new Date(cursor.getTime() + 86400000)) {
    columns.push({
      key: toDateKey(cursor),
      label: cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      weekday: cursor.toLocaleDateString("en-IN", { weekday: "short" }),
      isWeekend: cursor.getDay() === 0,
      isFuture: cursor > new Date(new Date().setHours(23, 59, 59, 999)),
    });
  }
  return columns;
};

const getAttendanceCode = (record, date = {}) => {
  if (record?.sign_in_at) return "P";
  if (record?.status === "leave") return "L";
  if (date.isFuture) return "-";
  if (date.isWeekend) return "W";
  return "A";
};

const getAttendanceExcelStyle = (code) => {
  const styles = {
    P: { cell: "color:#15803d;background:#dcfce7;", badge: "color:#15803d;background:#bbf7d0;" },
    A: { cell: "color:#dc2626;background:#fee2e2;", badge: "color:#dc2626;background:#fecaca;" },
    W: { cell: "color:#475569;background:#f1f5f9;", badge: "color:#475569;background:#e2e8f0;" },
    L: { cell: "color:#ea580c;background:#ffedd5;", badge: "color:#ea580c;background:#fed7aa;" },
    "-": { cell: "color:#94a3b8;background:#ffffff;", badge: "color:#94a3b8;background:#f8fafc;" },
  };
  return styles[code] || styles.A;
};

const formatAttendanceTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

export const buildUserWiseAttendanceExcelAttachment = async ({
  company = {},
  users = [],
  filters = {},
  summary = {},
}) => {
  const dateColumns = buildAttendanceDateColumns(filters.from_date, filters.to_date);
  const spreadsheetColumnCount = 5 + dateColumns.length;

  const details = {
    "Company ID": company.company_id || "-",
    "Company Name": company.company_name || "-",
    "From Date": filters.from_date || "-",
    "To Date": filters.to_date || "-",
  };

  const summaryDetails = {
    "Total Users": summary.total_users || 0,
    "Signed In Users": summary.signed_in_users || 0,
    "Signed Out Users": summary.signed_out_users || 0,
    "Total Logs": summary.total_logs || 0,
    "Total Sign In": summary.total_signins || 0,
    "Total Sign Out": summary.total_signouts || 0,
  };

  const supportRows = users.map((row, index) => {
    const records = new Map((row.attendance_days || []).map((record) => [String(record.attendance_date).slice(0, 10), record]));
    const dayValues = dateColumns.map((date) => {
      const record = records.get(date.key);
      const code = getAttendanceCode(record, date);
      const excelStyle = getAttendanceExcelStyle(code);

      return {
        code,
        signIn: formatAttendanceTime(record?.sign_in_at),
        signOut: record?.sign_out_at ? formatAttendanceTime(record.sign_out_at) : (record?.sign_in_at ? "MSO" : "-"),
        location: record?.sign_in_location || record?.sign_out_location || record?.location || "-",
        showDetails: Boolean(record?.sign_in_at),
        cellStyle: excelStyle.cell,
        badgeStyle: excelStyle.badge,
      };
    });

    return {
      srNo: index + 1,
      user_name: row.user_name || "-",
      username: row.username || "-",
      email: row.email || "-",
      total_logs: row.total_logs || 0,
      total_signin: row.total_signin || 0,
      total_signout: row.total_signout || 0,
      dayValues,
    };
  });

  const htmlBody = await renderTemplate(
    "userWiseAttendanceReport",
    "excel",
    {
      spreadsheetColumnCount,
      reportTitle: "User Attendance",
      spacerRow: await buildSheetSpacerRow(18, spreadsheetColumnCount),
      summarySection: await buildSideBySideRows({
        leftTitle: "Summary",
        leftData: summaryDetails,
        rightTitle: "Report Details",
        rightData: details,
        gapCols: 3,
        labelColspan: 1,
        valueColspan: 2,
      }),
      dateColumns,
      hasSupportRows: supportRows.length > 0,
      supportRows,
    }
  );

  return {
    filename: `User-wise-attendance-report${company.company_name ? "-" + company.company_name : ""}.xls`,
    content: await excelFormat(htmlBody),
    contentType: "application/vnd.ms-excel",
  };
};


