import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as WorkReportController from "./work-report.controller.js";

const workReportRoutes = express.Router();

workReportRoutes.post("/", requirePermission(["/work-report"], "view"), WorkReportController.list);

export default workReportRoutes;
