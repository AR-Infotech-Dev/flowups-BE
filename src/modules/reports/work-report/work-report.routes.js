import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as WorkReportController from "./work-report.controller.js";

const workReportRoutes = express.Router();

workReportRoutes.post("/", WorkReportController.list);

export default workReportRoutes;
