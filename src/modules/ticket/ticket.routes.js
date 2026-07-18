import express from "express";
import * as ticketController from "./ticket.controller.js";
import * as ticketHistoryController from "./ticket-history.controller.js";
import * as ticketWorkLogsController from "./ticket-work-logs.controller.js";
import * as ticketVisitsController from "./ticket-visits.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
const ticketRoutes = express.Router();

ticketRoutes.post("/", requirePermission("tickets", "view"), tenantDbMiddleware, ticketController.list);
ticketRoutes.post("/history", requirePermission("tickets", "view"), tenantDbMiddleware, ticketHistoryController.history);
ticketRoutes.post("/work-logs", requirePermission("tickets", "view"), tenantDbMiddleware, ticketWorkLogsController.list);
ticketRoutes.put("/work-logs/create", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketWorkLogsController.create);
ticketRoutes.post("/work-logs/update", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketWorkLogsController.update);
ticketRoutes.post("/visits", requirePermission("tickets", "view"), tenantDbMiddleware, ticketVisitsController.list);
ticketRoutes.put("/visits/create", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketVisitsController.create);
ticketRoutes.post("/visits/visited", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketVisitsController.markVisited);
ticketRoutes.post("/delete", requirePermission("tickets", "delete"), tenantDbMiddleware, ticketController.changeStatus);
ticketRoutes.put("/create", requirePermission("tickets", "create"), tenantDbMiddleware, ticketController.getTicketDetails);
ticketRoutes.post("/update-status/:id", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketController.updateStatus);
ticketRoutes.get("/:id", requirePermission("tickets", "view"), tenantDbMiddleware, ticketController.getTicketDetails);
ticketRoutes.post("/:id", requirePermission("tickets", "edit"), tenantDbMiddleware, ticketController.getTicketDetails);

export default ticketRoutes;
