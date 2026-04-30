import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import crypto from "crypto";


export const createFeedbackToken = () => {
    return crypto.randomBytes(32).toString("hex");
};

/* ======================================================
   SUBMIT CUSTOMER FEEDBACK
   POST /feedback/submit
====================================================== */
export const submitTicketFeedback = async (req, res) => {
    try {
        const {
            ticket_id = null,
            token = "",
            rating = "",
            is_resolved = "yes",
            comment = "",
        } = req.body;

        /* =====================================
           VALIDATION
        ===================================== */
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
                modified_date: toMysqlDateTime(),
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
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};