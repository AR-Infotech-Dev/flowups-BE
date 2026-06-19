import { env } from "#config/env.js";
export const CLOSED_STATUS = "208";
import {
  buildSheetSpacerRow,
  buildSideBySideRows,
  excelFormat
} from "./excel.utils.js";
import { renderTemplate } from "./templateMaker.js"

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
  const spreadsheetColumnCount = 10;
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
        gapCols: 1,
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
          assignee: row.assignee || "-",
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
