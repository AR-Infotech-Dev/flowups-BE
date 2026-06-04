const SUPPORT_LOGO_URL = "https://sathiconnect.flowups.in/assets/sathi-connect-logo.png";

const escapeTemplateHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatTemplateDate = (value = null) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const isTemplateActiveAMC = (customer = {}) => {
  const amcEndDate = customer?.amc_end_date ? new Date(customer.amc_end_date) : null;

  return (
    String(customer?.is_amc || "").toLowerCase() === "yes" &&
    amcEndDate &&
    amcEndDate >= new Date()
  );
};

const automatedFooter = `
  <div style="background:#f8f9fa;padding:12px;text-align:center;font-size:12px;color:#666;">
    This is an automated email. Please do not reply.
  </div>
`;

const metricCards = (summary = {}) =>
  [
    { label: "Total Tickets", value: summary.total || 0, bg: "#eff6ff", color: "#0f172a" },
    { label: "Resolved", value: summary.resolved || 0, bg: "#ecfdf5", color: "#166534" },
    { label: "Pending", value: summary.pending || 0, bg: "#fff7ed", color: "#c2410c" },
    { label: "Overdue", value: summary.overdue || 0, bg: "#fef2f2", color: "#dc2626" },
  ]
    .map(
      (item) => `
        <td style="padding:0 5px;">
          <div style="background:${item.bg};border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:12px;color:#64748b;">${item.label}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:700;color:${item.color};">
              ${item.value}
            </div>
          </div>
        </td>
      `
    )
    .join("");

