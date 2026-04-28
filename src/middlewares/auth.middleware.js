import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { failureResponse } from "../utils/apiResponse.js";

export const verifyToken = (req, res, next) => {    
    try {
        const authHeader = req.headers.authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
            return failureResponse(res, {
                code: 2006,
                httpStatus: 401,
                message: "Token required"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, env.jwtSecret);

        req.user = decoded;

        next();

    } catch (error) {
        console.log(error);
        return failureResponse(res, {
            code: 2007,
            httpStatus: 401,
            message: "Invalid or expired token"
        });
    }
};