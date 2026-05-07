import express from "express";
import * as companyController from "../controllers/company.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const companyRoutes = express.Router();

companyRoutes.post("/", requirePermission(['company-master', 'companies'], "view"), companyController.list);
companyRoutes.post("/delete", requirePermission(['company-master', 'companies'], "delete"), companyController.changeStatus);
companyRoutes.put("/create", requirePermission(['company-master', 'companies'], "create"), companyController.getCompanyDetails);
companyRoutes.get("/:id", requirePermission(['company-master', 'companies'], "view"), companyController.getCompanyDetails);
companyRoutes.post("/:id", requirePermission(['company-master', 'companies'], "edit"), companyController.getCompanyDetails);

export default companyRoutes;
