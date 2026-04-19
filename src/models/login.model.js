// models/login.model.js

import { query , DB_PREFIX} from "../config/database.js";

// ===================================
// VERIFY USER DETAILS
// ===================================
export const verifyUserDetails = async (userName) => {
  const sql = `
    SELECT t.*
    FROM ${DB_PREFIX}admin AS t
    WHERE (
      t.email = ?
      OR t.userName = ?
      OR t.contactNo = ?
    )
    AND t.status = 'active'
  `;

  return await query(sql, [userName, userName, userName]);
};

// ===================================
// UPDATE ADMIN INFO
// ===================================
export const saveadminInfo = async (data, adminID) => {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const setClause = keys.map((key) => `${key} = ?`).join(", ");

  const sql = `
    UPDATE admin
    SET ${setClause}
    WHERE adminID = ?
  `;

  return await query(sql, [...values, adminID]);
};

// ===================================
// INSERT SESSION KEY
// ===================================
export const setSessionKey = async (
  adminID,
  sessionKey,
  ip
) => {
  const sql = `
    INSERT INTO admin_sessions
    (
      adminID,
      sessionKey,
      accessDate,
      created_date,
      IP
    )
    VALUES (?, ?, NOW(), NOW(), ?)
  `;

  return await query(sql, [
    adminID,
    sessionKey,
    ip,
  ]);
};

// ===================================
// DELETE SESSION KEY
// ===================================
export const unsetSessionKey = async (
  adminID
) => {
  const sql = `
    DELETE FROM admin_sessions
    WHERE adminID = ?
  `;

  return await query(sql, [adminID]);
};

// ===================================
// GET SESSION DETAILS
// ===================================
export const getSessionDetails = async (
  adminID
) => {
  const sql = `
    SELECT *
    FROM admin_sessions
    WHERE adminID = ?
  `;

  return await query(sql, [adminID]);
};

// ===================================
// UPDATE SESSION TIME
// ===================================
export const updateSession = async (
  adminID
) => {
  const sql = `
    UPDATE admin_sessions
    SET accessDate = NOW()
    WHERE adminID = ?
  `;

  return await query(sql, [adminID]);
};

// ===================================
// UPDATE MOBILE DEVICE
// ===================================
export const updateDeviceDetails = async (
  data,
  deviceID
) => {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const setClause = keys.map((key) => `${key} = ?`).join(", ");

  const sql = `
    UPDATE mobileDevice
    SET ${setClause}
    WHERE deviceID = ?
  `;

  return await query(sql, [...values, deviceID]);
};

// ===================================
// GET MOBILE DEVICE DETAILS
// ===================================
export const getMobileDeviceDetails = async (
  deviceID
) => {
  const sql = `
    SELECT *
    FROM mobileDevice
    WHERE deviceID = ?
  `;

  return await query(sql, [deviceID]);
};

// ===================================
// SAVE MOBILE DEVICE
// ===================================
export const saveDeviceInfo = async (
  data
) => {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const sql = `
    INSERT INTO mobileDevice
    (${keys.join(",")})
    VALUES (${keys.map(() => "?").join(",")})
  `;

  return await query(sql, values);
};

// ===================================
// GET USER OS
// ===================================
export const getUserOS = (
  userAgent = ""
) => {
  const osList = [
    { regex: /windows nt 10/i, name: "Windows 10" },
    { regex: /windows nt 6.3/i, name: "Windows 8.1" },
    { regex: /windows nt 6.1/i, name: "Windows 7" },
    { regex: /android/i, name: "Android" },
    { regex: /iphone/i, name: "iPhone" },
    { regex: /ipad/i, name: "iPad" },
    { regex: /mac/i, name: "Mac OS" },
    { regex: /linux/i, name: "Linux" },
  ];

  const match = osList.find((os) =>
    os.regex.test(userAgent)
  );

  return match
    ? match.name
    : "Unknown OS";
};