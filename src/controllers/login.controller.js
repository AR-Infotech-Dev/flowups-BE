import jwt from "jsonwebtoken";
import { query } from "../config/database.js";
import { env } from "../config/env.js";
import { verifyUserDetails } from "../models/login.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";

export const login = async (req, res) => {
  try {
    const { username = "", password = "" } = req.body;
    // ===============================
    // VALIDATION
    // ===============================
    if (!username || !password) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Username and password are required",
      });
    }

    // ===============================
    // CHECK USER
    // ===============================
    const rows = await verifyUserDetails(username);
    const user = rows[0];

    if (!user) {
      return failureResponse(res, {
        code: 2002,
        httpStatus: 401,
        message: "Invalid username or password",
      });
    }

    // ===============================
    // STATUS CHECK
    // ===============================
    if (user.status !== "active") {
      return failureResponse(res, {
        code: 2003,
        httpStatus: 403,
        message: "Account is inactive",
      });
    }

    // ===============================
    // PASSWORD CHECK
    // (plain text current system)
    // ===============================
    if (String(password) !== String(user.password)) {
      return failureResponse(res, {
        code: 2002,
        httpStatus: 401,
        message: "Invalid username or password",
      });
    }

    // ===============================
    // GENERATE TOKEN
    // ===============================
    const token = jwt.sign(
      {
        adminID: user.adminID,
        username: user.userName,
        roleID: user.roleID,
      },
      env.jwtSecret,
      {
        expiresIn: env.jwtExpire,
      }
    );

    // ===============================
    // SUCCESS
    // ===============================
    return successResponse(res, {
      code: 1001,
      httpStatus: 200,
      data: {
        token,
        user: {
          adminID: user.adminID,
          name: user.name,
          userName: user.userName,
          roleID: user.roleID,
        },
      },
      message: "Login successful",
    });

  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};