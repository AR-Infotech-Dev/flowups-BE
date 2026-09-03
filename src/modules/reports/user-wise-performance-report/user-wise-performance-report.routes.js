import express from "express";

import * as UserWisePerformanceReportController
  from "./user-wise-performance-report.controller.js";

const userWisePerformanceReportRoutes = express.Router();

const permissions = [ "users", "/users", "reports", "/reports/user-performance", ];

userWisePerformanceReportRoutes.post( "/", UserWisePerformanceReportController.list );
userWisePerformanceReportRoutes.post( "/export-excel", UserWisePerformanceReportController.exportExcel );
userWisePerformanceReportRoutes.post( "/company-user-ticket-report", UserWisePerformanceReportController.companyUserTicketReport );

export default userWisePerformanceReportRoutes;