

import express from "express";
import * as UserWiseAttendanceReportController from "./user-wise-attendance-report.controller.js";

const userWiseAttendanceReportRoutes = express.Router();

const permissions = [ "reports", "/reports/user-wise-attendance", ];
userWiseAttendanceReportRoutes.post( "/", UserWiseAttendanceReportController.list );
userWiseAttendanceReportRoutes.post( "/export-excel", UserWiseAttendanceReportController.exportExcel );
export default userWiseAttendanceReportRoutes;