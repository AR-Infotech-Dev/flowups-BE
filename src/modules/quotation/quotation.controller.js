import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { validateBody } from "#shared/utils/bodyValidator.js";
import { customColumns, defaultColumns, QUOTATION_SEARCH_COLUMNS, MODULE_TABLE } from "./quotation.filter.js";
import {
  buildQuotationNumber,
  calculateQuotationTotals,
  prepareQuotationLines,
  quotationValidationRules,
  validateQuotationLines,
} from "./quotation.utils.js";
import {
  createQuotationDetails,
  createQuotationLines,
  createQuotationStatusHistory,
  createQuotationFollowup,
  closePendingQuotationFollowups,
  deleteQuotationDetails,
  deleteQuotationLines,
  getNextQuotationId,
  getQuotationDetails,
  getQuotationLines,
  getQuotationStatusHistory,
  getQuotationFollowups,
  replaceQuotationLines,
  updateQuotationDetails,
  updateQuotationFollowup,
} from "./quotation.model.js";
import { env } from "#config/env.js";
import { isSuperAdminRole } from "#shared/utils/role.utils.js";
import { createLead, getLeadById, updateLead } from "#modules/leads/leads.model.js";
import { createCustomerRecord } from "#modules/customer/customer.controller.js";
import { renderTemplate } from "#shared/utils/templateMaker.js";
import { sendEmail } from "#shared/utils/email.js";
import { htmlToPdfBuffer } from "#shared/utils/pdf.js";

const formatPreviewDate = (value) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
  : "-";

const formatPreviewMoney = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

const absoluteAssetUrl = (value) => value && !/^https?:\/\//i.test(value)
  ? `${env.baseUrl}${String(value).startsWith("/") ? "" : "/"}${value}`
  : value;

const getLeadStatusFromQuotation = (quotationStatus) => {
  if (quotationStatus === "draft") return "new";
  if (quotationStatus === "sent") return "quotation_sent";
  if (quotationStatus === "approved") return "won";
  if (quotationStatus === "rejected") return "lost";
  return null;
};

const allowedStatusTransitions = {
  draft: ["sent"],
  sent: ["approved", "rejected", "revision_required"],
  rejected: ["revision_required"],
};

const addStatusHistory = ({ quotationId, oldStatus, newStatus, remarks, user }) =>
  createQuotationStatusHistory({ quotation_id: quotationId, old_status: oldStatus || null, new_status: newStatus, remarks: remarks || null, changed_by: user.adminID, changed_date: toMysqlDateTime() });

const resolveApprovedCustomer = async ({ quotation, user }) => {
  if (quotation.customer_id) return Number(quotation.customer_id);
  if (!quotation.lead_id) return null;

  const leadRows = await getLeadById(quotation.lead_id);
  const lead = leadRows[0];
  if (!lead) throw new Error("Lead not found for customer conversion");
  if (lead.customer_id) return Number(lead.customer_id);

  const quotationLines = await getQuotationLines(quotation.quotation_id);
  const creation = await createCustomerRecord({
    user,
    body: {
      name: lead.name,
      company_name: lead.company_name || null,
      contact_person: lead.contact_person || lead.name,
      email: lead.email || null,
      mobile_no: lead.mobile_no || "",
      wa_no: lead.wa_no || lead.mobile_no || "",
      gst_number: lead.gst_number || null,
      address: lead.address || null,
      responsible_person: lead.assigned_to || user.adminID,
      customer_products: quotationLines.map((line) => ({
        product_id: line.product_id,
        product_name: line.product_name,
      })),
      customer_contacts: lead.contact_person || lead.mobile_no || lead.email ? [{
        name: lead.contact_person || lead.name,
        mobile_no: lead.mobile_no || "",
        email: lead.email || "",
        is_primary: "y",
      }] : [],
    },
  });

  if (!creation.success) throw new Error(creation.message || "Unable to convert lead to customer");
  await updateLead(lead.lead_id, { customer_id: creation.customerId, modified_by: user.adminID, modified_date: toMysqlDateTime() });
  return creation.customerId;
};

