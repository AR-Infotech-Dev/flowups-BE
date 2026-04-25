import * as CommonModel from "../models/common.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { prepareFilterData } from "../utils/filter.builder.js";
import { validate } from "../utils/request.validator.js";
import Joi from 'joi';

const MODULE_TABLE = "tickets"

const ticketSchema = Joi.object({
    // Primary Key (usually handled by DB, but good for POST/GET checks)
    ticket_id: Joi.number().integer().positive().allow(null),
    // Required Integer fields
    client_id: Joi.number().integer().required(),
    query_type: Joi.number().integer().required(),
    company_id: Joi.number().integer().allow(null),
    // Optional Integer fields (Assignee/Status/Priority might be null initially)
    reason: Joi.string().allow(null),
    assignee: Joi.number().integer().allow(null),
    ticket_status: Joi.number().integer().default(205),
    status: Joi.string().default('active'),
    ticket_priority: Joi.number().integer().default(0),
    // String fields with Length Constraints (matching VARCHAR)
    contact_no: Joi.string().max(15).pattern(/^[0-9+\s-]*$/).messages({ 'string.pattern.base': 'Contact number contains invalid characters.' }),
    contact_person: Joi.string().required(),
    // TEXT field
    description: Joi.string().allow('', null),
    // Date fields
    start_date: Joi.date().iso().allow(null),
    due_date: Joi.date().iso().greater(Joi.ref('start_date')).allow(null).messages({ 'date.greater': 'Due date must be after the start date.' }),
    created_by: Joi.number().integer().allow(null),
    modified_by: Joi.number().integer().allow(null),
});
// ======================================================
// LIST USERS
// ======================================================
const default_columns = {
    ticket_priority: { table: "categories", alias: "cat", column: "categoryName", key2: "category_id", select: "" },
    ticket_status: { table: "categories", alias: "ca", column: "categoryName", key2: "category_id", select: "ca.cat_color AS status_color" },
    query_type: { table: "categories", alias: "ct", column: "categoryName", key2: "category_id", select: "ct.cat_color AS type_color" },
    assignee: { table: "admin", alias: "a", column: "name", key2: "adminID", select: "" },
    client_id: { table: "customer", alias: "cs", column: "name", key2: "customer_id", select: "" },
    // project_id: { table: "projects", alias: "p", column: "title", key2: "project_id", select: "" }
};

const custom_columns = {
    company_id: { table: "info_settings", alias: "dc", column: "companyName", key2: "infoID", select: "" },
    modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "" },
    created_by: { table: "admin", alias: "ad", column: "name", key2: "adminID", select: "" }
};

export const list = async (req, res) => {
    try {
        const { client_id = null, page = 1, searchText = '', getAll = "N", orderBy = "created_date", order = "ASC", filters } = req.body;
        const limit = 10;
        const currentPage = Number(page) || 1;
        const start = (currentPage - 1) * limit;
        const freeTextSearch = searchText || '';
        // const wherec = {};
        // const join = [];
        // const other = { orderBy, order , searchText, freeTextSearch ,  };
        const other1 = { orderBy: 'ticket_id', order: 'DESC', searchColumns: ['name', 'userName', 'email'] };
        const filterData = prepareFilterData({ filters, searchText, other: other1, default_columns, custom_columns })
        const { select, where, values, join, other } = filterData;

        const total = await CommonModel.getCountsByParameter({ table: MODULE_TABLE, where, values, join, other });
        const totalPages = Math.ceil(total / limit);

        let end = start + limit;
        if (end > total) end = total;

        if (client_id) {
            where.push(`client_id = ${client_id}`);
        }

        let adminDetails = [];
        if (getAll === "Y") {
            let select1 = select + " , t.user_id as user_id, u.name as user_name,cs.customer_id as client_id,cs.name as client_name"
            adminDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, join, other });
        } else {
            let select1 = select + " , t.user_id as user_id, u.name as user_name,cs.customer_id as client_id,cs.name as client_name,";
            adminDetails = await CommonModel.GetMasterListDetails({ select, table: MODULE_TABLE, where, values, limit, start, join, other });
        }
        return successResponse(res, {
            code: 1004,
            httpStatus: 200,
            data: {
                data: adminDetails,
                pagination: {
                    total,
                    page: currentPage,
                    limit,
                    totalPages,
                    start: total === 0 ? 0 : start + 1,
                    end,
                }
            }
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
// CREATE / UPDATE / GET SINGLE
// ======================================================
export const getTicketDetails = async (req, res) => {
    try {
        const method = req.method.toUpperCase();
        const { id: ticket_id = null } = req.params;
        const body = req.body
        let data = {};
        if (method != 'GET') {
            const result = validate(ticketSchema, body);
            if (!result.isValid) {
                return failureResponse(res, {
                    code: 2004,
                    httpStatus: 404,
                    message: result.message.replace(/"/g, '')
                });
            }
            data = result.value;
        }

        switch (method) {
            case "PUT": {
                const next_id = await CommonModel.getNextID(MODULE_TABLE, 'ticket_id');

                data['created_by'] = req.user.adminID;
                data['created_date'] = new Date();

                data['ticket_no'] = `TKT-${next_id}`;

                const result = await CommonModel.saveMasterDetails({ table: MODULE_TABLE, data: data });
                return successResponse(res, {
                    code: 1001,
                    httpStatus: 201,
                    data: {
                        insertId: result.insertId,
                    },
                });
            }

            case "POST": {
                if (!ticket_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                data['modified_by'] = req.user.adminID;
                data['modified_date'] = new Date();

                await CommonModel.updateMasterDetails({ table: MODULE_TABLE, data, where: { ticket_id } });

                return successResponse(res, {
                    code: 1002,
                    httpStatus: 200,
                    data: [],
                });
            }

            case "GET": {
                if (!ticket_id) {
                    return failureResponse(res, {
                        code: 2004,
                        httpStatus: 404,
                    });
                }

                const details = await CommonModel.getMasterDetails(MODULE_TABLE, "*", { ticket_id });

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
            message: error.message,
            code: 2008,
            httpStatus: 500,
        });
    }
};

// ======================================================
// CHANGE STATUS / DELETE
// ======================================================
export const changeStatus = async (req, res) => {
    try {
        const { action = "", ids = [], status = "Y" } = req.body;
        switch (action.trim().toLowerCase()) {
            case "delete":
                await CommonModel.deleteMasterDetails({ table: MODULE_TABLE, where: { 'ticket_id': ids } });
                return successResponse(res, {
                    code: 1003,
                    httpStatus: 200,
                    data: [],
                });

            case "changestatus":
                await CommonModel.changeMasterStatus(MODULE_TABLE, status, ids);
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
            message: error.message
        });
    }
};