const productRows = (products = []) => {
  if (!products.length) {
    return `
      <tr>
        <td colspan="2" style="padding:14px;border:1px solid #e8eef6;text-align:center;color:#64748b;">
          No products found.
        </td>
      </tr>
    `;
  }

  return products
    .map(
      (product) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #e8eef6;">
            ${escapeTemplateHtml(product.product_name || "-")}
          </td>
          <td style="padding:10px 12px;border:1px solid #e8eef6;">
            ${escapeTemplateHtml(product.serial_number || "-")}
          </td>
        </tr>
      `
    )
    .join("");
};

export const AUTH_FORGOT_PASSWORD_OTP = ({ name = "User", otp = "" } = {}) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:650px;margin:auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
    <div style="background:#0d6efd;padding:20px;text-align:center;color:#fff">
      <h2 style="margin:0;">Forgot Password OTP</h2>
    </div>
    <div style="padding:25px;color:#333;">
      <p>Hello <b>${name}</b>,</p>
      <p>Your OTP for password reset is:</p>
      <div style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:20px 0;color:#0d6efd;">
        ${otp}
      </div>
      <p>This OTP will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
    ${automatedFooter}
  </div>
`;

export const AUTH_PASSWORD_UPDATED = ({ name = "User" } = {}) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:650px;margin:auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
    <div style="background:#198754;padding:20px;text-align:center;color:#fff">
      <h2 style="margin:0;">Password Updated</h2>
    </div>
    <div style="padding:25px;color:#333;">
      <p>Hello <b>${name}</b>,</p>
      <p>Your password has been updated successfully.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    </div>
    ${automatedFooter}
  </div>
`;

export const USER_ACCOUNT_CREDENTIALS = ({
  name = "User",
  userName = "-",
  password = "-",
} = {}) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:650px;margin:auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
    <div style="background:#0d6efd;padding:20px;text-align:center;color:#fff">
      <h2 style="margin:0;">Account Credentials</h2>
    </div>
    <div style="padding:25px;color:#333;">
      <p>Hello <b>${name}</b>,</p>
      <p>Your account has been created successfully. Please use the credentials below to login.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:15px;">
        <tr>
          <td style="padding:10px;border:1px solid #ddd;"><b>Username</b></td>
          <td style="padding:10px;border:1px solid #ddd;">${userName}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #ddd;"><b>Password</b></td>
          <td style="padding:10px;border:1px solid #ddd;">${password}</td>
        </tr>
      </table>
      <p style="margin-top:25px;">
        <b>Important:</b> Please change your password after first login.
      </p>
      <p>Regards,<br/><b>Support Team @ </b><br/>{companyName}<br/></p>
    </div>
    ${automatedFooter}
  </div>
`;

export const TICKET_NOTIFICATION = ({
  clientName = "User",
  ticketNo = "-",
  subject = "-",
  priority = "-",
  status = "-",
  createdDate = "-",
  dueDate = "-",
  category = "-",
  assignedTo = "-",
  message = "-",
  redirectUrl = "",
} = {}) => `
  <div style="font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:6px 0 18px;">
      <h2 style="margin:0;color:#0d6efd;">${subject}</h2>
    </div>

    <p>Hello <strong>${clientName}</strong>,</p>
    <p>${message}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:15px;">
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Ticket No</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${ticketNo}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Subject</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${subject}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Query Type</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${category}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Status</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${status}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Priority</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${priority}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Assigned To</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${assignedTo}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Created Date</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${createdDate}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;"><strong>Due Date</strong></td>
        <td style="padding:10px;border:1px solid #ddd;">${dueDate}</td>
      </tr>
    </table>

    <p style="margin-top:25px;">Thank you for contacting us.</p>

    ${redirectUrl
    ? `<p style="margin-top:25px;text-align:left;"><a href="${redirectUrl}" style="background:#0d6efd;color:#ffffff;text-decoration:none;padding:8px 18px;border-radius:6px;display:inline-block;font-weight:bold;">Submit Feedback</a></p>`
    : ""
  }

    <p>Regards,<br/><strong>Support Team</strong><br/>{companyName}</p>
  </div>
`;

export const AMC_RENEWAL_REMINDER = ({ customerName = "Customer", amcStartDate = "-", amcEndDate = "-", supportCallCount = 0, } = {}) => `
 <div style="background:#f4f7fb;padding:30px 15px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 25px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#003b7d;padding:30px;text-align:center;">
      <h2 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">AMC Renewal Reminder</h2>
      <p style="margin:10px 0 0;color:#dbeafe;font-size:15px;">Your annual maintenance contract is nearing expiry.</p>
    </div>

    <!-- Body -->
    <div style="padding:30px;">

      <div style="font-family:Arial,Helvetica,sans-serif;color:#172033;">
        
        <p style="margin:0 0 20px;font-size:16px;">Dear ${customerName},</p>

        <p style="margin:0 0 20px;line-height:1.7;color:#475569;">
          This is a friendly reminder that your AMC period from
          <strong>${amcStartDate}</strong> to
          <strong>${amcEndDate}</strong> is due for renewal.
        </p>

        <div style="background:#f8fafc;border-left:5px solid #003b7d;padding:5px;border-radius:10px;margin:20px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:12px;border:1px solid #e8eef6;background:#f8fbff;color:#64748b;font-weight:600;">Customer</td>
              <td style="padding:12px;border:1px solid #e8eef6;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding:12px;border:1px solid #e8eef6;background:#f8fbff;color:#64748b;font-weight:600;">AMC Expiry</td>
              <td style="padding:12px;border:1px solid #e8eef6;">${amcEndDate}</td>
            </tr>
            <tr>
              <td style="padding:12px;border:1px solid #e8eef6;background:#f8fbff;color:#64748b;font-weight:600;">Support Calls in AMC Period</td>
              <td style="padding:12px;border:1px solid #e8eef6;">${supportCallCount}</td>
            </tr>
          </table>
        </div>

        <p style="margin:20px 0;line-height:1.7;color:#475569;">
          Please contact us to renew your AMC and continue uninterrupted support.
        </p>

        

        <p style="margin-top:30px;color:#172033;">
          Regards,<br>
          <strong>Support Team</strong><br>
          {companyName}
        </p>

      </div>

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:13px;color:#64748b;">
        Thank you for choosing our services.
      </p>
    </div>

  </div>
</div>

`;

export const CUSTOMER_SUPPORT_REPORT = ({
  customer = {},
  supportCallCount = 0,
  summary = {},
  products = [],
} = {}) => {
  const customerName = escapeTemplateHtml(customer.name || "Customer");
  const amcStartDate = escapeTemplateHtml(formatTemplateDate(customer.amc_start_date));
  const amcEndDate = escapeTemplateHtml(formatTemplateDate(customer.amc_end_date));

  return `
    <div style="font-family:Arial,sans-serif;color:#172033;">
      <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table width="680" cellspacing="0" cellpadding="0" style="max-width:94%;background:#fff;border:1px solid #e8eef6;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="background:#ffffff;padding:10px 28px 0;text-align:center;color:#172033;">
                  <img src="${SUPPORT_LOGO_URL}" alt="{companyName}" width="120" style="display:block;margin:0 auto 14px;" />
                </td>
              </tr>
              <tr>
                <td style="background:#003b7d;padding:28px;text-align:center;color:#ffffff;">
                  <div style="font-size:24px;font-weight:700;">Customer Support Report</div>
                  <div style="margin-top:8px;font-size:13px;color:#bfdbfe;">
                    Service Summary & Support Activity
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 12px;font-size:14px;line-height:1.7;">
                    Dear <strong>${customerName}</strong>,
                  </p>
                  <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#475569;">
                    Please find below your support activity summary and service details.
                  </p>

                  <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                    <tr>${metricCards(summary)}</tr>
                  </table>

                  ${isTemplateActiveAMC(customer)
      ? `
                        <div style="margin-bottom:24px;padding:20px;background:#ecfdf5;border:1px solid #d1fae5;border-radius:12px;">
                          <div style="font-size:16px;font-weight:700;color:#166534;margin-bottom:14px;">
                            AMC Coverage Details
                          </div>
                          <table width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding:8px 0;color:#64748b;width:40%;">AMC Start Date</td>
                              <td style="padding:8px 0;font-weight:600;">${amcStartDate}</td>
                            </tr>
                            <tr>
                              <td style="padding:8px 0;color:#64748b;">AMC Expiry Date</td>
                              <td style="padding:8px 0;font-weight:600;">${amcEndDate}</td>
                            </tr>
                            <tr>
                              <td style="padding:8px 0;color:#64748b;">Support Calls</td>
                              <td style="padding:8px 0;font-weight:600;">${supportCallCount}</td>
                            </tr>
                          </table>
                        </div>
                      `
      : ""
    }

                  <div style="margin-bottom:24px;">
                    <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:#0f172a;">
                      Supported Products
                    </div>
                    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      <tr>
                        <th style="background:#003b7d;color:#fff;padding:12px;text-align:left;font-size:13px;">Product</th>
                        <th style="background:#003b7d;color:#fff;padding:12px;text-align:left;font-size:13px;">Serial Number</th>
                      </tr>
                      ${productRows(products)}
                    </table>
                  </div>

                  <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
                    For any support assistance or service queries, feel free to contact our support team.
                  </p>
                  <p style="margin-top:22px;font-size:14px;line-height:1.7;">
                    Regards,<br/><strong>Support Team</strong><br/>{companyName}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e8eef6;text-align:center;font-size:12px;color:#64748b;">
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
