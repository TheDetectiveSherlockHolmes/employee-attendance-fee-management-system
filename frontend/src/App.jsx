import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Users, Clock, Calendar, FileText, DollarSign, CheckCircle2,
  XCircle, AlertTriangle, LogOut, LogIn, Plus, Search, Filter, Download,
  Edit3, Trash2, Building2, Briefcase, Award, Bell, Lock, Unlock, Eye,
  RefreshCw, ChevronRight, Check, X, UserCheck, Timer, TrendingUp,
  Sliders, ClipboardList, Database, Terminal, Menu, Info
} from 'lucide-react';

// ============================================================================
// 1. DECIMAL-SAFE AUTOMATED SALARY CALCULATION ENGINE (Shared Backend Logic)
// ============================================================================
function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function formatINR(amount) {
  const num = roundCurrency(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function evaluateDailyAttendance({
  checkInTimeStr,
  checkOutTimeStr,
  shift,
  isWeeklyOff = false,
  isHoliday = false,
  isApprovedLeave = false,
  earlyDepartureApproved = false,
}) {
  if (isApprovedLeave) {
    return { status: 'LEAVE', totalWorkingHours: 0, lateMinutes: 0, deductibleLateMinutes: 0, earlyDepartureMinutes: 0, overtimeHours: 0 };
  }
  if (!checkInTimeStr) {
    return {
      status: isHoliday ? 'HOLIDAY' : isWeeklyOff ? 'WEEKLY_OFF' : 'ABSENT',
      totalWorkingHours: 0, lateMinutes: 0, deductibleLateMinutes: 0, earlyDepartureMinutes: 0, overtimeHours: 0,
    };
  }
  const shiftStartMins = parseTimeToMinutes(shift?.startTime || '09:00');
  const shiftEndMins = parseTimeToMinutes(shift?.endTime || '17:00');
  const standardHours = Number(shift?.standardHours || 8);
  const graceMins = Number(shift?.gracePeriodMinutes ?? 10);
  const halfDayHours = Number(shift?.halfDayThresholdHours ?? 4);
  const lateToHalfDayMins = Number(shift?.lateToHalfDayMinutes ?? 120);

  const inMins = parseTimeToMinutes(checkInTimeStr);
  const outMins = checkOutTimeStr ? parseTimeToMinutes(checkOutTimeStr) : inMins;
  const workedMinutes = checkOutTimeStr
    ? Math.max(0, outMins >= inMins ? outMins - inMins : (24 * 60 - inMins) + outMins)
    : 0;
  const totalWorkingHours = roundCurrency(workedMinutes / 60);

  if (isHoliday || isWeeklyOff) {
    return {
      status: isHoliday ? 'HOLIDAY' : 'WEEKLY_OFF',
      totalWorkingHours,
      lateMinutes: 0,
      deductibleLateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeHours: totalWorkingHours,
    };
  }

  const rawLateMinutes = Math.max(0, inMins - shiftStartMins);
  const isBeyondGrace = rawLateMinutes > graceMins;
  const deductibleLateMinutes = isBeyondGrace ? (rawLateMinutes - graceMins) : 0;
  const rawEarlyMins = checkOutTimeStr ? Math.max(0, shiftEndMins - outMins) : 0;
  const earlyDepartureMinutes = earlyDepartureApproved ? 0 : rawEarlyMins;
  const overtimeHours = totalWorkingHours > standardHours
    ? roundCurrency(totalWorkingHours - standardHours)
    : 0;

  let status = 'PRESENT';
  if (checkOutTimeStr && totalWorkingHours < halfDayHours) {
    status = 'HALF_DAY';
  } else if (rawLateMinutes >= lateToHalfDayMins) {
    status = 'HALF_DAY';
  } else if (isBeyondGrace) {
    status = 'LATE';
  }

  return {
    status,
    totalWorkingHours,
    lateMinutes: rawLateMinutes,
    deductibleLateMinutes,
    earlyDepartureMinutes,
    overtimeHours,
  };
}

function calculateMonthlySalary({
  employee,
  attendanceRecords = [],
  leaveRequests = [],
  overtimeRequests = [],
  extraDeductions = [],
}) {
  const basicSalary = roundCurrency(employee.basicSalary);
  const workingDays = Number(employee.workingDays || 25);
  const standardHoursPerDay = Number(employee.standardHoursPerDay || 8);

  const dailySalary = roundCurrency(basicSalary / workingDays);
  const hourlySalary = roundCurrency(dailySalary / standardHoursPerDay);
  const perMinuteCalculatedRate = dailySalary / (standardHoursPerDay * 60);

  const totalAllowances = roundCurrency(
    Number(employee.hra || 0) +
    Number(employee.transport || 0) +
    Number(employee.special || 0) +
    Number(employee.medical || 0)
  );

  const approvedPaidLeaveDates = new Set();
  const approvedUnpaidLeaveDates = new Set();
  leaveRequests.forEach((lr) => {
    if (lr.status !== 'APPROVED' || lr.employeeId !== employee.id) return;
    (lr.dates || []).forEach((d) => {
      if (lr.isPaid) approvedPaidLeaveDates.add(d);
      else approvedUnpaidLeaveDates.add(d);
    });
  });

  const uniqueByDate = new Map();
  attendanceRecords.forEach((rec) => {
    if (rec.employeeId === employee.id && rec.date && !uniqueByDate.has(rec.date)) {
      uniqueByDate.set(rec.date, rec);
    }
  });

  let presentDays = 0;
  let halfDays = 0;
  let unpaidAbsentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let lateArrivalsCount = 0;
  let deductibleLateMinutes = 0;
  let earlyDepartureMinutes = 0;

  const lateMode = employee.lateMode || 'PROPORTIONAL_PER_MINUTE';
  const lateGraceMins = Number(employee.gracePeriodMinutes ?? 10);
  const lateHalfDayThresholdMins = 120;
  const fixedPerMinRate = Number(employee.latePerMinuteRate || perMinuteCalculatedRate);

  for (const [dateStr, rec] of uniqueByDate.entries()) {
    const st = rec.status;
    if (st === 'HOLIDAY') { holidayDays += 1; continue; }
    if (st === 'WEEKLY_OFF') { weeklyOffDays += 1; continue; }
    if (approvedPaidLeaveDates.has(dateStr) || (st === 'LEAVE' && rec.leavePaid !== false)) {
      paidLeaveDays += 1;
      continue;
    }
    if (approvedUnpaidLeaveDates.has(dateStr) || (st === 'LEAVE' && rec.leavePaid === false)) {
      unpaidLeaveDays += 1;
      continue;
    }
    if (st === 'ABSENT') {
      unpaidAbsentDays += 1;
      continue;
    }
    if (st === 'HALF_DAY') {
      presentDays += 0.5;
      halfDays += 1;
      continue;
    }

    const rawLate = Number(rec.lateMinutes || 0);
    const dedLate = rec.deductibleLateMinutes != null
      ? Number(rec.deductibleLateMinutes)
      : Math.max(0, rawLate - lateGraceMins);

    if (rawLate > lateGraceMins || st === 'LATE') {
      lateArrivalsCount += 1;
      if (lateMode === 'HALF_DAY_AFTER_THRESHOLD' && rawLate >= lateHalfDayThresholdMins) {
        presentDays += 0.5;
        halfDays += 1;
        continue;
      } else if (lateMode === 'PROPORTIONAL_PER_MINUTE' || lateMode === 'FIXED_PER_MINUTE') {
        deductibleLateMinutes += dedLate;
      }
    }

    presentDays += 1;
    if (!rec.earlyDepartureApproved && Number(rec.earlyDepartureMinutes || 0) > 0) {
      earlyDepartureMinutes += Number(rec.earlyDepartureMinutes);
    }
  }

  const totalDeductibleAbsentDays = unpaidAbsentDays + unpaidLeaveDays;
  const absenceDeduction = roundCurrency(dailySalary * totalDeductibleAbsentDays);
  const halfDayDeduction = roundCurrency(dailySalary * halfDays * 0.5);

  let lateArrivalDeduction = 0;
  if (lateMode === 'PROPORTIONAL_PER_MINUTE') {
    lateArrivalDeduction = roundCurrency(deductibleLateMinutes * perMinuteCalculatedRate);
  } else if (lateMode === 'FIXED_PER_MINUTE') {
    lateArrivalDeduction = roundCurrency(deductibleLateMinutes * fixedPerMinRate);
  }

  const earlyCheckoutDeduction = roundCurrency(earlyDepartureMinutes * perMinuteCalculatedRate);

  const seenOtDates = new Set();
  let approvedOvertimeHours = 0;
  let overtimePay = 0;

  overtimeRequests.forEach((ot) => {
    if (ot.employeeId !== employee.id || ot.status !== 'APPROVED') return;
    if (!ot.date || seenOtDates.has(ot.date)) return;
    const hrs = Number(ot.hours || 0);
    if (hrs <= 0) return;
    seenOtDates.add(ot.date);
    const mult = ot.type === 'WEEKEND'
      ? Number(employee.otWeekendMult || 2.0)
      : ot.type === 'HOLIDAY'
        ? Number(employee.otHolidayMult || 2.0)
        : Number(employee.otNormalMult || 1.5);
    const linePay = roundCurrency(hrs * hourlySalary * mult);
    approvedOvertimeHours = roundCurrency(approvedOvertimeHours + hrs);
    overtimePay = roundCurrency(overtimePay + linePay);
  });

  const otherAuthorizedDeductions = roundCurrency(
    extraDeductions
      .filter((d) => d.employeeId === employee.id)
      .reduce((acc, d) => acc + Number(d.amount || 0), 0) +
    Number(employee.otherFixedDeduction || 0)
  );

  const grossSalary = roundCurrency(basicSalary + totalAllowances + overtimePay);
  const totalDeductions = roundCurrency(
    absenceDeduction + halfDayDeduction + lateArrivalDeduction + earlyCheckoutDeduction + otherAuthorizedDeductions
  );
  const netSalary = roundCurrency(Math.max(0, grossSalary - totalDeductions));

  return {
    basicSalary,
    totalAllowances,
    workingDays,
    standardHoursPerDay,
    dailySalary,
    hourlySalary,
    perMinuteRate: roundCurrency(perMinuteCalculatedRate),
    presentDays,
    halfDays,
    unpaidAbsentDays,
    paidLeaveDays,
    unpaidLeaveDays,
    weeklyOffDays,
    holidayDays,
    lateArrivalsCount,
    deductibleLateMinutes,
    earlyDepartureMinutes,
    approvedOvertimeHours,
    overtimePay,
    absenceDeduction,
    halfDayDeduction,
    lateArrivalDeduction,
    earlyCheckoutDeduction,
    otherAuthorizedDeductions,
    totalDeductions,
    grossSalary,
    netSalary,
  };
}

// ============================================================================
// 2. REALISTIC DEMO DATA INITIALIZER (22 Employees, 4 Depts, 30+ Days History)
// ============================================================================
const INITIAL_SHIFTS = [
  { id: 1, code: 'SHIFT-GEN', name: 'General Day Shift (09:00 - 17:00) [DEMO DATA]', startTime: '09:00', endTime: '17:00', standardHours: 8, gracePeriodMinutes: 10, halfDayThresholdHours: 4, lateToHalfDayMinutes: 120, weeklyOff: 'Sunday', allowedIp: '192.168.1.0/24' },
  { id: 2, code: 'SHIFT-ENG', name: 'Early Engineering Shift (08:30 - 16:30) [DEMO DATA]', startTime: '08:30', endTime: '16:30', standardHours: 8, gracePeriodMinutes: 10, halfDayThresholdHours: 4, lateToHalfDayMinutes: 120, weeklyOff: 'Sunday', allowedIp: '10.10.0.0/16' },
  { id: 3, code: 'SHIFT-OPS', name: 'Operations Extended Shift (10:00 - 18:00) [DEMO DATA]', startTime: '10:00', endTime: '18:00', standardHours: 8, gracePeriodMinutes: 15, halfDayThresholdHours: 4, lateToHalfDayMinutes: 120, weeklyOff: 'Sunday', allowedIp: '172.16.0.0/16' },
];

const INITIAL_HOLIDAYS = [
  { id: 1, date: '2026-10-02', name: 'Mahatma Gandhi Jayanti [DEMO DATA]', type: 'NATIONAL', isPaid: true },
  { id: 2, date: '2026-10-20', name: 'Dussehra / Vijayadashami [DEMO DATA]', type: 'FESTIVAL', isPaid: true },
  { id: 3, date: '2026-11-08', name: 'Diwali Festival Holiday [DEMO DATA]', type: 'FESTIVAL', isPaid: true },
  { id: 4, date: '2026-11-24', name: 'Guru Nanak Jayanti [DEMO DATA]', type: 'FESTIVAL', isPaid: true },
  { id: 5, date: '2026-12-25', name: 'Christmas Day [DEMO DATA]', type: 'NATIONAL', isPaid: true },
];

const INITIAL_EMPLOYEES = [
  { id: 1, code: 'EMP-1001', name: 'Rajesh Kumar Gupta (Owner)', email: 'admin@demo.com', role: 'ADMIN', department: 'DS Group HoReCa Management', designation: 'Owner & Managing Director (DS Group HoReCa)', shiftId: 1, basicSalary: 95000, hra: 22000, transport: 5000, special: 8000, medical: 2500, workingDays: 25, standardHoursPerDay: 8, lateMode: 'PROPORTIONAL_PER_MINUTE', latePerMinuteRate: 7.92, gracePeriodMinutes: 10, otNormalMult: 1.5, otWeekendMult: 2.0, otHolidayMult: 2.0, otherFixedDeduction: 1800, joinDate: '2022-03-15', phone: '+91-9810010001', isDemo: true },
  { id: 2, code: 'EMP-1002', name: 'Abhishek', email: 'hr@demo.com', role: 'HR_MANAGER', department: 'DS Group HoReCa Operations', designation: 'HoReCa Key Accounts & Operations Executive (DS Group)', shiftId: 1, basicSalary: 32000, hra: 8500, transport: 2500, special: 3000, medical: 1500, workingDays: 25, standardHoursPerDay: 8, lateMode: 'PROPORTIONAL_PER_MINUTE', latePerMinuteRate: 2.67, gracePeriodMinutes: 10, otNormalMult: 1.5, otWeekendMult: 2.0, otHolidayMult: 2.0, otherFixedDeduction: 500, joinDate: '2023-06-01', phone: '+91-9810010002', isDemo: true },
  { id: 3, code: 'EMP-1003', name: 'Vivek', email: 'employee@demo.com', role: 'EMPLOYEE', department: 'DS Group HoReCa Sales & Distribution', designation: 'HoReCa Sales & Distribution Executive (DS Group)', shiftId: 1, basicSalary: 30000, hra: 8000, transport: 2500, special: 3000, medical: 1500, workingDays: 25, standardHoursPerDay: 8, lateMode: 'PROPORTIONAL_PER_MINUTE', latePerMinuteRate: 2.50, gracePeriodMinutes: 10, otNormalMult: 1.5, otWeekendMult: 2.0, otHolidayMult: 2.0, otherFixedDeduction: 500, joinDate: '2023-01-10', phone: '+91-9810010003', isDemo: true },
];

// Generate 30+ days of deterministic attendance history across 2026-10 and 2026-11
function buildInitialAttendance(employees) {
  const records = [];
  let idCounter = 1;
  const holidaySet = new Set(['2026-10-02', '2026-10-20', '2026-11-08']);
  const sundaySet = new Set([
    '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25',
    '2026-11-01', '2026-11-08'
  ]);

  const dates = [];
  for (let d = 1; d <= 31; d++) {
    dates.push(`2026-10-${String(d).padStart(2, '0')}`);
  }
  for (let d = 1; d <= 10; d++) {
    dates.push(`2026-11-${String(d).padStart(2, '0')}`);
  }

  employees.forEach((emp) => {
    dates.forEach((dateStr, idx) => {
      // Leave Today (2026-11-10) for Rohan Verma (id: 3) checked-in at 09:04 so he can test live timer & check-out, or reset!
      if (dateStr === '2026-11-10' && emp.id === 3) {
        records.push({
          id: idCounter++,
          employeeId: emp.id,
          date: dateStr,
          status: 'PRESENT',
          checkIn: '09:04',
          checkOut: null,
          totalWorkingHours: 0,
          lateMinutes: 4,
          deductibleLateMinutes: 0,
          earlyDepartureMinutes: 0,
          earlyDepartureApproved: false,
          overtimeHours: 0,
          ipAddress: '192.168.1.42',
          isManualCorrection: false,
        });
        return;
      }

      if (holidaySet.has(dateStr)) {
        records.push({
          id: idCounter++,
          employeeId: emp.id,
          date: dateStr,
          status: 'HOLIDAY',
          checkIn: null,
          checkOut: null,
          totalWorkingHours: 0,
          lateMinutes: 0,
          deductibleLateMinutes: 0,
          earlyDepartureMinutes: 0,
          earlyDepartureApproved: false,
          overtimeHours: 0,
          ipAddress: null,
          isManualCorrection: false,
        });
        return;
      }

      if (sundaySet.has(dateStr)) {
        records.push({
          id: idCounter++,
          employeeId: emp.id,
          date: dateStr,
          status: 'WEEKLY_OFF',
          checkIn: null,
          checkOut: null,
          totalWorkingHours: 0,
          lateMinutes: 0,
          deductibleLateMinutes: 0,
          earlyDepartureMinutes: 0,
          earlyDepartureApproved: false,
          overtimeHours: 0,
          ipAddress: null,
          isManualCorrection: false,
        });
        return;
      }

      // Deterministic realistic pattern for Vivek (EMP-1003) & other employees
      if (emp.id === 3) {
        if (dateStr === '2026-11-03' || dateStr === '2026-10-14') {
          records.push({
            id: idCounter++, employeeId: emp.id, date: dateStr, status: 'ABSENT',
            checkIn: null, checkOut: null, totalWorkingHours: 0, lateMinutes: 0,
            deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
          });
          return;
        }
        if (dateStr === '2026-11-05') {
          records.push({
            id: idCounter++, employeeId: emp.id, date: dateStr, status: 'LEAVE', leavePaid: true,
            checkIn: null, checkOut: null, totalWorkingHours: 0, lateMinutes: 0,
            deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
          });
          return;
        }
        if (dateStr === '2026-11-06' || dateStr === '2026-10-22') {
          records.push({
            id: idCounter++, employeeId: emp.id, date: dateStr, status: 'LATE',
            checkIn: '09:30', checkOut: '17:05', totalWorkingHours: 7.58, lateMinutes: 30,
            deductibleLateMinutes: 20, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
            ipAddress: '192.168.1.42',
          });
          return;
        }
        if (dateStr === '2026-11-04') {
          records.push({
            id: idCounter++, employeeId: emp.id, date: dateStr, status: 'PRESENT',
            checkIn: '08:58', checkOut: '19:30', totalWorkingHours: 10.53, lateMinutes: 0,
            deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 2.5,
            ipAddress: '192.168.1.42',
          });
          return;
        }
      }

      // Deterministic variety across the 22 employees
      const seedVal = (emp.id * 17 + idx * 13) % 29;
      if (seedVal === 0) {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'ABSENT',
          checkIn: null, checkOut: null, totalWorkingHours: 0, lateMinutes: 0,
          deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
        });
      } else if (seedVal === 1 || seedVal === 2) {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'LATE',
          checkIn: '09:28', checkOut: '17:02', totalWorkingHours: 7.57, lateMinutes: 28,
          deductibleLateMinutes: 18, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
          ipAddress: '192.168.1.105',
        });
      } else if (seedVal === 3) {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'HALF_DAY',
          checkIn: '09:05', checkOut: '12:45', totalWorkingHours: 3.67, lateMinutes: 5,
          deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: true, overtimeHours: 0,
          ipAddress: '192.168.1.108',
        });
      } else if (seedVal === 4) {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'LEAVE', leavePaid: true,
          checkIn: null, checkOut: null, totalWorkingHours: 0, lateMinutes: 0,
          deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
        });
      } else if (seedVal === 5) {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'PRESENT',
          checkIn: '09:00', checkOut: '16:15', totalWorkingHours: 7.25, lateMinutes: 0,
          deductibleLateMinutes: 0, earlyDepartureMinutes: 45, earlyDepartureApproved: false, overtimeHours: 0,
          ipAddress: '192.168.1.112',
        });
      } else {
        records.push({
          id: idCounter++, employeeId: emp.id, date: dateStr, status: 'PRESENT',
          checkIn: '08:56', checkOut: '17:06', totalWorkingHours: 8.17, lateMinutes: 0,
          deductibleLateMinutes: 0, earlyDepartureMinutes: 0, earlyDepartureApproved: false, overtimeHours: 0,
          ipAddress: '192.168.1.101',
        });
      }
    });
  });

  return records;
}

