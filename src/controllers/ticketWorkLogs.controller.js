import * as CommonModel from "../models/common.model.js";
import { DB_PREFIX, query } from "../config/database.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";

const MODULE_TABLE = "ticket_work_logs";

const currentDateTime = toMysqlDateTime();

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

const findActiveWorkLog = async (ticketId = null) => {
    console.log('adasdada');
    
    if (!ticketId) return null;
    
    const rows = await query(
        `
        SELECT *
        FROM ${DB_PREFIX}${MODULE_TABLE}
        WHERE ticket_id = ?
          AND status = 'active'
          AND work_start_at IS NOT NULL
          AND (work_end_at IS NULL)
          AND COALESCE(work_status, 'working') NOT IN ('completed', 'complete', 'ended', 'closed', 'done')
        ORDER BY work_start_at DESC, work_log_id DESC
        LIMIT 1
        `,
        [ticketId]
    );
    console.log('rows?.[0] L : ',rows?.[0]);
    
    return rows?.[0] || null;
};

const calculateSpentMinutes = (startValue = null, endValue = null) => {
    if (!startValue || !endValue) return 0;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
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
        const activeWorkLog = rows.find((row) => row.work_start_at && !row.work_end_at && !["completed", "complete", "ended", "closed", "done"].includes(String(row.work_status || "").toLowerCase())) || null;

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
                    active_work_log: activeWorkLog,
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
        //TICKET REQUIRED
        if (!ticket) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket not found",
            });
        }
        // ONLY ASSIGNEE IS ALLOWED
        if (!canAddWorkLog(ticket, req.user)) {
            return failureResponse(res, {
                code: 2003,
                httpStatus: 403,
                message: "Only current assignee can add work log",
            });
        }
        const activeWorkLog = await findActiveWorkLog(ticketId);
        if (activeWorkLog) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 409,
                message: "Work already started for this ticket",
            });
        }

        const data = await buildTablePayload(MODULE_TABLE, {
            ticket_id: ticketId,
            employee_id: req.user.adminID,
            company_id: ticket.company_id || req.user.company_id,
            work_start_at: toMysqlDateTime() ,//req.body.work_start_at,
            work_status: req.body.work_status || "working",
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

export const update = async (req, res) => {
    try {
        const ticketId = req.body.ticket_id;
        const workLogId = req.body.work_log_id;
        const ticket = await getTicket(ticketId);
        // TICKET NOT FOUND
        if (!ticket) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Ticket not found",
            });
        }
        // ALLOWED ONLY ASSIGNEE
        if (!canAddWorkLog(ticket, req.user)) {
            return failureResponse(res, {
                code: 2003,
                httpStatus: 403,
                message: "Only current assignee can end work log",
            });
        }

        if (!workLogId || !String(req.body.work_details || "").trim()) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "work_log_id and work_details are required",
            });
        }

        const rows = await CommonModel.getMasterDetails(MODULE_TABLE, "*", {
            work_log_id: workLogId,
            ticket_id: ticketId,
            status: "active",
        });
        const workLog = rows?.[0] || null;

        if (!workLog) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
                message: "Work log not found",
            });
        }

        if (workLog.work_end_at) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 409,
                message: "Work log already ended",
            });
        }

        const spentMinutes = calculateSpentMinutes(workLog.work_start_at, currentDateTime);
        console.log('spentMinutes : ',spentMinutes);
        
        if (!spentMinutes) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "work_end_at must be after work_start_at",
            });
        }

        const data = await buildTablePayload(MODULE_TABLE, {
            work_end_at: toMysqlDateTime() , //req.body.work_end_at,
            spent_minutes: spentMinutes,
            work_details: String(req.body.work_details || "").trim(),
            work_status: req.body.work_status || "completed",
            modified_by: req.user.adminID,
            modified_date: toMysqlDateTime(),
        });

        await CommonModel.updateMasterDetails({
            table: MODULE_TABLE,
            data,
            where: { work_log_id: workLogId, ticket_id: ticketId },
        });

        return successResponse(res, {
            code: 1002,
            httpStatus: 200,
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

export const hasActiveWorkLog = async (ticketId = null) => {
    return await findActiveWorkLog(ticketId);
};
