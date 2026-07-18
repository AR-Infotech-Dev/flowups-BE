import { getDbPool, getTenantDbPool } from "#config/database.js";
import { runWithDb } from "#config/db.context.js";
import { getCompanyDbConfig } from "#shared/models/common.model.js";
import morgan from "morgan";

morgan.token("own_db_enabled", (req, res) => {
    return res.locals.own_db_enabled || "no";
});

morgan.token("active_db", (req, res) => {
    return res.locals.active_db || "MAIN_DB";
});

export const tenantDbMiddleware = async (req, res, next) => {
    try {
        let activeDb = getDbPool();
        res.locals.active_db = "MAIN_DB";
        res.locals.own_db_enabled = "no";
        req.own_db_enabled = "no";

        const companyId = req.user?.company_id;
        if (companyId) {
            const company = await runWithDb(getDbPool(), () => getCompanyDbConfig(companyId));
            const ownDbEnabled = company?.own_db_enabled === "yes";
            res.locals.own_db_enabled = ownDbEnabled ? "yes" : "no";
            res.locals.active_db = ownDbEnabled ? `TENANT_DB:${company.db_name}@${company.db_host}` : "MAIN_DB";
            req.own_db_enabled = ownDbEnabled ? "yes" : "no";
            req.tenant_db_name = ownDbEnabled ? company.db_name : "";

            if (ownDbEnabled) {
                activeDb = await getTenantDbPool(company);
            }
        }

        return runWithDb(activeDb, next);
    } catch (error) {
        return next(error);
    }
};
