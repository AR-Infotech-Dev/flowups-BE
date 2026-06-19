import { DB_PREFIX } from "#config/database.js";
import { env } from "#config/env.js";
import { getIO } from "#socket/index.js";
import { sendEmail } from "#shared/utils/email.js";
import { renderTemplate } from "#shared/utils/templateMaker.js";
import { canViewAllByRole, isAdminRole, isSuperAdminRole } from "#shared/utils/role.utils.js";
import { getCustomerAmcFields, getTicketNotificationDetails } from "./ticket.model.js";

export const isSuperAdmin = (user = {}) => isSuperAdminRole(user);

export const isAdmin = (user = {}) => isAdminRole(user);

export const canViewAllTickets = (user = {}) => canViewAllByRole(user);

export const getAssigneeHistoryExistsSql = (userId, condition) =>
  `EXISTS (SELECT 1 FROM ${DB_PREFIX}ticket_history h WHERE h.ticket_id = t.ticket_id AND h.field_name = 'assignee' AND h.action_type = 'reassigned' AND (${condition}))`;

export const getTicketVisibilitySelect = (userId = null) => {
  const safeUserId = Number(userId || 0);
  if (!safeUserId) return "";

  const delegatedExists = getAssigneeHistoryExistsSql(safeUserId, `h.new_value = ${safeUserId}`);
  const reassignedExists = getAssigneeHistoryExistsSql(safeUserId, `(h.old_value = ${safeUserId} OR h.changed_by = ${safeUserId})`);

  return `,
    CASE
      WHEN ${delegatedExists} THEN 'delegated'
      WHEN ${reassignedExists} THEN 'reassigned'
      ELSE ''
    END AS delegation_flag,
    CASE WHEN ${delegatedExists} THEN 'Y' ELSE 'N' END AS is_delegated,
    CASE WHEN ${reassignedExists} THEN 'Y' ELSE 'N' END AS is_reassigned,
    CASE
      WHEN t.created_by = ${safeUserId} THEN 'created'
      WHEN t.assignee = ${safeUserId} THEN 'assigned'
      WHEN ${delegatedExists} THEN 'delegated'
      WHEN ${reassignedExists} THEN 'reassigned'
      ELSE 'company'
    END AS visibility_reason
  `;
};

const parseDateOnly = (value = null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const isCustomerAmcActive = (customer = {}) => {
  if (String(customer?.is_amc || "").toLowerCase() !== "yes") return false;

  const endDate = parseDateOnly(customer?.amc_end_date);
  if (!endDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return endDate >= today;
};

export const resolveTicketActiveAmc = async (clientId = null) => {
  if (!clientId) return "n";
  const customer = await getCustomerAmcFields(clientId);
  return isCustomerAmcActive(customer) ? "y" : "n";
};

export const normalizeTicketAddOns = (value = []) => {
  if (typeof value === "string") {
    try {
      return normalizeTicketAddOns(JSON.parse(value));
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "object" && item !== null) {
        return String(item.name || item.add_on_name || item.label || item.value || "").trim();
      }

      return String(item || "").trim();
    })
    .filter(Boolean);
};

export const prepareTicketBody = (source = {}) => ({
  ...source,
  ...(Object.prototype.hasOwnProperty.call(source, "product_add_ons")
    ? { product_add_ons: JSON.stringify(normalizeTicketAddOns(source.product_add_ons)) }
    : {}),
});

export const emitNotification = (userId = null, data = {}) => {
  try {
    if (!userId) return;
    const io = getIO();
    io.to(`user_${userId}`).emit("new_notification", data);
  } catch (error) {
    console.log("Socket Error :", error.message);
  }
};

export const sendEmailToClient = async (ticketId, subject = "", message = "", redirectUrl = "") => {
  if (!ticketId) {
    return { success: false, message: "Ticket ID is required" };
  }

  const details = await getTicketNotificationDetails(ticketId);
  if (!details) {
    return { success: false, message: "Ticket details not found" };
  }

  if (!details.email || details.email.trim() === "") {
    return { success: false, message: "Client email not found" };
  }

  const html = await renderTemplate("ticketNotification", "email", {
    clientName: details.clientName || "User",
    ticketNo: details.ticket_no || "-",
    subject: subject || "Ticket Notification",
    createdDate: details.created_date || "-",
    dueDate: details.due_date || "-",
    assignedTo: details.assignedTo || "-",
    message: message || "Your ticket has been updated successfully.",
    category: details.query_type || "-",
    status: details.ticket_status || "-",
    priority: details.ticket_priority || "-",
    appName: env?.appName || "Support System",
    redirectUrl,
    redirectUrlText: "Feedback",
  });

  const result = await sendEmail({
    to: details.email,
    subject: subject || "Ticket Notification",
    html,
    text: "",
    company_id: details.company_id || null,
  });

  return result?.success
    ? { success: true }
    : { success: false, message: result?.error || "Email sending failed" };
};
