import { query, DB_PREFIX } from "../config/database.js";

// =====================================
// LAST INSERT ID
// =====================================
export const getLastInsertedID = (result) => {
    return result?.insertId || 0;
};
export const getNextID = async (table = "",primary_key="") => {
    let sql = `SELECT IFNULL(MAX(${primary_key}), 0) + 1 AS next_id FROM ${DB_PREFIX}${table};`;
    const result = await query(sql);
    return result[0].next_id;
};

// =====================================
// GET COUNT BY PARAMETER
// =====================================
// export const getCountByParameter = async (select = "*", table = "", where = {}, other = {}, join = []) => {
//     let sql = `SELECT ${select} FROM ${DB_PREFIX}${table} as t`;

//     // JOIN
//     if (join && join.length) {
//         join.forEach((j) => {
//             const key1 = j.key1Alias ? `${j.key1Alias}.${j.key1}` : `t.${j.key1}`;
//             sql += ` ${j.type} JOIN ${DB_PREFIX}${j.table} as ${j.alias} ON ${key1} = ${j.alias}.${j.key2}`;
//         });
//     }

//     const conditions = [];

//     // WHERE
//     Object.entries(where).forEach(
//         ([key, value]) => { conditions.push(`${key} ${value}`); }
//     );

//     // WHERE OR
//     if (other.whereOR) {
//         Object.entries(other.whereOR).forEach(([key, value]) => {
//             conditions.push(`${key} ${value}`);
//         });
//     }

//     if (conditions.length) {
//         sql += ` WHERE ${conditions.join(" AND ")}`;
//     }
//     const rows = await query(sql);
//     return rows.length;
// };

// // =====================================
// // GET MASTER LIST DETAILS
// // =====================================
// export const GetMasterListDetails = async (select = "*", table = "", where = {}, limit = "", start = "", join = [], other = {}) => {
//     let sql = `SELECT ${select} FROM ${DB_PREFIX}${table} as t`;
//     // JOIN
//     if (join.length) {
//         join.forEach((j) => {
//             const key1 = j.key1Alias ? `${j.key1Alias}.${j.key1}` : `t.${j.key1}`;
//             sql += ` ${j.type} JOIN ${DB_PREFIX}${j.table} as ${j.alias} ON ${key1} = ${j.alias}.${j.key2}`;
//         });
//     }

//     const conditions = [];

//     // WHERE
//     Object.entries(where).forEach(([key, value]) => {
//         conditions.push(`${key} ${value}`);
//     }
//     );

//     if (conditions.length) {
//         sql += ` WHERE ${conditions.join(" AND ")}`;
//     }

//     // GROUP BY
//     if (other.groupBy) {
//         sql += ` GROUP BY ${other.groupBy}`;
//     }

//     // ORDER BY
//     if (other.orderBy) {
//         sql += ` ORDER BY ${other.orderBy} ${other.order || "ASC"}`;
//     }

//     // LIMIT
//     if (limit !== "") {
//         sql += ` LIMIT ${start || 0}, ${limit}`;
//     }
//     return await query(sql);
// };

// =====================================
// GET MASTER DETAILS
// =====================================
export const getMasterDetails = async (table = "", select = "*", where = {}) => {
    let sql = ` SELECT ${select} FROM ${DB_PREFIX}${table}`;

    const values = [];
    const conditions = [];

    Object.entries(where).forEach(([key, value]) => {
        conditions.push(`${key} = ?`);
        values.push(value);
    });

    if (conditions.length) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    return await query(sql, values);
};

// // =====================================
// // INSERT
// // =====================================
// export const saveMasterDetails = async (table = "", data = {}) => {
//     const keys = Object.keys(data);
//     const values = Object.values(data);
//     const sql = `INSERT INTO ${DB_PREFIX}${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
//     return await query(sql, values);
// };

