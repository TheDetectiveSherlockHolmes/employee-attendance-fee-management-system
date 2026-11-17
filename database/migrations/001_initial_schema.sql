-- Migration 001: Audit Trigger & Reporting Views for Attendance & Payroll
USE `attendance_payroll_db`;

CREATE OR REPLACE VIEW `vw_employee_directory` AS
SELECT
  e.id AS employee_id,
  e.employee_code,
  CONCAT(e.first_name, ' ', e.last_name) AS full_name,
  u.email,
  u.role,
  d.code AS department_code,
  d.name AS department_name,
  dg.title AS designation_title,
  dg.grade_level,
  s.name AS shift_name,
  s.start_time AS shift_start,
  s.end_time AS shift_end,
  s.standard_hours,
  s.grace_period_minutes,
  ss.basic_salary,
  (ss.hra_allowance + ss.transport_allowance + ss.special_allowance + ss.medical_allowance) AS total_allowances,
  ss.payroll_working_days,
  ss.late_deduction_mode,
  ss.late_per_minute_rate,
  ss.overtime_normal_multiplier,
  ss.overtime_weekend_multiplier,
  ss.overtime_holiday_multiplier,
  e.employment_status,
  e.is_demo
FROM employees e
JOIN users u ON u.id = e.user_id
JOIN departments d ON d.id = e.department_id
JOIN designations dg ON dg.id = e.designation_id
JOIN shifts s ON s.id = e.shift_id
LEFT JOIN salary_structures ss ON ss.employee_id = e.id AND ss.is_active = 1;
