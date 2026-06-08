import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { validate } from "../utils/request.validator.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import { sendEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { DB_PREFIX } from "../config/database.js";
import { createFeedbackToken } from "./feedback.controller.js";
import { getIO } from "../socket/index.js";
import { renderTemplate } from "../utils/templateMaker.js";
import { hasActiveWorkLog } from "./ticketWorkLogs.controller.js";
import { title } from "process";

const MODULE_TABLE = "tickets"
const TICKET_STATUS_CLOSE = '208'
const TICKET_STATUS_OPEN = '205'
const VIEW_ALL_ROLE_SLUGS = new Set(["admin", "superadmin", "super_admin"]);

const canViewAllTickets = (user = {}) => {
    return VIEW_ALL_ROLE_SLUGS.has(String(user.role_slug || "").toLowerCase());
};
const isSuperAdmin = (user = {}) => {
    return String(user.role_slug || "").toLowerCase() === "super_admin";
};

const isAdmin = (user = {}) => {
    return String(user.role_slug || "").toLowerCase() === "admin";
};

const getAssigneeHistoryExistsSql = (userId, condition) => `
    EXISTS (
        SELECT 1
        FROM ${DB_PREFIX}ticket_history h
        WHERE h.ticket_id = t.ticket_id
          AND h.field_name = 'assignee'
          AND h.action_type = 'reassigned'
          AND (${condition})
    )
`;

const getTicketVisibilitySelect = (userId = null) => {
    const safeUserId = Number(userId || 0);
    if (!safeUserId) {
        return "";
    }
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

const resolveTicketActiveAmc = async (clientId = null) => {
    if (!clientId) return "n";

    const customer = await CommonModel.getSpecificDetails(
        "customer",
        "is_amc, amc_start_date, amc_end_date, amc_term_period",
        { customer_id: clientId }
    );

    return isCustomerAmcActive(customer) ? "y" : "n";
};

const normalizeTicketAddOns = (value = []) => {
    if (typeof value === "string") {
        try {
            return normalizeTicketAddOns(JSON.parse(value));
        } catch {
            return value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (typeof item === "object" && item !== null) {
                return String(item.name || item.add_on_name || item.label || item.value || "").trim();
            }

            return String(item || "").trim();
        })
        .filter(Boolean);
};

const prepareTicketBody = (source = {}) => ({
    ...source,
    ...(Object.prototype.hasOwnProperty.call(source, "product_add_ons")
        ? { product_add_ons: JSON.stringify(normalizeTicketAddOns(source.product_add_ons)) }
        : {}),
});

// ======================================================
// LIST USERS
// ======================================================
const default_columns = {
    ticket_priority: { table: "categories", alias: "cat", column: "categoryName", key2: "category_id", select: "cat.cat_color AS priority_color" },
    ticket_status: { table: "categories", alias: "ca", column: "categoryName", key2: "category_id", select: "ca.cat_color AS status_color" },
    query_type: { table: "categories", alias: "ct", column: "categoryName", key2: "category_id", select: "ct.cat_color AS type_color" },
    assignee: { table: "admin", alias: "a", column: "name", key2: "adminID", select: "" },
    client_id: {
        table: "customer",
        alias: "cs",
        column: "name",
        key2: "customer_id",
        select: "cs.name AS client_name"
    },
};

const custom_columns = {
    company_id: { table: "company_master", alias: "dc", column: "company_name", key2: "company_id", select: "" },
    modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "" },
    created_by: { table: "admin", alias: "ad", column: "name", key2: "adminID", select: "" }
};