// // =====================================
// // UPDATE
// // =====================================
// export const updateMasterDetails = async (table = "", data = {}, where = {}) => {
//     const setClause = Object.keys(data).map((k) => `${k} = ?`).join(", ");
//     const whereClause = Object.keys(where).map((k) => `${k} = ?`).join(" AND ");
//     const sql = `UPDATE ${DB_PREFIX}${table} SET ${setClause} WHERE ${whereClause}`;

//     return await query(sql,
//         [
//             ...Object.values(data),
//             ...Object.values(where),
//         ]
//     );
// };

// // =====================================
// // DELETE
// // =====================================
// export const deleteMasterDetails = async (table = "", where = {}) => {
//     const keys = Object.keys(where);
//     if (!table || keys.length === 0) {
//         throw new Error("Table name and where conditions are required");
//     }
//     const whereParts = [];
//     const values = [];
//     keys.forEach((key) => {
//         const value = where[key];
//         if (Array.isArray(value)) {
//             const placeholders = value.map(() => "?").join(", ");
//             whereParts.push(`${key} IN (${placeholders})`);
//             values.push(...value);
//         } else {
//             whereParts.push(`${key} = ?`);
//             values.push(value);
//         }
//     });

//     const whereClause = whereParts.join(" AND ");
//     const sql = `DELETE FROM ${DB_PREFIX}${table} WHERE ${whereClause}`;
//     const result = await query(sql, values);

//     return result;
// };

// // =====================================
// // CHANGE STATUS
// // =====================================
// export const changeMasterStatus = async (table = "", statusCode = "", ids = "", primaryID = "id", adminID = 0) => {
//     // const idList = ids.split(",");
//     const placeholders = ids.map(() => "?").join(",");
//     const sql = `UPDATE ${DB_PREFIX}${table} SET status = ?, modified_date = NOW(), modified_by = ? WHERE ${primaryID} IN (${placeholders})`;
//     return await query(sql,
//         [
//             adminID,
//             ...ids,
//         ]
//     );
// };


// =====================================
// GET COUNTS BY PARAMETER
// =====================================
export const getCountsByParameter = async ({ table = "", where = [], values = [], join = [], other = {} } = {}) => {

    let sql = `SELECT COUNT(*) AS total FROM ${DB_PREFIX}${table} t`;

    const params = [...values];

    // JOIN
    if (join.length) {
        join.forEach(({ type = "LEFT", table, alias, key1, key2, key1Alias = "t" }) => {
            sql += ` ${type} ${DB_PREFIX}${table} ${alias} ON ${key1Alias}.${key1} = ${alias}.${key2} `;
        });
    }

    // WHERE
    const whereParts = [];

    if (where.length) {
        whereParts.push(...where);
    }

    // WHERE IN
    if (other.whereIn && other.whereData?.length) {
        const placeholders = other.whereData.map(() => "?").join(",");
        whereParts.push(`${other.whereIn} IN (${placeholders})`);
        params.push(...other.whereData);
    }

    // FREE TEXT SEARCH
    if (other.freeTextSearch && other.searchColumns?.length) {
        const searchParts = other.searchColumns.map((col) => `${col} LIKE ?`);
        whereParts.push(`(${searchParts.join(" OR ")})`);

        other.searchColumns.forEach(() => {
            params.push(`%${other.freeTextSearch}%`);
        });
    }

    if (whereParts.length) {
        sql += ` WHERE ${whereParts.join(" AND ")}`;
    }

    const rows = await query(sql, params);
    return rows[0]?.total || 0;
};
// export const getCountsByParameter = async ({ table = "", where = {}, join = [], other = {} } = {}) => {
//     let sql = `SELECT COUNT(*) AS total FROM ${DB_PREFIX}${table} t`;
//     const values = [];

//     // JOIN
//     if (join.length) {
//         join.forEach((item) => {
//             sql += `
//         ${item.type || "LEFT"} JOIN ${DB_PREFIX}${item.table} ${item.alias}
//         ON ${(item.key1Alias || "t")}.${item.key1} = ${item.alias}.${item.key2}
//       `;
//         });
//     }

