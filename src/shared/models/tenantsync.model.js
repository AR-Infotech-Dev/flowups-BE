import { runWithDb } from "#config/db.context.js";
import { getTenantDbPool } from "#config/database.js";
import * as CommonModel from "#shared/models/common.model.js";

export const runOnTenantDb = async (company, callback) => {
    const tenantDb = await getTenantDbPool(company);
    return runWithDb(tenantDb, callback);
};