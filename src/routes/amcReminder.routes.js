import express from "express";
import * as amcReminderController from "../controllers/amcReminder.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const amcReminderRoutes = express.Router();

amcReminderRoutes.post("/", requirePermission(["amc-reminders", "amc reminders", "customers"], "view"), amcReminderController.list);
amcReminderRoutes.post("/send", requirePermission(["amc-reminders", "amc reminders", "customers"], "edit"), amcReminderController.sendReminder);

export default amcReminderRoutes;
