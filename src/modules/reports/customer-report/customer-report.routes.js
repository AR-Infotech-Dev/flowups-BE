import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as CustomerReportController from "./customer-report.controller.js";

const customerReportRoutes = express.Router();
const permissions = ["customers", "/customers", "reports", "/reports/customer"];

customerReportRoutes.post("/", requirePermission(permissions, "view"), CustomerReportController.list);
customerReportRoutes.post("/export-excel", requirePermission(permissions, "view"), CustomerReportController.exportExcel);
customerReportRoutes.post("/send", requirePermission(permissions, "view"), CustomerReportController.sendReport);

export default customerReportRoutes;
