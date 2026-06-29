CREATE TABLE `ticket_management`.`ab_customer_contacts` (
  `contact_id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `name` VARCHAR(45) NULL,
  `designation` VARCHAR(45) NULL,
  `mobile_no` VARCHAR(45) NULL,
  `email` VARCHAR(45) NULL,
  `is_primary` ENUM('y', 'n') NULL DEFAULT 'n',
  `department` VARCHAR(45) NULL,
  `created_by` INT NULL,
  `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_by` INT NULL,
  `modified_date` DATETIME NOT NULL,
  PRIMARY KEY (`contact_id`));
