import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as CustomerWiseReportController from "./customer-wise-report.controller.js";

const customerWiseReportRoutes = express.Router();
const permissions = ["customers", "/customers", "reports", "/reports/company-customer-tickets"];

customerWiseReportRoutes.post( "/", requirePermission(permissions, "view"), CustomerWiseReportController.list );
customerWiseReportRoutes.post( "/export-excel", requirePermission(permissions, "view"), CustomerWiseReportController.exportExcel );

export default customerWiseReportRoutes;
