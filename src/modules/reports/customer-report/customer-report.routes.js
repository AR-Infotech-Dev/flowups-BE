import express from "express";
import * as CustomerReportController from "./customer-report.controller.js";

const customerReportRoutes = express.Router();
const permissions = ["customers", "/customers", "reports", "/reports/customer"];

customerReportRoutes.post("/", CustomerReportController.list);
customerReportRoutes.post("/export-excel", CustomerReportController.exportExcel);
customerReportRoutes.post("/send", CustomerReportController.sendReport);

export default customerReportRoutes;
