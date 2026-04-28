import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";

const MODULE_TABLE = "notifications";

/* ======================================================
   GET NOTIFICATIONS
====================================================== */
export const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.body;
        const user_id = req.user.adminID;

        const start = (Number(page) - 1) * Number(limit);

        const where = ["user_id = ?"];
        const values = [user_id];

        const total = await CommonModel.getCountsByParameter({
            table: MODULE_TABLE,
            where,
            values,
        });

        const notificationDetails =
            await CommonModel.GetMasterListDetails({
                select: `
                    t.notification_id,
                    t.title,
                    t.message,
                    t.notification_type,
                    t.module_name,
                    t.reference_id,
                    t.is_read,
                    t.created_date
                `,
                table: MODULE_TABLE,
                where,
                values,
                limit: Number(limit),
                start,
                other: {
                    orderBy: "t.notification_id",
                    order: "DESC",
                },
            });

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: notificationDetails,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / limit),
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

/* ======================================================
   UNREAD COUNT
====================================================== */
export const getUnreadCount = async (req, res) => {
    try {
        const user_id = req.user.adminID;
        const unread = await CommonModel.getCountsByParameter({
            table: MODULE_TABLE,
            where: [
                "user_id = ?",
                "is_read = ?",
            ],
            values: [
                user_id,
                'n',
            ],
        });

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                total: unread,
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

/* ======================================================
   MARK AS READ
====================================================== */
export const markAsRead = async (req, res) => {
    try {
        const notification_id = req.params.id;
        const user_id = req.user.adminID;
        
        if (!notification_id) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
            });
        }

        const result =
            await CommonModel.updateMasterDetails({
                table: MODULE_TABLE,
                data: {
                    is_read: 'y',
                    read_date: new Date(),
                },
                where: {
                    notification_id,
                    user_id,
                },
            });

        if (!result.affectedRows) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
            });
        }

        return successResponse(res, {
            code: 1002,
            httpStatus: 200,
            data: [],
        });
    } catch (error) {
        console.log(error);
        
        return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error.message,
        });
    }
};

/* ======================================================
   MARK ALL AS READ
====================================================== */
export const markAllAsRead = async (req, res) => {
    try {
        const user_id = req.user.adminID;

        await CommonModel.updateMasterDetails({
            table: MODULE_TABLE,
            data: {
                is_read: 1,
                read_date: new Date(),
            },
            where: {
                user_id,
                is_read: 0,
            },
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