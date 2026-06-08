import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { validate } from "../utils/request.validator.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import Joi from "joi";
import { sendEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { renderTemplate } from "../utils/templateMaker.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const MODULE_TABLE = "admin";
const SUPER_ADMIN_ROLE_SLUGS = new Set(["super_admin", "superadmin", "administrator"]);

const isSuperAdminRole = (roleSlug = "") =>
  SUPER_ADMIN_ROLE_SLUGS.has(String(roleSlug || "").toLowerCase());

const getUserCompanyId = (user = {}) =>
  user?.company_id || user?.default_company || null;

const sanitizeSqlPayload = (payload = {}) =>
  Object.entries(payload).reduce((data, [key, value]) => {
    data[key] = value === undefined ? null : value;
    return data;
  }, {});

// ======================================================
// VALIDATION SCHEMA
// ======================================================
const userSchema = Joi.object({
  adminID: Joi.number().integer().positive().allow(null),
  name: Joi.string().required(),
  default_company: Joi.number().allow(null).default(null),
  time_zone: Joi.string().allow("", null),
  company_id: Joi.number().integer().allow(null),

  is_approver: Joi.string().valid("yes", "no").default("no"),
  userName: Joi.string().required(),
  email: Joi.string().email().required(),
  isEmailSend: Joi.string().valid("yes", "no").default("no"),

  password: Joi.string().allow("", null),

  is_sys_user: Joi.string().valid("yes", "no").default("no"),
  roleID: Joi.number().integer().required(),

  address: Joi.string().allow("", null),
  google_location: Joi.string().allow("", null),

  contactNo: Joi.string().allow("", null),
  whatsappNo: Joi.string().allow("", null),

  dateOfBirth: Joi.date().allow(null),

  created_by: Joi.number().integer().allow(null),
  modified_by: Joi.number().integer().allow(null),

  status: Joi.string().default("active"),

  user_setting: Joi.any().allow(null),
  photo: Joi.string().allow("", null),

  latitude: Joi.string().allow("", null),
  longitude: Joi.string().allow("", null),
  country_code: Joi.string().allow("", null),

  otp: Joi.any().allow("", null),
  isVerified: Joi.string().valid("Y", "N").default("N"),

  lastLogin: Joi.date().allow(null),
  gfcmToken: Joi.string().allow("", null),

  is_google_sync: Joi.string().valid("y", "n").default("n"),
  is_one_drive_sync: Joi.string().valid("y", "n").default("n"),

  g_cal_token: Joi.string().allow("", null),
  one_drive_access_token: Joi.string().allow("", null),

  otp_exp_time: Joi.date().allow(null),
  active_session_id: Joi.string().allow(null),
  active_session_id_mob: Joi.string().allow(null),

  created_date: Joi.date().allow(null),
  modified_date: Joi.date().allow(null),
});

// ======================================================
// LIST USERS
// ======================================================
const default_columns = {
  roleID: {
    table: "user_role_master",
    alias: "r",
    column: "roleName",
    key2: "roleID",
    select: "",
  },
  default_company: {
    table: "company_master",
    alias: "dc",
    column: "company_name",
    key2: "company_id",
    select: "",
  },
  // company_id: {
  //   table: "company_master",
  //   alias: "cm",
  //   column: "company_name",
  //   key2: "company_id",
  //   select: "",
  // },
};

const custom_columns = {
  modified_by: {
    table: "admin",
    alias: "am",
    column: "name",
    key2: "adminID",
    select: "",
  },
  created_by: {
    table: "admin",
    alias: "ad",
    column: "name",
    key2: "adminID",
    select: "",
  },
};

export const list = async (req, res) => {
  try {
    const {
      page = 1,
      searchText = "",
      getAll = "N",
      orderBy = "created_date",
      order = "DESC",
      company_id = null,
      filters,
    } = req.body;

    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const other1 = {
      orderBy,
      order,
      searchColumns: ["ad.name", "am.name", "r.roleName", 't.userName', "t.email"],
    };

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: other1,
      default_columns,
      custom_columns,
    });

    const { select, where, values, join, other } = filterData;
    const scopedCompanyId = isSuperAdminRole(req.user?.role_slug)
      ? null
      : getUserCompanyId(req.user);

    if (scopedCompanyId) {
      where.push("t.company_id = ?");
      values.push(scopedCompanyId);
    }
    // HIDE SUPER ADMIN FROM LIST
    where.push("r.slug != ?");
    values.push('super_admin');

    const total = await CommonModel.getCountsByParameter({
      table: MODULE_TABLE,
      where,
      values,
      join,
      other,
    });

    const totalPages = Math.ceil(total / limit);

    let end = start + limit;
    if (end > total) end = total;

    let data = [];

    if (getAll === "Y") {
      data = await CommonModel.GetMasterListDetails({
        select,
        table: MODULE_TABLE,
        where,
        values,
        join,
        other,
      });
    } else {
      data = await CommonModel.GetMasterListDetails({
        select,
        table: MODULE_TABLE,
        where,
        values,
        limit,
        start,
        join,
        other,
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data,
        pagination: {
          total,
          page: currentPage,
          limit,
          totalPages,
          start: total === 0 ? 0 : start + 1,
          end,
        },
      },
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
// CREATE / UPDATE / GET SINGLE
// ======================================================
export const getAdminDetails = async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const { id: adminID = null } = req.params;

    const body = await buildTablePayload(MODULE_TABLE, req.body);

    delete body.alive_data;

    let data = {};
    if (method !== "GET") {
      const result = validate(userSchema, body);

      if (!result.isValid) {
        return failureResponse(res, {
          code: 2004,
          httpStatus: 404,
          message: result.message.replace(/"/g, ""),
        });
      }

      data = result.value;

      const duplicateCheck = await validateAdminDetails(
        data.email,
        data.userName,
        adminID
      );

      if (duplicateCheck) {
        return failureResponse(res, duplicateCheck);
      }
    }

    switch (method) {
      case "PUT": {
        const plainPassword = data.password;
        if (plainPassword) {
          data.password = await hashPassword(plainPassword);
        }

        data = await buildTablePayload(MODULE_TABLE, {
          ...data,
          created_by: req.user.adminID,
          created_date: toMysqlDateTime(),
        });

        const result = await CommonModel.saveMasterDetails({
          table: MODULE_TABLE,
          data,
        });

        const template = await renderTemplate("userAccountCredentials", "email", {
          name: data.name,
          userName: data.userName,
          password: plainPassword,
          appName: env.appName,
        });
        const { success, error } = await sendEmail({
          to: data.email,
          subject: "User Login Credentials",
          html: template,
          text: "",
          company_id: data.company_id || req.user.company_id,
        });
        // console.log('success : ' ,success);
        if (!success) {
          return failureResponse(res, {
            code: 2008,
            httpStatus: 500,
            message: error,
          });
        }

        return successResponse(res, {
          code: 1001,
          httpStatus: 201,
          data: {
            insertId: result.insertId,
          },
        });
      }

      case "POST": {
        if (!adminID) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        if (data.password) {
          data.password = await hashPassword(data.password);
        } else {
          delete data.password;
        }

        data = await buildTablePayload(MODULE_TABLE, {
          ...data,
          modified_by: req.user.adminID,
          modified_date: toMysqlDateTime(),
        });

        await CommonModel.updateMasterDetails({
          table: MODULE_TABLE,
          data,
          where: { adminID },
        });

        return successResponse(res, {
          code: 1002,
          httpStatus: 200,
          data: [],
        });
      }

      case "GET": {
        if (!adminID) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        const details = await CommonModel.getMasterDetails(
          MODULE_TABLE,
          "*",
          { adminID }
        );

        if (!details.length) {
          return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
          });
        }

        return successResponse(res, {
          code: 1004,
          httpStatus: 200,
          data: {
            data: details[0],
          },
        });
      }

      default:
        return failureResponse(res, {
          code: 2000,
          httpStatus: 405,
        });
    }
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// ======================================================
// CHANGE STATUS / DELETE
// ======================================================
export const changeStatus = async (req, res) => {
  try {
    const { action = "", ids = [], status = "active" } = req.body;

    switch (action.trim().toLowerCase()) {
      case "delete":
        await CommonModel.deleteMasterDetails({
          table: MODULE_TABLE,
          where: { adminID: ids },
        });

        return successResponse(res, {
          code: 1003,
          httpStatus: 200,
          data: [],
        });

      case "changestatus":
        await CommonModel.changeMasterStatus(
          MODULE_TABLE,
          status,
          ids
        );

        return successResponse(res, {
          code: 1002,
          httpStatus: 200,
          data: [],
        });

      default:
        return failureResponse(res, {
          code: 2000,
          httpStatus: 400,
        });
    }
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

export const updateLocation = async (req, res) => {
  try {
    const adminID = req.user?.adminID;
    const latitude = req.body?.latitude ?? req.body?.lat;
    const longitude = req.body?.longitude ?? req.body?.lng;

    if (!adminID) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    if (latitude === undefined || longitude === undefined || latitude === "" || longitude === "") {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Latitude and longitude are required",
      });
    }

    const data = sanitizeSqlPayload(await buildTablePayload(MODULE_TABLE, {
      latitude,
      longitude,
      alive_data: req.body?.alive_data,
      modified_by: adminID,
      modified_date: toMysqlDateTime(),
    }));

    if (!Object.keys(data).length) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "No valid location fields found for update",
      });
    }

    const result = await CommonModel.updateMasterDetails({
      table: MODULE_TABLE,
      data,
      where: { adminID },
    });

    if (!result.affectedRows) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Location updated successfully",
      data: [],
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
}

