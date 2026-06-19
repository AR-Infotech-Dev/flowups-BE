import { failureResponse, successResponse } from "#shared/utils/apiResponse.js";
import * as ProductExpiryReportService from "./product-expiry-report.service.js";
import * as CommonModel from "#shared/models/common.model.js";
import { renderTemplate } from "#shared/utils/templateMaker.js"
import { sendEmail } from "#shared/utils/email.js";

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

// sendAlert

export const sendAlert = async (req, res) => {
  try {
    const customerId = req.body.customer_id || req.body.customerId;
    const product = req.body.product;
    if (!customerId) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "customer_id is required" });
    }
    const customerDetails = await CommonModel.getMasterDetails('customer', "name, email", {
      customer_id: customerId,
    });
    const customer = customerDetails[0]; 
    console.log(customer);

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