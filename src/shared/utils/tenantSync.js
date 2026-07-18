import { getDbPool } from "#config/database.js";
import { runWithDb } from "#config/db.context.js";
import { getCompanyDbConfig } from "#shared/models/common.model.js";
import { runOnTenantDb } from "#shared/models/tenantsync.model.js";

export const syncToTenant = async (company_id, callback) => {
    const company = await runWithDb(getDbPool(), () => getCompanyDbConfig(company_id));
    if (company?.own_db_enabled === "yes") {
        return await runOnTenantDb(company, callback);
    }
    return null;
};