export const list = async (req, res) => {
    try {
        const { viewAll, client_id = null, page = 1, searchText = '', getAll = "N", orderBy = "created_date", order = "ASC", filters } = req.body;
        const limit = 10;
        const currentPage = Number(page) || 1;
        const start = (currentPage - 1) * limit;
        const freeTextSearch = searchText || '';
        const other1 = { orderBy: 'ticket_id', order: 'DESC', searchColumns: ['t.ticket_no', 'cat.categoryName', 'ca.categoryName', 'ct.categoryName', 'a.name', 'cs.name', 'ad.name', 'am.name'] };
        const filterData = prepareFilterData({ filters, searchText, other: other1, default_columns, custom_columns })
        const { select, where, values, join, other } = filterData;
        const userId = Number(req.user.adminID || 0);
        const visibilitySelect = getTicketVisibilitySelect(userId);

        if (client_id) {
            where.push(`client_id = ${client_id}`);
        }

        if (!isSuperAdmin(req.user) && req.user.company_id) {
            where.push("t.company_id = ?");
            values.push(req.user.company_id);
        }

        const shouldFilterByAssignee =
            !isSuperAdmin(req.user) &&
            !(isAdmin(req.user) && (viewAll === "Y" || getAll === "Y")) &&
            userId;

        if (shouldFilterByAssignee && userId) {
            where.push(`
                (
                    t.assignee = ?
                    OR t.created_by = ?
                    OR ${getAssigneeHistoryExistsSql(userId, "(h.new_value = ? OR h.old_value = ? OR h.changed_by = ?)")}
                )
            `);
            values.push(userId, userId, userId, userId, userId);
        }

        const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });
        const totalPages = Math.ceil(total / limit);

        let end = start + limit;
        if (end > total) end = total;

        // join.push({
        //     type: "LEFT JOIN",
        //     table: 'ticket_work_logs',
        //     alias: 'twl',
        //     key1: 'ticket_id',
        //     key2: 'ticket_id',
        //     column: 'work_status'
        // })

        let adminDetails = [];
        if (getAll === "Y") {
            let select1 = select + "cs.customer_id as client_id,cs.name as client_name,twl.work_status as work_status"
            adminDetails = await CommonModel.GetMasterListDetails({ select: `${select}${visibilitySelect}`, table: MODULE_TABLE, where, values, join, other });
        } else {
            let select1 = select + " ,cs.customer_id as client_id,cs.name as client_name";
            adminDetails = await CommonModel.GetMasterListDetails({ select: `${select}${visibilitySelect}`, table: MODULE_TABLE, where, values, limit, start, join, other });
        }
        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: adminDetails,
                pagination: {
                    total,
                    page: currentPage,
                    limit,
                    totalPages,
                    start: total === 0 ? 0 : start + 1,
                    end,
                }
            }
        });
    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message
        });
    }
};
// ======================================================
// CREATE / UPDATE / GET SINGLE
// ======================================================
export const getTicketDetails = async (req, res) => {
    try {
        const method = req.method.toUpperCase();
        const { id: ticket_id = null } = req.params;
        const body = await buildTablePayload(MODULE_TABLE, req.body);
        let data = {};

        switch (method) {
            case "PUT": {
                const next_id = await CommonModel.getNextID(MODULE_TABLE, 'ticket_id');
                const active_amc = await resolveTicketActiveAmc(req.body.client_id);
                data = await buildTablePayload(MODULE_TABLE, {
                    ...prepareTicketBody(req.body),
                    active_amc,
                    created_by: req.user.adminID,
                    created_date: toMysqlDateTime(),
                    ticket_no: `TKT-${next_id}`,
                    company_id: req.user.company_id,
                });
                const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data: data });

                if (data.assignee && Number(data.assignee) !== Number(data.created_by)) {
                    emitNotification(data.assignee, {
                        "title": "New Ticket Assigned created",
                        "body": `Ticket #${data.ticket_no} has been assigned to you.`
                    });
                }

                await sendEmailToClient(res, result.insertId, 'Your Call is Registered', 'Your support ticket has been successfully created. Our team will review it shortly.')
                return successResponse(res, {
                    code: 1001,
                    httpStatus: 201,
                    data: {
                        insertId: result.insertId,
                    },
                });
            }

            case "POST": {
                if (!ticket_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }
                const active_amc = req.body.client_id ? await resolveTicketActiveAmc(req.body.client_id) : undefined;
                data = await buildTablePayload(MODULE_TABLE, {
                    ...prepareTicketBody(req.body),
                    active_amc,
                    modified_by: req.user.adminID,
                    modified_date: toMysqlDateTime(),
                });

                const old_details = await CommonModel.getMasterDetails(MODULE_TABLE, "assignee AS old_assignee, ticket_status AS old_ticket_status,due_date as old_due_date", { ticket_id });
                const old_assignee = old_details?.length > 0 ? old_details[0]?.old_assignee : null;
                const old_ticket_status = old_details?.length > 0 ? old_details[0]?.old_ticket_status : null;
                const old_due_date = old_details?.length > 0 ? old_details[0]?.old_due_date : null;
                console.log('data : ', data);

                if (data?.assignee && Number(old_assignee) !== Number(data.assignee)) {
                    const activeWorkLog = await hasActiveWorkLog(ticket_id);
                    if (activeWorkLog) {
                        return failureResponse(res, {
                            code: 2000,
                            httpStatus: 409,
                            message: "Ticket work is already started. End the active work before reassigning.",
                        });
                    }
                }

                await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data, where: { ticket_id }, });

                const modifiedByName = await CommonModel.getSpecificDetails('admin', 'name', { adminID: data.modified_by })
                const assigneeName = await CommonModel.getSpecificDetails('admin', 'name', { adminID: data.assignee });

                // Assignee changed
                if (data?.assignee && Number(old_assignee) !== Number(data.assignee)) {
                    emitNotification(data.assignee, { "title": 'New Ticket Assigned', "body": `Ticket #${data.ticket_no} has been assigned to you by ${modifiedByName?.name || '-'}.` });
                    if (Number(data.assignee) != Number(data.created_by)) {
                        emitNotification(data.created_by, {
                            "title": "New Ticket Assigned",
                            "body": `Ticket #${data.ticket_no} has been assigned to ${assigneeName?.name || '-'}. created by you`
                        });
                    }
                    await sendEmailToClient(res, ticket_id, "Assignee is Updated", "We would like to inform you that the service engineer for your support ticket has been updated.",);
                }

                // Ticket closed
                if (data?.ticket_status && old_ticket_status !== data.ticket_status && data.ticket_status === TICKET_STATUS_CLOSE) {
                    const feedback_token = createFeedbackToken();
                    await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data: { feedback_token }, where: { ticket_id }, });
                    const feedback_url = `${env.appFEUrl}/feedback/${ticket_id}/${feedback_token}`;

                    emitNotification(data.created_by, {
                        "title": "Ticket Closed",
                        "body": `Your ticket #${data.ticket_no} has been closed by ${modifiedByName?.name || ''}`
                    });

                    await sendEmailToClient(
                        res,
                        ticket_id,
                        "Ticket is Closed !",
                        "We would like to inform you that your support ticket has been closed.",
                        feedback_url
                    );
                }

                // Ticket closed
                if (data?.due_date && old_due_date !== data.due_date) {
                    emitNotification(data.created_by, {
                        "title": "Ticket Due Date Updated",
                        "body": `Your ticket #${data.ticket_no} has been change to ${data.due_date}`
                    });
                    await sendEmailToClient(
                        res,
                        ticket_id,
                        `Due Date for your service ticket is changed! `,
                        "We would like to inform you that due date has been changed for your support ticket.",
                    );
                }

                return successResponse(res, {
                    code: 1002,
                    httpStatus: 200,
                    data: [],
                });
            }

            case "GET": {
                if (!ticket_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                const details = await CommonModel.getMasterDetails(MODULE_TABLE, "*", { ticket_id });

                if (!details.length) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                return successResponse(res, {
                    code: 1004,
                    httpStatus: 200,
                    data: { data: details[0] },
                });
            }

            default:
                return failureResponse(res, {
                    code: 2000,
                    httpStatus: 405,
                });
        }
    } catch (error) {
        return failureResponse(res, {
            message: error.message,
            code: 2008,
            httpStatus: 500,
        });
    }
};