export const getMarkers = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const data = await CommonModel.GetMasterListDetails({
      select: 't.latitude , t.longitude, t.name',
      table: MODULE_TABLE,
      where: [
        // `t.company_id = ${company_id}`,
        `t.status = 'active'`
      ],
    });

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data,
      },
    });
  } catch (error) {
    console.log(error);

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
}

export const getProfile = async (req, res) => {
  try {
    const adminID = req.user?.adminID;

    if (!adminID) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    const rows = await CommonModel.GetMasterListDetails({
      select: `
        t.adminID,
        t.name,
        t.email,
        t.dateOfBirth,
        t.userName,
        t.whatsappNo,
        t.time_zone,
        t.roleID,
        r.roleName AS roleName,
        r.slug AS role_slug,
        t.company_id,
        cm.company_name AS company_name,
        t.is_approver,
        t.google_location,
        t.status,
        t.address,
        t.contactNo,
        t.created_date,
        t.lastLogin
      `,
      table: MODULE_TABLE,
      where: ["t.adminID = ?"],
      values: [adminID],
      join: [
        {
          type: "LEFT JOIN",
          table: "user_role_master",
          alias: "r",
          key1: "roleID",
          key2: "roleID",
        },
        {
          type: "LEFT JOIN",
          table: "company_master",
          alias: "cm",
          key1: "company_id",
          key2: "company_id",
        },
      ],
    });

    if (!rows.length) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: rows[0],
      },
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const adminID = req.user?.adminID;

    if (!adminID) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    const editableData = {
      email: req.body.email,
      whatsappNo: req.body.whatsappNo ?? req.body.whatsapp_no ?? req.body.wa_no,
      address: req.body.address,
      userName: req.body.userName ?? req.body.user_name,
    };

    const profileSchema = Joi.object({
      email: Joi.string().email().required(),
      whatsappNo: Joi.string().allow("", null),
      address: Joi.string().allow("", null),
      userName: Joi.string().trim().min(3).required(),
    });

    const result = validate(profileSchema, editableData);

    if (!result.isValid) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: result.message.replace(/"/g, ""),
      });
    }

    const duplicateCheck = await validateAdminDetails(
      result.value.email,
      result.value.userName,
      adminID
    );

    if (duplicateCheck) {
      return failureResponse(res, duplicateCheck);
    }

    await CommonModel.updateMasterDetails({
      table: MODULE_TABLE,
      data: {
        ...result.value,
        modified_by: adminID,
        modified_date: toMysqlDateTime(),
      },
      where: { adminID },
    });

    const updatedRows = await CommonModel.getMasterDetails(
      MODULE_TABLE,
      "*",
      { adminID }
    );

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Profile updated successfully",
      data: {
        data: updatedRows[0] || result.value,
      },
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