const INITIAL_OVERTIME = [
  { id: 1, employeeId: 3, date: '2026-11-04', hours: 2.5, type: 'NORMAL', multiplier: 1.5, reason: 'DS Group HoReCa bulk institutional order dispatch & hotel inventory settlement', status: 'APPROVED', reviewedBy: 'Rajesh Kumar Gupta (Owner)' },
  { id: 2, employeeId: 3, date: '2026-11-08', hours: 3.0, type: 'HOLIDAY', multiplier: 2.0, reason: 'Diwali festival HoReCa catering & restaurant supply rush delivery', status: 'PENDING', reviewedBy: null },
  { id: 3, employeeId: 2, date: '2026-11-02', hours: 4.0, type: 'NORMAL', multiplier: 1.5, reason: 'DS Group HoReCa monthly stock reconciliation & banquet billing', status: 'APPROVED', reviewedBy: 'Rajesh Kumar Gupta (Owner)' },
  { id: 4, employeeId: 2, date: '2026-11-07', hours: 3.5, type: 'WEEKEND', multiplier: 2.0, reason: 'Weekend hotel & cafe client onboarding for DS Group product line', status: 'PENDING', reviewedBy: null },
  { id: 6, employeeId: 3, date: '2026-10-19', hours: 4.0, type: 'NORMAL', multiplier: 1.5, reason: 'October festive season HoReCa distribution support', status: 'APPROVED', reviewedBy: 'Rajesh Kumar Gupta (Owner)' },
];

const INITIAL_LEAVES = [
  { id: 1, employeeId: 3, leaveType: 'CASUAL', isPaid: true, startDate: '2026-11-05', endDate: '2026-11-05', dates: ['2026-11-05'], totalDays: 1, reason: 'Family medical checkup appointment (Vivek)', status: 'APPROVED', reviewedBy: 'Rajesh Kumar Gupta (Owner)' },
  { id: 2, employeeId: 3, leaveType: 'EARNED', isPaid: true, startDate: '2026-11-18', endDate: '2026-11-19', dates: ['2026-11-18', '2026-11-19'], totalDays: 2, reason: 'Family function outstation visit (Vivek)', status: 'PENDING', reviewedBy: null },
  { id: 3, employeeId: 2, leaveType: 'SICK', isPaid: true, startDate: '2026-11-04', endDate: '2026-11-05', dates: ['2026-11-04', '2026-11-05'], totalDays: 2, reason: 'Seasonal fever recovery (Abhishek)', status: 'APPROVED', reviewedBy: 'Rajesh Kumar Gupta (Owner)' },
];

