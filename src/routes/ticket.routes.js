import express from 'express';
import * as ticketController from '../controllers/ticket.controller.js';
import * as ticketHistoryController  from '../controllers/ticketHistory.controller.js';

const ticketRoutes = express.Router();

ticketRoutes.post('/', ticketController.list);
ticketRoutes.post('/history', ticketHistoryController.history);
ticketRoutes.post('/delete', ticketController.changeStatus);
ticketRoutes.put('/create', ticketController.getTicketDetails);
ticketRoutes.post('/update-status/:id', ticketController.updateStatus);
ticketRoutes.get('/:id', ticketController.getTicketDetails);
ticketRoutes.post('/:id', ticketController.getTicketDetails);

export default ticketRoutes;
