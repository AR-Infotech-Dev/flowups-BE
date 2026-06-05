import * as CommonModel from "../models/common.model.js";
import { DB_PREFIX, query } from "../config/database.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";

const MODULE_TABLE = "ticket_work_logs";

const toMinutes = (value = 0) => {
    const minutes = Number(value || 0);
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
};

const getTicket = async (ticketId = null) => {
    if (!ticketId) return null;
    return await CommonModel.getSpecificDetails(
        "tickets",
        "ticket_id, assignee, company_id, expected_minutes",
        { ticket_id: ticketId }
    );
};

const canAddWorkLog = (ticket = {}, user = {}) => {
    return Number(ticket?.assignee || 0) === Number(user?.adminID || 0);
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
                wl.*,
                a.name AS employee_name,
                DATE_FORMAT(wl.work_start_at, '%Y-%m-%d') AS work_date,
                DATE_FORMAT(wl.work_start_at, '%h:%i %p') AS work_time
            FROM ${DB_PREFIX}${MODULE_TABLE} wl
            LEFT JOIN ${DB_PREFIX}admin a ON wl.employee_id = a.adminID
            WHERE wl.ticket_id = ? AND wl.status = 'active'
            ORDER BY wl.work_start_at DESC, wl.work_log_id DESC
            `,
            [ticketId]
        );

        const ticket = await getTicket(ticketId);
        const loggedMinutes = rows.reduce((total, row) => total + toMinutes(row.spent_minutes), 0);

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: rows,
                summary: {
                    expected_minutes: toMinutes(ticket?.expected_minutes),
                    logged_minutes: loggedMinutes,
                    remaining_minutes: Math.max(toMinutes(ticket?.expected_minutes) - loggedMinutes, 0),
                    overtime_minutes: Math.max(loggedMinutes - toMinutes(ticket?.expected_minutes), 0),
                    can_add_log: canAddWorkLog(ticket, req.user) ? "Y" : "N",
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

        if (!canAddWorkLog(ticket, req.user)) {
            return failureResponse(res, {
                code: 2003,
                httpStatus: 403,
                message: "Only current assignee can add work log",
            });
        }

        const spentMinutes = toMinutes(req.body.spent_minutes);
        const workDetails = String(req.body.work_details || "").trim();

        if (!req.body.work_start_at || !spentMinutes || !workDetails) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "work_start_at, spent_minutes and work_details are required",
            });
        }

        const data = await buildTablePayload(MODULE_TABLE, {
            ticket_id: ticketId,
            employee_id: req.user.adminID,
            company_id: ticket.company_id || req.user.company_id,
            work_start_at: req.body.work_start_at,
            spent_minutes: spentMinutes,
            work_details: workDetails,
            work_status: req.body.work_status || null,
            created_by: req.user.adminID,
            created_date: toMysqlDateTime(),
            status: "active",
        });

        const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });

        return successResponse(res, {
            code: 1001,
            httpStatus: 201,
            data: {
                insertId: result.insertId,
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
