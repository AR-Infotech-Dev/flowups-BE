/* ==========================================
   notification.model.js
========================================== */

import db from "#config/database.js";

const NotificationModel = {

    getNotifications: async (user_id) => {
        const [rows] = await db.query(`
            SELECT
                notification_id,
                title,
                message,
                notification_type,
                is_read,
                created_date
            FROM ab_notifications
            WHERE user_id = ?
            ORDER BY notification_id DESC
            LIMIT 20
        `, [user_id]);

        return rows;
    },

    getUnreadCount: async (user_id) => {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS total
            FROM ab_notifications
            WHERE user_id = ?
            AND is_read = 0
        `, [user_id]);

        return rows[0].total;
    },

    markAsRead: async (
        notification_id,
        user_id
    ) => {
        await db.query(`
            UPDATE ab_notifications
            SET
                is_read = 1,
                read_date = NOW()
            WHERE notification_id = ?
            AND user_id = ?
        `, [notification_id, user_id]);
    },

    markAllAsRead: async (user_id) => {
        await db.query(`
            UPDATE ab_notifications
            SET
                is_read = 1,
                read_date = NOW()
            WHERE user_id = ?
            AND is_read = 0
        `, [user_id]);
    }

};

export default NotificationModel;