// ======================================================
// CHANGE STATUS / DELETE
// ======================================================
export const changeStatus = async (req, res) => {
    try {
        const { action = "", ids = [], status = "Y" } = req.body;
        switch (action.trim().toLowerCase()) {
            case "delete":
                await CommonModel.deleteMasterDetails({ table: MODULE_TABLE, where: { 'ticket_id': ids } });
                return successResponse(res, {
                    code: 1003,
                    httpStatus: 200,
                    data: [],
                });

            case "changestatus":
                await CommonModel.changeMasterStatus(MODULE_TABLE, status, ids);
                return successResponse(res, {
                    code: 1002,
                    httpStatus: 200,
                    data: [],
                });

            default:
                return failureResponse(res, {
                    code: 2000,
                    httpStatus: 400,
                });
        }
    } catch (error) {
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message
        });
    }
};

const sendEmailToClient = async (res, ticket_id, subject = "", message = "", redirect_url = '') => {
    try {
        if (!ticket_id) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket ID is required",
            });
        }

        const filterData = prepareFilterData({ default_columns, custom_columns, });
        const { where, values, join, other } = filterData;
        const select = `
            t.ticket_no,
            t.company_id,
            DATE_FORMAT(t.created_date, '%d %M %Y') AS created_date,
            DATE_FORMAT(t.due_date, '%d %M %Y') AS due_date,
            a.name AS assignedTo,
            cs.name AS clientName,
            cs.email,
            cs.mobile_no,
            cs.wa_no,
            cat.categoryName AS ticket_priority,
            ca.categoryName AS ticket_status,
            ct.categoryName AS query_type
        `;

        where.push("ticket_id = ?");
        values.push(ticket_id);

        const ticketDetails = await CommonModel.GetMasterListDetails({ select, table: "tickets", where, values, join, other, });

        if (!ticketDetails || !Array.isArray(ticketDetails) || !ticketDetails.length) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket details not found",
            });
        }

        const details = ticketDetails[0] || {};
        const ticket_no = details.ticket_no || "-";
        const company_id = details.company_id || null;
        const created_date = details.created_date || "-";
        const due_date = details.due_date || "-";
        const email = details.email || "";
        const ticket_status = details.ticket_status || "-";
        const ticket_priority = details.ticket_priority || "-";
        const query_type = details.query_type || "-";
        const assignedTo = details.assignedTo || "-";
        const clientName = details.clientName || "User";

        if (!email || email.trim() === "") {
            return failureResponse(res, { code: 2004, httpStatus: 404, message: "Client email not found", });
        }

        const template = await renderTemplate("ticketNotification", "email", {
            clientName,
            ticketNo: ticket_no,
            subject: subject || "Ticket Notification",
            createdDate: created_date,
            dueDate: due_date,
            assignedTo,
            message: message || "Your ticket has been updated successfully.",
            category: query_type,
            status: ticket_status,
            priority: ticket_priority,
            appName: env?.appName || "Support System",
            redirectUrl: redirect_url
        });

        const { success, error } = await sendEmail({ to: email, subject: subject || "Ticket Notification", html: template, text: "", company_id, });

        if (!success) {
            return failureResponse(res, {
                code: 2008,
                httpStatus: 500,
                message: error || "Email sending failed",
            });
        }

        return true;
    } catch (error) {
        console.error("sendEmailToClient Error :", error);
        return failureResponse(res, { code: 5001, httpStatus: 500, message: error.message || "Something went wrong", });
    }
};

