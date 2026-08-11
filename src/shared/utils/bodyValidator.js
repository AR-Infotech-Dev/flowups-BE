const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

export const validateBody = (body = {}, fieldRules = {}) => {
  const data = {};

  for (const [key, rule] of Object.entries(fieldRules)) {
    const {
      label = key,
      required = false,
      type = "string",
      min,
      max,
    } = rule;

    const value = body[key];

    // Required validation
    if (required && isEmpty(value)) {
      return {
        isValid: false,
        message: `${label} is required`,
        field: key,
        data: {},
      };
    }

    // Optional field not provided
    if (isEmpty(value)) {
      continue;
    }

    // Email validation
    if (type === "email") {
      const email = String(value).trim();

      if (!EMAIL_REGEX.test(email)) {
        return {
          isValid: false,
          message: `${label} must be a valid email`,
          field: key,
          data: {},
        };
      }

      if (min !== undefined && email.length < min) {
        return {
          isValid: false,
          message: `${label} must contain at least ${min} characters`,
          field: key,
          data: {},
        };
      }

      if (max !== undefined && email.length > max) {
        return {
          isValid: false,
          message: `${label} must not exceed ${max} characters`,
          field: key,
          data: {},
        };
      }

      data[key] = email;
      continue;
    }

    // Date validation
    if (type === "date") {
      if (Number.isNaN(Date.parse(value))) {
        return {
          isValid: false,
          message: `${label} must be a valid date`,
          field: key,
          data: {},
        };
      }

      data[key] = value;
      continue;
    }

    // Number validation
    if (type === "number") {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue)) {
        return {
          isValid: false,
          message: `${label} must be a valid number`,
          field: key,
          data: {},
        };
      }

      if (min !== undefined && numberValue < min) {
        return {
          isValid: false,
          message: `${label} must be at least ${min}`,
          field: key,
          data: {},
        };
      }

      if (max !== undefined && numberValue > max) {
        return {
          isValid: false,
          message: `${label} must not be greater than ${max}`,
          field: key,
          data: {},
        };
      }

      data[key] = numberValue;
      continue;
    }

    // String validation
    if (type === "string") {
      const stringValue = String(value).trim();

      if (min !== undefined && stringValue.length < min) {
        return {
          isValid: false,
          message: `${label} must contain at least ${min} characters`,
          field: key,
          data: {},
        };
      }

      if (max !== undefined && stringValue.length > max) {
        return {
          isValid: false,
          message: `${label} must not exceed ${max} characters`,
          field: key,
          data: {},
        };
      }

      data[key] = stringValue;
      continue;
    }

    data[key] = value;
  }

  return {
    isValid: true,
    message: "Validation successful",
    field: null,
    data,
  };
};