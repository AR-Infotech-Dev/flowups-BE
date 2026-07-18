import express from "express";
import * as dashboardController from "./dashboard.controller.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";

const dashboardRoutes = express.Router();

dashboardRoutes.post("/", tenantDbMiddleware,dashboardController.overview);

export default dashboardRoutes;
