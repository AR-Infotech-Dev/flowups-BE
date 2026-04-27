// import * as CommonModel from "../models/common.model.js";
// import { successResponse, failureResponse } from "../utils/apiResponse.js";
// import {prepareFilterData} from "../utils/filter.builder.js";

// // ======================================================
// // LIST USERS
// // ======================================================
// const default_columns = { // THIS IS OR DEFAULT COLS
//   roleID: { table: "user_role_master", alias: "r", column: "roleName", key2: "roleID", select: "" },
//   default_company: { table: "info_settings", alias: "dc", column: "companyName", key2: "infoID", select: "" },
//   modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "" },
//   created_by: { table: "admin", alias: "ad", column: "name", key2: "adminID", select: "" }
// };

// const custom_columns = {}; // FOR CUSTOM SELECTED COLS

// export const list = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       searchText = '',
//       getAll = "N",
//       orderBy = "name",
//       order = "ASC",
//       filters
//     } = req.body;

//     const limit = 10;
//     const currentPage = Number(page) || 1;
//     const start = (currentPage - 1) * limit;
//     const freeTextSearch = searchText || '';
    
//     const other1 = { orderBy: 'created_date', order: 'ASC', searchColumns: ['name','userName','email'] };
//     const filterData = prepareFilterData({ filters,searchText,other:other1, default_columns, custom_columns})
//     const { select, where, values, join, other } = filterData;
    
//     const total = await CommonModel.getCountsByParameter({ table: "admin", where, values, join, other});
//     const totalPages = Math.ceil(total / limit);

//     let end = start + limit;
//     if (end > total) end = total;

//     let adminDetails = [];
//     if (getAll === "Y") {
//       adminDetails = await CommonModel.GetMasterListDetails({ select, table: "admin", where, values, join, other});
//     } else {
//       adminDetails = await CommonModel.GetMasterListDetails({ select, table: "admin", where ,values, limit, start, join, other});
//     }
//     return successResponse(res, {
//       code: 1004,
//       httpStatus: 200,      
//       data: {
//         data : adminDetails,
//         pagination: {
//           total,
//           page: currentPage,
//           limit,
//           totalPages,
//           start: total === 0 ? 0 : start + 1,
//           end,
//         }
//       }
//     });
//   } catch (error) {
//     console.log(error);
    
//     return failureResponse(res, {
//       code: 2008,
//       httpStatus: 500,
//     });
//   }
// };
// // ======================================================
// // CREATE / UPDATE / GET SINGLE
// // ======================================================
// export const getAdminDetails = async (req, res) => {
//   try {
//     const method = req.method.toUpperCase();
//     const { id: adminID = null } = req.params;
//     let data = {};
    
//     switch (method) {
//       case "PUT": {
//         const validation = await validateAdminDetails(req.body);
//         if (validation) {
//           return failureResponse(res, validation);
//         }
//         data = {
//           ...req.body,
//           created_by: 1,
//           created_date: new Date()
//         };
//         const result = await CommonModel.saveMasterDetails({table :"admin", data: data});
//         return successResponse(res, {
//           code: 1001,
//           httpStatus: 201,
//           data: {
//             insertId: result.insertId,
//           },
//         });
//       }

//       case "POST": {
//         if (!adminID) {
//           return failureResponse(res, {
//             code: 2004,
//             httpStatus: 404,
//           });
//         }

//         const validation = await validateAdminDetails(req.body, adminID);

//         if (validation) {
//           return failureResponse(res, validation);
//         }
//         data = {
//           ...req.body,
//           modified_by: 1,
//           modified_date: new Date()
//         };
//         await CommonModel.updateMasterDetails({table : "admin", data, where: { adminID }});

//         return successResponse(res, {
//           code: 1002,
//           httpStatus: 200,
//           data: [],
//         });
//       }

//       case "GET": {
//         if (!adminID) {
//           return failureResponse(res, {
//             code: 2004,
//             httpStatus: 404,
//           });
//         }

//         const details = await CommonModel.getMasterDetails("admin", "*", { adminID });

//         if (!details.length) {
//           return failureResponse(res, {
//             code: 2004,
//             httpStatus: 404,
//           });
//         }

//         return successResponse(res, {
//           code: 1004,
//           httpStatus: 200,
//           data: { data : details[0]},
//         });
//       }
//       default:
//         return failureResponse(res, {
//           code: 2000,
//           httpStatus: 405,
//         });
//     }
//   } catch (error) {
//     return failureResponse(res, {
//       message:error.message,
//       code: 2008,
//       httpStatus: 500,
//     });
//   }
// };

// // ======================================================
// // CHANGE STATUS / DELETE
// // ======================================================
// export const changeStatus = async (req, res) => {
//   try {
//     const { action = "", ids = [], status = "Y" } = req.body;
//     switch (action.trim().toLowerCase()) {
//       case "delete":
//         await CommonModel.deleteMasterDetails({table : "admin", where : { 'adminID': ids }});
//         return successResponse(res, {
//           code: 1003,
//           httpStatus: 200,
//           data: [],
//         });

//       case "changestatus":
//         await CommonModel.changeMasterStatus("admin", status, ids);
//         return successResponse(res, {
//           code: 1002,
//           httpStatus: 200,
//           data: [],
//         });

//       default:
//         return failureResponse(res, {
//           code: 2000,
//           httpStatus: 400,
//         });
//     }
//   } catch (error) {
//     return failureResponse(res, {
//       code: 2008,
//       httpStatus: 500,
//       message:error.message
//     });
//   }
// };

// // ======================================================
// // VALIDATION
// // ======================================================
// const validateAdminDetails = async ({ email, userName }, adminID = null) => {
//   if (email) {
//     const emailExist = await CommonModel.getMasterDetails("admin", "*", { email });
//     if (emailExist.length && emailExist[0].adminID != adminID) {
//       return {
//         code: 2002,
//         httpStatus: 409,
//       };
//     }
//   }

//   if (userName) {
//     const userExist = await CommonModel.getMasterDetails("admin", "*", { userName });
//     if (userExist.length && userExist[0].adminID != adminID) {
//       return {
//         code: 2003,
//         httpStatus: 409,
//       };
//     }
//   }
//   return null;
// };



import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { validate } from "../utils/request.validator.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";
import Joi from "joi";

const MODULE_TABLE = "admin";

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
    table: "info_settings",
    alias: "dc",
    column: "companyName",
    key2: "infoID",
    select: "",
  },
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
      filters,
    } = req.body;

    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const other1 = {
      orderBy,
      order,
      searchColumns: ["ad.name","am.name", "r.roleName", 't.userName',"t.email"],
    };

    const filterData = prepareFilterData({
      filters,
      searchText,
      other: other1,
      default_columns,
      custom_columns,
    });

    const { select, where, values, join, other } = filterData;

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
        data = await buildTablePayload(MODULE_TABLE, {
          ...data,
          created_by: req.user.adminID,
          created_date: toMysqlDateTime(),
        });

        const result = await CommonModel.saveMasterDetails({
          table: MODULE_TABLE,
          data,
        });

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
