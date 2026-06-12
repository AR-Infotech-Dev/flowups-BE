import * as CommonModel from "../models/common.model.js";
import { DB_PREFIX, query } from "../config/database.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import { sendEmail } from "../utils/email.js";
import { renderTemplate } from "../utils/templateMaker.js";
import { env } from "../config/env.js";
import { getIO } from "../socket/index.js";
import crypto from "crypto";

const MODULE_TABLE = "ticket_visits";
const createVisitToken = () => {
    return crypto.randomBytes(32).toString("hex");
};

const getTicket = async (ticketId = null) => {
    if (!ticketId) return null;
    return await CommonModel.getSpecificDetails(
        "tickets",
        "ticket_id, ticket_no, client_id, assignee, company_id, created_by, status",
        { ticket_id: ticketId }
    );
};

const canManageVisit = (ticket = {}, user = {}) => {
    const role = String(user?.role_slug || "").toLowerCase();
    return (
        ["admin", "superadmin", "super_admin"].includes(role) ||
        Number(ticket?.assignee || 0) === Number(user?.adminID || 0)
    );
};

const formatVisitDateTime = (value = null) => {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const toDateValue = (value = null) => {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
};

const emitNotification = (userId = null, data = {}) => {
    try {
        if (!userId) return;
        const io = getIO();
        io.to(`user_${userId}`).emit("new_notification", data);
    } catch (error) {
        console.log("Visit Socket Error :", error.message);
    }
};

const notifyVisitScheduled = async ({ ticket = {}, visit = {}, visitId = null } = {}) => {
    const rows = await query(
        `
        SELECT
            t.ticket_id,
            t.ticket_no,
            t.company_id,
            t.created_by,
            t.assignee,
            DATE_FORMAT(t.created_date, '%d %M %Y') AS created_date,
            DATE_FORMAT(t.due_date, '%d %M %Y') AS due_date,
            c.name AS clientName,
            c.email,
            qt.categoryName AS query_type,
            ts.categoryName AS ticket_status,
            tp.categoryName AS ticket_priority,
            a.name AS assignedTo
        FROM ${DB_PREFIX}tickets t
        LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
        LEFT JOIN ${DB_PREFIX}categories qt ON t.query_type = qt.category_id
        LEFT JOIN ${DB_PREFIX}categories ts ON t.ticket_status = ts.category_id
        LEFT JOIN ${DB_PREFIX}categories tp ON t.ticket_priority = tp.category_id
        LEFT JOIN ${DB_PREFIX}admin a ON t.assignee = a.adminID
        WHERE t.ticket_id = ?
        LIMIT 1
        `,
        [ticket.ticket_id]
    );
    const details = rows?.[0] || {};
    const visitDateTime = formatVisitDateTime(visit.visit_scheduled_at);
    const title = "Visit Scheduled";
    const body = `Visit scheduled for ticket ${details.ticket_no || ticket.ticket_no || ticket.ticket_id} on ${visitDateTime}.`;

    // emitNotification(details.assignee, { title, body, type: "visit", ticket_id: ticket.ticket_id, visit_id: visitId });
    // if (details.created_by && Number(details.created_by) !== Number(details.assignee)) { emitNotification(details.created_by, { title, body, type: "visit", ticket_id: ticket.ticket_id, visit_id: visitId }); }
    // if (!details.email) return { email_sent: false };

    const visit_token = createVisitToken();
    await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data: { visit_token }, where: { visit_id: visitId }, });
    const visit_mark_url = `${env.appFEUrl}/mark_visit/${visitId}/${visit_token}`;
    const html = await renderTemplate("ticketNotification", "email", {
        clientName: details.clientName || "Customer",
        ticketNo: details.ticket_no || ticket.ticket_id,
        subject: "Visit Scheduled",
        createdDate: details.created_date || "-",
        dueDate: details.due_date || "-",
        assignedTo: details.assignedTo || "-",
        message: `Your visit has been scheduled on ${visitDateTime}.${visit.visit_details ? `\n Details: ${visit.visit_details}` : ""}.${details.assignedTo ? `\n Visitor : ${details.assignedTo}` : ""}`,
        category: details.query_type || "-",
        status: details.ticket_status || "-",
        priority: details.ticket_priority || "-",
        appName: env?.appName || "Support System",
        redirectUrl: visit_mark_url,
        redirectUrlText: 'Mark as Visited'
    });

    const emailResult = await sendEmail({
        to: details.email,
        subject: `Visit Scheduled - ${details.ticket_no || `Ticket #${ticket.ticket_id}`}`,
        html,
        text: "",
        company_id: details.company_id || ticket.company_id,
    });

    return { email_sent: Boolean(emailResult?.success) };
};

