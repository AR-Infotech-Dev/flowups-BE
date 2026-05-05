import jwt from "jsonwebtoken";
import { query } from "../config/database.js";
import { env } from "../config/env.js";
import { verifyUserDetails, findUserByEmail, saveForgotPasswordOtp, findUserByOtp, updatePasswordByAdminID } from "../models/login.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { validateBody } from "../utils/bodyValidator.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { sendEmail } from "../utils/email.js";

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
        role_slug: user.role_slug,
        company_id: user.company_id,
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
          company_id: user.company_id,
          role_slug: user.role_slug,
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

const forgotPasswordRules = {
  email: { label: "Email", required: true, type: "email" },
};

const verifyForgotPasswordRules = {
  otp: { label: "OTP", required: true },
  new_password: { label: "New Password", required: true },
  re_enter_password: { label: "Re Enter Password", required: true },
};

const generateOtp = () =>
  String(Math.floor(100000 + Math.random() * 900000));

// ======================================================
// FORGOT PASSWORD
// ======================================================
export const forgotPassword = async (req, res) => {
  try {
    const validation = validateBody(req.body, forgotPasswordRules);

    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }

    const { email } = validation.data;
    const user = await findUserByEmail(email);

    if (!user) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "Email not found",
      });
    }

    const otp = generateOtp();
    const expiryDate = new Date(Date.now() + 10 * 60 * 1000);

    await saveForgotPasswordOtp(user.adminID, {
      otp,
      otp_exp_time: toMysqlDateTime(expiryDate),
      isEmailSend: "yes",
      modified_by: user.adminID,
      modified_date: toMysqlDateTime(),
    });

    const template = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:650px;margin:auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
      <div style="background:#0d6efd;padding:20px;text-align:center;color:#fff">
        <h2 style="margin:0;">Forgot Password OTP</h2>
      </div>
      <div style="padding:25px;color:#333;">
        <p>Hello <b>${user.name || user.userName || "User"}</b>,</p>
        <p>Your OTP for password reset is:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:20px 0;color:#0d6efd;">${otp}</div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
      <div style="background:#f8f9fa;padding:12px;text-align:center;font-size:12px;color:#666;">
        This is an automated email. Please do not reply.
      </div>
    </div>`;

    const { success, error } = await sendEmail({
      to: user.email,
      subject: "Forgot Password OTP",
      html: template,
      text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
    });

    if (!success) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 500,
        message: error || "Failed to send OTP email",
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: [],
      message: "OTP sent successfully",
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// ======================================================
// VERIFY FORGOT PASSWORD OTP
// ======================================================
export const verifyForgotPassword = async (req, res) => {
  try {
    const validation = validateBody(req.body, verifyForgotPasswordRules);

    if (!validation.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: validation.message,
      });
    }

    const { otp, new_password, re_enter_password } = validation.data;

    if (String(new_password) !== String(re_enter_password)) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "New password and re enter password must match",
      });
    }

    const user = await findUserByOtp(otp);

    if (!user) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "Invalid or expired OTP",
      });
    }

    await updatePasswordByAdminID(user.adminID, {
      password: new_password,
      otp: null,
      otp_exp_time: null,
      isEmailSend: "no",
      modified_by: user.adminID,
      modified_date: toMysqlDateTime(),
    });

    const template = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:650px;margin:auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
      <div style="background:#198754;padding:20px;text-align:center;color:#fff">
        <h2 style="margin:0;">Password Updated</h2>
      </div>
      <div style="padding:25px;color:#333;">
        <p>Hello <b>${user.name || user.userName || "User"}</b>,</p>
        <p>Your password has been updated successfully.</p>
        <p>If you did not make this change, please contact support immediately.</p>
      </div>
      <div style="background:#f8f9fa;padding:12px;text-align:center;font-size:12px;color:#666;">
        This is an automated email. Please do not reply.
      </div>
    </div>`;

    const { success, error } = await sendEmail({
      to: user.email,
      subject: "Password Updated Successfully",
      html: template,
      text: "Your password has been updated successfully.",
    });

    if (!success) {
      return failureResponse(res, {
        code: 2008,
        httpStatus: 500,
        message: error || "Password updated but confirmation email failed",
      });
    }

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      data: [],
      message: "Password updated successfully",
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
