import * as CommonModel from "#shared/models/common.model.js";

const MODULE_TABLE = "notifications";

export const getNotifications = async ({ userId, page = 1, limit = 20 }) => {
  const numericPage = Number(page);
  const numericLimit = Number(limit);
  const start = (numericPage - 1) * numericLimit;
  const where = ["user_id = ?"];
  const values = [userId];

  const total = await CommonModel.getCountsByParameter({
    table: MODULE_TABLE,
    where,
    values,
  });

  const data = await CommonModel.GetMasterListDetails({
    select: `
      t.notification_id,
      t.title,
      t.message,
      t.notification_type,
      t.module_name,
      t.reference_id,
      t.is_read,
      t.created_date
    `,
    table: MODULE_TABLE,
    where,
    values,
    limit: numericLimit,
    start,
    other: {
      orderBy: "t.notification_id",
      order: "DESC",
    },
  });

  return {
    data,
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      totalPages: Math.ceil(total / numericLimit),
    },
  };
};

export const getUnreadCount = async (userId) => {
  return CommonModel.getCountsByParameter({
    table: MODULE_TABLE,
    where: [
      "user_id = ?",
      "is_read = ?",
    ],
    values: [
      userId,
      "n",
    ],
  });
};

export const markAsRead = async ({ notificationId, userId }) => {
  if (!notificationId) {
    return { updated: false };
  }

  const result = await CommonModel.updateMasterDetails({
    table: MODULE_TABLE,
    data: {
      is_read: "y",
      read_date: new Date(),
    },
    where: {
      notification_id: notificationId,
      user_id: userId,
    },
  });

  return { updated: Boolean(result.affectedRows) };
};

export const markAllAsRead = async (userId) => {
  await CommonModel.updateMasterDetails({
    table: MODULE_TABLE,
    data: {
      is_read: 1,
      read_date: new Date(),
    },
    where: {
      user_id: userId,
      is_read: 0,
    },
  });
};
