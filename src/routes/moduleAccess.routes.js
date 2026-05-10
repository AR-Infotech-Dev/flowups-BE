import express from "express";
import { getModulesAccess, saveModulesAccess } from "../controllers/moduleAccess.controller.js";
import { requirePermission } from "../middlewares/permissions.middleware.js";

const moduleAccessrouter = express.Router();
moduleAccessrouter.post("/save/:id", requirePermission(['module-access', 'permissions'], "edit"), saveModulesAccess);
moduleAccessrouter.get("/:id", getModulesAccess);
export default moduleAccessrouter;