export const list = async (req, res) => {
    try {
        const ticketId = req.body.ticket_id || req.params.ticket_id;

        if (!ticketId) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "ticket_id is required",
            });
        }

        const rows = await query(
            `
            SELECT
                v.*,
                a.name AS employee_name,
                DATE_FORMAT(v.visit_scheduled_at, '%Y-%m-%d') AS visit_date,
                DATE_FORMAT(v.visit_scheduled_at, '%h:%i %p') AS visit_time,
                DATE_FORMAT(v.visited_at, '%Y-%m-%d') AS visited_date,
                DATE_FORMAT(v.visited_at, '%h:%i %p') AS visited_time
            FROM ${DB_PREFIX}${MODULE_TABLE} v
            LEFT JOIN ${DB_PREFIX}admin a ON v.employee_id = a.adminID
            WHERE v.ticket_id = ? AND v.status = 'active'
            ORDER BY v.visit_scheduled_at DESC, v.visit_id DESC
            `,
            [ticketId]
        );

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: { data: rows },
        });
    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

export const create = async (req, res) => {
    try {
        const ticketId = req.body.ticket_id;
        const ticket = await getTicket(ticketId);

        if (!ticket) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket not found",
            });
        }

        if (!canManageVisit(ticket, req.user)) {
            return failureResponse(res, {
                code: 2003,
                httpStatus: 403,
                message: "Only assignee or admin can schedule visit",
            });
        }

        if (!req.body.visit_scheduled_at) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "visit_scheduled_at is required",
            });
        }

        const scheduledVisit = await hasScheduledVisit(ticketId);
        if (scheduledVisit) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 409,
                message: "Visit already scheduled for this ticket",
            });
        }

        const data = await buildTablePayload(MODULE_TABLE, {
            ticket_id: ticketId,
            employee_id: req.body.employee_id || ticket.assignee || req.user.adminID,
            company_id: ticket.company_id || req.user.company_id,
            visit_scheduled_at: req.body.visit_scheduled_at,
            visit_details: req.body.visit_details || "",
            visit_status: "scheduled",
            created_by: req.user.adminID,
            created_date: toMysqlDateTime(),
            status: "active",
        });

        const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });
        const visitId = result.insertId;

        notifyVisitScheduled({ ticket, visit: data, visitId, })
            .catch((error) => {
                console.log("Visit notification error :", error.message);
            });

        return successResponse(res, {
            code: 1001,
            httpStatus: 201,
            message: "Visit scheduled successfully",
            data: { insertId: visitId },
        });
    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

export const markVisited = async (req, res) => {
    try {
        const ticketId = req.body.ticket_id;
        const visitId = req.body.visit_id;
        const ticket = await getTicket(ticketId);

        if (!ticket) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket not found",
            });
        }

        if (!canManageVisit(ticket, req.user)) {
            return failureResponse(res, {
                code: 2003,
                httpStatus: 403,
                message: "Only assignee or admin can update visit",
            });
        }

        if (!visitId) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "visit_id is required",
            });
        }


        const rows = await CommonModel.getMasterDetails(MODULE_TABLE, "*", {
            visit_id: visitId,
            ticket_id: ticketId,
            status: "active",
        });
        const visit = rows?.[0] || null;

        if (!visit) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Visit not found",
            });
        }

        const scheduledAt = toDateValue(visit.visit_scheduled_at);
        const now = new Date();
        if (scheduledAt && now < scheduledAt) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: `Visit can be marked visited only after scheduled time (${formatVisitDateTime(visit.visit_scheduled_at)}).`,
            });
        }

        const data = await buildTablePayload(MODULE_TABLE, {
            visited_at: toMysqlDateTime(),
            visit_details: req.body.visit_details || visit.visit_details || "",
            visit_status: "visited",
            modified_by: req.user.adminID,
            modified_date: toMysqlDateTime(),
        });

        await CommonModel.updateMasterDetails({
            table: MODULE_TABLE,
            data,
            where: { visit_id: visitId, ticket_id: ticketId },
        });

        return successResponse(res, {
            code: 1002,
            httpStatus: 200,
            message: "Visit marked as visited",
            data: [],
        });
    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