//     // WHERE
//     const whereParts = [];

//     Object.keys(where).forEach((key) => {
//         whereParts.push(key); // already contains ? condition
//     });
//     // Object.keys(where).forEach((key) => {
//     //     whereParts.push(`${key} ${where[key]}`);
//     // });

//     // WHERE IN
//     if (other.whereIn && other.whereData?.length) {
//         const placeholders = other.whereData.map(() => "?").join(",");
//         whereParts.push(`${other.whereIn} IN (${placeholders})`);
//         values.push(...other.whereData);
//     }

//     // FREE TEXT SEARCH
//     if (other.freeTextSearch && other.searchColumns?.length) {
//         const searchParts = other.searchColumns.map((col) => `${col} LIKE ?`);
//         whereParts.push(`(${searchParts.join(" OR ")})`);

//         other.searchColumns.forEach(() => {
//             values.push(`%${other.freeTextSearch}%`);
//         });
//     }

//     if (whereParts.length) {
//         sql += ` WHERE ${whereParts.join(" AND ")}`;
//     }

//     const rows = await query(sql, [...values]);

//     return rows[0]?.total || 0;
// };
// =====================================
// GET MASTER LIST
// =====================================
// export const GetMasterListDetails = async ({ select = "*", table = "", where = {}, limit = "", start = "", join = [], other = {} } = {}) => {
//     let sql = `SELECT ${select} FROM ${DB_PREFIX}${table} t`;
//     const values = [];

//     // JOIN
//     if (join.length) {
//         join.forEach((item) => {
//             sql += `
//                     ${item.type || "LEFT"} JOIN ${DB_PREFIX}${item.table} ${item.alias}
//                     ON ${(item.key1Alias || "t")}.${item.key1} = ${item.alias}.${item.key2}
//                 `;
//         });
//     }

//     // WHERE
//     const whereParts = [];

//     Object.keys(where).forEach((key) => {
//         whereParts.push(key); // already contains ? condition
//     });

//     // WHERE IN
//     if (other.whereIn && other.whereData?.length) {
//         const placeholders = other.whereData.map(() => "?").join(",");
//         whereParts.push(`${other.whereIn} IN (${placeholders})`);
//         values.push(...other.whereData);
//     }

//     // FREE TEXT SEARCH
//     if (other.freeTextSearch && other.searchColumns?.length) {
//         const searchParts = other.searchColumns.map((col) => `${col} LIKE ?`);
//         whereParts.push(`(${searchParts.join(" OR ")})`);

//         other.searchColumns.forEach(() => {
//             values.push(`%${other.freeTextSearch}%`);
//         });
//     }

//     if (whereParts.length) {
//         sql += ` WHERE ${whereParts.join(" AND ")}`;
//     }

//     // GROUP BY
//     if (other.groupBy) {
//         sql += ` GROUP BY ${other.groupBy}`;
//     }

//     // ORDER BY
//     if (other.orderBy) {
//         sql += ` ORDER BY ${other.orderBy} ${other.order || "ASC"}`;
//     }

//     // LIMIT
//     if (limit !== "") {
//         sql += ` LIMIT ? OFFSET ?`;
//         values.push(Number(limit), Number(start || 0));
//     }

