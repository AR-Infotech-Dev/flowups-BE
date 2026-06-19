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

export const findCustomerByNameAndEmail = async ({ name = "", email = "", company_id = null } = {}) => {
  if (!name || !email) return null;

  const rows = await query(
    `
      SELECT customer_id
      FROM ${DB_PREFIX}${MODULE_TABLE}
      WHERE LOWER(TRIM(name)) = ?
        AND LOWER(TRIM(email)) = ?
        AND company_id <=> ?
      LIMIT 1
    `,
    [
      String(name).trim().toLowerCase(),
      String(email).trim().toLowerCase(),
      company_id,
    ],
  );

  return rows[0] || null;
};

const buildDuplicateKey = ({ name = "", email = "", company_id = null } = {}) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedName || !normalizedEmail) return "";
  return `${company_id ?? "no-company"}::${normalizedName}::${normalizedEmail}`;
};

export const findExistingCustomerDuplicateKeys = async (customers = []) => {
  const keys = new Set();
  const candidates = customers
    .map((customer) => ({
      name: String(customer.name || "").trim().toLowerCase(),
      email: String(customer.email || "").trim().toLowerCase(),
      company_id: customer.company_id ?? null,
    }))
    .filter((customer) => customer.name && customer.email);

  for (let index = 0; index < candidates.length; index += 500) {
    const batch = candidates.slice(index, index + 500);
    const whereParts = [];
    const params = [];

    batch.forEach((customer) => {
      whereParts.push("(LOWER(TRIM(name)) = ? AND LOWER(TRIM(email)) = ? AND company_id <=> ?)");
      params.push(customer.name, customer.email, customer.company_id);
    });

    if (!whereParts.length) continue;

    const rows = await query(
      `
        SELECT name, email, company_id
        FROM ${DB_PREFIX}${MODULE_TABLE}
        WHERE ${whereParts.join(" OR ")}
      `,
      params,
    );

    rows.forEach((row) => {
      const key = buildDuplicateKey(row);
      if (key) keys.add(key);
    });
  }

  return keys;
};

export const createCustomersBulk = async (customers = [], chunkSize = 500) => {
  if (!customers.length) return 0;

  let inserted = 0;

  for (let index = 0; index < customers.length; index += chunkSize) {
    const batch = customers.slice(index, index + chunkSize);
    const columns = Object.keys(batch[0] || {});
    const rowPlaceholder = `(${columns.map(() => "?").join(",")})`;
    const placeholders = batch.map(() => rowPlaceholder).join(",");
    const values = batch.flatMap((customer) => columns.map((column) => customer[column] ?? null));

    if (!columns.length || !values.length) continue;

    const result = await query(
      `
        INSERT INTO ${DB_PREFIX}${MODULE_TABLE}
        (${columns.join(",")})
        VALUES ${placeholders}
      `,
      values,
    );

    inserted += result?.affectedRows || batch.length;
  }

  return inserted;
};
