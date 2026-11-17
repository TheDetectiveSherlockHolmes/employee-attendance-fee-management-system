-- ============================================================================
-- Employee Attendance & Automated Payroll Management System
-- Normalized Relational MySQL Database Schema (17 Tables)
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `attendance_payroll_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `attendance_payroll_db`;

-- ----------------------------------------------------------------------------
-- 1. users (Authentication & Role-Based Access Control)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'HR_MANAGER', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `last_login_ip` VARCHAR(45) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role_active` (`role`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. departments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_departments_code` (`code`),
  UNIQUE KEY `uq_departments_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. designations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `designations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `grade_level` VARCHAR(20) NOT NULL DEFAULT 'L1',
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_designations_dept_title` (`department_id`, `title`),
  KEY `idx_designations_dept` (`department_id`),
  CONSTRAINT `fk_designations_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. shifts (Working hours, grace periods, weekly offs, IP restrictions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `shifts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `standard_hours` DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  `grace_period_minutes` INT UNSIGNED NOT NULL DEFAULT 10,
  `half_day_threshold_hours` DECIMAL(4,2) NOT NULL DEFAULT 4.00,
  `late_to_half_day_minutes` INT UNSIGNED NOT NULL DEFAULT 120,
  `weekly_off_days` VARCHAR(50) NOT NULL DEFAULT 'Sunday',
  `allowed_ip_cidr` VARCHAR(100) NULL DEFAULT NULL,
  `geo_fence_lat` DECIMAL(10,7) NULL DEFAULT NULL,
  `geo_fence_lng` DECIMAL(10,7) NULL DEFAULT NULL,
  `geo_fence_radius_meters` INT UNSIGNED NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shifts_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. employees
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `employee_code` VARCHAR(30) NOT NULL,
  `first_name` VARCHAR(80) NOT NULL,
  `last_name` VARCHAR(80) NOT NULL,
  `phone` VARCHAR(25) NOT NULL,
  `department_id` INT UNSIGNED NOT NULL,
  `designation_id` INT UNSIGNED NOT NULL,
  `shift_id` INT UNSIGNED NOT NULL,
  `date_of_joining` DATE NOT NULL,
  `employment_status` ENUM('ACTIVE', 'ON_NOTICE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `bank_account_no` VARCHAR(40) NULL DEFAULT NULL,
  `bank_ifsc` VARCHAR(20) NULL DEFAULT NULL,
  `pan_number` VARCHAR(20) NULL DEFAULT NULL,
  `location_restriction_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `allowed_ip_range` VARCHAR(100) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employees_user_id` (`user_id`),
  UNIQUE KEY `uq_employees_code` (`employee_code`),
  KEY `idx_employees_dept` (`department_id`),
  KEY `idx_employees_desig` (`designation_id`),
  KEY `idx_employees_shift` (`shift_id`),
  KEY `idx_employees_status` (`employment_status`),
  CONSTRAINT `fk_employees_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_employees_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_employees_designation`
    FOREIGN KEY (`designation_id`) REFERENCES `designations` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_employees_shift`
    FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. salary_structures (Configurable per-employee base, policies & multipliers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salary_structures` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `basic_salary` DECIMAL(12,2) NOT NULL,
  `hra_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `transport_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `special_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `medical_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payroll_working_days` INT UNSIGNED NOT NULL DEFAULT 25,
  `standard_hours_per_day` DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  `overtime_normal_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  `overtime_weekend_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  `overtime_holiday_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  `late_deduction_mode` ENUM('PROPORTIONAL_PER_MINUTE', 'FIXED_PER_MINUTE', 'HALF_DAY_AFTER_THRESHOLD', 'RECORD_ONLY') NOT NULL DEFAULT 'PROPORTIONAL_PER_MINUTE',
  `late_per_minute_rate` DECIMAL(8,2) NULL DEFAULT NULL,
  `late_grace_minutes` INT UNSIGNED NOT NULL DEFAULT 10,
  `late_half_day_threshold_mins` INT UNSIGNED NOT NULL DEFAULT 120,
  `early_checkout_deduction_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `absence_deduction_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  `half_day_deduction_fraction` DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  `pf_deduction_rate_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `professional_tax_fixed` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `effective_from` DATE NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salary_structures_emp_active` (`employee_id`, `is_active`),
  KEY `idx_salary_structures_emp` (`employee_id`),
  CONSTRAINT `fk_salary_structures_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. allowances (Granular recurring or monthly employee allowances)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `allowances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `allowance_type` VARCHAR(60) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `is_recurring` TINYINT(1) NOT NULL DEFAULT 1,
  `payroll_month` CHAR(7) NULL DEFAULT NULL COMMENT 'YYYY-MM if one-time',
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_allowances_emp_month` (`employee_id`, `payroll_month`),
  CONSTRAINT `fk_allowances_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. deductions (Authorized recurring or one-time salary deductions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `deductions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `deduction_type` VARCHAR(60) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `is_recurring` TINYINT(1) NOT NULL DEFAULT 0,
  `payroll_month` CHAR(7) NOT NULL COMMENT 'YYYY-MM',
  `reason` VARCHAR(255) NULL DEFAULT NULL,
  `authorized_by` INT UNSIGNED NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_deductions_emp_month` (`employee_id`, `payroll_month`),
  CONSTRAINT `fk_deductions_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_deductions_authorized_by`
    FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. holidays (Official company holidays)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `holidays` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `holiday_date` DATE NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `holiday_type` ENUM('NATIONAL', 'FESTIVAL', 'COMPANY') NOT NULL DEFAULT 'NATIONAL',
  `is_paid` TINYINT(1) NOT NULL DEFAULT 1,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_holidays_date` (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. attendance (Daily employee check-in/out, server timestamps, metrics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `attendance_date` DATE NOT NULL,
  `shift_id` INT UNSIGNED NOT NULL,
  `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'WEEKLY_OFF', 'HOLIDAY') NOT NULL DEFAULT 'ABSENT',
  `check_in_at` DATETIME NULL DEFAULT NULL,
  `check_out_at` DATETIME NULL DEFAULT NULL,
  `total_working_hours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `late_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `deductible_late_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `early_departure_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `early_departure_approved` TINYINT(1) NOT NULL DEFAULT 0,
  `overtime_hours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `check_in_ip` VARCHAR(45) NULL DEFAULT NULL,
  `check_out_ip` VARCHAR(45) NULL DEFAULT NULL,
  `location_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `is_manual_correction` TINYINT(1) NOT NULL DEFAULT 0,
  `corrected_by` INT UNSIGNED NULL DEFAULT NULL,
  `correction_reason` VARCHAR(255) NULL DEFAULT NULL,
  `remarks` VARCHAR(255) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_emp_date` (`employee_id`, `attendance_date`),
  KEY `idx_attendance_date_status` (`attendance_date`, `status`),
  KEY `idx_attendance_emp_month` (`employee_id`, `attendance_date`),
  CONSTRAINT `fk_attendance_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_shift`
    FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_corrected_by`
    FOREIGN KEY (`corrected_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. overtime_requests (Overtime submission, multiplier tier & HR approval)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `overtime_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `attendance_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `overtime_date` DATE NOT NULL,
  `overtime_hours` DECIMAL(5,2) NOT NULL,
  `overtime_type` ENUM('NORMAL', 'WEEKEND', 'HOLIDAY') NOT NULL DEFAULT 'NORMAL',
  `applied_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  `reason` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` INT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at` DATETIME NULL DEFAULT NULL,
  `review_remarks` VARCHAR(255) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_overtime_emp_date` (`employee_id`, `overtime_date`),
  KEY `idx_overtime_status_date` (`status`, `overtime_date`),
  CONSTRAINT `fk_overtime_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_attendance`
    FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_reviewed_by`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. leave_balances (Annual & monthly paid/unpaid leave quota tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `leave_year` YEAR NOT NULL,
  `casual_leave_total` DECIMAL(4,1) NOT NULL DEFAULT 12.0,
  `casual_leave_used` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `sick_leave_total` DECIMAL(4,1) NOT NULL DEFAULT 10.0,
  `sick_leave_used` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `earned_leave_total` DECIMAL(4,1) NOT NULL DEFAULT 15.0,
  `earned_leave_used` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `unpaid_leave_used` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leave_balances_emp_year` (`employee_id`, `leave_year`),
  CONSTRAINT `fk_leave_balances_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. leave_requests (Employee leave applications, paid/unpaid, approval)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `leave_type` ENUM('CASUAL', 'SICK', 'EARNED', 'UNPAID') NOT NULL,
  `is_paid` TINYINT(1) NOT NULL DEFAULT 1,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `total_days` DECIMAL(4,1) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` INT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at` DATETIME NULL DEFAULT NULL,
  `review_comment` VARCHAR(255) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leave_emp_dates` (`employee_id`, `start_date`, `end_date`),
  KEY `idx_leave_status` (`status`),
  CONSTRAINT `fk_leave_requests_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_requests_reviewed_by`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. payroll (Monthly batch header for company payroll run & finalization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payroll` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_month` CHAR(7) NOT NULL COMMENT 'Format: YYYY-MM',
  `working_days_config` INT UNSIGNED NOT NULL DEFAULT 25,
  `total_employees` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_gross_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_deductions_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_overtime_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_net_payable` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('DRAFT', 'APPROVED', 'FINALIZED') NOT NULL DEFAULT 'DRAFT',
  `generated_by` INT UNSIGNED NULL DEFAULT NULL,
  `approved_by` INT UNSIGNED NULL DEFAULT NULL,
  `finalized_by` INT UNSIGNED NULL DEFAULT NULL,
  `finalized_at` DATETIME NULL DEFAULT NULL,
  `is_locked` TINYINT(1) NOT NULL DEFAULT 0,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payroll_month` (`payroll_month`),
  CONSTRAINT `fk_payroll_generated_by`
    FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_approved_by`
    FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_finalized_by`
    FOREIGN KEY (`finalized_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. payroll_details (Immutable employee-level monthly salary calculation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payroll_details` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_id` INT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NOT NULL,
  `payroll_month` CHAR(7) NOT NULL,
  `basic_salary` DECIMAL(12,2) NOT NULL,
  `total_allowances` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `working_days_Per_month` INT UNSIGNED NOT NULL DEFAULT 25,
  `standard_hours_per_day` DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  `daily_salary_rate` DECIMAL(12,2) NOT NULL,
  `hourly_salary_rate` DECIMAL(12,2) NOT NULL,
  `present_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `half_days` INT UNSIGNED NOT NULL DEFAULT 0,
  `unpaid_absent_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `paid_leave_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `unpaid_leave_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  `weekly_off_days` INT UNSIGNED NOT NULL DEFAULT 0,
  `holiday_days` INT UNSIGNED NOT NULL DEFAULT 0,
  `late_arrivals_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `deductible_late_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `early_departure_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `approved_overtime_hours` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `overtime_pay` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `absence_deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `half_day_deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `late_arrival_deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `early_checkout_deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `other_authorized_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `gross_salary` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_salary` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `slip_number` VARCHAR(50) NOT NULL,
  `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
  `calculation_snapshot_json` JSON NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payroll_details_emp_month` (`employee_id`, `payroll_month`),
  UNIQUE KEY `uq_payroll_details_slip` (`slip_number`),
  KEY `idx_payroll_details_payroll` (`payroll_id`),
  CONSTRAINT `fk_payroll_details_payroll`
    FOREIGN KEY (`payroll_id`) REFERENCES `payroll` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_details_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. audit_logs (Immutable security & compliance audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT UNSIGNED NULL DEFAULT NULL,
  `actor_role` VARCHAR(30) NOT NULL,
  `action_type` VARCHAR(80) NOT NULL COMMENT 'e.g. ATTENDANCE_CORRECTION, SALARY_UPDATE, OVERTIME_APPROVAL, PAYROLL_FINALIZE',
  `entity_table` VARCHAR(60) NOT NULL,
  `entity_id` VARCHAR(60) NOT NULL,
  `old_values_json` JSON NULL DEFAULT NULL,
  `new_values_json` JSON NULL DEFAULT NULL,
  `reason` VARCHAR(255) NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity_table`, `entity_id`),
  KEY `idx_audit_actor_date` (`actor_user_id`, `created_at`),
  CONSTRAINT `fk_audit_logs_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. notifications (In-app alerts for leave, overtime, attendance & payslips)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `notification_type` ENUM('ATTENDANCE', 'OVERTIME', 'LEAVE', 'PAYROLL', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `is_demo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_unread` (`user_id`, `is_read`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
