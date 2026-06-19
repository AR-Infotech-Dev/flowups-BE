export const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
export const toDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};
export const formatDate = (date) => {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
export const getDaysLeft = (expiryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
export const getExpiryStatus = (daysLeft, expiringDays) => {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= expiringDays) return "expiring_soon";
  return "valid";
};
export const getSortValue = (row, orderBy) => {
  const map = {
    customer_name: row.customer_name,
    product_name: row.product_name,
    serial_number: row.serial_number,
    expiry_date: row.expiry_date,
    days_left: row.days_left,
    expiry_status: row.expiry_status,
    company_name: row.company_name,
  };

  return map[orderBy] ?? row.expiry_date;
};