export const updateStatus = async (req, res) => {
    const { id: ticket_id = null } = req.params;
    if (!ticket_id) {
        return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
        });
    }
    const data = await buildTablePayload(MODULE_TABLE, {
        ticket_status: Number(req.body.ticket_status),
        modified_by: req.user.adminID,
        modified_date: toMysqlDateTime(),
    });

    await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data, where: { ticket_id }, });

    const modifiedByName = await CommonModel.getSpecificDetails('admin', 'name', { adminID: data.modified_by })
    const ticketData = await CommonModel.getSpecificDetails(MODULE_TABLE, '*', { ticket_id: ticket_id })

    if (data?.ticket_status && data.ticket_status === Number(TICKET_STATUS_CLOSE)) {
        const feedback_token = createFeedbackToken();
        await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data: { feedback_token }, where: { ticket_id }, });
        const feedback_url = `${env.appFEUrl}/feedback/${ticket_id}/${feedback_token}`;

        emitNotification(ticketData.created_by, {
            "title": "Ticket Closed",
            "body": `Your ticket #${ticketData.ticket_no} has been closed by ${modifiedByName?.name || ''}`
        });

        await sendEmailToClient(
            res,
            ticket_id,
            "Ticket is Closed !",
            "We would like to inform you that your support ticket has been closed.",
            feedback_url
        );
    }

    return successResponse(res, {
        code: 1002,
        httpStatus: 200,
        data: [],
    });
}

/* =======================================================
   SOCKET EMIT
======================================================= */
const emitNotification = (userId = null, data = {}) => {
    try {
        if (!userId) return;
        const io = getIO();
        io.to(`user_${userId}`).emit("new_notification", data);
    } catch (error) {
        console.log("Socket Error :", error.message);
    }
};
