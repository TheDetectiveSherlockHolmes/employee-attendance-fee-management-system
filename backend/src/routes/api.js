/**
 * Express REST API Routes & Controllers (`backend/src/routes/api.js`)
 * Implements all REST endpoints with JWT authentication, RBAC authorization,
 * server-side timestamps, audit logging, and ACID transactional payroll operations.
 */
const express = require('express');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const { pool, withTransaction } = require('../config/db');
const { authenticateJWT, authorizeRoles, ensureSelfOrHR, signJwt } = require('../middleware/auth');
const { evaluateDailyAttendance, calculateMonthlySalary } = require('../services/salaryEngine');
const { generateSalarySlipPDF } = require('../services/pdfGenerator');

const router = express.Router();

// ============================================================================
// 0. HEALTH CHECK ENDPOINT
// ============================================================================
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 AS ok');
    res.json({
      status: 'healthy',
      service: 'Employee Attendance & Automated Payroll API',
      database: 'connected',
      serverTime: dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
    });
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      service: 'Employee Attendance & Automated Payroll API',
      database: 'disconnected',
      serverTime: dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
    });
  }
});

// ============================================================================
// 1. AUTHENTICATION ENDPOINTS
// ============================================================================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [users] = await pool.execute(
      `SELECT u.*, e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
              e.department_id, e.designation_id, e.shift_id
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.email = ? AND u.is_active = 1
       LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    if (!users.length) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await pool.execute(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?',
      [req.ip || '127.0.0.1', user.id]
    );

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      employeeCode: user.employee_code,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id,
        employeeCode: user.employee_code,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        isDemo: Boolean(user.is_demo),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. EMPLOYEE & SALARY STRUCTURE MANAGEMENT (ADMIN / HR)
// ============================================================================
router.get('/employees', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vw_employee_directory ORDER BY employee_code ASC');
    res.json({ employees: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/employees/:employeeId', authenticateJWT, ensureSelfOrHR, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vw_employee_directory WHERE employee_id = ? LIMIT 1',
      [req.params.employeeId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const {
      email, password, role = 'EMPLOYEE', employeeCode, firstName, lastName,
      phone, departmentId, designationId, shiftId, dateOfJoining,
      basicSalary, hraAllowance = 0, transportAllowance = 0, specialAllowance = 0, medicalAllowance = 0,
      payrollWorkingDays = 25, standardHoursPerDay = 8,
    } = req.body;

    const result = await withTransaction(async (conn) => {
      const passwordHash = await bcrypt.hash(password || 'Demo@12345', 10);
      const [uRes] = await conn.execute(
        'INSERT INTO users (email, password_hash, role, is_demo) VALUES (?, ?, ?, 1)',
        [email.toLowerCase(), passwordHash, role]
      );
      const [eRes] = await conn.execute(
        `INSERT INTO employees
          (user_id, employee_code, first_name, last_name, phone, department_id, designation_id, shift_id, date_of_joining, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [uRes.insertId, employeeCode, firstName, lastName, phone, departmentId, designationId, shiftId, dateOfJoining]
      );
      await conn.execute(
        `INSERT INTO salary_structures
          (employee_id, basic_salary, hra_allowance, transport_allowance, special_allowance, medical_allowance,
           payroll_working_days, standard_hours_per_day, effective_from, is_active, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [eRes.insertId, basicSalary, hraAllowance, transportAllowance, specialAllowance, medicalAllowance, payrollWorkingDays, standardHoursPerDay, dateOfJoining]
      );
      await conn.execute(
        `INSERT INTO leave_balances (employee_id, leave_year, is_demo) VALUES (?, YEAR(CURDATE()), 1)`,
        [eRes.insertId]
      );
      await conn.execute(
        `INSERT INTO audit_logs (actor_user_id, actor_role, action_type, entity_table, entity_id, new_values_json, reason, ip_address)
         VALUES (?, ?, 'EMPLOYEE_CREATED', 'employees', ?, ?, 'New employee added by Administrator', ?)`,
        [req.user.userId, req.user.role, String(eRes.insertId), JSON.stringify({ employeeCode, email, basicSalary }), req.ip]
      );
      return { employeeId: eRes.insertId, userId: uRes.insertId };
    });

    res.status(201).json({ message: 'Employee created successfully', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 3. ATTENDANCE TRACKING MODULE (Check-In, Check-Out, HR Audit Corrections)
// ============================================================================
router.post('/attendance/check-in', authenticateJWT, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'No employee profile linked to user.' });

    // Server-side timestamp strictly enforced (never trusting device time)
    const serverNow = dayjs();
    const todayDate = serverNow.format('YYYY-MM-DD');
    const checkInTimeStr = serverNow.format('HH:mm');

    const [existing] = await pool.execute(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1',
      [employeeId, todayDate]
    );

    if (existing.length && existing[0].check_in_at) {
      return res.status(409).json({
        error: 'Duplicate check-in prevented: You have already checked in for today.',
      });
    }

    const [empRows] = await pool.execute(
      `SELECT e.*, s.start_time, s.end_time, s.standard_hours, s.grace_period_minutes,
              s.half_day_threshold_hours, s.late_to_half_day_minutes
       FROM employees e
       JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = ? LIMIT 1`,
      [employeeId]
    );
    const emp = empRows[0];

    const evalResult = evaluateDailyAttendance({
      checkInTimeStr,
      checkOutTimeStr: null,
      shift: emp,
    });

    await pool.execute(
      `INSERT INTO attendance
        (employee_id, attendance_date, shift_id, status, check_in_at, late_minutes, deductible_late_minutes, check_in_ip, is_demo)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
        check_in_at = NOW(), status = VALUES(status), late_minutes = VALUES(late_minutes),
        deductible_late_minutes = VALUES(deductible_late_minutes), check_in_ip = VALUES(check_in_ip)`,
      [
        employeeId,
        todayDate,
        emp.shift_id,
        evalResult.status,
        evalResult.lateMinutes,
        evalResult.deductibleLateMinutes,
        req.ip || '127.0.0.1',
      ]
    );

    res.status(201).json({
      message: 'Check-in recorded using verified server timestamp.',
      attendanceDate: todayDate,
      checkInTime: checkInTimeStr,
      status: evalResult.status,
      lateMinutes: evalResult.lateMinutes,
      deductibleLateMinutes: evalResult.deductibleLateMinutes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendance/check-out', authenticateJWT, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    const serverNow = dayjs();
    const todayDate = serverNow.format('YYYY-MM-DD');
    const checkOutTimeStr = serverNow.format('HH:mm');

    const [existing] = await pool.execute(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1',
      [employeeId, todayDate]
    );

    if (!existing.length || !existing[0].check_in_at) {
      return res.status(400).json({
        error: 'Cannot check out before checking in for today.',
      });
    }
    if (existing[0].check_out_at) {
      return res.status(409).json({
        error: 'Duplicate check-out prevented: You have already checked out for today.',
      });
    }

    const [empRows] = await pool.execute(
      `SELECT e.*, s.start_time, s.end_time, s.standard_hours, s.grace_period_minutes,
              s.half_day_threshold_hours, s.late_to_half_day_minutes
       FROM employees e
       JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = ? LIMIT 1`,
      [employeeId]
    );
    const emp = empRows[0];
    const checkInTimeStr = dayjs(existing[0].check_in_at).format('HH:mm');

    const evalResult = evaluateDailyAttendance({
      checkInTimeStr,
      checkOutTimeStr,
      shift: emp,
      earlyDepartureApproved: Boolean(existing[0].early_departure_approved),
    });

    await pool.execute(
      `UPDATE attendance
       SET check_out_at = NOW(),
           status = ?,
           total_working_hours = ?,
           early_departure_minutes = ?,
           overtime_hours = ?,
           check_out_ip = ?
       WHERE id = ?`,
      [
        evalResult.status,
        evalResult.totalWorkingHours,
        evalResult.earlyDepartureMinutes,
        evalResult.overtimeHours,
        req.ip || '127.0.0.1',
        existing[0].id,
      ]
    );

    res.json({
      message: 'Check-out recorded using verified server timestamp.',
      attendanceDate: todayDate,
      checkInTime: checkInTimeStr,
      checkOutTime: checkOutTimeStr,
      status: evalResult.status,
      totalWorkingHours: evalResult.totalWorkingHours,
      overtimeHours: evalResult.overtimeHours,
      earlyDepartureMinutes: evalResult.earlyDepartureMinutes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HR / Admin Attendance Correction with Mandatory Audit Trail
router.put('/attendance/:attendanceId/correct', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { status, checkInAt, checkOutAt, earlyDepartureApproved, reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A detailed audit reason is required to modify attendance.' });
    }

    await withTransaction(async (conn) => {
      const [oldRows] = await conn.execute('SELECT * FROM attendance WHERE id = ? LIMIT 1', [req.params.attendanceId]);
      if (!oldRows.length) throw new Error('Attendance record not found');
      const oldRec = oldRows[0];

      await conn.execute(
        `UPDATE attendance
         SET status = COALESCE(?, status),
             check_in_at = COALESCE(?, check_in_at),
             check_out_at = COALESCE(?, check_out_at),
             early_departure_approved = COALESCE(?, early_departure_approved),
             is_manual_correction = 1,
             corrected_by = ?,
             correction_reason = ?
         WHERE id = ?`,
        [status, checkInAt, checkOutAt, earlyDepartureApproved, req.user.userId, reason, req.params.attendanceId]
      );

      await conn.execute(
        `INSERT INTO audit_logs
          (actor_user_id, actor_role, action_type, entity_table, entity_id, old_values_json, new_values_json, reason, ip_address)
         VALUES (?, ?, 'ATTENDANCE_CORRECTION', 'attendance', ?, ?, ?, ?, ?)`,
        [
          req.user.userId,
          req.user.role,
          String(req.params.attendanceId),
          JSON.stringify({ status: oldRec.status, check_in_at: oldRec.check_in_at, check_out_at: oldRec.check_out_at }),
          JSON.stringify({ status, checkInAt, checkOutAt, earlyDepartureApproved }),
          reason,
          req.ip || '127.0.0.1',
        ]
      );
    });

    res.json({ message: 'Attendance corrected and logged to immutable audit trail.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 4. OVERTIME MANAGEMENT MODULE
// ============================================================================
router.post('/overtime', authenticateJWT, async (req, res) => {
  try {
    const { overtimeDate, overtimeHours, overtimeType = 'NORMAL', reason } = req.body;
    const employeeId = req.user.employeeId;
    if (!overtimeDate || !overtimeHours || Number(overtimeHours) <= 0 || !reason) {
      return res.status(400).json({ error: 'Valid date, overtime hours (> 0), and reason are required.' });
    }

    const [ss] = await pool.execute(
      'SELECT * FROM salary_structures WHERE employee_id = ? AND is_active = 1 LIMIT 1',
      [employeeId]
    );
    const struct = ss[0] || {};
    const multiplier = overtimeType === 'WEEKEND'
      ? Number(struct.overtime_weekend_multiplier || 2.0)
      : overtimeType === 'HOLIDAY'
        ? Number(struct.overtime_holiday_multiplier || 2.0)
        : Number(struct.overtime_normal_multiplier || 1.5);

    const [ins] = await pool.execute(
      `INSERT INTO overtime_requests
        (employee_id, overtime_date, overtime_hours, overtime_type, applied_multiplier, reason, status, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 1)`,
      [employeeId, overtimeDate, overtimeHours, overtimeType, multiplier, reason]
    );

    res.status(201).json({ message: 'Overtime request submitted for HR approval.', id: ins.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Overlapping overtime entry prevented: An overtime request already exists for this date.' });
    }
    res.status(400).json({ error: err.message });
  }
});

router.patch('/overtime/:id/review', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { status, reviewRemarks } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be APPROVED or REJECTED.' });
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE overtime_requests
         SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_remarks = ?
         WHERE id = ?`,
        [status, req.user.userId, reviewRemarks || null, req.params.id]
      );
      await conn.execute(
        `INSERT INTO audit_logs
          (actor_user_id, actor_role, action_type, entity_table, entity_id, new_values_json, reason, ip_address)
         VALUES (?, ?, 'OVERTIME_REVIEW', 'overtime_requests', ?, ?, ?, ?)`,
        [req.user.userId, req.user.role, String(req.params.id), JSON.stringify({ status }), reviewRemarks || status, req.ip]
      );
    });

    res.json({ message: `Overtime request ${status.toLowerCase()}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 5. LEAVE MANAGEMENT MODULE
// ============================================================================
router.post('/leaves', authenticateJWT, async (req, res) => {
  try {
    const { leaveType, startDate, endDate, totalDays, reason } = req.body;
    const employeeId = req.user.employeeId;
    const isPaid = leaveType !== 'UNPAID' ? 1 : 0;

    const [ins] = await pool.execute(
      `INSERT INTO leave_requests
        (employee_id, leave_type, is_paid, start_date, end_date, total_days, reason, status, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 1)`,
      [employeeId, leaveType, isPaid, startDate, endDate, totalDays, reason]
    );

    res.status(201).json({ message: 'Leave request submitted.', id: ins.insertId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/leaves/:id/review', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { status, reviewComment } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be APPROVED or REJECTED.' });
    }

    await withTransaction(async (conn) => {
      const [rows] = await conn.execute('SELECT * FROM leave_requests WHERE id = ? LIMIT 1', [req.params.id]);
      if (!rows.length) throw new Error('Leave request not found');
      const lr = rows[0];

      await conn.execute(
        `UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_comment = ? WHERE id = ?`,
        [status, req.user.userId, reviewComment || null, req.params.id]
      );

      if (status === 'APPROVED') {
        const colMap = {
          CASUAL: 'casual_leave_used',
          SICK: 'sick_leave_used',
          EARNED: 'earned_leave_used',
          UNPAID: 'unpaid_leave_used',
        };
        const col = colMap[lr.leave_type] || 'unpaid_leave_used';
        await conn.execute(
          `UPDATE leave_balances SET ${col} = ${col} + ? WHERE employee_id = ? AND leave_year = YEAR(?)`,
          [lr.total_days, lr.employee_id, lr.start_date]
        );
      }

      await conn.execute(
        `INSERT INTO audit_logs
          (actor_user_id, actor_role, action_type, entity_table, entity_id, new_values_json, reason, ip_address)
         VALUES (?, ?, 'LEAVE_REVIEW', 'leave_requests', ?, ?, ?, ?)`,
        [req.user.userId, req.user.role, String(req.params.id), JSON.stringify({ status }), reviewComment || status, req.ip]
      );
    });

    res.json({ message: `Leave request ${status.toLowerCase()}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 6. PAYROLL GENERATION, FINALIZATION & PDF SALARY SLIPS
// ============================================================================
router.post('/payroll/generate', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { payrollMonth } = req.body; // "YYYY-MM"
    if (!payrollMonth || !/^\d{4}-\d{2}$/.test(payrollMonth)) {
      return res.status(400).json({ error: 'Valid payrollMonth (YYYY-MM) is required.' });
    }

    const summary = await withTransaction(async (conn) => {
      const [existingBatch] = await conn.execute(
        'SELECT * FROM payroll WHERE payroll_month = ? LIMIT 1',
        [payrollMonth]
      );
      if (existingBatch.length && existingBatch[0].is_locked) {
        throw new Error(`Payroll for ${payrollMonth} is already FINALIZED and locked against modification.`);
      }

      const [employees] = await conn.query(
        `SELECT e.*, ss.*
         FROM employees e
         JOIN salary_structures ss ON ss.employee_id = e.id AND ss.is_active = 1
         WHERE e.employment_status = 'ACTIVE'`
      );

      let batchId;
      if (existingBatch.length) {
        batchId = existingBatch[0].id;
      } else {
        const [ins] = await conn.execute(
          `INSERT INTO payroll (payroll_month, working_days_config, status, generated_by, is_demo)
           VALUES (?, 25, 'DRAFT', ?, 1)`,
          [payrollMonth, req.user.userId]
        );
        batchId = ins.insertId;
      }

      let totalGross = 0;
      let totalDed = 0;
      let totalOt = 0;
      let totalNet = 0;

      for (const emp of employees) {
        const [attRows] = await conn.execute(
          `SELECT * FROM attendance WHERE employee_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
          [emp.employee_id, payrollMonth]
        );
        const [otRows] = await conn.execute(
          `SELECT * FROM overtime_requests WHERE employee_id = ? AND DATE_FORMAT(overtime_date, '%Y-%m') = ?`,
          [emp.employee_id, payrollMonth]
        );
        const [dedRows] = await conn.execute(
          `SELECT * FROM deductions WHERE employee_id = ? AND (payroll_month = ? OR is_recurring = 1)`,
          [emp.employee_id, payrollMonth]
        );

        const calc = calculateMonthlySalary({
          salaryStructure: emp,
          attendanceRecords: attRows,
          overtimeRequests: otRows,
          authorizedDeductions: dedRows,
        });

        totalGross += calc.grossSalary;
        totalDed += calc.deductionsBreakdown.totalDeductions;
        totalOt += calc.overtimeSummary.overtimePay;
        totalNet += calc.netSalary;

        const slipNo = `SLIP-${payrollMonth.replace('-', '')}-${emp.employee_code}`;
        await conn.execute(
          `INSERT INTO payroll_details
            (payroll_id, employee_id, payroll_month, basic_salary, total_allowances,
             working_days_Per_month, standard_hours_per_day, daily_salary_rate, hourly_salary_rate,
             present_days, half_days, unpaid_absent_days, paid_leave_days, unpaid_leave_days,
             weekly_off_days, holiday_days, late_arrivals_count, deductible_late_minutes,
             early_departure_minutes, approved_overtime_hours, overtime_pay,
             absence_deduction, half_day_deduction, late_arrival_deduction, early_checkout_deduction,
             other_authorized_deductions, total_deductions, gross_salary, net_salary,
             slip_number, calculation_snapshot_json, is_demo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             basic_salary = VALUES(basic_salary),
             total_allowances = VALUES(total_allowances),
             present_days = VALUES(present_days),
             unpaid_absent_days = VALUES(unpaid_absent_days),
             approved_overtime_hours = VALUES(approved_overtime_hours),
             overtime_pay = VALUES(overtime_pay),
             absence_deduction = VALUES(absence_deduction),
             late_arrival_deduction = VALUES(late_arrival_deduction),
             early_checkout_deduction = VALUES(early_checkout_deduction),
             total_deductions = VALUES(total_deductions),
             gross_salary = VALUES(gross_salary),
             net_salary = VALUES(net_salary),
             calculation_snapshot_json = VALUES(calculation_snapshot_json)`,
          [
            batchId, emp.employee_id, payrollMonth, calc.basicSalary, calc.totalAllowances,
            calc.workingDaysPerMonth, calc.standardHoursPerDay, calc.dailySalary, calc.hourlySalary,
            calc.attendanceSummary.presentDays, calc.attendanceSummary.halfDays,
            calc.attendanceSummary.unpaidAbsentDays, calc.attendanceSummary.paidLeaveDays,
            calc.attendanceSummary.unpaidLeaveDays, calc.attendanceSummary.weeklyOffDays,
            calc.attendanceSummary.holidayDays, calc.attendanceSummary.lateArrivalsCount,
            calc.attendanceSummary.deductibleLateMinutes, calc.attendanceSummary.earlyDepartureMinutes,
            calc.overtimeSummary.approvedOvertimeHours, calc.overtimeSummary.overtimePay,
            calc.deductionsBreakdown.absenceDeduction, calc.deductionsBreakdown.halfDayDeduction,
            calc.deductionsBreakdown.lateArrivalDeduction, calc.deductionsBreakdown.earlyCheckoutDeduction,
            calc.deductionsBreakdown.otherAuthorizedDeductions, calc.deductionsBreakdown.totalDeductions,
            calc.grossSalary, calc.netSalary, slipNo, JSON.stringify(calc),
          ]
        );
      }

      await conn.execute(
        `UPDATE payroll
         SET total_employees = ?, total_gross_amount = ?, total_deductions_amount = ?,
             total_overtime_amount = ?, total_net_payable = ?
         WHERE id = ?`,
        [employees.length, totalGross, totalDed, totalOt, totalNet, batchId]
      );

      return { batchId, payrollMonth, employeesCount: employees.length, totalGross, totalDed, totalOt, totalNet };
    });

    res.json({ message: 'Monthly payroll generated inside database transaction.', ...summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/payroll/:payrollMonth/finalize', authenticateJWT, authorizeRoles('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { payrollMonth } = req.params;
    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE payroll
         SET status = 'FINALIZED', is_locked = 1, finalized_by = ?, finalized_at = NOW()
         WHERE payroll_month = ?`,
        [req.user.userId, payrollMonth]
      );
      await conn.execute(
        `UPDATE payroll_details SET is_finalized = 1 WHERE payroll_month = ?`,
        [payrollMonth]
      );
      await conn.execute(
        `INSERT INTO audit_logs
          (actor_user_id, actor_role, action_type, entity_table, entity_id, new_values_json, reason, ip_address)
         VALUES (?, ?, 'PAYROLL_FINALIZE', 'payroll', ?, ?, 'Monthly payroll finalized and locked', ?)`,
        [req.user.userId, req.user.role, payrollMonth, JSON.stringify({ status: 'FINALIZED', is_locked: 1 }), req.ip]
      );
    });
    res.json({ message: `Payroll for ${payrollMonth} finalized and locked permanently.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/payroll/:payrollMonth/slip/:employeeId/pdf', authenticateJWT, ensureSelfOrHR, async (req, res) => {
  try {
    const { payrollMonth, employeeId } = req.params;
    const [rows] = await pool.execute(
      `SELECT pd.*, e.employee_code, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.name AS department_name, dg.title AS designation_title
       FROM payroll_details pd
       JOIN employees e ON e.id = pd.employee_id
       JOIN departments d ON d.id = e.department_id
       JOIN designations dg ON dg.id = e.designation_id
       WHERE pd.payroll_month = ? AND pd.employee_id = ? LIMIT 1`,
      [payrollMonth, employeeId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Salary slip not found' });
    const r = rows[0];

    const pdfBuffer = generateSalarySlipPDF({
      companyName: process.env.COMPANY_NAME,
      slipNumber: r.slip_number,
      payrollMonth: r.payroll_month,
      employeeName: r.employee_name,
      employeeCode: r.employee_code,
      designation: r.designation_title,
      department: r.department_name,
      workingDaysPerMonth: r.working_days_Per_month,
      basicSalary: r.basic_salary,
      allowances: r.total_allowances,
      presentDays: r.present_days,
      absentDays: r.unpaid_absent_days,
      paidLeave: r.paid_leave_days,
      unpaidLeave: r.unpaid_leave_days,
      lateArrivalDeductions: r.late_arrival_deduction,
      earlyDepartureDeductions: r.early_checkout_deduction,
      halfDayDeductions: r.half_day_deduction,
      overtimeHours: r.approved_overtime_hours,
      overtimeEarnings: r.overtime_pay,
      otherDeductions: r.other_authorized_deductions,
      totalDeductions: r.total_deductions,
      grossSalary: r.gross_salary,
      netSalary: r.net_salary,
      isFinalized: Boolean(r.is_finalized),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${r.slip_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
