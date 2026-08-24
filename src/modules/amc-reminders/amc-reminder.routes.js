import express from "express";
import * as amcReminderController from "./amc-reminder.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
const amcReminderRoutes = express.Router();

amcReminderRoutes.post("/", requirePermission(["amc-reminders", "amc reminders", "customers"], "view"), tenantDbMiddleware, amcReminderController.list);
amcReminderRoutes.post("/activity", requirePermission(["amc-reminders", "amc reminders", "customers"], "view"), tenantDbMiddleware, amcReminderController.activity);
amcReminderRoutes.post("/send", requirePermission(["amc-reminders", "amc reminders", "customers"], "edit"), tenantDbMiddleware, amcReminderController.sendReminder);
amcReminderRoutes.post("/call", requirePermission("tickets", "create"), tenantDbMiddleware, amcReminderController.createAmcCall);
amcReminderRoutes.post("/visit", requirePermission("tickets", "create"), tenantDbMiddleware, amcReminderController.createAmcVisit);

export default amcReminderRoutes;