//     const rows = await query(sql, values);
//     return rows;
// };
export const GetMasterListDetails = async ({ select = "*", table = "", where = [], values = [], limit = "", start = "", join = [], other = {} } = {}) => {
    let sql = `SELECT ${select} FROM ${DB_PREFIX}${table} t`;
    const params = [...values];
    // JOIN
    if (join.length) {
        join.forEach(({ type = "LEFT", table, alias, key1, key2, key1Alias = "t" }) => {
            sql += ` ${type} ${DB_PREFIX}${table} ${alias} ON ${key1Alias}.${key1} = ${alias}.${key2} `;
        });
    }
    // WHERE
    const whereParts = [];
    if (where.length) {
        whereParts.push(...where);
    }
    // WHERE IN
    if (other.whereIn && other.whereData?.length) {
        const placeholders = other.whereData.map(() => "?").join(",");
        whereParts.push(`${other.whereIn} IN (${placeholders})`);
        params.push(...other.whereData);
    }
    // FREE TEXT SEARCH
    if (other.freeTextSearch && other.searchColumns?.length) {
        const searchParts = other.searchColumns.map((col) => `${col} LIKE ?`);
        whereParts.push(`(${searchParts.join(" OR ")})`);

        other.searchColumns.forEach(() => {
            params.push(`%${other.freeTextSearch}%`);
        });
    }
    if (whereParts.length) {
        sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    // GROUP BY
    if (other.groupBy) {
        sql += ` GROUP BY ${other.groupBy}`;
    }
    // ORDER BY
    if (other.orderBy) {
        sql += ` ORDER BY ${other.orderBy} ${other.order || "ASC"}`;
    }

    // LIMIT
    if (limit !== "") {
        const safeLimit = Number(limit) || 10;
        const safeStart = Number(start) || 0;

        sql += ` LIMIT ${safeLimit} OFFSET ${safeStart}`;
    }
    const rows = await query(sql, params);
    return rows;
};

// =====================================
// FILTERED COUNT
// =====================================
export const getFilteredCount = async ({ table = "", where = {}, join = [], other = {} } = {}) => {
    const rows = await GetMasterListDetails({
        select: "COUNT(*) as total",
        table,
        where,
        join,
        other,
    });

    return rows[0]?.total || 0;
};

// =====================================
// INSERT
// =====================================
export const saveMasterDetails = async ({ table = "", data = {} } = {}) => {
    const columns = Object.keys(data);
    const values = Object.values(data);

    const placeholders = columns.map(() => "?").join(",");

    const sql = `
    INSERT INTO ${DB_PREFIX}${table}
    (${columns.join(",")})
    VALUES (${placeholders})
  `;

    const result = await query(sql, values);
    return result;
};

// =====================================
// UPDATE
// =====================================
export const updateMasterDetails = async ({ table = "", data = {}, where = {} } = {}) => {
    const setParts = [];
    const values = [];

    Object.keys(data).forEach((key) => {
        setParts.push(`${key} = ?`);
        values.push(data[key]);
    });

    const whereParts = [];

    Object.keys(where).forEach((key) => {
        whereParts.push(`${key} = ?`);
        values.push(where[key]);
    });

    const sql = `UPDATE ${DB_PREFIX}${table} SET ${setParts.join(", ")} WHERE ${whereParts.join(" AND ")}`;

    const result = await query(sql, values);
    return result;
};

// =====================================
// DELETE
// =====================================
export const deleteMasterDetails = async ({ table = "", where = {} } = {}) => {
    const whereParts = [];
    const values = [];

    Object.keys(where).forEach((key) => {
        const val = where[key];

        if (Array.isArray(val)) {
            const placeholders = val.map(() => "?").join(",");
            whereParts.push(`${key} IN (${placeholders})`);
            values.push(...val);
        } else {
            whereParts.push(`${key} = ?`);
            values.push(val);
        }
    });

    const sql = `DELETE FROM ${DB_PREFIX}${table} WHERE ${whereParts.join(" AND ")}`;

    const result = await query(sql, values);
    return result;
};

// =====================================
// CHANGE STATUS
// =====================================
export const changeMasterStatus = async ({ table = "", status = "Y", ids = [], key = "adminID" } = {}) => {
    const placeholders = ids.map(() => "?").join(",");

    const sql = `
    UPDATE ${DB_PREFIX}${table}
    SET status = ?
    WHERE ${key} IN (${placeholders})
  `;

    const [result] = await query(sql, [status, ...ids]);
    return result;
};