ALTER TABLE `ticket_management`.`ab_amc_reminder_logs` 
RENAME TO  `ticket_management`.`ab_reminder_logs` ;

ALTER TABLE `ticket_management`.`ab_reminder_logs` 
ADD COLUMN `related_to` ENUM('amc', 'product') NULL DEFAULT NULL AFTER `error_message`, RENAME TO  `ticket_management`.`ab_reminder_logs` ;

ALTER TABLE `ticket_management`.`ab_reminder_logs` 
ADD COLUMN `record_id` VARCHAR(250) NULL DEFAULT NULL AFTER `related_to`;

ALTER TABLE ab_company_master
ADD COLUMN ticket_prefix VARCHAR(20) DEFAULT 'TKT',
ADD COLUMN ticket_prefix_padding VARCHAR(20) DEFAULT null,
ADD COLUMN ticket_include_year ENUM('y','n') DEFAULT 'y',
ADD COLUMN ticket_no_reset ENUM('daily', 'monthly', 'yearly') NULL DEFAULT 'yearly';