const resolveQuotationLead = async ({ data, lines, user, existingLeadId = null }) => {
  if (data.lead_id || existingLeadId) return data.lead_id || existingLeadId;
  if (!data.customer_id) return null;

  const customerRows = await CommonModel.getMasterDetails("customer", "*", { customer_id: data.customer_id });
  const customer = customerRows[0];
  if (!customer) return null;

  const result = await createLead({
    customer_id: customer.customer_id,
    company_id: user.company_id,
    name: customer.name,
    company_name: customer.company_name || null,
    contact_person: customer.contact_person || null,
    mobile_no: customer.mobile_no || "",
    email: customer.email || null,
    requirement: lines.map((line) => line.product_name).filter(Boolean).join(", "),
    lead_source: "call",
    lead_status: getLeadStatusFromQuotation(data.quotation_status) || "new",
    status: "active",
    created_by: user.adminID,
    created_date: toMysqlDateTime(),
  });
  return result.insertId;
};


// ======================================================
// LIST CUSTOMERS
// ======================================================
export const list = async (req, res) => {
  try {
    const { page = 1, searchText = "", getAll = "N", order_by = "created_date", order = "DESC", filters = [], } = req.body;
    const limit = env.perPage;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: {
        orderBy: order_by,
        order,
        searchColumns: QUOTATION_SEARCH_COLUMNS,
      },
      default_columns: defaultColumns,
      custom_columns: customColumns,
    });

    const { select, where, values, join, other } = filterData;

    other.freeTextSearch = searchText;
    other.searchColumns = QUOTATION_SEARCH_COLUMNS;

    // FILTER DATA ACCORDING TO COMPANY ID
    if (!isSuperAdminRole(req.user) && req.user.company_id) {
      where.push("t.company_id = ?");
      values.push(req.user.company_id);
    }

    const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other, });
    const totalPages = Math.ceil(total / limit);
    const end = Math.min(start + limit, total);
    const quotationList = getAll === "Y"
      ? await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other, })
      : await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other, });


    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: quotationList,
        pagination: {
          total,
          page: currentPage,
          limit,
          totalPages,
          start: total === 0 ? 0 : start + 1,
          end,
        },
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

