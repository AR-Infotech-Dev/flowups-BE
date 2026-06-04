import crypto from "crypto";
import { DB_PREFIX, query } from "../config/database.js";

let ensuredActiveSessionColumn = false;
let ensureActiveSessionColumnPromise = null;

export function createActiveSessionId() {
  return crypto.randomUUID();
}

export async function ensureActiveSessionColumn() {
  if (ensuredActiveSessionColumn) {
    return;
  }

  if (!ensureActiveSessionColumnPromise) {
    ensureActiveSessionColumnPromise = (async () => {
      const rows = await query(`SHOW COLUMNS FROM ${DB_PREFIX}admin LIKE 'active_session_id'`);

      if (!rows.length) {
        await query(`ALTER TABLE ${DB_PREFIX}admin ADD COLUMN active_session_id VARCHAR(64) NULL`);
      }

      ensuredActiveSessionColumn = true;
    })();
  }

  return ensureActiveSessionColumnPromise;
}

export async function setActiveSessionId(adminID, activeSessionId) {
  await ensureActiveSessionColumn();

  return query(
    `UPDATE ${DB_PREFIX}admin SET active_session_id = ?, modified_date = NOW() WHERE adminID = ?`,
    [activeSessionId, adminID]
  );
}

export async function getActiveSessionId(adminID) {
  await ensureActiveSessionColumn();

  const rows = await query(
    `SELECT active_session_id FROM ${DB_PREFIX}admin WHERE adminID = ? LIMIT 1`,
    [adminID]
  );

  return rows[0]?.active_session_id || null;
}
