import express from "express";
import * as customerController from "../controllers/customer.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const customerRoutes = express.Router();

customerRoutes.post("/", requirePermission(['customer', 'customers'], "view"), customerController.list);
customerRoutes.post("/delete", requirePermission(['customer', 'customers'], "delete"), customerController.changeStatus);
customerRoutes.put("/create", requirePermission(['customer', 'customers'], "create"), customerController.getCustomerDetails);
customerRoutes.get("/:id", requirePermission(['customer', 'customers'], "view"), customerController.getCustomerDetails);
customerRoutes.post("/:id", requirePermission(['customer', 'customers'], "edit"), customerController.getCustomerDetails);

export default customerRoutes;
