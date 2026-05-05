import express from "express";
import * as companyController from "../controllers/company.controller.js";

const companyRoutes = express.Router();

companyRoutes.post("/", companyController.list);
companyRoutes.post("/delete", companyController.changeStatus);
companyRoutes.put("/create", companyController.getCompanyDetails);
companyRoutes.get("/:id", companyController.getCompanyDetails);
companyRoutes.post("/:id", companyController.getCompanyDetails);

export default companyRoutes;
