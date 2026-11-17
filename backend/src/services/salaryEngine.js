/**
 * Automated Salary Calculation Engine (`backend/src/services/salaryEngine.js`)
 *
 * Implements decimal-safe monetary calculations (rounded to 2 decimal places) for:
 *  A. Base Salary Calculation (Daily Salary & Hourly Salary from configurable working days)
 *  B. Absence Deduction (Unpaid Absent Days & Unpaid Leave Days, never deducting Paid Leave, Weekly Off, or Holidays, and never double-deducting)
 *  C. Late Arrival Deduction (Grace period, PROPORTIONAL_PER_MINUTE, FIXED_PER_MINUTE, HALF_DAY_AFTER_THRESHOLD, or RECORD_ONLY; never applying multiple penalties for the same violation)
 *  D. Early Check-Out Deduction (Unapproved early departure shortfall minutes)
 *  E. Overtime Calculation (Approved overtime only, preventing overlapping entries/double payment, configurable multipliers: 1.5x Normal, 2.0x Weekend, 2.0x Holiday)
 *  F. Final Salary Calculation:
 *     Net Salary = Basic Salary + Allowances + Approved Overtime Pay - Absence Deductions - Half-Day Deductions - Late Deductions - Early Checkout Deductions - Other Authorized Deductions
 */

/**
 * Decimal-safe rounding to 2 decimal places using integer paise/cents arithmetic
 * @param {number|string} value
 * @returns {number}
 */
function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Parses "HH:mm" or "HH:mm:ss" into minutes since 00:00
 * @param {string} timeStr
 * @returns {number}
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 60 + minutes;
}

/**
 * Evaluates a single attendance session (check-in & check-out against assigned shift)
 * Uses server-generated timestamps and shift rules to compute working hours,
 * late minutes, deductible late minutes, early departure minutes, and overtime hours.
 */
