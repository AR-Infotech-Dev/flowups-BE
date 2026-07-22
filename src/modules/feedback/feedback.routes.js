import express from "express";
import { submitTicketFeedback } from "./feedback.controller.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";

const router = express.Router();

router.post("/feedback/submit", tenantDbMiddleware, submitTicketFeedback);

export default router;