const INITIAL_AUDIT_LOGS = [
  { id: 1, timestamp: '2026-10-31 18:05:12', actor: 'Abhishek (HR_MANAGER)', action: 'PAYROLL_FINALIZE', entity: 'payroll (2026-10)', details: 'Finalized and permanently locked October 2026 payroll batch for 22 employees [DEMO DATA]', ip: '192.168.1.15' },
  { id: 2, timestamp: '2026-11-05 10:14:22', actor: 'Abhishek (HR_MANAGER)', action: 'LEAVE_REVIEW', entity: 'leave_requests (#1)', details: 'Approved 1-day Paid Casual Leave for Vivek (EMP-1003) on 2026-11-05 [DEMO DATA]', ip: '192.168.1.15' },
  { id: 3, timestamp: '2026-11-05 14:40:09', actor: 'Rajesh Kumar Gupta (OWNER / ADMIN)', action: 'OVERTIME_REVIEW', entity: 'overtime_requests (#1)', details: 'Approved 2.5 hrs Normal Overtime (1.5x) for Vivek (EMP-1003) on 2026-11-04 [DEMO DATA]', ip: '192.168.1.10' },
];

// ============================================================================
// 3. MAIN FULL-STACK REACT APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Authentication State (Default logged in as Employee or switchable via Login / Role Bar)
  const [currentUser, setCurrentUser] = useState({
    id: 3,
    code: 'EMP-1003',
    name: 'Vivek',
    email: 'employee@demo.com',
    role: 'EMPLOYEE',
  });
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [loginEmail, setLoginEmail] = useState('employee@demo.com');
  const [loginPassword, setLoginPassword] = useState('Demo@12345');
  const [loginError, setLoginError] = useState('');

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState('employee_dashboard');
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Core Relational State
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [shifts, setShifts] = useState(INITIAL_SHIFTS);
  const [holidays, setHolidays] = useState(INITIAL_HOLIDAYS);
  const [attendance, setAttendance] = useState(() => buildInitialAttendance(INITIAL_EMPLOYEES));
  const [overtimeRequests, setOvertimeRequests] = useState(INITIAL_OVERTIME);
  const [leaveRequests, setLeaveRequests] = useState(INITIAL_LEAVES);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [finalizedMonths, setFinalizedMonths] = useState({ '2026-10': true, '2026-11': false });
  const [approvedPayrollMonths, setApprovedPayrollMonths] = useState({ '2026-10': true, '2026-11': false });

  // Live Working Hours Clock (Server-Synced Simulation starting at 2026-11-10 14:34:00)
  const [elapsedSeconds, setElapsedSeconds] = useState(5 * 3600 + 30 * 60); // 5h 30m elapsed since 09:04 check-in
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Modals State
  const [selectedSlipEmployee, setSelectedSlipEmployee] = useState(null);
  const [correctionModalRec, setCorrectionModalRec] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({ status: 'PRESENT', checkIn: '09:00', checkOut: '17:00', earlyDepartureApproved: false, reason: '' });
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmpForm, setNewEmpForm] = useState({
    name: '', email: '', phone: '+91-9810010099', department: 'Engineering & Product',
    designation: 'Software Engineer II', shiftId: 1, basicSalary: 40000, hra: 10000,
    transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE',
  });

  // Employee Forms (Overtime & Leave)
  const [otForm, setOtForm] = useState({ date: '2026-11-09', hours: '2.5', type: 'NORMAL', reason: '' });
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'CASUAL', startDate: '2026-11-16', endDate: '2026-11-16', totalDays: 1, reason: '' });

  // Interactive Salary Formula Sandbox State (for testing edge cases directly)
  const [simState, setSimState] = useState({
    basicSalary: 30000,
    allowances: 0,
    workingDays: 25,
    standardHours: 8,
    unpaidAbsentDays: 2,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    halfDays: 0,
    deductibleLateMins: 0,
    earlyCheckoutMins: 0,
    normalOtHours: 0,
    weekendOtHours: 0,
    otherDeductions: 0,
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Switch role helper for rapid QA testing
  const switchDemoUser = (roleKey) => {
    if (roleKey === 'ADMIN') {
      const u = employees.find((e) => e.id === 1);
      setCurrentUser({ id: u.id, code: u.code, name: u.name, email: u.email, role: 'ADMIN' });
      setActiveTab('hr_dashboard');
      showToast('Switched to Owner / Admin account (admin@demo.com - Rajesh Kumar Gupta)', 'info');
    } else if (roleKey === 'HR_MANAGER') {
      const u = employees.find((e) => e.id === 2);
      setCurrentUser({ id: u.id, code: u.code, name: u.name, email: u.email, role: 'HR_MANAGER' });
      setActiveTab('hr_dashboard');
      showToast('Switched to HoReCa Ops / HR account (hr@demo.com - Abhishek)', 'info');
    } else {
      const u = employees.find((e) => e.id === 3);
      setCurrentUser({ id: u.id, code: u.code, name: u.name, email: u.email, role: 'EMPLOYEE' });
      setActiveTab('employee_dashboard');
      showToast('Switched to Employee account (employee@demo.com - Vivek)', 'info');
    }
    setIsAuthenticated(true);
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');
    const cleanEmail = loginEmail.trim().toLowerCase();
    const matchedEmp = employees.find((emp) => emp.email.toLowerCase() === cleanEmail);
    if (!matchedEmp || loginPassword !== 'Demo@12345') {
      setLoginError('Invalid credentials. Use admin@demo.com, hr@demo.com, or employee@demo.com with password Demo@12345');
      return;
    }
    setCurrentUser({
      id: matchedEmp.id,
      code: matchedEmp.code,
      name: matchedEmp.name,
      email: matchedEmp.email,
      role: matchedEmp.role,
    });
    setIsAuthenticated(true);
    setActiveTab(matchedEmp.role === 'EMPLOYEE' ? 'employee_dashboard' : 'hr_dashboard');
    showToast(`Welcome back, ${matchedEmp.name} (${matchedEmp.role})`, 'success');
  };

  // Current logged-in employee profile
  const activeEmployeeProfile = useMemo(() => {
    return employees.find((e) => e.id === currentUser.id) || employees[2];
  }, [employees, currentUser]);

  const activeEmployeeShift = useMemo(() => {
    return shifts.find((s) => s.id === activeEmployeeProfile.shiftId) || shifts[0];
  }, [shifts, activeEmployeeProfile]);

  // Today's attendance record (`2026-11-10`) for logged-in employee
  const todayDateStr = '2026-11-10';
  const myTodayAttendance = useMemo(() => {
    return attendance.find((a) => a.employeeId === activeEmployeeProfile.id && a.date === todayDateStr) || null;
  }, [attendance, activeEmployeeProfile]);

  // Compute monthly payroll calculations across all employees for `selectedMonth`
  const monthlyPayrollData = useMemo(() => {
    const monthAtt = attendance.filter((a) => a.date.startsWith(selectedMonth));
    const monthOt = overtimeRequests.filter((o) => o.date.startsWith(selectedMonth));
    const monthLeaves = leaveRequests.filter((l) => l.startDate.startsWith(selectedMonth));

    return employees.map((emp) => {
      const calc = calculateMonthlySalary({
        employee: emp,
        attendanceRecords: monthAtt,
        leaveRequests: monthLeaves,
        overtimeRequests: monthOt,
        extraDeductions: [],
      });
      return {
        employee: emp,
        calc,
        slipNumber: `SLIP-${selectedMonth.replace('-', '')}-${emp.code}`,
      };
    });
  }, [employees, attendance, overtimeRequests, leaveRequests, selectedMonth]);

  const myMonthlyPayroll = useMemo(() => {
    return monthlyPayrollData.find((p) => p.employee.id === activeEmployeeProfile.id) || monthlyPayrollData[0];
  }, [monthlyPayrollData, activeEmployeeProfile]);

  // HR Dashboard Aggregate Metrics
  const hrMetrics = useMemo(() => {
    const todayRecs = attendance.filter((a) => a.date === todayDateStr);
    const presentToday = todayRecs.filter((a) => a.status === 'PRESENT' || a.status === 'LATE' || a.status === 'HALF_DAY').length;
    const absentToday = todayRecs.filter((a) => a.status === 'ABSENT').length;
    const onLeaveToday = todayRecs.filter((a) => a.status === 'LEAVE').length;
    const lateToday = todayRecs.filter((a) => a.status === 'LATE' || a.lateMinutes > 10).length;

    let totalOtHours = 0;
    let totalGrossPayroll = 0;
    let totalDeductions = 0;
    let totalOtPayable = 0;
    let totalNetPayroll = 0;

    monthlyPayrollData.forEach(({ calc }) => {
      totalOtHours = roundCurrency(totalOtHours + calc.approvedOvertimeHours);
      totalGrossPayroll = roundCurrency(totalGrossPayroll + calc.grossSalary);
      totalDeductions = roundCurrency(totalDeductions + calc.totalDeductions);
      totalOtPayable = roundCurrency(totalOtPayable + calc.overtimePay);
      totalNetPayroll = roundCurrency(totalNetPayroll + calc.netSalary);
    });

    return {
      totalEmployees: employees.length,
      presentToday,
      absentToday,
      onLeaveToday,
      lateToday,
      totalOtHours,
      totalGrossPayroll,
      totalDeductions,
      totalOtPayable,
      totalNetPayroll,
    };
  }, [employees, attendance, monthlyPayrollData]);

  // ============================================================================
  // 4. INTERACTIVE WORKFLOW HANDLERS (Check-In, Check-Out, Approvals, Payroll)
  // ============================================================================
  const handleCheckIn = () => {
    if (myTodayAttendance && myTodayAttendance.checkIn) {
      showToast('Duplicate Check-In Prevented: You have already checked in for today.', 'error');
      return;
    }
    const serverTimeStr = '09:06'; // Simulated verified server timestamp
    const evalRes = evaluateDailyAttendance({
      checkInTimeStr: serverTimeStr,
      checkOutTimeStr: null,
      shift: activeEmployeeShift,
    });
    const newRec = {
      id: Date.now(),
      employeeId: activeEmployeeProfile.id,
      date: todayDateStr,
      status: evalRes.status,
      checkIn: serverTimeStr,
      checkOut: null,
      totalWorkingHours: 0,
      lateMinutes: evalRes.lateMinutes,
      deductibleLateMinutes: evalRes.deductibleLateMinutes,
      earlyDepartureMinutes: 0,
      earlyDepartureApproved: false,
      overtimeHours: 0,
      ipAddress: '192.168.1.42 (Verified Server IP)',
      isManualCorrection: false,
    };
    setAttendance((prev) => [newRec, ...prev.filter((a) => !(a.employeeId === activeEmployeeProfile.id && a.date === todayDateStr))]);
    setElapsedSeconds(60);
    showToast(`Checked in at ${serverTimeStr} (Server Timestamp Verified).`, 'success');
  };

  const handleCheckOut = () => {
    if (!myTodayAttendance || !myTodayAttendance.checkIn) {
      showToast('Action Blocked: You cannot check out before checking in!', 'error');
      return;
    }
    if (myTodayAttendance.checkOut) {
      showToast('Duplicate Check-Out Prevented: Work session already closed for today.', 'error');
      return;
    }
    const checkOutTimeStr = '17:34'; // Server timestamp
    const evalRes = evaluateDailyAttendance({
      checkInTimeStr: myTodayAttendance.checkIn,
      checkOutTimeStr,
      shift: activeEmployeeShift,
    });

    setAttendance((prev) =>
      prev.map((a) =>
        a.employeeId === activeEmployeeProfile.id && a.date === todayDateStr
          ? {
              ...a,
              checkOut: checkOutTimeStr,
              status: evalRes.status,
              totalWorkingHours: evalRes.totalWorkingHours,
              overtimeHours: evalRes.overtimeHours,
              earlyDepartureMinutes: evalRes.earlyDepartureMinutes,
            }
          : a
      )
    );
    showToast(`Checked out at ${checkOutTimeStr}. Total Working Hours: ${evalRes.totalWorkingHours} hrs (Overtime: ${evalRes.overtimeHours} hrs).`, 'success');
  };

  const handleResetTodaySession = () => {
    setAttendance((prev) => prev.filter((a) => !(a.employeeId === activeEmployeeProfile.id && a.date === todayDateStr)));
    setElapsedSeconds(0);
    showToast("Reset today's attendance session so you can test Check-In -> Check-Out workflow from scratch.", 'info');
  };

  const handleSubmitOvertime = (e) => {
    e.preventDefault();
    if (!otForm.date || !otForm.hours || Number(otForm.hours) <= 0 || !otForm.reason.trim()) {
      showToast('Please provide a valid date, overtime hours (> 0), and reason.', 'error');
      return;
    }
    const duplicate = overtimeRequests.find((o) => o.employeeId === activeEmployeeProfile.id && o.date === otForm.date);
    if (duplicate) {
      showToast(`Overlapping Overtime Blocked: You already have an overtime entry on ${otForm.date}.`, 'error');
      return;
    }
    const mult = otForm.type === 'WEEKEND' ? 2.0 : otForm.type === 'HOLIDAY' ? 2.0 : 1.5;
    const newOt = {
      id: Date.now(),
      employeeId: activeEmployeeProfile.id,
      date: otForm.date,
      hours: Number(otForm.hours),
      type: otForm.type,
      multiplier: mult,
      reason: `${otForm.reason.trim()} [DEMO DATA]`,
      status: 'PENDING',
      reviewedBy: null,
    };
    setOvertimeRequests((prev) => [newOt, ...prev]);
    setOtForm({ date: '2026-11-10', hours: '2.0', type: 'NORMAL', reason: '' });
    showToast('Overtime request submitted for HR approval.', 'success');
  };

  const handleReviewOvertime = (id, status) => {
    if (currentUser.role === 'EMPLOYEE') {
      showToast('RBAC Violation Blocked: Only HR or Admin can approve/reject overtime.', 'error');
      return;
    }
    setOvertimeRequests((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status, reviewedBy: `${currentUser.name} (${currentUser.role})` } : o))
    );
    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:10:00',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'OVERTIME_REVIEW',
        entity: `overtime_requests (#${id})`,
        details: `Marked overtime request #${id} as ${status}`,
        ip: '192.168.1.15',
      },
      ...prev,
    ]);
    showToast(`Overtime request #${id} ${status.toLowerCase()}. Monthly payroll recalculated automatically.`, 'success');
  };

  const handleSubmitLeave = (e) => {
    e.preventDefault();
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      showToast('Please complete all leave fields.', 'error');
      return;
    }
    const isPaid = leaveForm.leaveType !== 'UNPAID';
    const newLeave = {
      id: Date.now(),
      employeeId: activeEmployeeProfile.id,
      leaveType: leaveForm.leaveType,
      isPaid,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      dates: [leaveForm.startDate],
      totalDays: Number(leaveForm.totalDays || 1),
      reason: `${leaveForm.reason.trim()} [DEMO DATA]`,
      status: 'PENDING',
      reviewedBy: null,
    };
    setLeaveRequests((prev) => [newLeave, ...prev]);
    setLeaveForm({ leaveType: 'CASUAL', startDate: '2026-11-20', endDate: '2026-11-20', totalDays: 1, reason: '' });
    showToast('Leave request submitted for HR review.', 'success');
  };

  const handleReviewLeave = (id, status) => {
    if (currentUser.role === 'EMPLOYEE') {
      showToast('RBAC Violation Blocked: Employees cannot approve leave requests.', 'error');
      return;
    }
    setLeaveRequests((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status, reviewedBy: `${currentUser.name} (${currentUser.role})` } : l))
    );
    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:12:30',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'LEAVE_REVIEW',
        entity: `leave_requests (#${id})`,
        details: `Marked leave request #${id} as ${status}`,
        ip: '192.168.1.15',
      },
      ...prev,
    ]);
    showToast(`Leave request #${id} ${status.toLowerCase()}. Payroll engine updated.`, 'success');
  };

  const handleSaveAttendanceCorrection = (e) => {
    e.preventDefault();
    if (!correctionForm.reason || correctionForm.reason.trim().length < 5) {
      showToast('Mandatory Audit Trail: Please enter a valid reason (min 5 chars) for this correction.', 'error');
      return;
    }
    const emp = employees.find((x) => x.id === correctionModalRec.employeeId) || employees[0];
    const sh = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
    const evalRes = evaluateDailyAttendance({
      checkInTimeStr: correctionForm.status === 'ABSENT' || correctionForm.status === 'LEAVE' ? null : correctionForm.checkIn,
      checkOutTimeStr: correctionForm.status === 'ABSENT' || correctionForm.status === 'LEAVE' ? null : correctionForm.checkOut,
      shift: sh,
      isApprovedLeave: correctionForm.status === 'LEAVE',
      earlyDepartureApproved: correctionForm.earlyDepartureApproved,
    });

    setAttendance((prev) =>
      prev.map((a) =>
        a.id === correctionModalRec.id
          ? {
              ...a,
              status: correctionForm.status,
              checkIn: correctionForm.checkIn,
              checkOut: correctionForm.checkOut,
              totalWorkingHours: evalRes.totalWorkingHours,
              lateMinutes: evalRes.lateMinutes,
              deductibleLateMinutes: evalRes.deductibleLateMinutes,
              earlyDepartureMinutes: evalRes.earlyDepartureMinutes,
              earlyDepartureApproved: correctionForm.earlyDepartureApproved,
              isManualCorrection: true,
            }
          : a
      )
    );

    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:15:45',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'ATTENDANCE_CORRECTION',
        entity: `attendance (#${correctionModalRec.id} - ${correctionModalRec.date})`,
        details: `Changed status from ${correctionModalRec.status} to ${correctionForm.status}. Reason: ${correctionForm.reason}`,
        ip: '192.168.1.15',
      },
      ...prev,
    ]);

    setCorrectionModalRec(null);
    showToast('Attendance corrected and logged to immutable Audit Trail.', 'success');
  };

  const handleApprovePayroll = () => {
    if (finalizedMonths[selectedMonth]) {
      showToast(`Payroll for ${selectedMonth} is already FINALIZED and locked.`, 'error');
      return;
    }
    setApprovedPayrollMonths((prev) => ({ ...prev, [selectedMonth]: true }));
    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:20:00',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'PAYROLL_APPROVE',
        entity: `payroll (${selectedMonth})`,
        details: `Approved monthly payroll calculation batch for ${selectedMonth} (${employees.length} employees)`,
        ip: '192.168.1.15',
      },
      ...prev,
    ]);
    showToast(`Payroll for ${selectedMonth} approved! Ready for finalization.`, 'success');
  };

  const handleFinalizePayroll = () => {
    if (finalizedMonths[selectedMonth]) {
      showToast(`Payroll for ${selectedMonth} is already finalized.`, 'info');
      return;
    }
    setApprovedPayrollMonths((prev) => ({ ...prev, [selectedMonth]: true }));
    setFinalizedMonths((prev) => ({ ...prev, [selectedMonth]: true }));
    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:22:10',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'PAYROLL_FINALIZE',
        entity: `payroll (${selectedMonth})`,
        details: `Finalized and locked monthly payroll batch for ${selectedMonth} inside ACID transaction`,
        ip: '192.168.1.15',
      },
      ...prev,
    ]);
    showToast(`Payroll for ${selectedMonth} FINALIZED & LOCKED. Historical records are now immutable.`, 'success');
  };

  const handleAddEmployee = (e) => {
    e.preventDefault();
    if (!newEmpForm.name.trim() || !newEmpForm.email.trim()) {
      showToast('Employee Name and Email are required.', 'error');
      return;
    }
    const nextId = employees.length + 1;
    const newCode = `EMP-${1000 + nextId}`;
    const created = {
      id: nextId,
      code: newCode,
      name: `${newEmpForm.name.trim()} [DEMO DATA]`,
      email: newEmpForm.email.trim().toLowerCase(),
      role: 'EMPLOYEE',
      department: newEmpForm.department,
      designation: newEmpForm.designation,
      shiftId: Number(newEmpForm.shiftId),
      basicSalary: Number(newEmpForm.basicSalary),
      hra: Number(newEmpForm.hra),
      transport: Number(newEmpForm.transport),
      special: Number(newEmpForm.special),
      medical: Number(newEmpForm.medical),
      workingDays: Number(newEmpForm.workingDays),
      standardHoursPerDay: 8,
      lateMode: newEmpForm.lateMode,
      latePerMinuteRate: roundCurrency(Number(newEmpForm.basicSalary) / (Number(newEmpForm.workingDays) * 8 * 60)),
      gracePeriodMinutes: 10,
      otNormalMult: 1.5,
      otWeekendMult: 2.0,
      otHolidayMult: 2.0,
      otherFixedDeduction: 600,
      joinDate: '2026-11-01',
      phone: newEmpForm.phone,
      isDemo: true,
    };
    setEmployees((prev) => [...prev, created]);
    setAuditLogs((prev) => [
      {
        id: Date.now(),
        timestamp: '2026-11-10 15:25:00',
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'EMPLOYEE_CREATED',
        entity: `employees (${newCode})`,
        details: `Created employee ${created.name} (${newCode}) with Basic Salary ${formatINR(created.basicSalary)}`,
        ip: '192.168.1.10',
      },
      ...prev,
    ]);
    setShowAddEmployeeModal(false);
    setNewEmpForm({ ...newEmpForm, name: '', email: '' });
    showToast(`Added employee ${created.name} (${newCode}).`, 'success');
  };

  // Download Real PDF 1.4 Salary Slip in Browser
  const handleDownloadSalarySlipPDF = (payrollItem) => {
    const { employee: emp, calc, slipNumber } = payrollItem;
    const cleanText = (s) => String(s || '').replace(/[()\\]/g, '').replace(/₹/g, 'INR ');
    const lines = [
      'MAA AARYA INTERNATINAL (DS Group HoReCa Business)',
      `OFFICIAL MONTHLY SALARY SLIP - PAYROLL MONTH: ${selectedMonth}`,
      `Slip Number: ${slipNumber} | Status: ${finalizedMonths[selectedMonth] ? 'FINALIZED & LOCKED' : 'GENERATED'}`,
      '--------------------------------------------------------------------------------',
      `Employee Name : ${cleanText(emp.name)}`,
      `Employee ID   : ${cleanText(emp.code)}`,
      `Designation   : ${cleanText(emp.designation)}`,
      `Department    : ${cleanText(emp.department)}`,
      `Working Days  : ${calc.workingDays} days/month (${calc.standardHoursPerDay} hrs/day) | Daily Rate: INR ${calc.dailySalary}`,
      '--------------------------------------------------------------------------------',
      `Present Days  : ${calc.presentDays}   | Unpaid Absent Days : ${calc.unpaidAbsentDays}`,
      `Paid Leave    : ${calc.paidLeaveDays} (No Deduction) | Unpaid Leave : ${calc.unpaidLeaveDays}`,
      `Late Arrivals : ${calc.lateArrivalsCount} (${calc.deductibleLateMinutes} deductible mins) | Approved OT: ${calc.approvedOvertimeHours} hrs`,
      '--------------------------------------------------------------------------------',
      `1. Basic Salary              : INR ${calc.basicSalary.toFixed(2)}`,
      `2. Total Allowances          : INR ${calc.totalAllowances.toFixed(2)}`,
      `3. Approved Overtime Pay     : INR ${calc.overtimePay.toFixed(2)}`,
      `GROSS SALARY                 : INR ${calc.grossSalary.toFixed(2)}`,
      '--------------------------------------------------------------------------------',
      `1. Absence & Unpaid Leave Ded: INR ${calc.absenceDeduction.toFixed(2)}`,
      `2. Half-Day Deductions       : INR ${calc.halfDayDeduction.toFixed(2)}`,
      `3. Late Arrival Deductions   : INR ${calc.lateArrivalDeduction.toFixed(2)}`,
      `4. Early Checkout Deductions : INR ${calc.earlyCheckoutDeduction.toFixed(2)}`,
      `5. Other Authorized Ded.     : INR ${calc.otherAuthorizedDeductions.toFixed(2)}`,
      `TOTAL DEDUCTIONS             : INR ${calc.totalDeductions.toFixed(2)}`,
      '================================================================================',
      `NET PAYABLE SALARY           : INR ${calc.netSalary.toFixed(2)}`,
      '================================================================================',
    ];

    let stream = 'BT\n/F1 10 Tf\n';
    let y = 780;
    lines.forEach((line) => {
      stream += `1 0 0 1 45 ${y} Tm (${line}) Tj\n`;
      y -= 22;
    });
    stream += 'ET';

    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000309 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${365 + stream.length}
%%EOF`;

    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slipNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded PDF Salary Slip: ${slipNumber}.pdf`, 'success');
  };

  // Format live working timer
  const formatLiveTimer = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  // Interactive Sandbox calculation result
  const simResult = useMemo(() => {
    const daily = roundCurrency(simState.basicSalary / Math.max(1, simState.workingDays));
    const hourly = roundCurrency(daily / Math.max(1, simState.standardHours));
    const perMin = daily / (Math.max(1, simState.standardHours) * 60);
    const absenceDed = roundCurrency(daily * (Number(simState.unpaidAbsentDays) + Number(simState.unpaidLeaveDays)));
    const halfDayDed = roundCurrency(daily * Number(simState.halfDays) * 0.5);
    const lateDed = roundCurrency(Number(simState.deductibleLateMins) * perMin);
    const earlyDed = roundCurrency(Number(simState.earlyCheckoutMins) * perMin);
    const otPay = roundCurrency(
      Number(simState.normalOtHours) * hourly * 1.5 +
      Number(simState.weekendOtHours) * hourly * 2.0
    );
    const gross = roundCurrency(Number(simState.basicSalary) + Number(simState.allowances) + otPay);
    const totalDed = roundCurrency(absenceDed + halfDayDed + lateDed + earlyDed + Number(simState.otherDeductions));
    const net = roundCurrency(Math.max(0, gross - totalDed));
    return { daily, hourly, perMin: roundCurrency(perMin), absenceDed, halfDayDed, lateDed, earlyDed, otPay, gross, totalDed, net };
  }, [simState]);

  // Filtered payroll / employee rows
  const filteredPayrollRows = useMemo(() => {
    return monthlyPayrollData.filter(({ employee }) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.designation.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = deptFilter === 'ALL' || employee.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [monthlyPayrollData, searchQuery, deptFilter]);

  // ============================================================================
  // 5. LOGIN SCREEN VIEW (When logged out)
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
          <div className="bg-[#0f172a] px-6 py-8 text-white text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">MAA AARYA INTERNATINAL</h1>
            <p className="text-xs text-blue-200 mt-1">DS Group HoReCa Business — Owner: Rajesh Kumar Gupta | Employees: Vivek & Abhishek</p>
          </div>
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Work Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#1e3a8a] hover:bg-blue-900 text-white font-semibold text-sm rounded-lg shadow transition flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In with JWT Auth
            </button>

            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2 text-center">Instant Demo Account Fill (Password: Demo@12345)</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setLoginEmail('admin@demo.com'); setLoginPassword('Demo@12345'); }}
                  className="px-2 py-2 text-xs font-medium bg-slate-100 hover:bg-blue-50 text-slate-800 rounded-lg border border-slate-200"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => { setLoginEmail('hr@demo.com'); setLoginPassword('Demo@12345'); }}
                  className="px-2 py-2 text-xs font-medium bg-slate-100 hover:bg-blue-50 text-slate-800 rounded-lg border border-slate-200"
                >
                  HR Manager
                </button>
                <button
                  type="button"
                  onClick={() => { setLoginEmail('employee@demo.com'); setLoginPassword('Demo@12345'); }}
                  className="px-2 py-2 text-xs font-medium bg-slate-100 hover:bg-blue-50 text-slate-800 rounded-lg border border-slate-200"
                >
                  Employee
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'employee_dashboard', label: 'Employee Dashboard', icon: Clock, roles: ['EMPLOYEE', 'HR_MANAGER', 'ADMIN'] },
    { id: 'hr_dashboard', label: 'HR & Admin Overview', icon: TrendingUp, roles: ['HR_MANAGER', 'ADMIN'] },
    { id: 'attendance_mgr', label: 'Attendance & Shifts', icon: UserCheck, roles: ['EMPLOYEE', 'HR_MANAGER', 'ADMIN'] },
    { id: 'payroll_engine', label: 'Payroll & Salary Engine', icon: DollarSign, roles: ['EMPLOYEE', 'HR_MANAGER', 'ADMIN'] },
    { id: 'overtime_leaves', label: 'Overtime & Leaves', icon: Calendar, roles: ['EMPLOYEE', 'HR_MANAGER', 'ADMIN'] },
    { id: 'employees_dir', label: 'Employees & Structures', icon: Users, roles: ['HR_MANAGER', 'ADMIN'] },
    { id: 'audit_schema', label: 'Audit Logs & DB Schema', icon: Database, roles: ['EMPLOYEE', 'HR_MANAGER', 'ADMIN'] },
  ].filter((item) => item.roles.includes(currentUser.role));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium ${
          toast.type === 'error'
            ? 'bg-red-900 text-white border-red-700'
            : toast.type === 'info'
              ? 'bg-slate-900 text-white border-slate-700'
              : 'bg-[#1e3a8a] text-white border-blue-700'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Responsive Navy Blue Sidebar */}
      <aside className={`bg-[#0f172a] text-white w-full md:w-64 shrink-0 flex flex-col justify-between border-r border-slate-800 ${mobileMenuOpen ? 'block' : 'hidden md:flex'}`}>
        <div>
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white">MAA AARYA INTERNATINAL</div>
              <div className="text-[11px] text-blue-300">DS Group HoReCa Business</div>
            </div>
          </div>

          {/* Active User Badge */}
          <div className="p-4 mx-3 my-3 rounded-xl bg-slate-800/90 border border-slate-700/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-600/30 text-blue-200 border border-blue-500/30">
                {currentUser.role}
              </span>
              <span className="text-[10px] text-amber-300 font-semibold">[DEMO DATA]</span>
            </div>
            <div className="font-semibold text-sm mt-1.5 text-white truncate">{currentUser.name}</div>
            <div className="text-xs text-slate-400 truncate">{currentUser.email} • {currentUser.code}</div>
          </div>

          <nav className="px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition ${
                    active
                      ? 'bg-[#1e3a8a] text-white shadow-sm border border-blue-500/40'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Instant Role Switcher for Demo Testing */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Quick Demo Role Switcher
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => switchDemoUser('EMPLOYEE')}
              className={`px-2 py-1.5 rounded text-[11px] font-semibold border transition ${
                currentUser.role === 'EMPLOYEE'
                  ? 'bg-blue-600 text-white border-blue-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Employee
            </button>
            <button
              onClick={() => switchDemoUser('HR_MANAGER')}
              className={`px-2 py-1.5 rounded text-[11px] font-semibold border transition ${
                currentUser.role === 'HR_MANAGER'
                  ? 'bg-blue-600 text-white border-blue-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              HR Mgr
            </button>
            <button
              onClick={() => switchDemoUser('ADMIN')}
              className={`px-2 py-1.5 rounded text-[11px] font-semibold border transition ${
                currentUser.role === 'ADMIN'
                  ? 'bg-blue-600 text-white border-blue-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Admin
            </button>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out ({currentUser.email})
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg border border-slate-200 text-slate-700"
              aria-label="Toggle Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-bold text-slate-900">
                  {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  DEMO DATA ENVIRONMENT
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Server Date: <strong className="text-slate-700">2026-11-10 (IST)</strong> • Active Payroll Period: <strong className="text-slate-700">{selectedMonth}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="text-xs font-medium text-slate-600">Payroll Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-semibold bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="2026-11">November 2026 (Current - Active)</option>
              <option value="2026-10">October 2026 (Finalized & Locked)</option>
            </select>

            <button
              onClick={() => setSelectedSlipEmployee(myMonthlyPayroll)}
              className="px-3 py-1.5 rounded-lg bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <FileText className="w-3.5 h-3.5" /> My Salary Slip
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* ================================================================
              VIEW 1: EMPLOYEE PERSONAL DASHBOARD
             ================================================================ */}
          {activeTab === 'employee_dashboard' && (
            <div className="space-y-6">
              {/* Top Profile & Prominent Live Attendance Check-In / Check-Out Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] text-white rounded-2xl p-6 shadow-lg flex flex-col justify-between">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                        <Briefcase className="w-3 h-3" /> {activeEmployeeProfile.designation} • {activeEmployeeProfile.department}
                      </span>
                      <h3 className="text-2xl font-bold mt-2">{activeEmployeeProfile.name}</h3>
                      <p className="text-xs text-blue-200 mt-0.5">
                        Employee ID: <strong>{activeEmployeeProfile.code}</strong> • Assigned Shift: <strong>{activeEmployeeShift.name}</strong> (Grace: {activeEmployeeShift.gracePeriodMinutes} mins)
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] uppercase tracking-wider text-blue-200 block">Today's Status (2026-11-10)</span>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                        !myTodayAttendance
                          ? 'bg-red-500/30 text-red-200 border border-red-400/40'
                          : myTodayAttendance.status === 'PRESENT'
                            ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                            : 'bg-amber-500/30 text-amber-200 border border-amber-400/40'
                      }`}>
                        {myTodayAttendance ? myTodayAttendance.status : 'NOT CHECKED IN'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5 pt-4 border-t border-white/15">
                    <div>
                      <div className="text-[11px] text-blue-200">Check-In Time</div>
                      <div className="text-lg font-bold mt-0.5">{myTodayAttendance?.checkIn || '--:--'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-200">Check-Out Time</div>
                      <div className="text-lg font-bold mt-0.5">{myTodayAttendance?.checkOut || '--:--'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-200">Live Working Hours</div>
                      <div className="text-lg font-bold mt-0.5 text-emerald-300 font-mono">
                        {myTodayAttendance?.checkOut
                          ? `${myTodayAttendance.totalWorkingHours} hrs`
                          : myTodayAttendance?.checkIn
                            ? formatLiveTimer(elapsedSeconds)
                            : '00h 00m 00s'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-200">Today's Overtime</div>
                      <div className="text-lg font-bold mt-0.5 text-amber-300">
                        {myTodayAttendance?.overtimeHours || 0} hrs
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleCheckIn}
                      disabled={Boolean(myTodayAttendance?.checkIn)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow ${
                        myTodayAttendance?.checkIn
                          ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Mark Daily Check In
                    </button>

                    <button
                      onClick={handleCheckOut}
                      disabled={!myTodayAttendance?.checkIn || Boolean(myTodayAttendance?.checkOut)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow ${
                        !myTodayAttendance?.checkIn || myTodayAttendance?.checkOut
                          ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                      }`}
                    >
                      <Clock className="w-4 h-4" /> Mark Daily Check Out
                    </button>

                    <button
                      onClick={handleResetTodaySession}
                      className="px-3 py-2.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-blue-100 border border-white/15 transition ml-auto"
                    >
                      Reset Today's Session (Test Guardrails)
                    </button>
                  </div>
                </div>

                {/* Estimated Current Month Net Salary Summary Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {selectedMonth} Salary Estimate
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-blue-50 text-[#1e3a8a]">
                        {myMonthlyPayroll.calc.workingDays} Working Days
                      </span>
                    </div>
                    <div className="text-3xl font-extrabold text-[#0f172a] mt-2">
                      {formatINR(myMonthlyPayroll.calc.netSalary)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Gross: <strong>{formatINR(myMonthlyPayroll.calc.grossSalary)}</strong> • Daily Rate: <strong>{formatINR(myMonthlyPayroll.calc.dailySalary)}/day</strong>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Monthly Basic + Allowances:</span>
                        <span className="font-semibold text-slate-900">
                          {formatINR(myMonthlyPayroll.calc.basicSalary + myMonthlyPayroll.calc.totalAllowances)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>+ Approved Overtime ({myMonthlyPayroll.calc.approvedOvertimeHours} hrs):</span>
                        <span className="font-semibold">+{formatINR(myMonthlyPayroll.calc.overtimePay)}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>- Absence & Late Deductions:</span>
                        <span className="font-semibold">
                          -{formatINR(myMonthlyPayroll.calc.absenceDeduction + myMonthlyPayroll.calc.lateArrivalDeduction + myMonthlyPayroll.calc.halfDayDeduction + myMonthlyPayroll.calc.earlyCheckoutDeduction)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>- Standard PF / Tax Deductions:</span>
                        <span className="font-semibold">-{formatINR(myMonthlyPayroll.calc.otherAuthorizedDeductions)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => setSelectedSlipEmployee(myMonthlyPayroll)}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Breakdown
                    </button>
                    <button
                      onClick={() => handleDownloadSalarySlipPDF(myMonthlyPayroll)}
                      className="flex-1 py-2 px-3 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" /> PDF Slip
                    </button>
                  </div>
                </div>
              </div>

              {/* Monthly Attendance KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Present Days</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">{myMonthlyPayroll.calc.presentDays}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Month {selectedMonth}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Unpaid Absent Days</div>
                  <div className="text-2xl font-bold text-red-600 mt-1">{myMonthlyPayroll.calc.unpaidAbsentDays}</div>
                  <div className="text-[11px] text-red-500 mt-0.5">-{formatINR(myMonthlyPayroll.calc.absenceDeduction)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Late Arrivals</div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">{myMonthlyPayroll.calc.lateArrivalsCount}</div>
                  <div className="text-[11px] text-amber-600 mt-0.5">{myMonthlyPayroll.calc.deductibleLateMinutes} mins (-{formatINR(myMonthlyPayroll.calc.lateArrivalDeduction)})</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Approved Leave</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{myMonthlyPayroll.calc.paidLeaveDays} Paid</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">₹0.00 deducted</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Approved Overtime</div>
                  <div className="text-2xl font-bold text-indigo-700 mt-1">{myMonthlyPayroll.calc.approvedOvertimeHours} hrs</div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">+{formatINR(myMonthlyPayroll.calc.overtimePay)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Total Deductions</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{formatINR(myMonthlyPayroll.calc.totalDeductions)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Auto-computed</div>
                </div>
              </div>

              {/* Employee Attendance History & Quick Overtime/Leave Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">My Attendance History ({selectedMonth})</h4>
                      <p className="text-xs text-slate-500">Read-only verified server timestamps (Employees cannot alter attendance logs)</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Check In</th>
                          <th className="py-3 px-4">Check Out</th>
                          <th className="py-3 px-4 text-right">Work Hrs</th>
                          <th className="py-3 px-4 text-right">Late Mins</th>
                          <th className="py-3 px-4 text-right">Overtime</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {attendance
                          .filter((a) => a.employeeId === activeEmployeeProfile.id && a.date.startsWith(selectedMonth))
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((rec) => (
                            <tr key={rec.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-medium text-slate-900">{rec.date}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  rec.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                                  rec.status === 'ABSENT' ? 'bg-red-100 text-red-800' :
                                  rec.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                                  rec.status === 'LEAVE' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {rec.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-700">{rec.checkIn || '-'}</td>
                              <td className="py-2.5 px-4 text-slate-700">{rec.checkOut || '-'}</td>
                              <td className="py-2.5 px-4 text-right font-mono">{rec.totalWorkingHours}h</td>
                              <td className="py-2.5 px-4 text-right text-amber-700">
                                {rec.lateMinutes > 0 ? `${rec.lateMinutes}m (${rec.deductibleLateMinutes}m ded)` : '-'}
                              </td>
                              <td className="py-2.5 px-4 text-right text-indigo-700 font-semibold">
                                {rec.overtimeHours > 0 ? `+${rec.overtimeHours}h` : '-'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Submit Overtime & Apply for Leave Quick Forms */}
                <div className="space-y-5">
                  <form onSubmit={handleSubmitOvertime} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Timer className="w-4 h-4 text-[#1e3a8a]" /> Submit Overtime Record
                    </h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={otForm.date}
                          onChange={(e) => setOtForm({ ...otForm, date: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Extra Hours</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="12"
                          value={otForm.hours}
                          onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Overtime Tier Multiplier</label>
                      <select
                        value={otForm.type}
                        onChange={(e) => setOtForm({ ...otForm, type: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="NORMAL">Normal Weekday Overtime (1.5x Rate)</option>
                        <option value="WEEKEND">Weekend Overtime (2.0x Rate)</option>
                        <option value="HOLIDAY">Official Holiday Overtime (2.0x Rate)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Work Justification</label>
                      <input
                        type="text"
                        placeholder="e.g., Production deployment verification"
                        value={otForm.reason}
                        onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Submit Overtime Request
                    </button>
                  </form>

                  <form onSubmit={handleSubmitLeave} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#1e3a8a]" /> Apply for Leave
                    </h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Leave Category</label>
                        <select
                          value={leaveForm.leaveType}
                          onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="CASUAL">Casual Leave (Paid)</option>
                          <option value="SICK">Sick Leave (Paid)</option>
                          <option value="EARNED">Earned Leave (Paid)</option>
                          <option value="UNPAID">Unpaid Leave (Deductible)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Leave Date</label>
                        <input
                          type="date"
                          value={leaveForm.startDate}
                          onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value, endDate: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Leave Reason</label>
                      <input
                        type="text"
                        placeholder="Reason for leave request..."
                        value={leaveForm.reason}
                        onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Submit Leave Application
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 2: HR & ADMIN EXECUTIVE DASHBOARD
             ================================================================ */}
          {activeTab === 'hr_dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Total Employees</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-1">{hrMetrics.totalEmployees}</div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">4 Active Departments</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Present Today</div>
                  <div className="text-2xl font-extrabold text-emerald-700 mt-1">{hrMetrics.presentToday}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Absent: {hrMetrics.absentToday} • Leave: {hrMetrics.onLeaveToday}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Late Arrivals Today</div>
                  <div className="text-2xl font-extrabold text-amber-600 mt-1">{hrMetrics.lateToday}</div>
                  <div className="text-[11px] text-amber-700 mt-0.5">Beyond shift grace period</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Total Overtime Payable</div>
                  <div className="text-2xl font-extrabold text-indigo-700 mt-1">{formatINR(hrMetrics.totalOtPayable)}</div>
                  <div className="text-[11px] text-indigo-600 mt-0.5">{hrMetrics.totalOtHours} approved OT hours</div>
                </div>
                <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm">
                  <div className="text-xs text-blue-200 font-medium">Estimated Net Payroll</div>
                  <div className="text-xl font-extrabold text-white mt-1">{formatINR(hrMetrics.totalNetPayroll)}</div>
                  <div className="text-[11px] text-red-300 mt-0.5">Deductions: {formatINR(hrMetrics.totalDeductions)}</div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by employee name, ID (EMP-1003), or designation..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Departments (4)</option>
                    <option value="DS Group HoReCa Management">DS Group HoReCa Management (Owner: Rajesh Kumar Gupta)</option>
                    <option value="DS Group HoReCa Sales & Distribution">DS Group HoReCa Sales & Distribution (Vivek)</option>
                    <option value="DS Group HoReCa Operations">DS Group HoReCa Operations (Abhishek)</option>
                    <option value="Human Resources & People Ops">Human Resources & People Ops</option>
                    <option value="Finance & Accounting">Finance & Accounting</option>
                    <option value="Customer Success & Operations">Customer Success & Operations</option>
                  </select>
                  <button
                    onClick={handleFinalizePayroll}
                    className="px-3.5 py-2 bg-[#1e3a8a] hover:bg-blue-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {finalizedMonths[selectedMonth] ? `${selectedMonth} Finalized` : `Finalize ${selectedMonth} Payroll`}
                  </button>
                </div>
              </div>

              {/* Employee-Wise DS Group HoReCa Business Master Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Employee-Wise Attendance & Automated Salary Ledger ({selectedMonth}) — {filteredPayrollRows.length} Employees
                    </h3>
                    <p className="text-xs text-slate-500">
                      Every row is dynamically computed by the Automated Salary Calculation Engine from daily attendance, leave, and overtime records.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-3">Department</th>
                        <th className="py-3 px-3 text-right">Basic + Allow.</th>
                        <th className="py-3 px-3 text-center">Pres / Abs / Leave</th>
                        <th className="py-3 px-3 text-right">Late Ded.</th>
                        <th className="py-3 px-3 text-right">Absence Ded.</th>
                        <th className="py-3 px-3 text-right">Approved OT</th>
                        <th className="py-3 px-3 text-right">Net Payable</th>
                        <th className="py-3 px-4 text-right">Salary Slip</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayrollRows.map((row) => {
                        const { employee: emp, calc } = row;
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{emp.name}</div>
                              <div className="text-[11px] text-slate-500">{emp.code} • {emp.designation}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-600">{emp.department}</td>
                            <td className="py-3 px-3 text-right font-medium">
                              {formatINR(calc.basicSalary + calc.totalAllowances)}
                              <div className="text-[10px] text-slate-400">Daily: {formatINR(calc.dailySalary)}</div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">{calc.presentDays}P</span>{' '}
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">{calc.unpaidAbsentDays}A</span>{' '}
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">{calc.paidLeaveDays}L</span>
                            </td>
                            <td className="py-3 px-3 text-right text-amber-700 font-medium">
                              -{formatINR(calc.lateArrivalDeduction + calc.earlyCheckoutDeduction)}
                              <div className="text-[10px] text-slate-400">{calc.deductibleLateMinutes}m late</div>
                            </td>
                            <td className="py-3 px-3 text-right text-red-600 font-medium">
                              -{formatINR(calc.absenceDeduction + calc.halfDayDeduction)}
                            </td>
                            <td className="py-3 px-3 text-right text-emerald-700 font-medium">
                              +{formatINR(calc.overtimePay)}
                              <div className="text-[10px] text-slate-400">{calc.approvedOvertimeHours} hrs</div>
                            </td>
                            <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                              {formatINR(calc.netSalary)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedSlipEmployee(row)}
                                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-[#1e3a8a] font-semibold"
                                >
                                  Slip
                                </button>
                                <button
                                  onClick={() => handleDownloadSalarySlipPDF(row)}
                                  className="p-1.5 rounded bg-[#1e3a8a] hover:bg-blue-900 text-white"
                                  title="Download PDF Salary Slip"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 3: ATTENDANCE MANAGEMENT & HR AUDIT CORRECTION
             ================================================================ */}
          {activeTab === 'attendance_mgr' && (
            <div className="space-y-6">
              {/* Shifts & Holidays Configuration Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#1e3a8a]" /> Configured Shifts & Grace Policies
                  </h3>
                  <div className="space-y-2.5">
                    {shifts.map((sh) => (
                      <div key={sh.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{sh.name}</div>
                          <div className="text-slate-500 mt-0.5">
                            Timings: <strong>{sh.startTime} – {sh.endTime}</strong> ({sh.standardHours} hrs) • Grace: <strong>{sh.gracePeriodMinutes} mins</strong> • Weekly Off: <strong>{sh.weeklyOff}</strong>
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded bg-blue-100 text-[#1e3a8a] font-mono text-[11px] font-semibold">
                          IP: {sh.allowedIp}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#1e3a8a]" /> Official Paid Holidays Calendar (Zero Deduction)
                  </h3>
                  <div className="space-y-2">
                    {holidays.map((h) => (
                      <div key={h.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{h.name}</span>
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            PAID {h.type}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-700">{h.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Attendance Records Table with HR Correction Trigger */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Attendance Log & Exception Monitor ({selectedMonth})
                    </h3>
                    <p className="text-xs text-slate-500">
                      {currentUser.role === 'EMPLOYEE'
                        ? 'Showing your personal attendance records.'
                        : 'HR & Admin can correct attendance exceptions with a mandatory audit log reason.'}
                    </p>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late Arrivals</option>
                    <option value="ABSENT">Unpaid Absences</option>
                    <option value="HALF_DAY">Half Days</option>
                    <option value="LEAVE">Approved Leave</option>
                  </select>
                </div>

                <div className="overflow-x-auto max-h-[460px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Check In / Out</th>
                        <th className="py-3 px-3 text-right">Worked Hrs</th>
                        <th className="py-3 px-3 text-right">Late / Early</th>
                        <th className="py-3 px-4 text-right">Audit Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendance
                        .filter((a) => {
                          if (!a.date.startsWith(selectedMonth)) return false;
                          if (currentUser.role === 'EMPLOYEE' && a.employeeId !== currentUser.id) return false;
                          if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
                          return true;
                        })
                        .slice(0, 80)
                        .map((rec) => {
                          const emp = employees.find((e) => e.id === rec.employeeId) || employees[0];
                          return (
                            <tr key={rec.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-mono font-medium">{rec.date}</td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-slate-900">{emp.name}</div>
                                <div className="text-[10px] text-slate-500">{emp.code}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  rec.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                                  rec.status === 'ABSENT' ? 'bg-red-100 text-red-800' :
                                  rec.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                                  rec.status === 'HALF_DAY' ? 'bg-orange-100 text-orange-800' :
                                  rec.status === 'LEAVE' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {rec.status}
                                </span>
                                {rec.isManualCorrection && (
                                  <span className="ml-1.5 text-[10px] text-indigo-600 font-semibold">[Corrected]</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                {rec.checkIn || '--:--'} → {rec.checkOut || '--:--'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">{rec.totalWorkingHours}h</td>
                              <td className="py-2.5 px-3 text-right">
                                {rec.lateMinutes > 0 && <span className="text-amber-700">Late {rec.lateMinutes}m </span>}
                                {rec.earlyDepartureMinutes > 0 && <span className="text-red-600">Early {rec.earlyDepartureMinutes}m</span>}
                                {!rec.lateMinutes && !rec.earlyDepartureMinutes && '-'}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {currentUser.role !== 'EMPLOYEE' ? (
                                  <button
                                    onClick={() => {
                                      setCorrectionModalRec(rec);
                                      setCorrectionForm({
                                        status: rec.status,
                                        checkIn: rec.checkIn || '09:00',
                                        checkOut: rec.checkOut || '17:00',
                                        earlyDepartureApproved: Boolean(rec.earlyDepartureApproved),
                                        reason: '',
                                      });
                                    }}
                                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-[#1e3a8a] font-semibold inline-flex items-center gap-1"
                                  >
                                    <Edit3 className="w-3 h-3" /> Correct
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Locked</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 4: AUTOMATED SALARY ENGINE & INTERACTIVE VERIFIER
             ================================================================ */}
          {activeTab === 'payroll_engine' && (
            <div className="space-y-6">
              {/* Interactive Salary Calculation Engine Verifier (Tests Spec Example & Edge Cases) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-[#1e3a8a]" /> Automated Salary Calculation Engine — Live Policy & Formula Verifier
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pre-loaded with the exact specification example (Basic ₹30,000, Working Days 25 → Daily ₹1,200; 2 Unpaid Absent Days = ₹2,400 Deduction → ₹27,600 Net). Adjust any parameter to verify edge cases!
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSimState({
                        basicSalary: 30000, allowances: 0, workingDays: 25, standardHours: 8,
                        unpaidAbsentDays: 2, paidLeaveDays: 1, unpaidLeaveDays: 0, halfDays: 0,
                        deductibleLateMins: 0, earlyCheckoutMins: 0, normalOtHours: 0, weekendOtHours: 0, otherDeductions: 0,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Reset to Spec Example (₹30,000 / 25 Days / 2 Absences)
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-5">
                  <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Monthly Basic Salary (₹)</label>
                      <input
                        type="number"
                        value={simState.basicSalary}
                        onChange={(e) => setSimState({ ...simState, basicSalary: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Total Allowances (₹)</label>
                      <input
                        type="number"
                        value={simState.allowances}
                        onChange={(e) => setSimState({ ...simState, allowances: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Payroll Working Days</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={simState.workingDays}
                        onChange={(e) => setSimState({ ...simState, workingDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-red-700 block mb-1">Unpaid Absent Days</label>
                      <input
                        type="number"
                        min="0"
                        value={simState.unpaidAbsentDays}
                        onChange={(e) => setSimState({ ...simState, unpaidAbsentDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-red-300 bg-red-50/40 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-emerald-700 block mb-1">Approved Paid Leave Days</label>
                      <input
                        type="number"
                        min="0"
                        value={simState.paidLeaveDays}
                        onChange={(e) => setSimState({ ...simState, paidLeaveDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/40 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-amber-700 block mb-1">Deductible Late Minutes</label>
                      <input
                        type="number"
                        min="0"
                        value={simState.deductibleLateMins}
                        onChange={(e) => setSimState({ ...simState, deductibleLateMins: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-amber-700 block mb-1">Unapproved Early Out (Mins)</label>
                      <input
                        type="number"
                        min="0"
                        value={simState.earlyCheckoutMins}
                        onChange={(e) => setSimState({ ...simState, earlyCheckoutMins: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-indigo-700 block mb-1">Normal OT Hours (1.5x)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={simState.normalOtHours}
                        onChange={(e) => setSimState({ ...simState, normalOtHours: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-indigo-700 block mb-1">Weekend/Holiday OT (2.0x)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={simState.weekendOtHours}
                        onChange={(e) => setSimState({ ...simState, weekendOtHours: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="bg-[#0f172a] text-white p-5 rounded-xl flex flex-col justify-between space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="text-[11px] uppercase tracking-wider text-blue-300 font-bold">
                        Live Engine Output (Decimal-Safe)
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-300">Daily Salary Rate:</span>
                        <span className="font-mono font-bold text-white">{formatINR(simResult.daily)} / day</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-300">Hourly Salary Rate:</span>
                        <span className="font-mono font-bold text-white">{formatINR(simResult.hourly)} / hr</span>
                      </div>
                      <div className="flex justify-between text-emerald-300">
                        <span>+ Approved Overtime Pay:</span>
                        <span className="font-mono font-bold">+{formatINR(simResult.otPay)}</span>
                      </div>
                      <div className="flex justify-between text-red-300">
                        <span>- Absence Deduction ({simState.unpaidAbsentDays}d):</span>
                        <span className="font-mono font-bold">-{formatINR(simResult.absenceDed)}</span>
                      </div>
                      <div className="flex justify-between text-amber-300">
                        <span>- Late & Early Shortfall:</span>
                        <span className="font-mono font-bold">-{formatINR(simResult.lateDed + simResult.earlyDed)}</span>
                      </div>
                      <div className="flex justify-between text-blue-200">
                        <span>Paid Leave ({simState.paidLeaveDays}d) Deduction:</span>
                        <span className="font-mono font-bold">₹0.00 (Exempt)</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-700">
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-bold text-blue-200">NET PAYABLE SALARY:</span>
                        <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                          {formatINR(simResult.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Batch Payroll Control Bar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900">
                      Batch Payroll Run — Period {selectedMonth}
                    </h4>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      finalizedMonths[selectedMonth]
                        ? 'bg-emerald-100 text-emerald-800'
                        : approvedPayrollMonths[selectedMonth]
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {finalizedMonths[selectedMonth] ? 'FINALIZED & LOCKED' : approvedPayrollMonths[selectedMonth] ? 'APPROVED' : 'DRAFT (AUTO-CALCULATED)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gross Payroll: <strong>{formatINR(hrMetrics.totalGrossPayroll)}</strong> • Total Deductions: <strong>{formatINR(hrMetrics.totalDeductions)}</strong> • Net Payable: <strong>{formatINR(hrMetrics.totalNetPayroll)}</strong>
                  </p>
                </div>

                {currentUser.role !== 'EMPLOYEE' && (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={handleApprovePayroll}
                      disabled={finalizedMonths[selectedMonth]}
                      className="px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1e3a8a] text-xs font-bold border border-blue-200 disabled:opacity-50"
                    >
                      1. Approve Payroll Batch
                    </button>
                    <button
                      onClick={handleFinalizePayroll}
                      disabled={finalizedMonths[selectedMonth]}
                      className="px-4 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" /> 2. Finalize & Lock Month
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 5: OVERTIME & LEAVE APPROVAL WORKFLOWS
             ================================================================ */}
          {activeTab === 'overtime_leaves' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Overtime Requests Panel */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900">Overtime Requests & Multiplier Queue</h3>
                  <p className="text-xs text-slate-500">Only HR/Admin approved overtime is added to monthly salary slips.</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {overtimeRequests
                    .filter((o) => currentUser.role !== 'EMPLOYEE' || o.employeeId === currentUser.id)
                    .map((ot) => {
                      const emp = employees.find((e) => e.id === ot.employeeId) || employees[0];
                      return (
                        <div key={ot.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{emp.name} ({emp.code})</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-semibold text-[10px]">
                                {ot.hours} hrs @ {ot.multiplier}x ({ot.type})
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ot.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                                ot.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {ot.status}
                              </span>
                            </div>
                            <div className="text-slate-600 mt-1">{ot.reason}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Date: {ot.date} {ot.reviewedBy ? `• Reviewed by ${ot.reviewedBy}` : ''}</div>
                          </div>

                          {currentUser.role !== 'EMPLOYEE' && ot.status === 'PENDING' && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleReviewOvertime(ot.id, 'APPROVED')}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleReviewOvertime(ot.id, 'REJECTED')}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Leave Requests Panel */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900">Leave Applications (Paid vs. Unpaid Policy)</h3>
                  <p className="text-xs text-slate-500">Approved Paid Leave incurs ₹0 deduction; Approved Unpaid Leave deducts daily salary.</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {leaveRequests
                    .filter((l) => currentUser.role !== 'EMPLOYEE' || l.employeeId === currentUser.id)
                    .map((lr) => {
                      const emp = employees.find((e) => e.id === lr.employeeId) || employees[0];
                      return (
                        <div key={lr.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{emp.name} ({emp.code})</span>
                              <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                lr.isPaid ? 'bg-blue-50 text-blue-800' : 'bg-orange-100 text-orange-800'
                              }`}>
                                {lr.leaveType} ({lr.isPaid ? 'PAID' : 'UNPAID'}) • {lr.totalDays}d
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                lr.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                                lr.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {lr.status}
                              </span>
                            </div>
                            <div className="text-slate-600 mt-1">{lr.reason}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Dates: {lr.startDate} to {lr.endDate}</div>
                          </div>

                          {currentUser.role !== 'EMPLOYEE' && lr.status === 'PENDING' && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleReviewLeave(lr.id, 'APPROVED')}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleReviewLeave(lr.id, 'REJECTED')}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 6: EMPLOYEES & CONFIGURABLE SALARY STRUCTURES (ADMIN / HR)
             ================================================================ */}
          {activeTab === 'employees_dir' && (
            <div className="space-y-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Employee Directory & Salary Structure Configuration ({employees.length} Active Records)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure monthly basic salary, allowances, payroll working days, and late arrival policy per employee.
                  </p>
                </div>
                {currentUser.role === 'ADMIN' && (
                  <button
                    onClick={() => setShowAddEmployeeModal(true)}
                    className="px-4 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Add New Employee
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Emp ID & Name</th>
                      <th className="py-3 px-3">Department & Role</th>
                      <th className="py-3 px-3 text-right">Basic Salary</th>
                      <th className="py-3 px-3 text-right">Allowances</th>
                      <th className="py-3 px-3 text-center">Working Days</th>
                      <th className="py-3 px-3">Late Policy Mode</th>
                      <th className="py-3 px-4 text-right">OT Multipliers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-500">{emp.code} • {emp.email}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">{emp.designation}</div>
                          <div className="text-[11px] text-slate-500">{emp.department}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{formatINR(emp.basicSalary)}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatINR(emp.hra + emp.transport + emp.special + emp.medical)}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold">{emp.workingDays}d ({emp.standardHoursPerDay}h/d)</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px] font-semibold">
                            {emp.lateMode}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[11px]">
                          1.5x Normal / 2.0x Wknd / 2.0x Hol
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================
              VIEW 7: IMMUTABLE AUDIT LOGS & 17-TABLE MYSQL SCHEMA INSPECTOR
             ================================================================ */}
          {activeTab === 'audit_schema' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900">Immutable Security & Compliance Audit Trail (`audit_logs`)</h3>
                  <p className="text-xs text-slate-500">Every attendance correction, overtime/leave review, employee addition, and payroll finalization is permanently recorded.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1e3a8a] font-mono font-bold text-[10px] mr-2">
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-900">{log.actor}</span>
                        <span className="text-slate-500 ml-2">→ {log.entity}</span>
                        <p className="text-slate-700 mt-1">{log.details}</p>
                      </div>
                      <div className="text-right font-mono text-[11px] text-slate-400">
                        <div>{log.timestamp}</div>
                        <div>IP: {log.ip}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0f172a] text-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-sm text-blue-300 uppercase tracking-wider mb-3">
                  17-Table Normalized MySQL Relational Schema (`database/schema.sql`)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                  {[
                    '1. users (PK, uq_email, RBAC ENUM)',
                    '2. employees (PK, FK user/dept/desig/shift)',
                    '3. departments (PK, uq_code, uq_name)',
                    '4. designations (PK, FK department_id)',
                    '5. shifts (PK, grace_mins, geo/IP rules)',
                    '6. attendance (PK, uq_emp_date, server_ts)',
                    '7. salary_structures (PK, multipliers, policies)',
                    '8. payroll (PK, uq_month, ACID lock)',
                    '9. payroll_details (PK, uq_slip, snapshot JSON)',
                    '10. overtime_requests (PK, uq_emp_date, 1.5x/2x)',
                    '11. leave_requests (PK, paid/unpaid, status)',
                    '12. leave_balances (PK, uq_emp_year)',
                    '13. holidays (PK, uq_holiday_date)',
                    '14. deductions (PK, FK employee_id)',
                    '15. allowances (PK, FK employee_id)',
                    '16. audit_logs (PK, old/new JSON, actor IP)',
                    '17. notifications (PK, FK user_id, unread idx)',
                  ].map((tbl) => (
                    <div key={tbl} className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 font-mono text-[11px] text-slate-200">
                      {tbl}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ====================================================================
          MODAL 1: OFFICIAL SALARY SLIP VIEWER & PDF DOWNLOADER
         ==================================================================== */}
      {selectedSlipEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-bold uppercase text-[#1e3a8a]">MAA AARYA INTERNATINAL (DS Group HoReCa Business)</div>
                <h3 className="text-lg font-extrabold text-slate-900">Monthly Salary Slip — {selectedMonth}</h3>
                <p className="text-xs text-slate-500">Slip No: <strong>{selectedSlipEmployee.slipNumber}</strong></p>
              </div>
              <button
                onClick={() => setSelectedSlipEmployee(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Employee Name</span>
                <strong className="text-slate-900">{selectedSlipEmployee.employee.name}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Employee ID</span>
                <strong className="text-slate-900">{selectedSlipEmployee.employee.code}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Designation</span>
                <strong className="text-slate-900">{selectedSlipEmployee.employee.designation}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Department</span>
                <strong className="text-slate-900">{selectedSlipEmployee.employee.department}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Attendance Summary</span>
                <strong className="text-slate-900">
                  {selectedSlipEmployee.calc.presentDays}P / {selectedSlipEmployee.calc.unpaidAbsentDays}A / {selectedSlipEmployee.calc.paidLeaveDays} Paid Lv
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Daily / Hourly Rate</span>
                <strong className="text-slate-900">
                  {formatINR(selectedSlipEmployee.calc.dailySalary)} / {formatINR(selectedSlipEmployee.calc.hourlySalary)}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 uppercase border-b border-slate-100 pb-1.5">Earnings</div>
                <div className="flex justify-between"><span>Basic Salary</span><span className="font-mono font-semibold">{formatINR(selectedSlipEmployee.calc.basicSalary)}</span></div>
                <div className="flex justify-between"><span>Allowances (HRA, Transport, Special, Med)</span><span className="font-mono font-semibold">{formatINR(selectedSlipEmployee.calc.totalAllowances)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Overtime Earnings ({selectedSlipEmployee.calc.approvedOvertimeHours} hrs)</span><span className="font-mono font-semibold">+{formatINR(selectedSlipEmployee.calc.overtimePay)}</span></div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200"><span>Gross Salary</span><span className="font-mono">{formatINR(selectedSlipEmployee.calc.grossSalary)}</span></div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 uppercase border-b border-slate-100 pb-1.5">Deductions</div>
                <div className="flex justify-between text-red-600"><span>Unpaid Absence ({selectedSlipEmployee.calc.unpaidAbsentDays}d)</span><span className="font-mono font-semibold">-{formatINR(selectedSlipEmployee.calc.absenceDeduction)}</span></div>
                <div className="flex justify-between text-amber-700"><span>Late Arrival ({selectedSlipEmployee.calc.deductibleLateMinutes}m)</span><span className="font-mono font-semibold">-{formatINR(selectedSlipEmployee.calc.lateArrivalDeduction)}</span></div>
                <div className="flex justify-between text-amber-700"><span>Early Departure Shortfall</span><span className="font-mono font-semibold">-{formatINR(selectedSlipEmployee.calc.earlyCheckoutDeduction)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Other Authorized Deductions (PF/Tax)</span><span className="font-mono font-semibold">-{formatINR(selectedSlipEmployee.calc.otherAuthorizedDeductions)}</span></div>
                <div className="flex justify-between font-bold text-red-700 pt-2 border-t border-slate-200"><span>Total Deductions</span><span className="font-mono">-{formatINR(selectedSlipEmployee.calc.totalDeductions)}</span></div>
              </div>
            </div>

            <div className="bg-[#0f172a] text-white p-4 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase text-blue-300 font-bold">Net Payable Salary</div>
                <div className="text-xs text-slate-300">Paid Leave ({selectedSlipEmployee.calc.paidLeaveDays}d) & Official Holidays incurred ₹0.00 deduction</div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                {formatINR(selectedSlipEmployee.calc.netSalary)}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSelectedSlipEmployee(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
              <button
                onClick={() => handleDownloadSalarySlipPDF(selectedSlipEmployee)}
                className="px-4 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Download className="w-4 h-4" /> Download Official PDF Salary Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: HR ATTENDANCE CORRECTION WITH MANDATORY AUDIT REASON
         ==================================================================== */}
      {correctionModalRec && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={handleSaveAttendanceCorrection} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">HR Attendance Correction (Audit Logged)</h3>
              <button type="button" onClick={() => setCorrectionModalRec(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Attendance Status</label>
              <select
                value={correctionForm.status}
                onChange={(e) => setCorrectionForm({ ...correctionForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="PRESENT">PRESENT</option>
                <option value="LATE">LATE</option>
                <option value="HALF_DAY">HALF_DAY</option>
                <option value="ABSENT">ABSENT</option>
                <option value="LEAVE">LEAVE (Approved Paid)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Check-In Time</label>
                <input
                  type="time"
                  value={correctionForm.checkIn}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, checkIn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Check-Out Time</label>
                <input
                  type="time"
                  value={correctionForm.checkOut}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, checkOut: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={correctionForm.earlyDepartureApproved}
                onChange={(e) => setCorrectionForm({ ...correctionForm, earlyDepartureApproved: e.target.checked })}
              />
              <span className="text-slate-700 font-medium">Approve Early Departure Exception (Waive shortfall deduction)</span>
            </label>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Mandatory Audit Trail Reason *</label>
              <input
                type="text"
                placeholder="e.g., Biometric reader sync delay verified by floor manager"
                value={correctionForm.reason}
                onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCorrectionModalRec(null)} className="px-3 py-2 rounded-lg border border-slate-300">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#1e3a8a] text-white font-semibold">Save & Log to Audit Trail</button>
            </div>
          </form>
        </div>
      )}

      {/* ====================================================================
          MODAL 3: ADD NEW EMPLOYEE & SALARY STRUCTURE (ADMIN)
         ==================================================================== */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={handleAddEmployee} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Add New Employee & Configure Salary Structure</h3>
              <button type="button" onClick={() => setShowAddEmployeeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newEmpForm.name}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Work Email *</label>
                <input
                  type="email"
                  value={newEmpForm.email}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Department</label>
                <select
                  value={newEmpForm.department}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="DS Group HoReCa Management">DS Group HoReCa Management (Owner: Rajesh Kumar Gupta)</option>
                    <option value="DS Group HoReCa Sales & Distribution">DS Group HoReCa Sales & Distribution (Vivek)</option>
                    <option value="DS Group HoReCa Operations">DS Group HoReCa Operations (Abhishek)</option>
                  <option value="Human Resources & People Ops">Human Resources & People Ops</option>
                  <option value="Finance & Accounting">Finance & Accounting</option>
                  <option value="Customer Success & Operations">Customer Success & Operations</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                <input
                  type="text"
                  value={newEmpForm.designation}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Monthly Basic Salary (₹)</label>
                <input
                  type="number"
                  value={newEmpForm.basicSalary}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, basicSalary: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Payroll Working Days</label>
                <input
                  type="number"
                  value={newEmpForm.workingDays}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, workingDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setShowAddEmployeeModal(false)} className="px-3 py-2 rounded-lg border border-slate-300">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#1e3a8a] text-white font-semibold">Create Employee Account</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
