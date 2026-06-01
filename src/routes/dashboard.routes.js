import express from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";

const dashboardRoutes = express.Router();

dashboardRoutes.get("/", dashboardController.overview);

export default dashboardRoutes;
