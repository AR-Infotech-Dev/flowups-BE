import express from "express";
import {submitTicketFeedback} from "./feedback.controller.js";

const router = express.Router();

router.post("/feedback/submit", submitTicketFeedback);

export default router;
