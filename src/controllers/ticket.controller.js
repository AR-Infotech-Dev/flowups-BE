import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { validate } from "../utils/request.validator.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import { sendEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { createFeedbackToken } from "./feedback.controller.js";
import { getIO } from "../socket/index.js";
import { title } from "process";

const MODULE_TABLE = "tickets"
const TICKET_STATUS_CLOSE = '208'
const TICKET_STATUS_OPEN = '205'

// ======================================================
// LIST USERS
// ======================================================
const default_columns = {
    ticket_priority: { table: "categories", alias: "cat", column: "categoryName", key2: "category_id", select: "cat.cat_color AS priority_color" },
    ticket_status: { table: "categories", alias: "ca", column: "categoryName", key2: "category_id", select: "ca.cat_color AS status_color" },
    query_type: { table: "categories", alias: "ct", column: "categoryName", key2: "category_id", select: "ct.cat_color AS type_color" },
    assignee: { table: "admin", alias: "a", column: "name", key2: "adminID", select: "" },
    client_id: { table: "customer", alias: "cs", column: "name", key2: "customer_id", select: "" },
};

const custom_columns = {
    company_id: { table: "company_master", alias: "dc", column: "company_name", key2: "company_id", select: "" },
    modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "" },
    created_by: { table: "admin", alias: "ad", column: "name", key2: "adminID", select: "" }
};

export const list = async (req, res) => {
    try {
        const { viewAll , client_id = null, page = 1, searchText = '', getAll = "N", orderBy = "created_date", order = "ASC", filters } = req.body;
        const limit = 10;
        const currentPage = Number(page) || 1;
        const start = (currentPage - 1) * limit;
        const freeTextSearch = searchText || '';
        const other1 = { orderBy: 'ticket_id', order: 'DESC', searchColumns: ['t.ticket_no', 'cat.categoryName', 'ca.categoryName', 'ct.categoryName', 'a.name', 'cs.name', 'ad.name', 'am.name'] };
        const filterData = prepareFilterData({ filters, searchText, other: other1, default_columns, custom_columns })
        const { select, where, values, join, other } = filterData;

        if (client_id) {
            where.push(`client_id = ${client_id}`);
        }

        if (req.user.company_id) {
            where.push(`t.company_id = ${req.user.company_id}`);
        }

        if (viewAll === "N" && req.user.adminID) {
            where.push(`t.assignee = ${req.user.adminID}`);
        }
        
        console.log('where : ',where);
        
        const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });
        const totalPages = Math.ceil(total / limit);

        let end = start + limit;
        if (end > total) end = total;

        let adminDetails = [];
        if (getAll === "Y") {
            let select1 = select + " , t.user_id as user_id, u.name as user_name,cs.customer_id as client_id,cs.name as client_name"
            adminDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other });
        } else {
            let select1 = select + " , t.user_id as user_id, u.name as user_name,cs.customer_id as client_id,cs.name as client_name,";
            adminDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other });
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
                data = await buildTablePayload(MODULE_TABLE, {
                    ...req.body,
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
                data = await buildTablePayload(MODULE_TABLE, {
                    ...req.body,
                    modified_by: req.user.adminID,
                    modified_date: toMysqlDateTime(),
                });

                const old_details = await CommonModel.getMasterDetails(MODULE_TABLE, "assignee AS old_assignee, ticket_status AS old_ticket_status,due_date as old_due_date", { ticket_id });
                const old_assignee = old_details?.length > 0 ? old_details[0]?.old_assignee : null;
                const old_ticket_status = old_details?.length > 0 ? old_details[0]?.old_ticket_status : null;
                const old_due_date = old_details?.length > 0 ? old_details[0]?.old_due_date : null;

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

        const template = ticketNotificationTemplate({
            clientName,
            ticketNo: ticket_no,
            subject: subject || "Ticket Notification",
            createdDate: created_date,
            due_date: due_date,
            assignedTo,
            message: message || "Your ticket has been updated successfully.",
            category: query_type,
            status: ticket_status,
            priority: ticket_priority,
            appName: env?.appName || "Support System",
            redirect_url: redirect_url
        });

        const { success, error } = await sendEmail({ to: email, subject: subject || "Ticket Notification", html: template, text: "", });

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

export const ticketNotificationTemplate = ({
    clientName = "User",
    ticketNo = "-",
    subject = "-",
    priority = "-",
    status = "-",
    createdDate = "-",
    due_date = "-",
    category = "-",
    assignedTo = "-",
    message = "-",
    appName = "Support System",
    redirect_url = '',
    logoUrl = `${env.baseUrl}/images/logo.png`,
    logoWidth = "140",    // Width in px
    logoHeight = "auto",  // Height auto
}) => {
    return `
    <div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
            <tr>
                <td align="center">
                    <table cellpadding="0" cellspacing="0"
                        style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e5e5;max-width:700px;width:100%;">
                        <tr>
                            <td style="background:#0d6efd;padding:22px;text-align:center;color:#ffffff;">
                            ${logoUrl ? ` <img
                                        src="${logoUrl}"
                                        alt="${appName}"
                                        width="${logoWidth}"
                                        style="max-width:${logoWidth}px;height:${logoHeight};display:block;margin:0 auto 12px auto;"
                                    />`
            : ""
        }
                                <h2 style="margin:0;">${appName}</h2>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px;color:#333;">
                                <p>Hello <strong>${clientName}</strong>,</p>
                                <p>${message}</p>
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="border-collapse:collapse;margin-top:15px;">
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Ticket No</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${ticketNo}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Subject</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${subject}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Query Type</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${category}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Status</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${status}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Assigned To</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${assignedTo}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Created Date</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${createdDate}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:10px;border:1px solid #ddd;background:#f8f9fa;">
                                            <strong>Due Date</strong>
                                        </td>
                                        <td style="padding:10px;border:1px solid #ddd;">
                                            ${due_date}
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin-top:25px;">
                                    Thank you for contacting us.
                                </p>
                                ${redirect_url && redirect_url.trim() !== ""
            ? `<p style="margin-top:25px;text-align:left;">
                                        <a href="${redirect_url}" style="background:#0d6efd; color:#ffffff; text-decoration:none; padding:6px 18px; border-radius:6px; display:inline-block; font-weight:bold;"> Submit Feedback  </a>
                                    </p>`
            : ``
        }
                                <p>
                                    Regards,<br />
                                    <strong>Support Team</strong><br />
                                    ${appName}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="background:#f8f9fa;padding:15px;text-align:center;font-size:12px;color:#666;">
                                This is an automated email. Please do not reply.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
    `;
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