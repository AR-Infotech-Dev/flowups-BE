/* ==========================================
   notification.routes.js
========================================== */
import express from "express";
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
} from "./notifications.controller.js";

const router = express.Router();

router.post("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.get("/read/:id", markAsRead);
router.post("/read-all", markAllAsRead);

export default router;
