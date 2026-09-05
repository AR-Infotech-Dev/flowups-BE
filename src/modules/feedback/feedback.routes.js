import express from "express";
import { submitTicketFeedback, list, getReviewRatings } from "./feedback.controller.js";
import { verifyToken } from "#middlewares/auth.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
const router = express.Router();

router.post("/feedback/submit", tenantDbMiddleware, submitTicketFeedback);
router.post("/reviews", verifyToken, tenantDbMiddleware, list);
router.post("/review-ratings", verifyToken,tenantDbMiddleware,getReviewRatings);

export default router;