function evaluateDailyAttendance({
  checkInTimeStr,   // "HH:mm" in server local time
  checkOutTimeStr,  // "HH:mm" in server local time
  shift,            // { start_time: "09:00", end_time: "17:00", standard_hours: 8, grace_period_minutes: 10, half_day_threshold_hours: 4, late_to_half_day_minutes: 120 }
  isWeeklyOff = false,
  isHoliday = false,
  isApprovedLeave = false,
  earlyDepartureApproved = false,
}) {
  if (isApprovedLeave) {
    return {
      status: 'LEAVE',
      totalWorkingHours: 0,
      lateMinutes: 0,
      deductibleLateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeHours: 0,
    };
  }

  if (!checkInTimeStr) {
    return {
      status: isHoliday ? 'HOLIDAY' : isWeeklyOff ? 'WEEKLY_OFF' : 'ABSENT',
      totalWorkingHours: 0,
      lateMinutes: 0,
      deductibleLateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeHours: 0,
    };
  }

  const shiftStartMins = parseTimeToMinutes(shift.start_time || '09:00');
  const shiftEndMins = parseTimeToMinutes(shift.end_time || '17:00');
  const standardHours = Number(shift.standard_hours || 8);
  const graceMins = Number(shift.grace_period_minutes ?? 10);
  const halfDayHours = Number(shift.half_day_threshold_hours ?? 4);
  const lateToHalfDayMins = Number(shift.late_to_half_day_minutes ?? 120);

  const inMins = parseTimeToMinutes(checkInTimeStr);
  const outMins = checkOutTimeStr ? parseTimeToMinutes(checkOutTimeStr) : inMins;

  // Handle overnight or standard same-day shifts
  const workedMinutes = Math.max(0, outMins >= inMins ? outMins - inMins : (24 * 60 - inMins) + outMins);
  const totalWorkingHours = roundCurrency(workedMinutes / 60);

  // On Holiday or Weekly Off, all worked hours count toward eligible overtime
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

  // Late arrival detection against shift start + grace period
  const rawLateMinutes = Math.max(0, inMins - shiftStartMins);
  const isBeyondGrace = rawLateMinutes > graceMins;
  // Once beyond grace period, calculate excess late minutes beyond grace period (or full late minutes per policy)
  const deductibleLateMinutes = isBeyondGrace ? (rawLateMinutes - graceMins) : 0;

  // Early departure detection against scheduled checkout time
  const rawEarlyMins = checkOutTimeStr ? Math.max(0, shiftEndMins - outMins) : 0;
  const earlyDepartureMinutes = earlyDepartureApproved ? 0 : rawEarlyMins;

  // Overtime: Actual Eligible Working Hours - Standard Working Hours
  const overtimeHours = totalWorkingHours > standardHours
    ? roundCurrency(totalWorkingHours - standardHours)
    : 0;

  // Status classification (preventing duplicate/conflicting status penalties)
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

/**
 * Calculates the complete monthly salary breakdown for an employee.
 *
 * @param {Object} params
 * @param {Object} params.salaryStructure - Employee's configurable salary structure
 * @param {Array}  params.attendanceRecords - Daily attendance records for the month
 * @param {Array}  params.leaveRequests - Leave requests overlapping the month
 * @param {Array}  params.overtimeRequests - Overtime requests for the month
 * @param {Array}  params.additionalAllowances - Extra monthly/recurring allowances
 * @param {Array}  params.authorizedDeductions - Other authorized deductions (PF, Tax, Loan, etc.)
 * @returns {Object} Full decimal-safe salary breakdown
 */
function calculateMonthlySalary({
  salaryStructure,
  attendanceRecords = [],
  leaveRequests = [],
  overtimeRequests = [],
  additionalAllowances = [],
  authorizedDeductions = [],
}) {
  if (!salaryStructure) {
    throw new Error('Salary structure configuration is required for payroll calculation.');
  }

  const basicSalary = roundCurrency(salaryStructure.basic_salary);
  const workingDays = Number(salaryStructure.payroll_working_days || 25);
  const standardHoursPerDay = Number(salaryStructure.standard_hours_per_day || 8);

  if (workingDays <= 0 || standardHoursPerDay <= 0) {
    throw new Error('payroll_working_days and standard_hours_per_day must be greater than zero.');
  }

  // A. Base Salary Calculation
  // Daily Salary = Monthly Basic Salary / Monthly Payroll Working Days
  const dailySalary = roundCurrency(basicSalary / workingDays);
  // Hourly Salary = Daily Salary / Standard Working Hours Per Day
  const hourlySalary = roundCurrency(dailySalary / standardHoursPerDay);
  const perMinuteCalculatedRate = dailySalary / (standardHoursPerDay * 60);

  // Sum structured allowances + additional recurring/monthly allowances
  const structuredAllowances = roundCurrency(
    Number(salaryStructure.hra_allowance || 0) +
    Number(salaryStructure.transport_allowance || 0) +
    Number(salaryStructure.special_allowance || 0) +
    Number(salaryStructure.medical_allowance || 0)
  );
  const extraAllowancesTotal = roundCurrency(
    additionalAllowances.reduce((acc, item) => acc + Number(item.amount || 0), 0)
  );
  const totalAllowances = roundCurrency(structuredAllowances + extraAllowancesTotal);

  // Build map of approved leave dates so we never double-deduct an absence or deduct paid leave
  const approvedPaidLeaveDates = new Set();
  const approvedUnpaidLeaveDates = new Set();

  for (const lr of leaveRequests) {
    if (lr.status !== 'APPROVED') continue;
    const dates = Array.isArray(lr.dates) ? lr.dates : [];
    for (const d of dates) {
      if (lr.is_paid || (lr.leave_type && lr.leave_type !== 'UNPAID')) {
        approvedPaidLeaveDates.add(d);
      } else {
        approvedUnpaidLeaveDates.add(d);
      }
    }
  }

  // Deduplicate attendance records by date (prevent duplicate attendance records)
  const uniqueByDate = new Map();
  for (const rec of attendanceRecords) {
    if (rec && rec.attendance_date && !uniqueByDate.has(rec.attendance_date)) {
      uniqueByDate.set(rec.attendance_date, rec);
    }
  }

  let presentDays = 0;
  let halfDays = 0;
  let unpaidAbsentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let lateArrivalsCount = 0;
  let totalDeductibleLateMinutes = 0;
  let totalEarlyDepartureMinutes = 0;
  let halfDaysConvertedFromLate = 0;

  const lateMode = salaryStructure.late_deduction_mode || 'PROPORTIONAL_PER_MINUTE';
  const lateGraceMins = Number(salaryStructure.late_grace_minutes ?? 10);
  const lateHalfDayThresholdMins = Number(salaryStructure.late_half_day_threshold_mins ?? 120);
  const configuredPerMinuteRate = salaryStructure.late_per_minute_rate != null
    ? Number(salaryStructure.late_per_minute_rate)
    : perMinuteCalculatedRate;
  const earlyCheckoutEnabled = salaryStructure.early_checkout_deduction_enabled !== false &&
    salaryStructure.early_checkout_deduction_enabled !== 0;

  for (const [dateStr, rec] of uniqueByDate.entries()) {
    const status = rec.status;

    // 1. Official Holidays & Weekly Offs: never deducted
    if (status === 'HOLIDAY') {
      holidayDays += 1;
      continue;
    }
    if (status === 'WEEKLY_OFF') {
      weeklyOffDays += 1;
      continue;
    }

    // 2. Approved Leave Handling (Paid vs Unpaid)
    if (approvedPaidLeaveDates.has(dateStr) || (status === 'LEAVE' && rec.leave_paid !== false)) {
      paidLeaveDays += 1;
      continue;
    }
    if (approvedUnpaidLeaveDates.has(dateStr) || (status === 'LEAVE' && rec.leave_paid === false)) {
      unpaidLeaveDays += 1;
      continue;
    }

    // 3. Unpaid Absence (not covered by approved leave, holiday, or weekly off)
    if (status === 'ABSENT') {
      unpaidAbsentDays += 1;
      continue;
    }

    // 4. Half-Day status: counts as 0.5 present day and 0.5 half-day deduction
    // IMPORTANT: Never apply additional late/early penalties on top of a HALF_DAY violation!
    if (status === 'HALF_DAY') {
      presentDays += 0.5;
      halfDays += 1;
      continue;
    }

    // 5. Present or Late
    const rawLate = Number(rec.late_minutes || 0);
    const deductibleLate = rec.deductible_late_minutes != null
      ? Number(rec.deductible_late_minutes)
      : Math.max(0, rawLate - lateGraceMins);

    if (rawLate > lateGraceMins || status === 'LATE') {
      lateArrivalsCount += 1;

      if (lateMode === 'HALF_DAY_AFTER_THRESHOLD' && rawLate >= lateHalfDayThresholdMins) {
        // Converted into a half-day penalty; do NOT also charge per-minute late or early departure for this day
        presentDays += 0.5;
        halfDays += 1;
        halfDaysConvertedFromLate += 1;
        continue;
      } else if (lateMode === 'PROPORTIONAL_PER_MINUTE' || lateMode === 'FIXED_PER_MINUTE') {
        totalDeductibleLateMinutes += deductibleLate;
      }
      // If RECORD_ONLY, we record lateArrivalsCount without adding deductible minutes
    }

    presentDays += 1;

    // 6. Early Checkout Shortfall (only unapproved shortfall on non-half-day working days)
    if (earlyCheckoutEnabled && !rec.early_departure_approved) {
      const earlyMins = Number(rec.early_departure_minutes || 0);
      if (earlyMins > 0) {
        totalEarlyDepartureMinutes += earlyMins;
      }
    }
  }

  // Also include any approved paid/unpaid leave dates that didn't have an explicit attendance row
  for (const d of approvedPaidLeaveDates) {
    if (!uniqueByDate.has(d)) paidLeaveDays += 1;
  }
  for (const d of approvedUnpaidLeaveDates) {
    if (!uniqueByDate.has(d)) unpaidLeaveDays += 1;
  }

  // B. Absence & Unpaid Leave Deduction
  // Absence Deduction = Daily Salary * (Number of Unpaid Absent Days + Unpaid Leave Days)
  const absenceMultiplier = Number(salaryStructure.absence_deduction_multiplier ?? 1.0);
  const totalDeductibleAbsentDays = unpaidAbsentDays + unpaidLeaveDays;
  const absenceDeduction = roundCurrency(dailySalary * totalDeductibleAbsentDays * absenceMultiplier);

  // Half-Day Deduction
  const halfDayFraction = Number(salaryStructure.half_day_deduction_fraction ?? 0.5);
  const halfDayDeduction = roundCurrency(dailySalary * halfDays * halfDayFraction);

  // C. Late Arrival Deduction
  // Formula: Late Deduction = Deductible Late Minutes * Per-Minute Deduction Rate
  let lateArrivalDeduction = 0;
  if (lateMode === 'PROPORTIONAL_PER_MINUTE') {
    lateArrivalDeduction = roundCurrency(totalDeductibleLateMinutes * perMinuteCalculatedRate);
  } else if (lateMode === 'FIXED_PER_MINUTE') {
    lateArrivalDeduction = roundCurrency(totalDeductibleLateMinutes * configuredPerMinuteRate);
  } else {
    lateArrivalDeduction = 0;
  }

  // D. Early Check-Out Deduction
  const earlyCheckoutDeduction = earlyCheckoutEnabled
    ? roundCurrency(totalEarlyDepartureMinutes * perMinuteCalculatedRate)
    : 0;

  // E. Overtime Calculation (Approved only; deduplicate by date to prevent overlapping/double payment)
  const normalMult = Number(salaryStructure.overtime_normal_multiplier ?? 1.5);
  const weekendMult = Number(salaryStructure.overtime_weekend_multiplier ?? 2.0);
  const holidayMult = Number(salaryStructure.overtime_holiday_multiplier ?? 2.0);

  const seenOvertimeDates = new Set();
  let approvedOvertimeHours = 0;
  let overtimePay = 0;
  const overtimeBreakdown = [];

  for (const ot of overtimeRequests) {
    if (!ot || ot.status !== 'APPROVED') continue;
    const otDate = ot.overtime_date;
    if (!otDate || seenOvertimeDates.has(otDate)) {
      // Prevent overlapping overtime entries and double payment on the same date
      continue;
    }
    const hours = Number(ot.overtime_hours || 0);
    if (hours <= 0) continue;

    seenOvertimeDates.add(otDate);
    let multiplier = normalMult;
    if (ot.overtime_type === 'WEEKEND') multiplier = weekendMult;
    else if (ot.overtime_type === 'HOLIDAY') multiplier = holidayMult;
    else if (ot.applied_multiplier) multiplier = Number(ot.applied_multiplier);

    const otRate = hourlySalary * multiplier;
    const linePay = roundCurrency(hours * otRate);

    approvedOvertimeHours = roundCurrency(approvedOvertimeHours + hours);
    overtimePay = roundCurrency(overtimePay + linePay);
    overtimeBreakdown.push({
      date: otDate,
      hours,
      type: ot.overtime_type || 'NORMAL',
      multiplier,
      hourlyRate: roundCurrency(otRate),
      amount: linePay,
    });
  }

  // Other Authorized Deductions (PF + Professional Tax + explicit authorized deductions)
  const pfRatePct = Number(salaryStructure.pf_deduction_rate_pct || 0);
  const pfDeduction = roundCurrency((basicSalary * pfRatePct) / 100);
  const profTax = roundCurrency(Number(salaryStructure.professional_tax_fixed || 0));
  const explicitDeductions = roundCurrency(
    authorizedDeductions.reduce((acc, d) => acc + Number(d.amount || 0), 0)
  );
  const otherAuthorizedDeductions = roundCurrency(pfDeduction + profTax + explicitDeductions);

  // F. Final Salary Calculation
  // Gross Salary = Basic Salary + Allowances + Approved Overtime Pay
  const grossSalary = roundCurrency(basicSalary + totalAllowances + overtimePay);

  // Total Deductions = Absence Deductions + Half-Day Deductions + Late Deductions + Early Checkout Deductions + Other Authorized Deductions
  const totalDeductions = roundCurrency(
    absenceDeduction +
    halfDayDeduction +
    lateArrivalDeduction +
    earlyCheckoutDeduction +
    otherAuthorizedDeductions
  );

  // Net Salary = Basic Salary + Allowances + Approved Overtime Pay - Absence Deductions - Half-Day Deductions - Late Deductions - Early Checkout Deductions - Other Authorized Deductions
  const netSalary = roundCurrency(Math.max(0, grossSalary - totalDeductions));

  return {
    basicSalary,
    totalAllowances,
    structuredAllowances,
    extraAllowancesTotal,
    workingDaysPerMonth: workingDays,
    standardHoursPerDay,
    dailySalary,
    hourlySalary,
    perMinuteRate: roundCurrency(perMinuteCalculatedRate),
    attendanceSummary: {
      presentDays,
      halfDays,
      halfDaysConvertedFromLate,
      unpaidAbsentDays,
      paidLeaveDays,
      unpaidLeaveDays,
      totalDeductibleAbsentDays,
      weeklyOffDays,
      holidayDays,
      lateArrivalsCount,
      deductibleLateMinutes: totalDeductibleLateMinutes,
      earlyDepartureMinutes: totalEarlyDepartureMinutes,
    },
    overtimeSummary: {
      approvedOvertimeHours,
      overtimePay,
      overtimeBreakdown,
    },
    deductionsBreakdown: {
      absenceDeduction,
      halfDayDeduction,
      lateArrivalDeduction,
      earlyCheckoutDeduction,
      pfDeduction,
      professionalTax: profTax,
      explicitDeductions,
      otherAuthorizedDeductions,
      totalDeductions,
    },
    grossSalary,
    netSalary,
  };
}

module.exports = {
  roundCurrency,
  parseTimeToMinutes,
  evaluateDailyAttendance,
  calculateMonthlySalary,
};
