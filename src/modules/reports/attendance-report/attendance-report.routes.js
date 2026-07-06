import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as AttendanceReportController from "./attendance-report.controller.js";

const attendanceReportRoutes = express.Router();

attendanceReportRoutes.post( "/", requirePermission(["users", "/users", "/user-markers", "reports", "/reports/user-attendance"], "view"), AttendanceReportController.list );
attendanceReportRoutes.post( "/export-excel", requirePermission(["users", "/users", "/user-markers", "reports", "/reports/user-attendance"], "view"), AttendanceReportController.exportExcel );

export default attendanceReportRoutes;
