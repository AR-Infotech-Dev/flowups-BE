import { env } from "../config/env.js";
import { CUSTOMER_SUPPORT_REPORT } from "./emailtemplates.js";
export const CLOSED_STATUS = "208";
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

export const escapeHtml = (value = "") =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

export const stripHtml = (value = "") =>
    String(value || "").replace(/<[^>]*>/g, "");

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

// export const buildSupportReportTemplate = ({ customer = {}, supportCallCount = 0, summary = {}}) => {
//     const customerName = escapeHtml(customer.name || "Customer");
//     const amcStartDate = escapeHtml(formatDate(customer.amc_start_date));
//     const amcEndDate = escapeHtml(formatDate(customer.amc_end_date));
//     const appName = escapeHtml(env?.appName || "Support System");
//     const logoUrl = `${env.baseUrl}/images/logo.png`;

//     return `
//     <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
//       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:24px 0;">
//         <tr>
//           <td align="center">
//             <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:94%;background:#ffffff;border:1px solid #e8eef6;border-radius:8px;overflow:hidden;">
//               <tr>
//                 <td style="padding:22px 26px;background:#003b7d;color:#ffffff;text-align:center;">
//                   <img
//                     src="${logoUrl}"
//                     alt="${appName}"
//                     width="120"
//                     style="display:block;margin:0 auto 12px;"
//                   />
//                   <div style="font-size:18px;font-weight:700;">
//                     Customer Support Report
//                   </div>
//                 </td>
//               </tr>
//               <tr>
//                 <td style="padding:26px;">
//                   <p>
//                     Dear ${customerName},
//                   </p>
//                   <p>
//                     Please find attached your support report.
//                   </p>
//                   ${isActiveAMC(customer)
//                     ? `
//                         <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse;">
//                           <tr>
//                             <td style="padding:10px;border:1px solid #e8eef6;background:#f8fbff;">
//                               AMC Start
//                             </td>
//                             <td style="padding:10px;border:1px solid #e8eef6;">
//                               ${amcStartDate}
//                             </td>
//                           </tr>
//                           <tr>
//                             <td style="padding:10px;border:1px solid #e8eef6;background:#f8fbff;">
//                               AMC End
//                             </td>
//                             <td style="padding:10px;border:1px solid #e8eef6;">
//                               ${amcEndDate}
//                             </td>
//                           </tr>
//                           <tr>
//                             <td style="padding:10px;border:1px solid #e8eef6;background:#f8fbff;">
//                               Support Calls
//                             </td>
//                             <td style="padding:10px;border:1px solid #e8eef6;">
//                               ${supportCallCount}
//                             </td>
//                           </tr>
//                         </table>
//                       `
//             : ""
//         }

//                   <p style="margin-top:20px;">
//                     Regards,<br/>
//                     Support Team
//                   </p>

//                 </td>
//               </tr>

