import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { toMysqlDateTime } from "../utils/dateTime.js";
import { buildTablePayload } from "../utils/tablePayload.js";

// =====================================
// GET MENU LIST
// =====================================
// export const getMenuList = async (req, res) => {
//   try {
//     // ===============================
//     // GET PARENT MENUS
//     // ===============================
//     const menuHistory = await CommonModel.GetMasterListDetails({
//       select: "*",
//       table: "menu_master",
//       where: [
//         "t.status = ?",
//         "t.isParent = ?"
//       ],
//       values: [
//         "active",
//         "yes"
//       ],
//       other: {
//         orderBy: "t.menuIndex",
//         order: "ASC"
//       }
//     });
//     console.log(menuHistory);

//     // ===============================
//     // GET SUB MENUS
//     // ===============================
//     for (const menu of menuHistory) {
//       const subMenuHistory = await CommonModel.GetMasterListDetails({
//         select: "*",
//         table: "menu_master",
//         where: [
//           "t.status = ?",
//           "t.isParent = ?",
//           "t.parentID = ?"
//         ],
//         values: [
//           "active",
//           "no",
//           menu.menuID
//         ],
//         other: {
//           orderBy: "t.menuIndex",
//           order: "ASC"
//         }
//       });

//       menu.subMenu = subMenuHistory;
//     }

//     // ===============================
//     // RESPONSE
//     // ===============================
//     if (menuHistory.length) {
//       return successResponse(res, {
//         code: 1004,
//         httpStatus: 200,
//         data: {
//           data: menuHistory
//         },
//       });
//     }

//     return failureResponse(res, {
//       code: 2004,
//       httpStatus: 404,
//       message: "No menu found"
//     });

//   } catch (error) {
//     console.log(error);

//     return failureResponse(res, {
//       code: 2008,
//       httpStatus: 500,
//       message: error.message
//     });
//   }
// };

// =====================================================
// GET MENU DETAILS (LIST + PAGINATION + SUBMENU)
// =====================================================
export const list = async (req, res) => {
  try {
    const {
      page = 1,
      getAll = "N",
      orderBy = "menuIndex",
      order = "ASC",
      searchText = "",
      status = "active",
      show_on_website = "",
    } = req.body;

    const limit = 10;
    const currentPage = Number(page) || 1;
    const start = (currentPage - 1) * limit;

    const where = {};
    const join = [];

    const other = {
      orderBy,
      order,
      freeTextSearch: searchText,
      searchColumns: [
        "t.menuName",
        "t.module_name",
        "t.menuLink",
      ],
    };

    if (status) {
      where["t.status = ?"] = status;
    }

    if (show_on_website) {
      where["t.show_on_website = ?"] =
        show_on_website;
    }

    if (getAll !== "Y") {
      where["t.isParent = ?"] = "yes";
    }

    const total =
      await CommonModel.getCountsByParameter({
        table: "menu_master",
        where,
        join,
        other,
      });

    const totalPages = Math.ceil(
      total / limit
    );

    const rows =
      await CommonModel.GetMasterListDetails({
        table: "menu_master",
        where,
        join,
        other,
        limit:
          getAll === "Y"
            ? ""
            : limit,
        start:
          getAll === "Y"
            ? ""
            : start,
      });

    const menuData = [];

    for (const row of rows) {
      const subMenu =
        await CommonModel.GetMasterListDetails({
          table: "menu_master",
          where: {
            "t.parentID = ?":
              row.menuID,
          },
          other: {
            orderBy:
              "menuIndex",
            order: "ASC",
          },
        });

      menuData.push({
        ...row,
        subMenu,
      });
    }

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data: menuData,
        pagination: {
          total,
          page:
            currentPage,
          limit,
          totalPages,
          start:
            total === 0
              ? 0
              : start + 1,
          end: Math.min(
            start + limit,
            total
          ),
        },
      },
    });
  } catch (error) {
    console.log(error);

    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message:
        error.message,
    });
  }
};

// =====================================================
// GET SINGLE MENU
// =====================================================
export const details = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await CommonModel.GetMasterListDetails({ table: "menu_master", where: { "t.menuID = ?": id, }, });

    if (!rows.length) {
      return failureResponse(res,
        {
          code: 2004,
          httpStatus: 404,
          message: "Menu not found",
        }
      );
    }

    return successResponse(res, {
      data: { data: rows[0] },
    });
  } catch (error) {
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};

