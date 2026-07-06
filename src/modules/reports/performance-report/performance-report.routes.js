import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as PerformanceReportController from "./performance-report.controller.js";

const performanceReportRoutes = express.Router();

performanceReportRoutes.post( "/", requirePermission(["reports/performance"], "view"), PerformanceReportController.list );
performanceReportRoutes.post( "/export-excel", requirePermission(["reports/performance"], "view"), PerformanceReportController.exportExcel );

export default performanceReportRoutes;
