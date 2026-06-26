CREATE TABLE ab_user_location_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,

  adminID INT NOT NULL,
  company_id INT DEFAULT NULL,

  event_type ENUM('signin', 'signout') NOT NULL,

  latitude VARCHAR(45) DEFAULT NULL,
  longitude VARCHAR(45) DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL,

  alive_data JSON DEFAULT NULL,

  status ENUM('active', 'inactive') DEFAULT 'active',

  created_by INT DEFAULT NULL,
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_by INT DEFAULT NULL,
  modified_date DATETIME DEFAULT NULL,

  INDEX idx_user_location_logs_adminID (adminID),
  INDEX idx_user_location_logs_event_type (event_type),
  INDEX idx_user_location_logs_created_date (created_date),
  INDEX idx_user_location_logs_company_id (company_id)
);