export const changeProfilePassword = async (req, res) => {
  try {
    const adminID = req.user?.adminID;
    const { current_password, currentPassword, new_password, newPassword, confirm_password, confirmPassword } = req.body;
    const current = current_password ?? currentPassword;
    const next = new_password ?? newPassword;
    const confirm = confirm_password ?? confirmPassword;

    if (!adminID) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    if (!current || !next || !confirm) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Current password, new password and confirm password are required",
      });
    }

    if (String(next).length < 6) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "New password must be at least 6 characters",
      });
    }

    if (String(next) !== String(confirm)) {
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "New password and confirm password must match",
      });
    }

    const rows = await CommonModel.getMasterDetails(
      MODULE_TABLE,
      "adminID, password",
      { adminID }
    );
    const user = rows[0];

    if (!user) {
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "User not found",
      });
    }

    const isCurrentPasswordValid = await verifyPassword(current, user.password);

    if (!isCurrentPasswordValid) {
      return failureResponse(res, {
        code: 2002,
        httpStatus: 401,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await hashPassword(next);

    await CommonModel.updateMasterDetails({
      table: MODULE_TABLE,
      data: {
        password: hashedPassword,
        modified_by: adminID,
        modified_date: toMysqlDateTime(),
      },
      where: { adminID },
    });

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Password changed successfully",
      data: [],
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
// UNIQUE CHECK
// ======================================================
const validateAdminDetails = async (
  email,
  userName,
  adminID = null
) => {
  if (email) {
    const emailExist = await CommonModel.getMasterDetails(
      MODULE_TABLE,
      "*",
      { email }
    );

    if (
      emailExist.length &&
      Number(emailExist[0].adminID) !== Number(adminID)
    ) {
      return {
        code: 2002,
        httpStatus: 409,
        message: "Email already exists",
      };
    }
  }

  if (userName) {
    const userExist = await CommonModel.getMasterDetails(
      MODULE_TABLE,
      "*",
      { userName }
    );

    if (
      userExist.length &&
      Number(userExist[0].adminID) !== Number(adminID)
    ) {
      return {
        code: 2003,
        httpStatus: 409,
        message: "Username already exists",
      };
    }
  }

  return null;
};
