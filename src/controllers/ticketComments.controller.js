import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";

const MODULE_TABLE = "tickets_comments";

const default_columns = {
    ticket_id: { table: "tickets", alias: "tk", column: "ticket_id", key2: "ticket_id", select: "tk.ticket_id" },
    user_id: { table: "admin", alias: "u", column: "name", key2: "adminID", select: "u.name as user_id" },
};

const custom_columns = {
    modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "am.name as modify_by_name" },
};

// ======================================================
// LIST TICKET COMMENTS
// ======================================================
export const list = async (req, res) => {
    try {
        const {
            ticket_id = null,
            record_type = "",
            page = 1,
            searchText = "",
            getAll = "N",
            orderBy = "created_date",
            order = "ASC",
            filters,
        } = req.body;

        const limit = 10;
        const currentPage = Number(page) || 1;
        const start = (currentPage - 1) * limit;
        const other1 = { orderBy, order, searchColumns: ["comment_text"] };
        const filterData = prepareFilterData({ filters, searchText, other: other1, default_columns, custom_columns });
        const { select, where, values, join, other } = filterData;

        other.freeTextSearch = searchText;
        other.searchColumns = ["t.comment_text"];

        if (ticket_id) {
            where.push("t.ticket_id = ?");
            values.push(ticket_id);
        }

        if (record_type) {
            where.push("t.record_type = ?");
            values.push(record_type);
        }

        const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });
        const totalPages = Math.ceil(total / limit);
        const end = Math.min(start + limit, total);

        let commentDetails = [];
        if (getAll === "Y") {
            let select1 = select + " , t.user_id as user_id, u.name as user_name"
            commentDetails = await CommonModel.GetMasterListDetails({ select: select1, table: MODULE_TABLE, where, values, join, other });
        } else {
            commentDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other });
        }

        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: commentDetails,
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
export const getTicketCommentDetails = async (req, res) => {
    try {
        const method = req.method.toUpperCase();
        const { id: comment_id = null } = req.params;
        let data = {};

        switch (method) {
            case "PUT": {
                const { ticket_id, record_type, comment } = req.body;

                if (!ticket_id || !record_type || !comment) {
                    return failureResponse(res, {
                        code: 2000,
                        httpStatus: 400,
                        message: "ticket_id, record_type and comment_text are required",
                    });
                }

                data = {
                    ticket_id,
                    record_type,
                    user_id: req.body.user_id || req.user.adminID,
                    comment_text: comment,
                    created_date: new Date(),
                };

                const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });

                return successResponse(res, {
                    code: 1001,
                    httpStatus: 201,
                    data: {
                        insertId: result.insertId,
                    },
                });
            }

            case "POST": {
                if (!comment_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                const { comment } = req.body;
                if (!comment) {
                    return failureResponse(res, {
                        code: 2000,
                        httpStatus: 400,
                        message: "comment_text is required",
                    });
                }

                data = {
                    comment_text: comment,
                    modified_by: req.user.adminID,
                    modified_date: new Date(),
                };

                const result = await CommonModel.updateMasterDetails({
                    table: MODULE_TABLE,
                    data,
                    where: { comment_id },
                });

                if (!result.affectedRows) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                return successResponse(res, {
                    code: 1002,
                    httpStatus: 200,
                    data: [],
                });
            }

            case "GET": {
                if (!comment_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                const details = await CommonModel.getMasterDetails(MODULE_TABLE, "*", { comment_id });

                if (!details.length) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                return successResponse(res, {
                    code: 1004,
                    httpStatus: 200,
                    data: { data: details[0] },
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
// DELETE
// ======================================================
export const deleteTicketComment = async (req, res) => {
    try {
        const ids = req.body.ids || (req.body.comment_id ? [req.body.comment_id] : []);

        if (!Array.isArray(ids) || !ids.length) {
            return failureResponse(res, {
                code: 2000,
                httpStatus: 400,
                message: "ids are required",
            });
        }

        const result = await CommonModel.deleteMasterDetails({
            table: MODULE_TABLE,
            where: { comment_id: ids },
        });

        if (!result.affectedRows) {
            return failureResponse(res, {
                code: 2004,
                httpStatus: 404,
            });
        }

        return successResponse(res, {
            code: 1003,
            httpStatus: 200,
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
