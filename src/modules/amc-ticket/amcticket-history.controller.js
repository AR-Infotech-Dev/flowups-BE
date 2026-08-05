import * as CommonModel from "#shared/models/common.model.js";
import { successResponse, failureResponse } from "#shared/utils/apiResponse.js";

const MODULE_TABLE = "ticket_history"

export const history = async (req, res) => {
    try {
        const { ticket_id, } = req.body;

        if (!ticket_id) {
            return failureResponse(res,
                {
                    code: 2001,
                    httpStatus: 400,
                    message: "ticket_id is required",
                }
            );
        }
        const select = `t.*, cb.name AS changed_by_name,CASE WHEN t.field_name IN ( 'ticket_status','ticket_priority','query_type') THEN c_old.categoryName WHEN t.field_name IN ( 'assignee', 'changed_by' ) THEN a_old.name ELSE t.old_value END  AS old_label, CASE WHEN t.field_name IN ( 'ticket_status', 'ticket_priority', 'query_type' ) THEN c_new.categoryName WHEN t.field_name IN ( 'assignee', 'changed_by') THEN a_new.name ELSE t.new_value END AS new_label`;
        const join = [
            {
                type: "LEFT JOIN",
                table: "admin",
                alias: "cb",
                key1: "changed_by",
                key2: "adminID",
            },
            {
                type: "LEFT JOIN",
                table: "categories",
                alias: "c_old",
                key1: "old_value",
                key2: "category_id",
            },
            {
                type: "LEFT JOIN",
                table: "categories",
                alias: "c_new",
                key1: "new_value",
                key2: "category_id",
            },
            {
                type: "LEFT JOIN",
                table: "admin",
                alias: "a_old",
                key1: "old_value",
                key2: "adminID",
            },
            {
                type: "LEFT JOIN",
                table: "admin",
                alias: "a_new",
                key1: "new_value",
                key2: "adminID",
            },
        ];

        const where = ["t.ticket_id = ?",];
        const values = [ticket_id,];
        const other = {
            orderBy: "history_id",
            order: "DESC",
        };

        const rows = await CommonModel.GetMasterListDetails({ select, table: "ticket_history", where, values, join, other });

        return successResponse(res,
            {
                code: 1004,
                httpStatus: 200,
                data: { data: rows, },
            }
        );
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
