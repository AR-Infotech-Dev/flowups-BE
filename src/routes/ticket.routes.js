import express from 'express';
import * as ticketController from '../controllers/ticket.controller.js';
import * as ticketHistoryController  from '../controllers/ticketHistory.controller.js';
import * as ticketWorkLogsController from '../controllers/ticketWorkLogs.controller.js';
import { requirePermission } from '../middlewares/permissions.middleware.js';

const ticketRoutes = express.Router();

ticketRoutes.post('/', requirePermission('tickets', 'view'), ticketController.list);
ticketRoutes.post('/history', requirePermission('tickets', 'view'), ticketHistoryController.history);
ticketRoutes.post('/work-logs', requirePermission('tickets', 'view'), ticketWorkLogsController.list);
ticketRoutes.put('/work-logs/create', requirePermission('tickets', 'edit'), ticketWorkLogsController.create);
ticketRoutes.post('/work-logs/update', requirePermission('tickets', 'edit'), ticketWorkLogsController.update);
ticketRoutes.post('/delete', requirePermission('tickets', 'delete'), ticketController.changeStatus);
ticketRoutes.put('/create', requirePermission('tickets', 'create'), ticketController.getTicketDetails);
ticketRoutes.post('/update-status/:id', requirePermission('tickets', 'edit'), ticketController.updateStatus);
ticketRoutes.get('/:id', requirePermission('tickets', 'view'), ticketController.getTicketDetails);
ticketRoutes.post('/:id', requirePermission('tickets', 'edit'), ticketController.getTicketDetails);

export default ticketRoutes;
