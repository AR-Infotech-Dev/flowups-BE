import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import { DB_PREFIX, query } from "#config/database.js";
import { isSuperAdminRole as isSuperAdmin } from "#shared/utils/role.utils.js";
import * as ProductExpiryReportService from "./product-expiry-report.service.js";
import * as CommonModel from "#shared/models/common.model.js";
import { renderTemplate } from "#shared/utils/templateMaker.js"
import { sendEmail } from "#shared/utils/email.js";
import { createProductExpiryCall, insertReminderLog } from "#modules/amc-reminders/amc-reminder.controller.js"
export const list = async (req, res) => {
  try {
    const report = await ProductExpiryReportService.getProductExpiryReport({
      body: req.body || {},
      user: req.user || {},
    });

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: report.data,
        summary: report.summary,
        pagination: report.pagination,
        filters: report.filters,
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
export const activity = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId || req.body.client_id;
    const product = req.body.product;

    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }

    const companyScope = !isSuperAdmin(req.user) && req.user.company_id ? "AND c.company_id = ?" : "";
    const scopeValues = !isSuperAdmin(req.user) && req.user.company_id ? [customerId, req.user.company_id] : [customerId];
    const customerRows = await query(
      `
        SELECT c.customer_id, c.name, c.email, c.mobile_no, cm.company_name, c.company_id, c.is_amc
        FROM ${DB_PREFIX}customer c
        LEFT JOIN ${DB_PREFIX}company_master cm ON cm.company_id = c.company_id
        WHERE c.customer_id = ?
          ${companyScope}
        LIMIT 1
      `,
      scopeValues
    );
    const customer = customerRows[0];

    if (!customer) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer not found" });
    }

    const ticketScope = !isSuperAdmin(req.user) && req.user.company_id ? "AND t.company_id = ?" : "";
    const ticketValues = !isSuperAdmin(req.user) && req.user.company_id
      ? [customerId, product?.serial_number || "", req.user.company_id]
      : [customerId, product?.serial_number || ""];

    const calls = await query(
      `
        SELECT
          t.ticket_id,
          t.ticket_no,
          t.description,
          t.created_date,
          t.due_date,
          qs.categoryName AS query_type,
          ts.categoryName AS ticket_status,
          tp.categoryName AS ticket_priority,
          a.name AS assignee_name
        FROM ${DB_PREFIX}tickets t
        LEFT JOIN ${DB_PREFIX}categories qs ON t.query_type = qs.category_id
        LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
        LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
        LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
        WHERE t.client_id = ?
          AND t.status = 'active'
          AND t.amc_call = 'n'
          AND t.call_direction = 'out'
          AND t.product_serial_number = ?
          ${ticketScope}
        ORDER BY t.created_date DESC, t.ticket_id DESC
      `,
      ticketValues
    );

    const reminders = await query(
      `
        SELECT reminder_id, sent_at, include_report, recipient_email, email_subject, status, error_message
        FROM ${DB_PREFIX}reminder_logs
        WHERE record_id = ?
        AND related_to = "product"
        ORDER BY sent_at DESC, reminder_id DESC
      `,
      [product?.serial_number || ""]
    );

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        customer,
        data:{
          calls,
          reminders,
          counts: {
            calls: calls.length,
            reminders: reminders.length,
          },
        }
      },
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
export const makeProductExpiryCall = (req, res) => {
  createProductExpiryCall(req, res)
}
// sendAlert
export const sendAlert = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    const product = req.body.product;
    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }
    const customerDetails = await CommonModel.getMasterDetails('customer', "name, email, customer_id", {
      customer_id: customerId,
    });
    const customer = customerDetails[0];
    if (!customer.email) {
      return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer email not found" });
    }

    const subject = `Product renewal reminder - ${customer.name || "Customer"}`;
    const html = await renderTemplate("productRenewalReminder", "email", {
      customerName: customer.name || "Customer",
      product: product,
    });
    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      text: "",
      company_id: customer.company_id,
    });
    await insertReminderLog({ customer, user: req.user, includeReport: 'n', subject, errorMessage: result.error || result.message || "Email sending failed", related_to: 'product', record_id: product.serial_number });
    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Product expiry reminder sent successfully.",
      data: {},
    });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};
