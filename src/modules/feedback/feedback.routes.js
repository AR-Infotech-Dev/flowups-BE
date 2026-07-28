import express from "express";
import { submitTicketFeedback, list,getReviewRatings } from "./feedback.controller.js";
import { verifyToken } from "#middlewares/auth.middleware.js";

const router = express.Router();
router.post("/feedbacks", submitTicketFeedback);
router.post("/reviews", verifyToken, list);
router.post("/review-ratings", verifyToken,getReviewRatings);

export default router;
