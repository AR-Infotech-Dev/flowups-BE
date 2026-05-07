import express from "express";
import { getModulesAccess, saveModulesAccess } from "../controllers/moduleAccess.controller.js";

const moduleAccessrouter = express.Router();
moduleAccessrouter.post("/save/:id", saveModulesAccess);
moduleAccessrouter.get("/:id", getModulesAccess);
export default moduleAccessrouter;
