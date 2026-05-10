import express from 'express';
import * as loginController from '../controllers/login.controller.js';

// const loginController = require('@controllers/login.controller');
// const loginController = require('@controllers/login.controller');

const loginRoutes = express.Router();
loginRoutes.post('/login', loginController.login);
loginRoutes.post('/forgotPassword', loginController.forgotPassword);
loginRoutes.post('/verifyOtp', loginController.verifyForgotPassword);

export default loginRoutes;
