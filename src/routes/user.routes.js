import express from 'express';
import * as userController from '../controllers/users.controller.js';

const usersRoutes = express.Router();

usersRoutes.post('/', userController.list);
usersRoutes.post('/delete', userController.changeStatus);

usersRoutes.put('/create', userController.getAdminDetails);
usersRoutes.get('/:id', userController.getAdminDetails);
usersRoutes.post('/:id', userController.getAdminDetails);

// usersRoutes.post('/delete/:id', userController.changeStatus);

export default usersRoutes;