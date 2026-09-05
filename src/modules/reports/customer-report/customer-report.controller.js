import { DB_PREFIX, query } from "#config/database.js";
import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import {
  buildReportAttachment,
  buildSupportReportTemplate,
  formatDate,
  isActiveAMC,
  parseJsonArray,
  stripHtml,
} from "#shared/utils/report.utils.js";
import { sendEmail } from "#shared/utils/email.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import {
  CLOSED_TICKET_STATUS as CLOSED_STATUS,
  sendExcelDownload,
} from "../report.utils.js";

const getCustomerReportWhere = ({ body = {}, user = {} } = {}) => {
  const { customer_id = "", from_date = "", to_date = "" } = body;
  const where = ["t.status = 'active'", "t.client_id = ?"];
  const values = [customer_id];

  if (from_date) {
    where.push("DATE(COALESCE(t.start_date, t.created_date)) >= ?");
    values.push(from_date);
  }
  if (to_date) {
    where.push("DATE(COALESCE(t.start_date, t.created_date)) <= ?");
    values.push(to_date);
  }

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("t.company_id = ?");
    values.push(user.company_id);
  }
  // NOT THAT AMC CALLS 
  where.push("t.amc_call = ?");
  values.push('n');
  where.push("t.call_direction = ?");
  values.push('in');
  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    values,
  };
};

const getCustomerReportCustomer = async ({ customerId, user }) => {
  const where = ["c.customer_id = ?"];
  const values = [customerId];

  if (!isSuperAdmin(user) && user.company_id) {
    where.push("(c.company_id = ? OR c.company_id IS NULL)");
    values.push(user.company_id);
  }

  const rows = await query(
    `
      SELECT
        c.customer_id,
        c.name,
        c.email,
        c.mobile_no,
        c.wa_no,
        c.contact_person,
        c.company_name,
        c.company_id,
        c.is_amc,
        c.amc_start_date,
        c.amc_end_date,
        c.customer_products,
        c.created_date
      FROM ${DB_PREFIX}customer c
      WHERE ${where.join(" AND ")}
      LIMIT 1
    `,
    values
  );

  const customer = rows[0] || {};
  return {
    ...customer,
    customer_products: parseJsonArray(customer.customer_products),
  };
};

const getCustomerReportSummary = async ({ body, user }) => {
  const { whereSql, values } = getCustomerReportWhere({ body, user });
  const rows = await query(
    `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN t.ticket_status = ? THEN 1 ELSE 0 END), 0) AS resolved,
        COALESCE(SUM(CASE WHEN t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.ticket_status <> ? THEN 1 ELSE 0 END), 0) AS overdue
      FROM ${DB_PREFIX}tickets t
      ${whereSql}
    `,
    [CLOSED_STATUS, CLOSED_STATUS, CLOSED_STATUS, ...values]
  );

  const summary = rows[0] || {};
  return {
    total: Number(summary.total || 0),
    resolved: Number(summary.resolved || 0),
    pending: Number(summary.pending || 0),
    overdue: Number(summary.overdue || 0),
  };
};

const getCustomerReportTickets = async ({ body, user }) => {
  const { whereSql, values } = getCustomerReportWhere({ body, user });

  return query(
    `
      SELECT
        t.ticket_id,
        t.ticket_no,
        t.description,
        t.created_date,
        t.start_date,
        t.due_date,
        t.contact_person,
        t.contact_no,
        t.product_serial_number,
        t.product_name,
        t.modified_by,
        priority.categoryName AS ticket_priority,
        status.categoryName AS ticket_status,
        queryType.categoryName AS query_type,
        assignee.name AS assignee_name,
        resolver.name AS resolver_name,
        CASE
          WHEN t.ticket_status = ? THEN COALESCE(TIMESTAMPDIFF(HOUR, t.created_date, COALESCE(cl.closed_at, t.modified_date)), 0)
          ELSE ''
        END AS resolution_time
      FROM ${DB_PREFIX}tickets t
      LEFT JOIN ${DB_PREFIX}categories priority ON t.ticket_priority = priority.category_id
      LEFT JOIN ${DB_PREFIX}categories status ON t.ticket_status = status.category_id
      LEFT JOIN ${DB_PREFIX}categories queryType ON t.query_type = queryType.category_id
      LEFT JOIN ${DB_PREFIX}admin assignee ON t.assignee = assignee.adminID
      LEFT JOIN (
        SELECT h.ticket_id, h.created_date AS closed_at, h.changed_by AS resolved_by
        FROM ${DB_PREFIX}ticket_history h
        INNER JOIN (
          SELECT ticket_id, MIN(history_id) AS history_id
          FROM ${DB_PREFIX}ticket_history
          WHERE field_name = 'ticket_status'
            AND new_value = ?
          GROUP BY ticket_id
        ) first_close ON first_close.history_id = h.history_id
      ) cl ON cl.ticket_id = t.ticket_id
      LEFT JOIN ${DB_PREFIX}admin resolver ON cl.resolved_by = resolver.adminID
      ${whereSql}
      ORDER BY COALESCE(t.start_date, t.created_date) DESC, t.ticket_id DESC
    `,
    [CLOSED_STATUS, CLOSED_STATUS, ...values]
  );
};

