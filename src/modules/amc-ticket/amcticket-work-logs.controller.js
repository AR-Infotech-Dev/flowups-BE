import * as CommonModel from "#shared/models/common.model.js";
import { DB_PREFIX, query } from "#config/database.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";
import { toMysqlDateTime } from "#shared/utils/dateTime.js";
import { buildTablePayload } from "#shared/utils/tablePayload.js";
import { TICKET_STATUS_INPROGRESS, TICKET_STATUS_OPEN } from "./amcticket.constants.js";
import { notifyTicketUpdates } from "./amcticket.controller.js";

const MODULE_TABLE = "ticket_work_logs";

const toMinutes = (value = 0) => {
    const minutes = Number(value || 0);
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 100) / 100 : 0;
};

const getTicket = async (ticketId = null) => {
    if (!ticketId) return null;
    return await CommonModel.getSpecificDetails(
        "tickets",
        "ticket_id, ticket_no, assignee, company_id, expected_minutes, ticket_status, created_by, modified_by",
        { ticket_id: ticketId }
    );
};

const canAddWorkLog = (ticket = {}, user = {}) => {
    return Number(ticket?.assignee || 0) === Number(user?.adminID || 0);
};

const findActiveWorkLog = async (ticketId = null) => {
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
    return rows?.[0] || null;
};

const calculateSpentMinutes = (startValue = null, endValue = null) => {
    if (!startValue || !endValue) return 0;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const minutes = (end.getTime() - start.getTime()) / 60000;
    return Math.max(0, Math.round(minutes * 100) / 100);
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
                ROUND(
                    CASE
                        WHEN wl.work_start_at IS NOT NULL AND wl.work_end_at IS NOT NULL
                            THEN TIMESTAMPDIFF(SECOND, wl.work_start_at, wl.work_end_at) / 60
                        ELSE COALESCE(wl.spent_minutes, 0)
                    END,
                    2   
                ) AS spent_minutes,
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
            work_start_at: toMysqlDateTime(),//req.body.work_start_at,
            work_status: req.body.work_status || "working",
            created_by: req.user.adminID,
            created_date: toMysqlDateTime(),
            status: "active",
        });

        const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });

        if (parseInt(ticket.ticket_status) == parseInt(TICKET_STATUS_OPEN)) {
            const ticketUpdateData = {
                ticket_status: TICKET_STATUS_INPROGRESS,
                modified_by: req.user.adminID
            };
            await CommonModel.updateMasterDetails({
                table: 'tickets',
                data: ticketUpdateData,
                where: { ticket_id: ticketId },
            });

            await notifyTicketUpdates(ticketId, ticketUpdateData, ticket);

        }
        return successResponse(res, {
            code: 1001,
            httpStatus: 201,
            data: {
                insertId: result.insertId,
            },
        });
    } catch (error) {
        console.error(error);

        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

export const update = async (req, res) => {
    try {
        const currentDateTime = toMysqlDateTime();
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
        // if (!spentMinutes) {
        //     return failureResponse(res, {
        //         code: 2000,
        //         httpStatus: 400,
        //         message: "Work should be taken more than 1 minute",
        //     });
        // }

        const data = await buildTablePayload(MODULE_TABLE, {
            work_end_at: toMysqlDateTime(), //req.body.work_end_at,
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
