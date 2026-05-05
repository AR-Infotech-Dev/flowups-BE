import express from 'express';
import * as userController from '../controllers/users.controller.js';

const usersRoutes = express.Router();

usersRoutes.post('/', userController.list);
usersRoutes.post('/delete', userController.changeStatus);
usersRoutes.post('/update-location', userController.updateLocation);
usersRoutes.get('/get-markers', userController.getMarkers);
usersRoutes.put('/create', userController.getAdminDetails);
usersRoutes.get('/:id', userController.getAdminDetails);
usersRoutes.post('/:id', userController.getAdminDetails);

// usersRoutes.post('/delete/:id', userController.changeStatus);

export default usersRoutes;