// =====================================================
// CREATE MENU
// =====================================================
export const create = async (req, res) => {
  try {
    const { SadminID = 1, custom_module = "no", } = req.body;

    const menuPayload = {
      ...req.body,
      created_by: SadminID,
      created_date: toMysqlDateTime(),
    };

    if (custom_module !== "yes") {
      menuPayload.module_name = String(menuPayload.module_name || "")
        .trim()
        .toLowerCase()
        .replaceAll(
          " ",
          "_"
        );

      menuPayload.menuLink = menuPayload.module_name;
      if (!menuPayload.table_name) {
        menuPayload.table_name = menuPayload.module_name;
      }
    }

    const data = await buildTablePayload("menu_master", menuPayload);

    const result = await CommonModel.saveMasterDetails({ table: "menu_master", data, });

    return successResponse(res, {
      code: 1001,
      message: "Menu created successfully",
      data: {
        data: { id: result.insertId },
      },
    });
  } catch (error) {
    return failureResponse(
      res,
      {
        code: 2008,
        httpStatus: 500,
        message:
          error.message,
      }
    );
  }
};

// =====================================================
// UPDATE MENU
// =====================================================
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { SadminID = 1, } = req.body;

    const data = await buildTablePayload("menu_master", {
      ...req.body,
      modified_by: SadminID,
      modified_date: toMysqlDateTime(),
    });

    await CommonModel.updateMasterDetails({ table: "menu_master", data, where: { menuID: id, }, });

    return successResponse(res, {
      code: 1002,
      message: "Menu updated successfully",
    });
  } catch (error) {
    return failureResponse(
      res,
      {
        code: 2008,
        httpStatus: 500,
        message: error.message,
      }
    );
  }
};

// =====================================================
// DELETE MENU
// =====================================================
export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await CommonModel.deleteMasterDetails({ table: "menu_master", where: { menuID: id, }, });

    return successResponse(res, {
      code: 1003,
      message: "Menu deleted successfully",
    });
  } catch (error) {
    return failureResponse(res,
      {
        code: 2008,
        httpStatus: 500,
        message: error.message,
      }
    );
  }
};

// =====================================================
// GET SIDEBAR MENU
// =====================================================
export const getMenuList = async (req, res) => {

  try {
    // { select, table: MODULE_TABLE, where, values, limit, start, join, other }
    const parents = await CommonModel.GetMasterListDetails({
      select: '*',
      table: "menu_master",
      where: [
        "t.status = ?",
        "t.isParent = ?",
      ],
      values: [
        "active",
        "yes"
      ],
      other: {
        orderBy: "menuIndex",
        order: "ASC",
      },
    }
    );

    for (const row of parents) {
      console.log(row);

      const subMenu = await CommonModel.GetMasterListDetails({
        table: "menu_master",
        where: [
          "t.status = ?",
          "t.isParent = ?",
          "t.parentID = ?"
        ],
        values: [
          "active",
          "no",
          row.menuID,
        ],
        other: {
          orderBy: "menuIndex",
          order: "ASC",
        },
      }
      );

      row.subMenu = subMenu;
    }
    // console.log(parents);

    return successResponse(res, {
      data: { data: parents },
    });
  } catch (error) {
    return failureResponse(
      res,
      {
        code: 2008,
        httpStatus: 500,
        message: error.message,
      }
    );
  }
};

export const updatePositions = async (req, res) => {
  try {
    const { positions = [] } = req.body;

    if (!Array.isArray(positions) || !positions.length) {
      return failureResponse(res, {
        code: 2000,
        httpStatus: 400,
        message: "Invalid positions data",
      });
    }

    for (const row of positions) {
      await CommonModel.updateMasterDetails({
        table: "menu_master",
        data: {
          parentID: row.parentID || 0,
          menuIndex: row.menuIndex || 1,
        },
        where: {
          menuID: row.menuID,
        },
      });
    }

    return successResponse(res, {
      code: 1002,
      httpStatus: 200,
      message: "Menu positions updated successfully",
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
