import express from "express";
import * as PerformanceReportController from "./performance-report.controller.js";

const performanceReportRoutes = express.Router();

performanceReportRoutes.post("/", PerformanceReportController.list);
performanceReportRoutes.post("/export-excel", PerformanceReportController.exportExcel);

export default performanceReportRoutes;
