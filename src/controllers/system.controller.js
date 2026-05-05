import * as CommonModel from "../models/common.model.js";
import { query, DB_PREFIX } from "../config/database.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";

// ======================================================
// GET DEFINATIONS
// ======================================================
export const getDefinations = async (req, res) => {
    try {
        let { table, menu_id } = req.body;

        if (!table) {
            if (!menu_id) {
                return failureResponse(res, {
                    code: 2001,
                    httpStatus: 400,
                    message: "menu_id is required",
                });
            }

            const moduleDetails = await CommonModel.getMasterDetails("menu_master", "*", { menu_id });

            if (!moduleDetails.length) {
                return failureResponse(res, {
                    code: 2004,
                    httpStatus: 404,
                    message: "Menu not found",
                });
            }

            table = moduleDetails[0].table_name;
        }

        if (!table) {
            return failureResponse(res, {
                code: 2001,
                httpStatus: 400,
                message: "Table is required",
            });
        }

        const sql = `SHOW COLUMNS FROM ${DB_PREFIX}${table}`;
        const rows = await query(sql);

        if (rows.length) {
            return successResponse(res, {
                code: 1004,
                httpStatus: 200,
                data: {
                    data: rows
                },
            });
        }

        return failureResponse(res, {
            code: 2004,
            httpStatus: 404,
            message: "No definitions found",
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
// FREE TEXT SEARCH
// ======================================================
// export const getFreeTextSearch = async (req, res) => {
//     try {
//         const { text: searchText, type, tableName, wherec, list = "*", status } = req.body;

//         const text = String(searchText || "").trim();
//         const where = {};

//         if (type === "input") {
//             if (!text) {
//                 return failureResponse(res, {
//                     code: 2001,
//                     httpStatus: 400,
//                     message: "Search text required",
//                 });
//             }

//             where[`${wherec} LIKE`] = `'%${text}%'`;
//         }

//         if (String(status) === "true") {
//             where["t.status"] = `IN ("active")`;
//         }

//         const result = await CommonModel.GetMasterListDetails(list, tableName, where);

//         if (result.length) {
//             return successResponse(res, {
//                 code: 1004,
//                 httpStatus: 200,
//                 data: {
//                     data: result
//                 },
//             });
//         }

//         return failureResponse(res, {
//             code: 2004,
//             httpStatus: 404,
//             message: "No records found",
//         });
//     } catch (error) {
//         return failureResponse(res, {
//             code: 2008,
//             httpStatus: 500,
//             message: error.message,
//         });
//     }
// };
export const getFreeTextSearch = async (req, res) => {
  try {
    const { text: searchText = "", type = "", tableName = "", wherec = "", list = "*", status = "false" } = req.body;
    const text = String(searchText).trim();
    const where = [];
    const values = [];

    // ===============================
    // INPUT SEARCH
    // ===============================
    if (type === "input") {
      if (!text) {
        return failureResponse(res, {
          code: 2001,
          httpStatus: 400,
          message: "Search text required"
        });
      }

      where.push(`t.${wherec} LIKE ?`);
      values.push(`%${text}%`);
    }

    // ===============================
    // STATUS FILTER
    // ===============================
    if (String(status) === "true") {
      where.push(`t.status = ?`);
      values.push("active");
    }
    if (['customer'].includes(tableName)) {
      where.push(`t.company_id = ${req.user.company_id} `);
    }
    const result = await CommonModel.GetMasterListDetails({ select: list, table: tableName, where, values});
    if (result.length) {
      return successResponse(res, {
        code: 1004,
        httpStatus: 200,
        data: {
            data : result
        }
      });
    }
    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "No records found"
    });

  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message
    });
  }
};

// ======================================================
// GET SLUG LIST
// ======================================================
// export const getslugList = async (req, res) => {
//     try {
//         const { slug, status, category_id } = req.body;

//         const where = {};
//         const join = [];
//         const other = { orderBy: "categories_index", order: "ASC" };

//         if (status) {
//             const statusStr = String(status).split(",").join('","');
//             where["t.status"] = `IN ("${statusStr}")`;
//         }

//         if (slug) {
//             const slugStr = String(slug).split(",").join('","');
//             where["t.slug"] = `IN ("${slugStr}")`;
//         }

//         if (category_id) {
//             const categoryStr = String(category_id).split(",").join('","');
//             where["t.category_id"] = `IN ("${categoryStr}")`;
//         }

//         const categoryDetails = await CommonModel.GetMasterListDetails({select="category_id,slug,categoryName,parent_id,is_parent,categories_index", table="categories", where, values=[],limit= "", join, other});

//         for (const row of categoryDetails) {
//             const childWhere = {
//                 "t.parent_id": `= "${row.category_id}"`,
//                 "t.status": `IN ("active")`,
//             };

//             row.sublist = await CommonModel.GetMasterListDetails("category_id,slug,categoryName,parent_id,is_parent,categories_index,cat_color", "categories", childWhere, "", "", join, other);
//         }

//         if (categoryDetails.length) {
//             return successResponse(res, {
//                 code: 1004,
//                 httpStatus: 200,
//                 data: {
//                     data: categoryDetails
//                 },
//             });
//         }

//         return failureResponse(res, {
//             code: 2004,
//             httpStatus: 404,
//             message: "No records found",
//         });
//     } catch (error) {
//         console.log(error);

//         return failureResponse(res, {
//             code: 2008,
//             httpStatus: 500,
//             message: error.message,
//         });
//     }
// };

export const getslugList = async (req, res) => {
  try {
    const { slug = "", status = "", category_id = "" } = req.body;

    const where = [];
    const values = [];
    const join = [];

    const other = {
      orderBy: "t.categories_index",
      order: "ASC",
    };

    // ===============================
    // STATUS FILTER
    // ===============================
    if (status) {
      const statusArr = String(status).split(",");

      where.push(
        `t.status IN (${statusArr.map(() => "?").join(",")})`
      );

      values.push(...statusArr);
    }

    // ===============================
    // SLUG FILTER
    // ===============================
    if (slug) {
      const slugArr = String(slug).split(",");

      where.push(
        `t.slug IN (${slugArr.map(() => "?").join(",")})`
      );

      values.push(...slugArr);
    }

    // ===============================
    // CATEGORY ID FILTER
    // ===============================
    if (category_id) {
      const catArr = String(category_id).split(",");

      where.push(
        `t.category_id IN (${catArr.map(() => "?").join(",")})`
      );

      values.push(...catArr);
    }

    // ===============================
    // MAIN CATEGORY LIST
    // ===============================
    const categoryDetails =
      await CommonModel.GetMasterListDetails({
        select:
          "t.category_id,t.slug,t.categoryName,t.parent_id,t.is_parent,t.categories_index",
        table: "categories",
        where,
        values,
        join,
        other,
      });

    // ===============================
    // CHILD CATEGORY LIST
    // ===============================
    for (const row of categoryDetails) {
      row.sublist =
        await CommonModel.GetMasterListDetails({
          select:
            "t.category_id,t.slug,t.categoryName,t.parent_id,t.is_parent,t.categories_index,t.cat_color",
          table: "categories",
          where: [
            "t.parent_id = ?",
            "t.status = ?",
          ],
          values: [
            row.category_id,
            "active",
          ],
          join,
          other,
        });
    }

    // ===============================
    // RESPONSE
    // ===============================
    if (categoryDetails.length) {
      return successResponse(res, {
        code: 1004,
        httpStatus: 200,
        data: {data : categoryDetails},
      });
    }

    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "No records found",
    });

  } catch (error) {
    console.log(error);

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};