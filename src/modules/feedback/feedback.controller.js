import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";
import { validate } from "#shared/utils/request.validator.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { buildTablePayload } from "#shared/utils/tablePayload.js";
import { env } from "#config/env.js";
import { DB_PREFIX, query } from "#config/database.js";
import { getUserCompanyId, isSuperAdminRole } from "#shared/utils/role.utils.js";
import { reviewRatingSummary } from "./feedback.model.js";
import Joi from "joi";
import crypto from "node:crypto";

const MODULE_TABLE = "ticket_feedback";
const default_columns = {
  client_id: {
    table: "customer",
    alias: "cu",
    column: "name",
    key2: "customer_id",
    select: "",
  },
  ticket_id: {
    table: "tickets",
    alias: "ad",
    column: "ticket_no",
    key2: "ticket_id",
    select: "ad.ticket_no as ticket_no, ad.ticket_id as ticket_id",
  },

};

const custom_columns = {};

export const list = async (req, res) => {
  try {
    const {
      page = 1,
      searchText = "",
      getAll = "N",
      orderBy = "submitted_at",
      order = "DESC",
      company_id = null,
      filters,
    } = req.body;

    const limit = env.perPage;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;
    const other1 = {
      orderBy,
      order,
      searchColumns: ["feedback_id", "ticket_id", "client_id", "rating", "is_resolved", "comment", "submitted_at", "feedback_submitted"],
    };
    const filterData = prepareFilterData({
      filters,
      searchText,
      other: other1,
      default_columns,
      custom_columns,
    });
    const { select, where, values, join, other } = filterData;

    const scopedCompanyId = isSuperAdminRole(req.user.adminID)
      ? null
      : getUserCompanyId(req.user);


    if (scopedCompanyId) {
      where.push("ad.company_id = ?");
      values.push(scopedCompanyId);
    };

    const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other, });
    const totalPages = Math.ceil(total / limit);
    let end = start + limit;
    if (end > total) end = total;

    let data = [];

    if (getAll === "Y") {
      data = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other, });
    } else {
      data = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other, });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data,
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

export const createFeedbackToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/* ======================================================
   SUBMIT CUSTOMER FEEDBACK
   POST /feedback/submit
====================================================== */
export const submitTicketFeedback = async (req, res) => {
  try {
    const { ticket_id = null, token = "", rating = "", is_resolved = "yes", comment = "", } = req.body;

    if (!ticket_id) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 400,
        message: "Ticket ID is required",
      });
    }

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 400,
        message: "Please provide valid rating between 1 to 5",
      });
    }

    /* =====================================
       GET TICKET DETAILS
    ===================================== */
    const ticketDetails = await CommonModel.getMasterDetails("tickets", "ticket_id, client_id, feedback_token, feedback_submitted", { ticket_id });
    if (!ticketDetails.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "Ticket not found",
      });
    }

    const ticket = ticketDetails[0];

    /* =====================================
       TOKEN CHECK
    ===================================== */
    if (String(ticket.feedback_token || "") !== String(token)) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 401,
        message: "Invalid feedback link",
      });
    }

    /* =====================================
       ALREADY SUBMITTED
    ===================================== */
    if (ticket.feedback_submitted === "y") {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 400,
        message: "Feedback already submitted",
      });
    }

    /* =====================================
       SAVE FEEDBACK
    ===================================== */
    const data = {
      ticket_id: ticket.ticket_id,
      client_id: ticket.client_id,
      rating: Number(rating),
      is_resolved,
      comment,
      submitted_at: toMysqlDateTime(),
    };

    await CommonModel.saveMasterDetails({
      table: "ticket_feedback",
      data,
    });

    /* =====================================
       UPDATE TICKET FLAG
    ===================================== */
    await CommonModel.updateMasterDetails({
      table: "tickets",
      data: {
        feedback_submitted: "y",
      },
      where: {
        ticket_id,
      },
    });
    /* =====================================
       SUCCESS
    ===================================== */
    return successResponse(res, {
      code: 1001,
      httpStatus: 200,
      data: [],
      message: "Feedback submitted successfully",
    });

  } catch (error) {
    console.error("Error in submitTicketFeedback:", error);
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

export const getReviewRatings = async (req, res) => {
  try {
    const company_id = req.user.company_id || null;
    const ratingsSummary = await reviewRatingSummary(company_id);
    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: ratingsSummary[0] || {}
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