import express from "express";
import * as reportsController from "./reports.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import productExpiryReportRoutes from "./product-expiry-report/product-expiry-report.routes.js";

const reportsRoutes = express.Router();

reportsRoutes.post("/user-performance", requirePermission(["reports/performance"], "view"),  reportsController.userPerformance);
reportsRoutes.post("/user-performance/export-excel", requirePermission(["reports/performance"], "view"),  reportsController.exportUserPerformanceExcel);
reportsRoutes.post("/work-report", requirePermission(["/work-report"], "view"),  reportsController.workReport);
reportsRoutes.post("/customer", requirePermission(["customers", "/customers", "reports", "/reports/customer"], "view"),  reportsController.customerReport );
reportsRoutes.post("/customer/export-excel", requirePermission(["customers", "/customers", "reports", "/reports/customer"], "view"),  reportsController.exportCustomerReportExcel );
reportsRoutes.post("/sendReport", requirePermission(["customers", "/customers", "reports", "/reports/customer"], "view"),  reportsController.sendReport );
reportsRoutes.use("/product-expiry", productExpiryReportRoutes);

export default reportsRoutes;