export const customerReport = async (req, res) => {
  try {
    const body = req.body || {};
    const customerId = body.customer_id || body.customerId;

    if (!customerId) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 400,
        message: "Customer id is required.",
      });
    }

    const normalizedBody = {
      ...body,
      customer_id: customerId,
    };

    const [customer, summary, tickets] = await Promise.all([
      getCustomerReportCustomer({ customerId, user: req.user }),
      getCustomerReportSummary({ body: normalizedBody, user: req.user }),
      getCustomerReportTickets({ body: normalizedBody, user: req.user }),
    ]);

    if (!customer?.customer_id) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 404,
        message: "Customer not found.",
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          customer,
          products: customer.customer_products || [],
          summary,
          tickets,
          filters: {
            customer_id: customerId,
            from_date: body.from_date || "",
          },
        },
      },
    });
  } catch (error) {
    console.error(error);

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

export const exportCustomerReportExcel = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    const normalizedBody = {
      ...req.body,
      customer_id: customerId,
    };
    const [customer, summary, tickets] = await Promise.all([
      getCustomerReportCustomer({ customerId, user: req.user }),
      getCustomerReportSummary({ body: normalizedBody, user: req.user }),
      getCustomerReportTickets({ body: normalizedBody, user: req.user }),
    ]);

    if (!customer?.customer_id) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer not found" });
    }

    const attachment = await buildReportAttachment({ customer, summary, supportRows: tickets });
    return sendExcelDownload(res, attachment);
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
export const sendReport = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }
    const normalizedBody = {
      ...req.body,
      customer_id: customerId,
    };
    const [customer, summary, tickets] = await Promise.all([
      getCustomerReportCustomer({ customerId, user: req.user }),
      getCustomerReportSummary({ body: normalizedBody, user: req.user }),
      getCustomerReportTickets({ body: normalizedBody, user: req.user }),
    ]);
    if (!customer?.customer_id) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer not found" });
    }
    if (!customer.email) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer email not found" });
    }
    const products = customer.customer_products || [];
    const supportRows = tickets;
    const subject = `Support Report - ${customer.name || "Customer"}`;
    const html = await buildSupportReportTemplate({ customer, supportCallCount: supportRows.length, summary, products });
    const attachments = [await buildReportAttachment({ customer, summary, supportRows, })];
    // SEND EMAIL To Customer 
    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      text: "",
      company_id: customer.company_id,
      attachments,
    });

    if (!result.success) {
      // await insertReminderLog({
      //   customer,
      //   user: req.user,
      //   includeReport,
      //   subject,
      //   status: "failed",
      //   errorMessage: result.error || result.message || "Email sending failed",
      // });

      return failureResponse(res, {
        code: 2008,
        httpStatus: 500,
        message: result.error || "Email sending failed",
      });
    }
    // await insertReminderLog({ customer, user: req.user, includeReport, subject });
    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Support report sent successfully.",
      data: {
        data: {
          customer_id: customer.customer_id,
          support_call_count: supportRows.length,
        },
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const list = customerReport;
export const exportExcel = exportCustomerReportExcel;

