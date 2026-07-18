ALTER TABLE ab_company_master
ADD COLUMN own_db_enabled enum('yes','no') DEFAULT 'no',
ADD COLUMN db_type varchar(255) DEFAULT NULL,
ADD COLUMN db_host varchar(255) DEFAULT NULL,
ADD COLUMN db_port varchar(10) DEFAULT NULL,
ADD COLUMN db_name varchar(255) DEFAULT NULL,
ADD COLUMN db_username varchar(255) DEFAULT NULL,
ADD COLUMN db_password varchar(255) CHARACTER SET cp1256 COLLATE cp1256_general_ci DEFAULT NULL,
ADD COLUMN db_ssl_enabled enum('yes','no') DEFAULT 'no',
ADD COLUMN db_status enum('connected','not_connected') DEFAULT 'not_connected',
ADD COLUMN db_tested_at datetime DEFAULT NULL;

ALTER TABLE ab_tickets
ADD INDEX idx_tickets_company_base_order ( company_id, amc_call, call_direction, created_date, ticket_id ),
ADD INDEX idx_tickets_assignee_base ( assignee, amc_call, call_direction, created_date ),
ADD INDEX idx_tickets_created_base ( created_by, amc_call, call_direction, created_date );

ALTER TABLE ab_ticket_history
ADD INDEX idx_history_ticket_new ( ticket_id, field_name, action_type, new_value(50) ),
ADD INDEX idx_history_ticket_old ( ticket_id, field_name, action_type, old_value(50) ),
ADD INDEX idx_history_ticket_changed ( ticket_id, field_name, action_type, changed_by );