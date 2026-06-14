import express from "express";
import * as amcReminderController from "./amc-reminder.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";

const amcReminderRoutes = express.Router();

amcReminderRoutes.post("/", requirePermission(["amc-reminders", "amc reminders", "customers"], "view"), amcReminderController.list);
amcReminderRoutes.post("/activity", requirePermission(["amc-reminders", "amc reminders", "customers"], "view"), amcReminderController.activity);
amcReminderRoutes.post("/send", requirePermission(["amc-reminders", "amc reminders", "customers"], "edit"), amcReminderController.sendReminder);
amcReminderRoutes.post("/call", requirePermission("tickets", "create"), amcReminderController.createAmcCall);
amcReminderRoutes.post("/visit", requirePermission("tickets", "create"), amcReminderController.createAmcVisit);

export default amcReminderRoutes;
