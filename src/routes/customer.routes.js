import express from "express";
import * as customerController from "../controllers/customer.controller.js";

const customerRoutes = express.Router();

customerRoutes.post("/", customerController.list);
customerRoutes.post("/delete", customerController.changeStatus);
customerRoutes.put("/create", customerController.getCustomerDetails);
customerRoutes.get("/:id", customerController.getCustomerDetails);
customerRoutes.post("/:id", customerController.getCustomerDetails);

export default customerRoutes;
