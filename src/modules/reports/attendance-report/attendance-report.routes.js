import express from "express";
import * as AttendanceReportController from "./attendance-report.controller.js";

const attendanceReportRoutes = express.Router();

attendanceReportRoutes.post("/", AttendanceReportController.list);
attendanceReportRoutes.post("/export-excel", AttendanceReportController.exportExcel);

export default attendanceReportRoutes;
