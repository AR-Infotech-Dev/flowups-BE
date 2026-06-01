import express from "express";
import * as customerController from "../controllers/customer.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const customerRoutes = express.Router();

customerRoutes.post("/", requirePermission('customers', 'view'), customerController.list);
customerRoutes.post("/delete", requirePermission('customers', 'delete'), customerController.changeStatus);
customerRoutes.put("/create", requirePermission('customers', 'create'), customerController.getCustomerDetails);
customerRoutes.get("/:id", requirePermission('customers', 'view'), customerController.getCustomerDetails);
customerRoutes.post("/:id", requirePermission('customers', 'edit'), customerController.getCustomerDetails);

export default customerRoutes;
