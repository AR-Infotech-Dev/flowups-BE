import express from "express";
import * as amcticketController from "./amcticket.controller.js";
import * as amcticketHistoryController from "./amcticket-history.controller.js";
import * as amcticketWorkLogsController from "./amcticket-work-logs.controller.js";
import * as amcticketVisitsController from "./amcticket-visits.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
const ticketRoutes = express.Router();

ticketRoutes.post("/", requirePermission("tickets", "view"), tenantDbMiddleware, amcticketController.list);
ticketRoutes.post("/history", requirePermission("tickets", "view"), tenantDbMiddleware, amcticketHistoryController.history);
ticketRoutes.post("/work-logs", requirePermission("tickets", "view"), tenantDbMiddleware, amcticketWorkLogsController.list);
ticketRoutes.put("/work-logs/create", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketWorkLogsController.create);
ticketRoutes.post("/work-logs/update", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketWorkLogsController.update);
ticketRoutes.post("/visits", requirePermission("tickets", "view"), tenantDbMiddleware, amcticketVisitsController.list);
ticketRoutes.put("/visits/create", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketVisitsController.create);
ticketRoutes.post("/visits/visited", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketVisitsController.markVisited);
ticketRoutes.post("/delete", requirePermission("tickets", "delete"), tenantDbMiddleware, amcticketController.changeStatus);

ticketRoutes.put("/create", requirePermission("tickets", "create"), tenantDbMiddleware, amcticketController.getTicketDetails);
ticketRoutes.post("/update-status/:id", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketController.updateStatus);
ticketRoutes.get("/:id", requirePermission("tickets", "view"), tenantDbMiddleware, amcticketController.getTicketDetails);
ticketRoutes.post("/:id", requirePermission("tickets", "edit"), tenantDbMiddleware, amcticketController.getTicketDetails);

export default ticketRoutes;
