import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import attendanceReportRoutes from "./attendance-report/attendance-report.routes.js";
import * as CustomerReportController from "./customer-report/customer-report.controller.js";
import customerReportRoutes from "./customer-report/customer-report.routes.js";
import * as CustomerWiseReportController from "./customer-wise-report/customer-wise-report.controller.js";
import customerWiseReportRoutes from "./customer-wise-report/customer-wise-report.routes.js";
import performanceReportRoutes from "./performance-report/performance-report.routes.js";
import productExpiryReportRoutes from "./product-expiry-report/product-expiry-report.routes.js";
import workReportRoutes from "./work-report/work-report.routes.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
import userWiseAttendanceReportRoutes from "./user-wise-attendance-report/user-wise-attendance-report.routes.js";
import userWisePerformanceReportRoutes from "./user-wise-performance-report/user-wise-performance-report.routes.js";

const reportsRoutes = express.Router();

// USERS
reportsRoutes.use("/user-performance", tenantDbMiddleware, performanceReportRoutes);
reportsRoutes.use("/user-performances", tenantDbMiddleware, userWisePerformanceReportRoutes);
reportsRoutes.use("/work-report", tenantDbMiddleware, workReportRoutes);
reportsRoutes.use("/attendance", tenantDbMiddleware, attendanceReportRoutes);

// CUSTOMER
// customer report
reportsRoutes.use("/customer", tenantDbMiddleware, customerReportRoutes);
// customer report send
reportsRoutes.post("/sendReport", requirePermission(["customers", "/reports/customer"], "view"), tenantDbMiddleware, CustomerReportController.sendReport);

// customer-wise-ticket-report
reportsRoutes.use("/customer-wise", tenantDbMiddleware, customerWiseReportRoutes);
// customer-wise-ticket-report excel export
reportsRoutes.post("/customer-wise-report-excel", requirePermission(["customers", "/reports/customer"], "view"), tenantDbMiddleware, CustomerWiseReportController.exportExcel);

// PRODUCTS
reportsRoutes.use("/product-expiry", tenantDbMiddleware, productExpiryReportRoutes);

reportsRoutes.use("/user-wise-attendance", tenantDbMiddleware, userWiseAttendanceReportRoutes);

export default reportsRoutes;
