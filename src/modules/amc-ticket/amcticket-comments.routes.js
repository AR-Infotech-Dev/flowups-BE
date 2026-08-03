import express from 'express';
import * as ticketCommentsController from './ticket-comments.controller.js';
const commentsRoutes = express.Router();
commentsRoutes.post('/comments', ticketCommentsController.list);
commentsRoutes.put('/comments/create', ticketCommentsController.getTicketCommentDetails);
commentsRoutes.post('/comments/delete', ticketCommentsController.deleteTicketComment);
commentsRoutes.get('/comments/:id', ticketCommentsController.getTicketCommentDetails);
commentsRoutes.post('/comments/:id', ticketCommentsController.getTicketCommentDetails);


export default commentsRoutes;