//             </table>
//           </td>
//         </tr>
//       </table>
//     </div>
//   `;
// };
export const buildSupportReportTemplate = ({
    customer = {},
    supportCallCount = 0,
    summary = {},
    products = [],
}) => {
    return CUSTOMER_SUPPORT_REPORT({
        customer,
        supportCallCount,
        summary,
        products,
        companyName: env?.appName || "Support System",
    });

    const customerName = escapeHtml(customer.name || "Customer");
    const companyName = escapeHtml(env?.appName || "Support System");
    //   const logoUrl = `${env.baseUrl}/images/logo.png`;
    const logoUrl = `https://sathiconnect.flowups.in/assets/sathi-connect-logo.png`;
    const amcStartDate = escapeHtml(formatDate(customer.amc_start_date));
    const amcEndDate = escapeHtml(formatDate(customer.amc_end_date));

    const productRows = products.length
        ? products.map((product) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #e8eef6;">
            ${escapeHtml(product.product_name || "-")}
          </td>

          <td style="padding:10px 12px;border:1px solid #e8eef6;">
            ${escapeHtml(product.serial_number || "-")}
          </td>
        </tr>
      `).join("")
        : `
      <tr>
        <td colspan="2"
          style="padding:14px;border:1px solid #e8eef6;text-align:center;color:#64748b;">
          No products found.
        </td>
      </tr>
    `;

    return `
    <div style="background:#f4f7fb;padding:24px 0;font-family:Arial,sans-serif;color:#172033;">

      <table width="100%" cellspacing="0" cellpadding="0">
        <tr>

          <td align="center">

            <table
              width="680"
              cellspacing="0"
              cellpadding="0"
              style="max-width:94%;background:#fff;border:1px solid #e8eef6;border-radius:14px;overflow:hidden;"
            >

              <!-- HEADER -->
                <tr>
                    <td style="background:#ffffff;padding:10px 28px 0px 28px;text-align:center;color:#172033;">
                        <img src="${logoUrl}" alt="${companyName}" width="120" style="display:block;margin:0 auto 14px;" />
                    </td>
                </tr>
                <tr>
                    <td style="background:#003b7d;padding:28px;text-align:center;color:#ffffff;">
                        <div style="font-size:24px;font-weight:700;">Customer Support Report</div>
                        <div style="margin-top:8px;font-size:13px;color:#64748b;">Service Summary & Support Activity</div>
                    </td>
                </tr>

              <!-- BODY -->
              <tr>
                <td style="padding:32px;">

                  <p style="margin:0 0 12px;font-size:14px;line-height:1.7;">
                    Dear <strong>${customerName}</strong>,
                  </p>

                  <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#475569;">
                    Please find below your support activity summary and service details.
                  </p>

                  <!-- SUMMARY -->
                  <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                    <tr>

                      ${[
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
        ].map((item) => `
                        <td style="padding:0 5px;">

                          <div
                            style="
                              background:${item.bg};
                              border-radius:12px;
                              padding:16px;
                              text-align:center;
                            "
                          >

                            <div style="font-size:12px;color:#64748b;">
                              ${item.label}
                            </div>

                            <div
                              style="
                                margin-top:6px;
                                font-size:24px;
                                font-weight:700;
                                color:${item.color};
                              "
                            >
                              ${item.value}
                            </div>

                          </div>

                        </td>
                      `).join("")}

                    </tr>
                  </table>

                  ${isActiveAMC(customer)
            ? `
                        <!-- AMC DETAILS -->
                        <div
                          style="
                            margin-bottom:24px;
                            padding:20px;
                            background:#ecfdf5;
                            border:1px solid #d1fae5;
                            border-radius:12px;
                          "
                        >

                          <div
                            style="
                              font-size:16px;
                              font-weight:700;
                              color:#166534;
                              margin-bottom:14px;
                            "
                          >
                            AMC Coverage Details
                          </div>

                          <table width="100%" cellspacing="0" cellpadding="0">

                            <tr>
                              <td style="padding:8px 0;color:#64748b;width:40%;">
                                AMC Start Date
                              </td>

                              <td style="padding:8px 0;font-weight:600;">
                                ${amcStartDate}
                              </td>
                            </tr>

                            <tr>
                              <td style="padding:8px 0;color:#64748b;">
                                AMC Expiry Date
                              </td>

                              <td style="padding:8px 0;font-weight:600;">
                                ${amcEndDate}
                              </td>
                            </tr>

                            <tr>
                              <td style="padding:8px 0;color:#64748b;">
                                Support Calls
                              </td>

                              <td style="padding:8px 0;font-weight:600;">
                                ${supportCallCount}
                              </td>
                            </tr>

                          </table>

                        </div>
                      `
            : ""
        }

                  <!-- PRODUCTS -->
                  <div style="margin-bottom:24px;">

                    <div
                      style="
                        font-size:16px;
                        font-weight:700;
                        margin-bottom:14px;
                        color:#0f172a;
                      "
                    >
                      Supported Products
                    </div>

                    <table
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      style="border-collapse:collapse;"
                    >

                      <tr>

                        <th
                          style="
                            background:#003b7d;
                            color:#fff;
                            padding:12px;
                            text-align:left;
                            font-size:13px;
                          "
                        >
                          Product
                        </th>

                        <th
                          style="
                            background:#003b7d;
                            color:#fff;
                            padding:12px;
                            text-align:left;
                            font-size:13px;
                          "
                        >
                          Serial Number
                        </th>

                      </tr>

                      ${productRows}

                    </table>

                  </div>

                  <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
                    For any support assistance or service queries,
                    feel free to contact our support team.
                  </p>

                  <p style="margin-top:22px;font-size:14px;line-height:1.7;">
                    Regards,<br/>
                    <strong>Support Team</strong><br/>
                    ${companyName}
                  </p>

                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td
                  style="
                    padding:16px 24px;
                    background:#f8fafc;
                    border-top:1px solid #e8eef6;
                    text-align:center;
                    font-size:12px;
                    color:#64748b;
                  "
                >
                  This is an automated support service email.
                </td>
              </tr>

            </table>

          </td>

        </tr>
      </table>

    </div>
  `;
};

// export const buildReportAttachment = ({ customer = {}, summary = {}, supportRows = [], }) => {

//     const activeAMC = isActiveAMC(customer);

//     const rows = supportRows.length
//         ? supportRows.map((ticket, index) => {

//             return `
//           <tr>

//             <td>${index + 1}</td>

//             <td>${escapeHtml(
//                 ticket.ticket_no || "-"
//             )}</td>

//             <td>${escapeHtml(
//                 stripHtml(ticket.description || "-")
//             )}</td>

//             <td>${escapeHtml(
//                 ticket.query_type || "-"
//             )}</td>

//             <td>${escapeHtml(
//                 ticket.ticket_status || "-"
//             )}</td>

//             <td>${escapeHtml(
//                 ticket.ticket_priority || "-"
//             )}</td>

//             <td>${escapeHtml(
//                 ticket.assignee_name || "-"
//             )}</td>

//             <td>
//               ${ticket?.product_name
//                     ? `${escapeHtml(ticket.product_name)}${ticket?.product_serial_number
//                         ? ` - ${escapeHtml(ticket.product_serial_number)}`
//                         : ""
//                     }`
//                     : "-"
//                 }
//             </td>

//             <td>${escapeHtml(
//                     formatDate(
//                         ticket.start_date || ticket.created_date
//                     )
//                 )}</td>

//             <td>${escapeHtml(
//                     formatDate(ticket.due_date)
//                 )}</td>

//             <td>
//               ${ticket?.resolution_time !== "" &&
//                     ticket?.resolution_time !== undefined
//                     ? `${ticket.resolution_time} hrs`
//                     : "-"
//                 }
//             </td>

//           </tr>
//         `;

//         }).join("")
//         : `
//       <tr>
//         <td colspan="11">
//           No tickets found.
//         </td>
//       </tr>
//     `;

//     const html = `
//     <html>

//       <head>

//         <meta charset="utf-8" />

//         <style>

//           body {
//             font-family: Arial, Helvetica, sans-serif;
//             color: #172033;
//           }

//           table {
//             border-collapse: collapse;
//             width: 100%;
//             margin-top: 8px;
//           }

//           th {
//             background: #003b7d;
//             color: #ffffff;
//             border: 1px solid #003b7d;
//             padding: 8px;
//             text-align: left;
//           }

//           td {
//             border: 1px solid #dbe3ef;
//             padding: 8px;
//           }

//         </style>

//       </head>

//       <body>

//         <h2>
//           ${activeAMC
//             ? "AMC Customer Support Report"
//             : "Customer Support Report"
//         }
//         </h2>

//         <h3>Summary</h3>

//         <table>

//           <tr>
//             <th>Total Tickets</th>
//             <td>${summary.total || 0}</td>
//           </tr>

//           <tr>
//             <th>Resolved</th>
//             <td>${summary.resolved || 0}</td>
//           </tr>

//           <tr>
//             <th>Pending</th>
//             <td>${summary.pending || 0}</td>
//           </tr>

//           <tr>
//             <th>Overdue</th>
//             <td>${summary.overdue || 0}</td>
//           </tr>

//         </table>

//         ${activeAMC
//             ? `
//               <h3>AMC Details</h3>

//               <table>

//                 <tr>
//                   <th>AMC Start Date</th>

//                   <td>
//                     ${escapeHtml(
//                 formatDate(customer.amc_start_date)
//             )}
//                   </td>
//                 </tr>

//                 <tr>
//                   <th>AMC End Date</th>

//                   <td>
//                     ${escapeHtml(
//                 formatDate(customer.amc_end_date)
//             )}
//                   </td>
//                 </tr>

//               </table>
//             `
//             : ""
//         }

//         <h3>Tickets</h3>

//         <table>

//           <tr>
//             <th>Sr No</th>
//             <th>Ticket No</th>
//             <th>Description</th>
//             <th>Query Type</th>
//             <th>Status</th>
//             <th>Priority</th>
//             <th>Assignee</th>
//             <th>Product</th>
//             <th>Start Date</th>
//             <th>Due Date</th>
//             <th>Resolution Time</th>
//           </tr>

//           ${rows}

//         </table>

//       </body>

//     </html>
//   `;

//     return {
//         filename: `Customer-Report-${customer.name || "customer"
//             }.xls`,
//         content: html,
//         contentType: "application/vnd.ms-excel",
//     };
// };

export const buildReportAttachment = ({
  customer = {},
  summary = {},
  supportRows = [],
}) => {

  const activeAMC = isActiveAMC(customer);

  const rows = supportRows.length
    ? supportRows.map((ticket, index) => {

        const statusClass =
          String(ticket.ticket_status || "")
            .toLowerCase()
            .includes("resolve")
            ? "badge-resolved"
            : "badge-pending";

        return `
          <tr>

            <td>${index + 1}</td>

            <td>
              ${escapeHtml(ticket.ticket_no || "-")}
            </td>

            <td>
              ${escapeHtml(
                stripHtml(ticket.description || "-")
              )}
            </td>

            <td>
              ${escapeHtml(ticket.query_type || "-")}
            </td>

            <td>
              <span class="${statusClass}">
                ${escapeHtml(ticket.ticket_status || "-")}
              </span>
            </td>

            <td>
              ${escapeHtml(ticket.ticket_priority || "-")}
            </td>

            <td>
              ${escapeHtml(ticket.assignee_name || "-")}
            </td>

            <td>
              ${
                ticket?.product_name
                  ? `${escapeHtml(ticket.product_name)}${
                      ticket?.product_serial_number
                        ? ` - ${escapeHtml(ticket.product_serial_number)}`
                        : ""
                    }`
                  : "-"
              }
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  ticket.start_date || ticket.created_date
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                formatDate(ticket.due_date)
              )}
            </td>

            <td>
              ${
                ticket?.resolution_time !== "" &&
                ticket?.resolution_time !== undefined
                  ? `${ticket.resolution_time} hrs`
                  : "-"
              }
            </td>

          </tr>
        `;

      }).join("")
    : `
      <tr>
        <td colspan="11" style="text-align:center;padding:18px;">
          No tickets found.
        </td>
      </tr>
    `;

  const html = `
    <html>

      <head>

        <meta charset="utf-8" />

        <style>

          body{
            font-family:Arial,Helvetica,sans-serif;
            color:#172033;
            padding:18px;
            background:#f8fafc;
          }

          .report-wrapper{
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-radius:12px;
            padding:24px;
          }

          .report-header{
            text-align:center;
            margin-bottom:24px;
          }

          .report-title{
            font-size:28px;
            font-weight:700;
            color:#1e3a8a;
            margin-bottom:6px;
          }

          .report-subtitle{
            font-size:13px;
            color:#64748b;
          }

          .section-title{
            font-size:18px;
            font-weight:700;
            color:#0f172a;
            margin:28px 0 14px;
          }

          .summary-table{
            width:100%;
            border-collapse:separate;
            border-spacing:12px;
            margin-top:12px;
          }

          .summary-card{
            border-radius:12px;
            padding:16px;
            text-align:center;
            border:1px solid #dbeafe;
          }

          .summary-label{
            font-size:12px;
            color:#64748b;
            margin-bottom:8px;
          }

          .summary-value{
            font-size:24px;
            font-weight:700;
          }

          .summary-total{
            background:#eff6ff;
            color:#1d4ed8;
          }

          .summary-resolved{
            background:#ecfdf5;
            color:#15803d;
          }

          .summary-pending{
            background:#fff7ed;
            color:#c2410c;
          }

          .summary-overdue{
            background:#fef2f2;
            color:#dc2626;
          }

          .report-table{
            width:100%;
            border-collapse:collapse;
            margin-top:14px;
          }

          .report-table th{
            background:#1e40af;
            color:#ffffff;
            padding:12px;
            border:1px solid #dbeafe;
            font-size:13px;
            text-align:left;
          }

          .report-table td{
            border:1px solid #e2e8f0;
            padding:10px 12px;
            font-size:13px;
            vertical-align:top;
          }

          .report-table tr:nth-child(even) td{
            background:#f8fafc;
          }

          .badge-resolved{
            background:#dcfce7;
            color:#166534;
            padding:4px 8px;
            border-radius:999px;
            font-size:11px;
            font-weight:700;
          }

          .badge-pending{
            background:#ffedd5;
            color:#9a3412;
            padding:4px 8px;
            border-radius:999px;
            font-size:11px;
            font-weight:700;
          }

          .amc-box{
            margin-top:16px;
            padding:18px;
            border-radius:12px;
            background:#ecfdf5;
            border:1px solid #bbf7d0;
          }

          .amc-title{
            font-size:16px;
            font-weight:700;
            color:#166534;
            margin-bottom:12px;
          }

          .footer-note{
            margin-top:28px;
            font-size:12px;
            color:#64748b;
            text-align:center;
          }

        </style>

      </head>

      <body>

        <div class="report-wrapper">

          <!-- HEADER -->
          <div class="report-header">

            <div class="report-title">
              ${
                activeAMC
                  ? "AMC Customer Support Report"
                  : "Customer Support Report"
              }
            </div>

            <div class="report-subtitle">
              Generated Service & Ticket Summary
            </div>

          </div>

          <!-- SUMMARY -->
          <div class="section-title">
            Summary
          </div>

          <table class="summary-table">

            <tr>

              <td>
                <div class="summary-card summary-total">
                  <div class="summary-label">
                    Total Tickets
                  </div>

                  <div class="summary-value">
                    ${summary.total || 0}
                  </div>
                </div>
              </td>

              <td>
                <div class="summary-card summary-resolved">
                  <div class="summary-label">
                    Resolved
                  </div>

                  <div class="summary-value">
                    ${summary.resolved || 0}
                  </div>
                </div>
              </td>

              <td>
                <div class="summary-card summary-pending">
                  <div class="summary-label">
                    Pending
                  </div>

                  <div class="summary-value">
                    ${summary.pending || 0}
                  </div>
                </div>
              </td>

              <td>
                <div class="summary-card summary-overdue">
                  <div class="summary-label">
                    Overdue
                  </div>

                  <div class="summary-value">
                    ${summary.overdue || 0}
                  </div>
                </div>
              </td>

            </tr>

          </table>

          ${
            activeAMC
              ? `
                <!-- AMC DETAILS -->
                <div class="amc-box">

                  <div class="amc-title">
                    AMC Coverage Details
                  </div>

                  <table class="report-table">

                    <tr>
                      <th>AMC Start Date</th>

                      <td>
                        ${escapeHtml(
                          formatDate(customer.amc_start_date)
                        )}
                      </td>
                    </tr>

                    <tr>
                      <th>AMC End Date</th>

                      <td>
                        ${escapeHtml(
                          formatDate(customer.amc_end_date)
                        )}
                      </td>
                    </tr>

                  </table>

                </div>
              `
              : ""
          }

          <!-- TICKETS -->
          <div class="section-title">
            Ticket Details
          </div>

          <table class="report-table">

            <tr>
              <th>Sr No</th>
              <th>Ticket No</th>
              <th>Description</th>
              <th>Query Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Product</th>
              <th>Start Date</th>
              <th>Due Date</th>
              <th>Resolution Time</th>
            </tr>

            ${rows}

          </table>

          <div class="footer-note">
            This is a system generated support report.
          </div>

        </div>

      </body>

    </html>
  `;

  return {
    filename: `Customer-Report-${
      customer.name || "customer"
    }.xls`,
    content: html,
    contentType: "application/vnd.ms-excel",
  };
};
