import mysql from "mysql2/promise";
import { env } from "./env.js";
import { getActiveDb } from "./db.context.js";

let pool;
let tenantDBPools = new Map();

export const DB_PREFIX = env.dbPrefix;

export function getDbPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      timezone: '+05:30',
      dateStrings: true
    });
  }

  return pool;
}

export const getTenantDbPool = async (company) => {
  const key = String(company.company_id);
  if (tenantDBPools.has(key)) {
    return tenantDBPools.get(key);
  }
  const pool = mysql.createPool({
    host: company.db_host,
    port: Number(company.db_port || 3306),
    user: company.db_username,
    password: company.db_password,
    database: company.db_name,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: "+05:30",
    dateStrings: true,
  });
  tenantDBPools.set(key, pool);
  return pool;
}

export async function query(sql, params = []) {
  const activeDb = getActiveDb() || getDbPool();

  const [rows] = await activeDb.execute(sql, params);
  return rows;
}