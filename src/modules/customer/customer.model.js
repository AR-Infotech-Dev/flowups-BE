import * as CommonModel from "#shared/models/common.model.js";
import { DB_PREFIX, query } from "#config/database.js";
import { MODULE_TABLE } from "./customer.constants.js";

export const getCustomerById = (customerId) => CommonModel.getMasterDetails(MODULE_TABLE, "*", { customer_id: customerId });

export const createCustomer = (data) => CommonModel.saveMasterDetails({table: MODULE_TABLE,data,});

export const updateCustomer = (customerId, data) => CommonModel.updateMasterDetails({table: MODULE_TABLE, data,where: { customer_id: customerId }, });

export const deleteCustomers = (ids = []) => CommonModel.deleteMasterDetails({table: MODULE_TABLE,where: { customer_id: ids },});

export const getCustomerTableColumns = async () => {
  const rows = await query(`SHOW COLUMNS FROM ${DB_PREFIX}${MODULE_TABLE}`);
  return new Set(rows.map((row) => row.Field));
};
