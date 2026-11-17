-- ============================================================================
-- COMPLETE SELF-CONTAINED DEMO SEED DATA (`database/seed.sql`)
-- Creates database & tables if not already created, then seeds all 22 DEMO DATA
-- employees, salary structures, shifts, holidays, leave balances, overtime,
-- leave requests, and attendance records.
--
-- Usage (no database name argument needed on CLI):
--   mysql -u root -p < ../database/schema.sql
--   mysql -u root -p < ../database/migrations/001_initial_schema.sql
--   mysql -u root -p < ../database/seed.sql
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `attendance_payroll_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `attendance_payroll_db`;

INSERT INTO `departments` (`id`, `code`, `name`, `description`, `is_demo`) VALUES
(1, 'ENG', 'DS Group HoReCa Sales & Distribution [MAA AARYA INTERNATINAL]', 'Core Software Engineering, QA, and Cloud Infrastructure (DEMO DATA)', 1),
(2, 'HROPS', 'DS Group HoReCa Operations & Management [MAA AARYA INTERNATINAL]', 'Talent Acquisition, Payroll Administration, and Employee Relations (DEMO DATA)', 1),
(3, 'FIN', 'Finance & Accounting [DEMO DATA]', 'Corporate Finance, Compliance, Treasury, and Audit (DEMO DATA)', 1),
(4, 'OPS', 'Customer Success & Operations [DEMO DATA]', 'Enterprise Onboarding, Support Operations, and Service Delivery (DEMO DATA)', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);

INSERT INTO `designations` (`id`, `department_id`, `title`, `grade_level`, `is_demo`) VALUES
(1, 1, 'Principal Systems Architect', 'L5', 1),
(2, 1, 'Senior Full-Stack Engineer', 'L4', 1),
(3, 1, 'Software Engineer II', 'L3', 1),
(4, 1, 'QA Automation Engineer', 'L2', 1),
(5, 2, 'HR & Payroll Director', 'L5', 1),
(6, 2, 'Senior HR Generalist', 'L3', 1),
(7, 3, 'Senior Financial Analyst', 'L4', 1),
(8, 4, 'Operations Lead', 'L3', 1)
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `grade_level` = VALUES(`grade_level`);

INSERT INTO `shifts` (`id`, `name`, `code`, `start_time`, `end_time`, `standard_hours`, `grace_period_minutes`, `half_day_threshold_hours`, `late_to_half_day_minutes`, `weekly_off_days`, `allowed_ip_cidr`, `is_demo`) VALUES
(1, 'General Day Shift (09:00 - 17:00) [DEMO DATA]', 'SHIFT-GEN', '09:00:00', '17:00:00', 8.00, 10, 4.00, 120, 'Sunday', '192.168.1.0/24', 1),
(2, 'Early Engineering Shift (08:30 - 16:30) [DEMO DATA]', 'SHIFT-ENG', '08:30:00', '16:30:00', 8.00, 10, 4.00, 120, 'Sunday', '10.10.0.0/16', 1),
(3, 'Operations Extended Shift (10:00 - 18:00) [DEMO DATA]', 'SHIFT-OPS', '10:00:00', '18:00:00', 8.00, 15, 4.00, 120, 'Sunday', '172.16.0.0/16', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `holidays` (`id`, `holiday_date`, `name`, `holiday_type`, `is_paid`, `is_demo`) VALUES
(1, '2026-10-02', 'Mahatma Gandhi Jayanti [DEMO DATA]', 'NATIONAL', 1, 1),
(2, '2026-10-20', 'Dussehra / Vijayadashami [DEMO DATA]', 'FESTIVAL', 1, 1),
(3, '2026-11-08', 'Diwali Festival Holiday [DEMO DATA]', 'FESTIVAL', 1, 1),
(4, '2026-11-24', 'Guru Nanak Jayanti [DEMO DATA]', 'FESTIVAL', 1, 1),
(5, '2026-12-25', 'Christmas Day [DEMO DATA]', 'NATIONAL', 1, 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Bcrypt cost-10 hash for Demo@12345
INSERT INTO `users` (`id`, `email`, `password_hash`, `role`, `is_active`, `is_demo`) VALUES
(1, 'admin@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN', 1, 1),
(2, 'hr@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'HR_MANAGER', 1, 1),
(3, 'employee@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(4, 'priya.nair@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(5, 'siddharth.k@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(6, 'meera.iyer@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(7, 'arjun.reddy@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(8, 'kavita.d@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(9, 'devansh.m@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(10, 'neha.kapoor@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(11, 'karthik.s@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(12, 'pooja.c@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(13, 'aditya.joshi@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(14, 'ritika.b@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(15, 'manish.t@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(16, 'shruti.m@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(17, 'harsh.v@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(18, 'divya.s@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(19, 'nikhil.g@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(20, 'tanvi.a@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(21, 'rajat.b@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1),
(22, 'sneha.p@demo.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'EMPLOYEE', 1, 1)
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

INSERT INTO `employees` (`id`, `user_id`, `employee_code`, `first_name`, `last_name`, `phone`, `department_id`, `designation_id`, `shift_id`, `date_of_joining`, `employment_status`, `is_demo`) VALUES
(1, 1, 'EMP-1001', 'Rajesh Kumar', 'Gupta (Owner)', '+91-9810010001', 1, 1, 1, '2022-03-15', 'ACTIVE', 1),
(2, 2, 'EMP-1002', 'Abhishek', '(DS Group HoReCa)', '+91-9810010002', 2, 5, 1, '2022-06-01', 'ACTIVE', 1),
(3, 3, 'EMP-1003', 'Vivek', '(DS Group HoReCa)', '+91-9810010003', 1, 2, 1, '2023-01-10', 'ACTIVE', 1),
(4, 4, 'EMP-1004', 'Priya', 'Nair', '+91-9810010004', 1, 2, 2, '2023-02-14', 'ACTIVE', 1),
(5, 5, 'EMP-1005', 'Siddharth', 'Kulkarni', '+91-9810010005', 1, 3, 2, '2023-04-03', 'ACTIVE', 1),
(6, 6, 'EMP-1006', 'Meera', 'Iyer', '+91-9810010006', 3, 7, 1, '2023-05-19', 'ACTIVE', 1),
(7, 7, 'EMP-1007', 'Arjun', 'Reddy', '+91-9810010007', 1, 4, 2, '2023-07-01', 'ACTIVE', 1),
(8, 8, 'EMP-1008', 'Kavita', 'Deshmukh', '+91-9810010008', 2, 6, 1, '2023-08-11', 'ACTIVE', 1),
(9, 9, 'EMP-1009', 'Devansh', 'Mehta', '+91-9810010009', 4, 8, 3, '2023-09-05', 'ACTIVE', 1),
(10, 10, 'EMP-1010', 'Neha', 'Kapoor', '+91-9810010010', 3, 7, 1, '2023-10-12', 'ACTIVE', 1),
(11, 11, 'EMP-1011', 'Karthik', 'Subramanian', '+91-9810010011', 1, 3, 2, '2023-11-20', 'ACTIVE', 1),
(12, 12, 'EMP-1012', 'Pooja', 'Chatterjee', '+91-9810010012', 4, 8, 3, '2024-01-08', 'ACTIVE', 1),
(13, 13, 'EMP-1013', 'Aditya', 'Joshi', '+91-9810010013', 1, 4, 1, '2024-02-19', 'ACTIVE', 1),
(14, 14, 'EMP-1014', 'Ritika', 'Bansal', '+91-9810010014', 2, 6, 1, '2024-03-11', 'ACTIVE', 1),
(15, 15, 'EMP-1015', 'Manish', 'Tiwari', '+91-9810010015', 4, 8, 3, '2024-04-15', 'ACTIVE', 1),
(16, 16, 'EMP-1016', 'Shruti', 'Menon', '+91-9810010016', 1, 2, 2, '2024-05-06', 'ACTIVE', 1),
(17, 17, 'EMP-1017', 'Harsh', 'Vardhan', '+91-9810010017', 3, 7, 1, '2024-06-17', 'ACTIVE', 1),
(18, 18, 'EMP-1018', 'Divya', 'Saxena', '+91-9810010018', 1, 3, 1, '2024-07-22', 'ACTIVE', 1),
(19, 19, 'EMP-1019', 'Nikhil', 'Gowda', '+91-9810010019', 4, 8, 3, '2024-08-05', 'ACTIVE', 1),
(20, 20, 'EMP-1020', 'Tanvi', 'Agrawal', '+91-9810010020', 1, 4, 2, '2024-09-02', 'ACTIVE', 1),
(21, 21, 'EMP-1021', 'Rajat', 'Bhatia', '+91-9810010021', 3, 7, 1, '2024-10-01', 'ACTIVE', 1),
(22, 22, 'EMP-1022', 'Sneha', 'Pillai', '+91-9810010022', 2, 6, 1, '2024-10-14', 'ACTIVE', 1)
ON DUPLICATE KEY UPDATE `first_name` = VALUES(`first_name`), `last_name` = VALUES(`last_name`);

INSERT INTO `salary_structures` (`id`, `employee_id`, `basic_salary`, `hra_allowance`, `transport_allowance`, `special_allowance`, `medical_allowance`, `payroll_working_days`, `standard_hours_per_day`, `late_deduction_mode`, `late_per_minute_rate`, `effective_from`, `is_active`, `is_demo`) VALUES
(1, 1, 95000.00, 22000.00, 5000.00, 8000.00, 2500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2022-03-15', 1, 1),
(2, 2, 75000.00, 18000.00, 4000.00, 6000.00, 2000.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2022-06-01', 1, 1),
(3, 3, 30000.00, 8000.00, 2500.00, 3000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-01-10', 1, 1),
(4, 4, 60000.00, 15000.00, 3500.00, 5000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-02-14', 1, 1),
(5, 5, 45000.00, 11000.00, 3000.00, 4000.00, 1500.00, 25, 8.00, 'FIXED_PER_MINUTE', 5.00, '2023-04-03', 1, 1),
(6, 6, 55000.00, 14000.00, 3000.00, 4500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-05-19', 1, 1),
(7, 7, 35000.00, 9000.00, 2500.00, 3000.00, 1500.00, 25, 8.00, 'HALF_DAY_AFTER_THRESHOLD', NULL, '2023-07-01', 1, 1),
(8, 8, 40000.00, 10000.00, 2500.00, 3500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-08-11', 1, 1),
(9, 9, 38000.00, 9500.00, 2500.00, 3000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-09-05', 1, 1),
(10, 10, 52000.00, 13000.00, 3000.00, 4000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-10-12', 1, 1),
(11, 11, 48000.00, 12000.00, 3000.00, 4000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2023-11-20', 1, 1),
(12, 12, 36000.00, 9000.00, 2500.00, 2500.00, 1500.00, 25, 8.00, 'RECORD_ONLY', NULL, '2024-01-08', 1, 1),
(13, 13, 32000.00, 8000.00, 2000.00, 2500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-02-19', 1, 1),
(14, 14, 42000.00, 10500.00, 2500.00, 3500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-03-11', 1, 1),
(15, 15, 34000.00, 8500.00, 2000.00, 2500.00, 1500.00, 25, 8.00, 'FIXED_PER_MINUTE', 4.00, '2024-04-15', 1, 1),
(16, 16, 62000.00, 15500.00, 3500.00, 5000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-05-06', 1, 1),
(17, 17, 50000.00, 12500.00, 3000.00, 4000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-06-17', 1, 1),
(18, 18, 44000.00, 11000.00, 2500.00, 3500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-07-22', 1, 1),
(19, 19, 37500.00, 9000.00, 2500.00, 3000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-08-05', 1, 1),
(20, 20, 33000.00, 8200.00, 2000.00, 2800.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-09-02', 1, 1),
(21, 21, 49000.00, 12000.00, 3000.00, 3500.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-10-01', 1, 1),
(22, 22, 41000.00, 10000.00, 2500.00, 3000.00, 1500.00, 25, 8.00, 'PROPORTIONAL_PER_MINUTE', NULL, '2024-10-14', 1, 1)
ON DUPLICATE KEY UPDATE `basic_salary` = VALUES(`basic_salary`);

INSERT INTO `leave_balances` (`employee_id`, `leave_year`, `casual_leave_total`, `casual_leave_used`, `sick_leave_total`, `sick_leave_used`, `earned_leave_total`, `earned_leave_used`, `unpaid_leave_used`, `is_demo`) VALUES
(1, 2026, 12.0, 1.0, 10.0, 0.0, 15.0, 2.0, 0.0, 1),
(2, 2026, 12.0, 2.0, 10.0, 1.0, 15.0, 0.0, 0.0, 1),
(3, 2026, 12.0, 1.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(4, 2026, 12.0, 0.0, 10.0, 1.0, 15.0, 0.0, 0.0, 1),
(5, 2026, 12.0, 1.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(6, 2026, 12.0, 0.0, 10.0, 2.0, 15.0, 0.0, 0.0, 1),
(7, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(8, 2026, 12.0, 1.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(9, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 1.0, 1),
(10, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(11, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(12, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(13, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(14, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(15, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(16, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(17, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(18, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(19, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(20, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(21, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1),
(22, 2026, 12.0, 0.0, 10.0, 0.0, 15.0, 0.0, 0.0, 1)
ON DUPLICATE KEY UPDATE `casual_leave_used` = VALUES(`casual_leave_used`);

INSERT INTO `overtime_requests` (`id`, `employee_id`, `overtime_date`, `overtime_hours`, `overtime_type`, `applied_multiplier`, `reason`, `status`, `reviewed_by`, `reviewed_at`, `is_demo`) VALUES
(1, 3, '2026-11-04', 2.50, 'NORMAL', 1.50, 'Production payment gateway release & hotfix verification [DEMO DATA]', 'APPROVED', 2, '2026-11-05 14:40:00', 1),
(2, 3, '2026-11-08', 3.00, 'HOLIDAY', 2.00, 'Diwali holiday emergency database failover maintenance [DEMO DATA]', 'PENDING', NULL, NULL, 1),
(3, 4, '2026-11-02', 4.00, 'NORMAL', 1.50, 'Q4 microservice load testing benchmark [DEMO DATA]', 'APPROVED', 2, '2026-11-03 11:20:00', 1),
(4, 5, '2026-11-07', 3.50, 'WEEKEND', 2.00, 'Weekend security patching & SSL certificate rotation [DEMO DATA]', 'PENDING', NULL, NULL, 1),
(5, 7, '2026-11-03', 2.00, 'NORMAL', 1.50, 'Regression suite execution for payroll module [DEMO DATA]', 'REJECTED', 2, '2026-11-04 10:00:00', 1)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

INSERT INTO `leave_requests` (`id`, `employee_id`, `leave_type`, `is_paid`, `start_date`, `end_date`, `total_days`, `reason`, `status`, `reviewed_by`, `reviewed_at`, `is_demo`) VALUES
(1, 3, 'CASUAL', 1, '2026-11-05', '2026-11-05', 1.0, 'Family medical checkup appointment [DEMO DATA]', 'APPROVED', 2, '2026-11-04 16:00:00', 1),
(2, 3, 'EARNED', 1, '2026-11-18', '2026-11-19', 2.0, 'Attending cousin wedding in Jaipur [DEMO DATA]', 'PENDING', NULL, NULL, 1),
(3, 6, 'SICK', 1, '2026-11-04', '2026-11-05', 2.0, 'Viral fever recovery [DEMO DATA]', 'APPROVED', 2, '2026-11-04 09:30:00', 1),
(4, 9, 'UNPAID', 0, '2026-11-06', '2026-11-06', 1.0, 'Personal travel extension (Unpaid Leave Policy) [DEMO DATA]', 'APPROVED', 2, '2026-11-05 12:00:00', 1)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

SET FOREIGN_KEY_CHECKS = 1;
