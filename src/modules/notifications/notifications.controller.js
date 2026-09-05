import * as NotificationsService from "./notifications.service.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";

/* ======================================================
   GET NOTIFICATIONS
====================================================== */
export const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.body;
        const result = await NotificationsService.getNotifications({
            userId: req.user.adminID,
            page,
            limit,
        });

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: result.data,
                pagination: result.pagination,
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
        const unread = await NotificationsService.getUnreadCount(req.user.adminID);

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
        const result = await NotificationsService.markAsRead({
            notificationId: req.params.id,
            userId: req.user.adminID,
        });

        if (!result.updated) {
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
        console.error(error);
        
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
        await NotificationsService.markAllAsRead(req.user.adminID);

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