// ======================================================
// CREATE / UPDATE / GET SINGLE
// ======================================================
export const create = async (req, res) => {
  let createdQuotationId = null;

  try {
    const validation = validateBody(req.body, quotationValidationRules);
    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }
    const data = validation.data;
    if (!data.customer_id && !data.lead_id) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Customer or lead is required" });
    }
    const preparedLines = prepareQuotationLines(req.body.items);
    const lineValidationError = validateQuotationLines(preparedLines);
    if (lineValidationError) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: lineValidationError,
      });
    }

    const nextQuotationId = await getNextQuotationId();
    const totals = calculateQuotationTotals(preparedLines);
    const leadId = await resolveQuotationLead({ data, lines: preparedLines, user: req.user });
    if (!leadId) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Customer or lead not found" });
    const details = {
      ...data,
      ...totals,
      lead_id: leadId,
      quotation_no: buildQuotationNumber(nextQuotationId),
      quotation_status: data.quotation_status || "draft",
      company_id: req.user.company_id,
      created_by: req.user.adminID,
      created_date: toMysqlDateTime(),
    };

    const detailsResult = await createQuotationDetails(details);
    createdQuotationId = detailsResult.insertId;
    const lines = preparedLines.map(({ gross, discount, ...line }) => line);
    await createQuotationLines(createdQuotationId, lines);
    await addStatusHistory({ quotationId: createdQuotationId, oldStatus: null, newStatus: "draft", remarks: "Quotation created", user: req.user });
    const leadStatus = getLeadStatusFromQuotation(details.quotation_status);
    if (leadStatus) {
      await updateLead(leadId, { lead_status: leadStatus, modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    }

    return successResponse(res, {
      code: 1001,
      httpStatus: 201,
      data: {
        quotation_id: createdQuotationId,
        quotation_no: details.quotation_no,
      },
    });
  } catch (error) {
    if (createdQuotationId) {
      try {
        await deleteQuotationLines(createdQuotationId);
        await deleteQuotationDetails(createdQuotationId);
      } catch (cleanupError) {
        console.error("Unable to clean up incomplete quotation", cleanupError);
      }
    }

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
export const read = async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const { id: quotation_id = null } = req.params;
    if (!quotation_id) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const details = await getQuotationDetails(quotation_id);

    if (!details.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const quotationData = details[0];
    const items = await getQuotationLines(quotation_id);

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: {
          ...quotationData,
          items,
        },
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

export const preview = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    if (!quotationId) return failureResponse(res, { code: 2004, httpStatus: 404 });

    const quotationRows = await getQuotationDetails(quotationId);
    if (!quotationRows.length) return failureResponse(res, { code: 2004, httpStatus: 404 });

    const quotation = quotationRows[0];
    const [items, companyRows, customerRows, leadRows, adminRows] = await Promise.all([
      getQuotationLines(quotationId),
      CommonModel.getMasterDetails("company_master", "*", { company_id: quotation.company_id }),
      quotation.customer_id ? CommonModel.getMasterDetails("customer", "*", { customer_id: quotation.customer_id }) : [],
      quotation.lead_id ? CommonModel.getMasterDetails("leads", "*", { lead_id: quotation.lead_id }) : [],
      quotation.created_by ? CommonModel.getMasterDetails("admin", "name", { adminID: quotation.created_by }) : [],
    ]);
    const company = companyRows[0] || {};
    const party = customerRows[0] || leadRows[0] || {};
    const taxableAmount = Number(quotation.subtotal || 0) - Number(quotation.discount_total || 0);
    const footerLogos = parseJsonArray(company.footer_logos || quotation.footer_logos).map((logo) => ({
      name: logo.name || logo.label || "Partner",
      url: absoluteAssetUrl(logo.url || logo.logo_url || logo.path),
    })).filter((logo) => logo.url);

    const html = await renderTemplate("quotation", "preview", {
      company: {
        name: company.company_name || env.appName,
        legal_name: company.company_name || env.appName,
        tagline: "CallDesk",
        logo_url: absoluteAssetUrl(company.email_logo),
        address: company.company_address || "",
        footer_address: [company.city, company.state, company.country].filter(Boolean).join(" | "),
        phone: company.mobile_number || "",
        email: company.sender_email || company.cc_email || "",
        website: company.website || "",
        gst_number: company.gst_number || "",
        signature_url: absoluteAssetUrl(company.signature_url),
      },
      customer: {
        company_name: party.company_name || party.name || quotation.customer_name || quotation.lead_name || "-",
        contact_person: party.contact_person || party.name || "",
        email: party.email || "",
        mobile_no: party.mobile_no || "",
        gst_number: party.gst_number || "",
        address: party.address || "",
      },
      quotation: {
        quotation_no: quotation.quotation_no,
        quotation_date: formatPreviewDate(quotation.quotation_date),
        valid_until: formatPreviewDate(quotation.valid_until),
        status_label: String(quotation.quotation_status || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        timeframe: quotation.timeframe || "",
        sales_executive: adminRows[0]?.name || "",
        notes: quotation.notes || "",
      },
      items: items.map((item, index) => ({
        ...item,
        display_index: index + 1,
        rate_formatted: formatPreviewMoney(item.rate),
        gst_rate_formatted: `${Number(item.gst_rate || 0)}%`,
        line_total_formatted: formatPreviewMoney(item.line_total),
      })),
      terms: String(quotation.terms || "").split(/\r?\n/).map((term) => term.trim()).filter(Boolean),
      totals: {
        subtotal_formatted: formatPreviewMoney(quotation.subtotal),
        discount_total_formatted: `- ${formatPreviewMoney(quotation.discount_total)}`,
        taxable_amount_formatted: formatPreviewMoney(taxableAmount),
        tax_total_formatted: formatPreviewMoney(quotation.tax_total),
        grand_total_formatted: formatPreviewMoney(quotation.grand_total),
        amount_in_words: quotation.amount_in_words || "",
      },
      footer_logos: footerLogos,
    });

    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: { html } } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

const getRenderedPreview = async (req) => {
  let body = null;
  const response = { status() { return this; }, json(payload) { body = payload; return payload; } };
  await preview(req, response);
  if (!body?.success || !body?.data?.html) throw new Error(body?.message || "Unable to render quotation");
  return body.data.html;
};

export const send = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    if (!quotationId) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const quotationRows = await getQuotationDetails(quotationId);
    if (!quotationRows.length) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const quotation = quotationRows[0];
    if (quotation.quotation_status !== "draft") return failureResponse(res, { code: 2001, httpStatus: 400, message: "Only draft quotations can be sent" });
    const partyRows = quotation.customer_id
      ? await CommonModel.getMasterDetails("customer", "name,company_name,email", { customer_id: quotation.customer_id })
      : await CommonModel.getMasterDetails("leads", "name,company_name,email", { lead_id: quotation.lead_id });
    const party = partyRows[0] || {};
    const storedEmail = String(party.email || "").trim().toLowerCase();
    const confirmedEmail = String(req.body?.recipient_email || "").trim().toLowerCase();
    if (!storedEmail) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Customer or lead email is required" });
    if (req.body?.confirmed !== true || confirmedEmail !== storedEmail) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Confirm the stored recipient email before sending" });
    const companyRows = await CommonModel.getMasterDetails("company_master", "company_name", { company_id: quotation.company_id });
    const companyName = companyRows[0]?.company_name || env.appName;
    const previewHtml = await getRenderedPreview(req);
    const pdf = await htmlToPdfBuffer(previewHtml);
    const emailHtml = await renderTemplate("quotation", "email", { recipientName: party.name || party.company_name || "Customer", quotationNo: quotation.quotation_no, validUntil: formatPreviewDate(quotation.valid_until), grandTotal: formatPreviewMoney(quotation.grand_total), companyName });
    const result = await sendEmail({ to: storedEmail, subject: `Quotation ${quotation.quotation_no} - ${companyName}`, html: emailHtml, company_id: quotation.company_id, attachments: [{ filename: `${quotation.quotation_no || `quotation-${quotationId}`}.pdf`, content: pdf, contentType: "application/pdf" }] });
    if (!result.success) return failureResponse(res, { code: 2008, httpStatus: 500, message: result.error || result.message });
    const sentAt = toMysqlDateTime();
    await updateQuotationDetails(quotationId, { quotation_status: "sent", sent_date: sentAt, sent_to_email: storedEmail, modified_by: req.user.adminID, modified_date: sentAt });
    await addStatusHistory({ quotationId, oldStatus: quotation.quotation_status, newStatus: "sent", remarks: `Sent to ${storedEmail}`, user: req.user });
    await closePendingQuotationFollowups(quotationId, "cancelled", { modified_by: req.user.adminID, modified_date: sentAt });
    await createQuotationFollowup({
      quotation_id: quotationId,
      lead_id: quotation.lead_id || null,
      customer_id: quotation.customer_id || null,
      followup_date: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 19).replace("T", " "),
      followup_type: "call",
      followup_status: "pending",
      notes: "Auto follow-up after quotation sent",
      assigned_to: req.user.adminID,
      company_id: quotation.company_id,
      created_by: req.user.adminID,
      created_date: sentAt,
    });
    if (quotation.lead_id) await updateLead(quotation.lead_id, { lead_status: "quotation_sent", modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    return successResponse(res, { code: 1002, httpStatus: 200, message: `Quotation sent to ${storedEmail}`, data: { data: { quotation_id: quotationId, email: storedEmail } } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const history = async (req, res) => {
  try {
    const rows = await getQuotationStatusHistory(Number(req.params.id));
    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: rows } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const changeStatus = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    const nextStatus = String(req.body?.status || "").trim();
    const remarks = String(req.body?.remarks || "").trim();
    const rows = await getQuotationDetails(quotationId);
    if (!rows.length) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const quotation = rows[0];
    if (!(allowedStatusTransitions[quotation.quotation_status] || []).includes(nextStatus)) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: `Cannot change quotation from ${quotation.quotation_status} to ${nextStatus}` });
    }
    if (["rejected", "revision_required"].includes(nextStatus) && !remarks) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Reason is required" });
    }
    const now = toMysqlDateTime();
    const data = { quotation_status: nextStatus, modified_by: req.user.adminID, modified_date: now };
    if (nextStatus === "approved") {
      data.approved_date = now;
      data.approval_notes = remarks || null;
      const approvedCustomerId = await resolveApprovedCustomer({ quotation, user: req.user });
      if (approvedCustomerId) data.customer_id = approvedCustomerId;
    }
    if (nextStatus === "rejected") { data.rejected_date = now; data.rejection_reason = remarks; }
    if (nextStatus === "revision_required") data.revision_reason = remarks;
    await updateQuotationDetails(quotationId, data);
    await addStatusHistory({ quotationId, oldStatus: quotation.quotation_status, newStatus: nextStatus, remarks, user: req.user });
    if (["approved", "rejected", "revision_required"].includes(nextStatus)) {
      await closePendingQuotationFollowups(quotationId, "cancelled", { modified_by: req.user.adminID, modified_date: now });
    }
    const leadStatus = getLeadStatusFromQuotation(nextStatus);
    if (quotation.lead_id && leadStatus) {
      await updateLead(quotation.lead_id, {
        lead_status: nextStatus === "approved" && data.customer_id ? "converted" : leadStatus,
        ...(data.customer_id ? { customer_id: data.customer_id } : {}),
        modified_by: req.user.adminID,
        modified_date: now,
      });
    }
    return successResponse(res, { code: 1002, httpStatus: 200, message: `Quotation marked as ${nextStatus.replaceAll("_", " ")}`, data: { data: { quotation_id: quotationId, quotation_status: nextStatus, customer_id: data.customer_id || quotation.customer_id || null } } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const followups = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    const quotationRows = await getQuotationDetails(quotationId);
    if (!quotationRows.length) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Quotation not found" });
    const rows = await getQuotationFollowups(quotationId);
    return successResponse(res, { code: 1004, httpStatus: 200, data: { data: rows } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const addFollowup = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    const quotationRows = await getQuotationDetails(quotationId);
    if (!quotationRows.length) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Quotation not found" });
    const quotation = quotationRows[0];
    if (!["sent", "revision_required"].includes(quotation.quotation_status)) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Follow-up can be scheduled only for a sent quotation" });
    }
    const followupDate = String(req.body?.followup_date || "").trim();
    if (!followupDate) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Follow-up date is required" });
    const now = toMysqlDateTime();
    await closePendingQuotationFollowups(quotationId, "cancelled", { modified_by: req.user.adminID, modified_date: now });
    const result = await createQuotationFollowup({
      quotation_id: quotationId,
      lead_id: quotation.lead_id || null,
      customer_id: quotation.customer_id || null,
      followup_date: followupDate.replace("T", " "),
      followup_type: req.body?.followup_type || "call",
      followup_status: "pending",
      notes: String(req.body?.notes || "").trim() || null,
      assigned_to: Number(req.body?.assigned_to || req.user.adminID),
      company_id: quotation.company_id,
      created_by: req.user.adminID,
      created_date: now,
    });
    return successResponse(res, { code: 1001, httpStatus: 201, message: "Follow-up scheduled", data: { data: { followup_id: result.insertId } } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const completeFollowup = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    const followupId = Number(req.params.followupId);
    const result = String(req.body?.followup_result || "").trim();
    if (!result) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Follow-up result is required" });
    const now = toMysqlDateTime();
    await updateQuotationFollowup(followupId, {
      followup_status: "completed",
      followup_result: result,
      notes: String(req.body?.notes || "").trim() || null,
      next_followup_date: req.body?.next_followup_date ? String(req.body.next_followup_date).replace("T", " ") : null,
      modified_by: req.user.adminID,
      modified_date: now,
    });
    if (req.body?.next_followup_date && ["no_response", "callback", "interested"].includes(result)) {
      const quotationRows = await getQuotationDetails(quotationId);
      const quotation = quotationRows[0];
      await createQuotationFollowup({ quotation_id: quotationId, lead_id: quotation?.lead_id || null, customer_id: quotation?.customer_id || null, followup_date: String(req.body.next_followup_date).replace("T", " "), followup_type: req.body?.followup_type || "call", followup_status: "pending", notes: "Next quotation follow-up", assigned_to: req.user.adminID, company_id: quotation?.company_id, created_by: req.user.adminID, created_date: now });
    }
    return successResponse(res, { code: 1002, httpStatus: 200, message: "Follow-up completed" });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const revise = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Revision reason is required" });
    const rows = await getQuotationDetails(quotationId);
    if (!rows.length) return failureResponse(res, { code: 2004, httpStatus: 404 });
    const original = rows[0];
    if (!["sent", "rejected", "revision_required"].includes(original.quotation_status)) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Only sent, rejected or revision-required quotations can be revised" });
    }
    const sourceLines = await getQuotationLines(quotationId);
    const nextId = await getNextQuotationId();
    const quotationNo = buildQuotationNumber(nextId);
    const now = toMysqlDateTime();
    const excluded = new Set(["quotation_id", "quotation_no", "customer_name", "customer_email", "lead_name", "lead_email", "sent_date", "sent_to_email", "approved_date", "approval_notes", "rejected_date", "rejection_reason", "revision_no", "parent_quotation_id", "revision_reason", "created_by", "created_date", "modified_by", "modified_date"]);
    const details = Object.fromEntries(Object.entries(original).filter(([key]) => !excluded.has(key)));
    const result = await createQuotationDetails({ ...details, quotation_no: quotationNo, quotation_status: "draft", is_revised_copy: "yes", created_by: req.user.adminID, created_date: now });
    const lineExcluded = new Set(["quotation_item_id", "quotation_id"]);
    await createQuotationLines(result.insertId, sourceLines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => !lineExcluded.has(key)))));
    if (original.quotation_status !== "revision_required") {
      await updateQuotationDetails(quotationId, { quotation_status: "revision_required", revision_reason: reason, modified_by: req.user.adminID, modified_date: now });
      await addStatusHistory({ quotationId, oldStatus: original.quotation_status, newStatus: "revision_required", remarks: reason, user: req.user });
    }
    await addStatusHistory({ quotationId: result.insertId, oldStatus: null, newStatus: "draft", remarks: `Revision of ${original.quotation_no}: ${reason}`, user: req.user });
    return successResponse(res, { code: 1001, httpStatus: 201, message: `New draft quotation ${quotationNo} created`, data: { data: { quotation_id: result.insertId, quotation_no: quotationNo } } });
  } catch (error) {
    return failureResponse(res, { code: 2008, httpStatus: 500, message: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id: quotation_id = null } = req.params;
    if (!quotation_id) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }

    const existingDetails = await getQuotationDetails(quotation_id);
    if (!existingDetails.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
      });
    }
    if (existingDetails[0].quotation_status !== "draft") {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Only draft quotations can be edited. Create a revision instead." });
    }

    const validation = validateBody(req.body, quotationValidationRules);
    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }

    if (!validation.data.customer_id && !validation.data.lead_id && !existingDetails[0].lead_id) {
      return failureResponse(res, { code: 2001, httpStatus: 400, message: "Customer or lead is required" });
    }

    const preparedLines = prepareQuotationLines(req.body.items);
    const lineValidationError = validateQuotationLines(preparedLines);
    if (lineValidationError) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: lineValidationError,
      });
    }

    const totals = calculateQuotationTotals(preparedLines);
    const leadId = await resolveQuotationLead({ data: validation.data, lines: preparedLines, user: req.user, existingLeadId: existingDetails[0].lead_id });
    const details = {
      ...validation.data,
      ...totals,
      lead_id: leadId,
      quotation_status: validation.data.quotation_status || existingDetails[0].quotation_status,
      modified_by: req.user.adminID,
      modified_date: toMysqlDateTime(),
    };
    const lines = preparedLines.map(({ gross, discount, ...line }) => line);

    await updateQuotationDetails(quotation_id, details);
    await replaceQuotationLines(quotation_id, lines);
    const leadStatus = getLeadStatusFromQuotation(details.quotation_status);
    if (leadId && leadStatus) {
      await updateLead(leadId, { lead_status: leadStatus, modified_by: req.user.adminID, modified_date: toMysqlDateTime() });
    }

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      data: {
        quotation_id: Number(quotation_id),
        quotation_no: existingDetails[0].quotation_no,
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