export const customerConfirmVisit = async (req, res) => {
    try {
        const { visit_id: visitId = null, token = "", customer_name = "", visit_done = "yes", comment = "", visited_latitude = null, visited_longitude = null, visited_location_accuracy = null, } = req.body;

        if (!visitId || !token) { return failureResponse(res, { code: 2000, httpStatus: 400, message: "visit_id and token are required", }); }

        if (!customer_name) { return failureResponse(res, { code: 2000, httpStatus: 400, message: "customer_name is required", }); }

        if (visited_latitude === null || visited_longitude === null || visited_latitude === "" || visited_longitude === "") { return failureResponse(res, { code: 2000, httpStatus: 400, message: "Location is required to confirm visit", }); }

        const rows = await CommonModel.getMasterDetails(MODULE_TABLE, "*", { visit_id: visitId, visit_token: token, status: "active", });
        const visit = rows?.[0] || null;

        if (!visit) { return failureResponse(res, { code: 2004, httpStatus: 404, message: "Invalid or expired visit link", }); }

        if (String(visit.visit_status || "").toLowerCase() === "visited") { return failureResponse(res, { code: 2000, httpStatus: 409, message: "Visit is already marked as visited", }); }
        
        const scheduledAt = toDateValue(visit.visit_scheduled_at);
        const now = new Date();
        if (scheduledAt && now < scheduledAt) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: `Visit can be marked visited only after scheduled time (${formatVisitDateTime(visit.visit_scheduled_at)}).`,
            });
        }
        
        const isVisited = String(visit_done || "yes").toLowerCase() === "yes";
        const confirmationNote = [
            visit.visit_details || "",
            `Customer confirmation: ${isVisited ? "Visit completed" : "Visit not completed"}`,
            comment ? `Comment: ${comment}` : "",
        ].filter(Boolean).join("\n");

        const data = await buildTablePayload(MODULE_TABLE, {
            visited_at: isVisited ? toMysqlDateTime() : visit.visited_at,
            visit_details: confirmationNote,
            visit_status: isVisited ? "visited" : "scheduled",
            latitude: String(visited_latitude),
            longitude: String(visited_longitude),
            marked_by: customer_name,
            modified_date: toMysqlDateTime(),
        });

        await CommonModel.updateMasterDetails({
            table: MODULE_TABLE,
            data,
            where: { visit_id: visitId, visit_token: token },
        });

        return successResponse(res, {
            code: 1002,
            httpStatus: 200,
            message: isVisited ? "Visit confirmed successfully" : "Visit response submitted successfully",
            data: [],
        });

    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

const findScheduledVisit = async (ticketId = null) => {
    if (!ticketId) return null;

    const rows = await query(
        `
        SELECT *
        FROM ${DB_PREFIX}${MODULE_TABLE}
        WHERE ticket_id = ?
          AND status = 'active'
          AND visit_scheduled_at IS NOT NULL
          AND (visited_at IS NULL)
          AND COALESCE(visit_status, 'scheduled') NOT IN ('visited')
        ORDER BY visit_scheduled_at DESC, visit_id DESC
        LIMIT 1
        `,
        [ticketId]
    );
    return rows?.[0] || null;
};

export const hasScheduledVisit = async (ticketId = null) => {
    return await findScheduledVisit(ticketId);
};
