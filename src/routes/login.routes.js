import express from 'express';
import * as loginController from '../controllers/login.controller.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';

// const loginController = require('@controllers/login.controller');
// const loginController = require('@controllers/login.controller');

const loginRoutes = express.Router();
loginRoutes.post('/login', rateLimit({ keyPrefix: 'login', max: 8, windowMs: 15 * 60 * 1000 }), loginController.login);
loginRoutes.post('/forgotPassword', rateLimit({ keyPrefix: 'forgot-password', max: 5, windowMs: 15 * 60 * 1000 }), loginController.forgotPassword);
loginRoutes.post('/verifyOtp', rateLimit({ keyPrefix: 'verify-otp', max: 8, windowMs: 15 * 60 * 1000 }), loginController.verifyForgotPassword);

export default loginRoutes;
