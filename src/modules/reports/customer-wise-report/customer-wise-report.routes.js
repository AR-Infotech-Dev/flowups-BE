import express from "express";
import * as CustomerWiseReportController from "./customer-wise-report.controller.js";

const customerWiseReportRoutes = express.Router();
const permissions = ["customers", "/customers", "reports", "/reports/company-customer-tickets"];

customerWiseReportRoutes.post("/", CustomerWiseReportController.list);
customerWiseReportRoutes.post("/export-excel", CustomerWiseReportController.exportExcel);

export default customerWiseReportRoutes;
