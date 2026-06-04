import express from "express";
import * as reportsController from "../controllers/reports.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const reportsRoutes = express.Router();

reportsRoutes.post("/user-performance", requirePermission(["reports", "/reports/performance", "performance_reports"], "view"),  reportsController.userPerformance);
reportsRoutes.post("/customer", requirePermission(["customers", "/customers", "reports", "/reports/customer"], "view"),  reportsController.customerReport );
reportsRoutes.post("/sendReport", requirePermission(["customers", "/customers", "reports", "/reports/customer"], "view"),  reportsController.sendReport );

export default reportsRoutes;
