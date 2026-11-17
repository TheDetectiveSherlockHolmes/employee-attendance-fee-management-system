/**
 * Deterministic Demo Data Generator & Seeder (`database/seed.js`)
 *
 * Resolves `../backend/node_modules` automatically when executed via `npm run seed`
 * from `backend/`. Seeds MySQL (`seed.sql` + 22 employees, salary structures,
 * 30+ days of attendance, overtime, leave requests, and payroll) and also writes
 * `database/local_db.json` as an automatic fallback store.
 */
const fs = require('fs');
const path = require('path');

const backendNodeModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

try {
  const dotenv = require('dotenv');
  const envPath = path.resolve(__dirname, '../backend/.env');
  const envExamplePath = path.resolve(__dirname, '../backend/.env.example');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  else if (fs.existsSync(envExamplePath)) dotenv.config({ path: envExamplePath });
} catch (e) {
  // Ignore if dotenv is not installed
}

// Pre-computed bcrypt hash (cost 10) for "Demo@12345"
const DEMO_PASSWORD_PLAIN = 'Demo@12345';
const DEMO_PASSWORD_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const DEPARTMENTS = [
  { id: 1, code: 'ENG', name: 'DS Group HoReCa Sales & Distribution [MAA AARYA INTERNATINAL]', description: 'Core Software Engineering, QA, and Cloud Infrastructure (DEMO DATA)' },
  { id: 2, code: 'HROPS', name: 'DS Group HoReCa Operations & Management [MAA AARYA INTERNATINAL]', description: 'Talent Acquisition, Payroll Administration, and Employee Relations (DEMO DATA)' },
  { id: 3, code: 'FIN', name: 'Finance & Accounting [DEMO DATA]', description: 'Corporate Finance, Compliance, Treasury, and Audit (DEMO DATA)' },
  { id: 4, code: 'OPS', name: 'Customer Success & Operations [DEMO DATA]', description: 'Enterprise Onboarding, Support Operations, and Service Delivery (DEMO DATA)' },
];

const DESIGNATIONS = [
  { id: 1, department_id: 1, title: 'Principal Systems Architect', grade_level: 'L5' },
  { id: 2, department_id: 1, title: 'Senior Full-Stack Engineer', grade_level: 'L4' },
  { id: 3, department_id: 1, title: 'Software Engineer II', grade_level: 'L3' },
  { id: 4, department_id: 1, title: 'QA Automation Engineer', grade_level: 'L2' },
  { id: 5, department_id: 2, title: 'HR & Payroll Director', grade_level: 'L5' },
  { id: 6, department_id: 2, title: 'Senior HR Generalist', grade_level: 'L3' },
  { id: 7, department_id: 3, title: 'Senior Financial Analyst', grade_level: 'L4' },
  { id: 8, department_id: 4, title: 'Operations Lead', grade_level: 'L3' },
];

const SHIFTS = [
  {
    id: 1,
    name: 'General Day Shift (09:00 - 17:00) [DEMO DATA]',
    code: 'SHIFT-GEN',
    start_time: '09:00',
    end_time: '17:00',
    standard_hours: 8.0,
    grace_period_minutes: 10,
    half_day_threshold_hours: 4.0,
    late_to_half_day_minutes: 120,
    weekly_off_days: 'Sunday',
    allowed_ip_cidr: '192.168.1.0/24',
  },
  {
    id: 2,
    name: 'Early Engineering Shift (08:30 - 16:30) [DEMO DATA]',
    code: 'SHIFT-ENG',
    start_time: '08:30',
    end_time: '16:30',
    standard_hours: 8.0,
    grace_period_minutes: 10,
    half_day_threshold_hours: 4.0,
    late_to_half_day_minutes: 120,
    weekly_off_days: 'Sunday',
    allowed_ip_cidr: '10.10.0.0/16',
  },
  {
    id: 3,
    name: 'Operations Extended Shift (10:00 - 18:00) [DEMO DATA]',
    code: 'SHIFT-OPS',
    start_time: '10:00',
    end_time: '18:00',
    standard_hours: 8.0,
    grace_period_minutes: 15,
    half_day_threshold_hours: 4.0,
    late_to_half_day_minutes: 120,
    weekly_off_days: 'Sunday',
    allowed_ip_cidr: '172.16.0.0/16',
  },
];

const HOLIDAYS = [
  { id: 1, holiday_date: '2026-10-02', name: 'Mahatma Gandhi Jayanti [DEMO DATA]', holiday_type: 'NATIONAL', is_paid: 1 },
  { id: 2, holiday_date: '2026-10-20', name: 'Dussehra / Vijayadashami [DEMO DATA]', holiday_type: 'FESTIVAL', is_paid: 1 },
  { id: 3, holiday_date: '2026-11-08', name: 'Diwali Festival Holiday [DEMO DATA]', holiday_type: 'FESTIVAL', is_paid: 1 },
  { id: 4, holiday_date: '2026-11-24', name: 'Guru Nanak Jayanti [DEMO DATA]', holiday_type: 'FESTIVAL', is_paid: 1 },
  { id: 5, holiday_date: '2026-12-25', name: 'Christmas Day [DEMO DATA]', holiday_type: 'NATIONAL', is_paid: 1 },
];

const EMPLOYEES_SEED = [
  { id: 1, code: 'EMP-1001', firstName: 'Rajesh Kumar', lastName: 'Gupta (Owner)', email: 'admin@demo.com', role: 'ADMIN', deptId: 1, desigId: 1, shiftId: 1, basic: 95000, hra: 22000, transport: 5000, special: 8000, medical: 2500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2022-03-15', phone: '+91-9810010001' },
  { id: 2, code: 'EMP-1002', firstName: 'Abhishek', lastName: 'HoReCa', email: 'hr@demo.com', role: 'HR_MANAGER', deptId: 2, desigId: 5, shiftId: 1, basic: 75000, hra: 18000, transport: 4000, special: 6000, medical: 2000, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2022-06-01', phone: '+91-9810010002' },
  { id: 3, code: 'EMP-1003', firstName: 'Vivek', lastName: 'HoReCa', email: 'employee@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 2, shiftId: 1, basic: 30000, hra: 8000, transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-01-10', phone: '+91-9810010003' },
  { id: 4, code: 'EMP-1004', firstName: 'Priya', lastName: 'Nair', email: 'priya.nair@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 2, shiftId: 2, basic: 60000, hra: 15000, transport: 3500, special: 5000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-02-14', phone: '+91-9810010004' },
  { id: 5, code: 'EMP-1005', firstName: 'Siddharth', lastName: 'Kulkarni', email: 'siddharth.k@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 3, shiftId: 2, basic: 45000, hra: 11000, transport: 3000, special: 4000, medical: 1500, workingDays: 25, lateMode: 'FIXED_PER_MINUTE', lateRate: 5.0, joinDate: '2023-04-03', phone: '+91-9810010005' },
  { id: 6, code: 'EMP-1006', firstName: 'Meera', lastName: 'Iyer', email: 'meera.iyer@demo.com', role: 'EMPLOYEE', deptId: 3, desigId: 7, shiftId: 1, basic: 55000, hra: 14000, transport: 3000, special: 4500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-05-19', phone: '+91-9810010006' },
  { id: 7, code: 'EMP-1007', firstName: 'Arjun', lastName: 'Reddy', email: 'arjun.reddy@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 4, shiftId: 2, basic: 35000, hra: 9000, transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'HALF_DAY_AFTER_THRESHOLD', joinDate: '2023-07-01', phone: '+91-9810010007' },
  { id: 8, code: 'EMP-1008', firstName: 'Kavita', lastName: 'Deshmukh', email: 'kavita.d@demo.com', role: 'EMPLOYEE', deptId: 2, desigId: 6, shiftId: 1, basic: 40000, hra: 10000, transport: 2500, special: 3500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-08-11', phone: '+91-9810010008' },
  { id: 9, code: 'EMP-1009', firstName: 'Devansh', lastName: 'Mehta', email: 'devansh.m@demo.com', role: 'EMPLOYEE', deptId: 4, desigId: 8, shiftId: 3, basic: 38000, hra: 9500, transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-09-05', phone: '+91-9810010009' },
  { id: 10, code: 'EMP-1010', firstName: 'Neha', lastName: 'Kapoor', email: 'neha.kapoor@demo.com', role: 'EMPLOYEE', deptId: 3, desigId: 7, shiftId: 1, basic: 52000, hra: 13000, transport: 3000, special: 4000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-10-12', phone: '+91-9810010010' },
  { id: 11, code: 'EMP-1011', firstName: 'Karthik', lastName: 'Subramanian', email: 'karthik.s@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 3, shiftId: 2, basic: 48000, hra: 12000, transport: 3000, special: 4000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2023-11-20', phone: '+91-9810010011' },
  { id: 12, code: 'EMP-1012', firstName: 'Pooja', lastName: 'Chatterjee', email: 'pooja.c@demo.com', role: 'EMPLOYEE', deptId: 4, desigId: 8, shiftId: 3, basic: 36000, hra: 9000, transport: 2500, special: 2500, medical: 1500, workingDays: 25, lateMode: 'RECORD_ONLY', joinDate: '2024-01-08', phone: '+91-9810010012' },
  { id: 13, code: 'EMP-1013', firstName: 'Aditya', lastName: 'Joshi', email: 'aditya.joshi@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 4, shiftId: 1, basic: 32000, hra: 8000, transport: 2000, special: 2500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-02-19', phone: '+91-9810010013' },
  { id: 14, code: 'EMP-1014', firstName: 'Ritika', lastName: 'Bansal', email: 'ritika.b@demo.com', role: 'EMPLOYEE', deptId: 2, desigId: 6, shiftId: 1, basic: 42000, hra: 10500, transport: 2500, special: 3500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-03-11', phone: '+91-9810010014' },
  { id: 15, code: 'EMP-1015', firstName: 'Manish', lastName: 'Tiwari', email: 'manish.t@demo.com', role: 'EMPLOYEE', deptId: 4, desigId: 8, shiftId: 3, basic: 34000, hra: 8500, transport: 2000, special: 2500, medical: 1500, workingDays: 25, lateMode: 'FIXED_PER_MINUTE', lateRate: 4.0, joinDate: '2024-04-15', phone: '+91-9810010015' },
  { id: 16, code: 'EMP-1016', firstName: 'Shruti', lastName: 'Menon', email: 'shruti.m@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 2, shiftId: 2, basic: 62000, hra: 15500, transport: 3500, special: 5000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-05-06', phone: '+91-9810010016' },
  { id: 17, code: 'EMP-1017', firstName: 'Harsh', lastName: 'Vardhan', email: 'harsh.v@demo.com', role: 'EMPLOYEE', deptId: 3, desigId: 7, shiftId: 1, basic: 50000, hra: 12500, transport: 3000, special: 4000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-06-17', phone: '+91-9810010017' },
  { id: 18, code: 'EMP-1018', firstName: 'Divya', lastName: 'Saxena', email: 'divya.s@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 3, shiftId: 1, basic: 44000, hra: 11000, transport: 2500, special: 3500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-07-22', phone: '+91-9810010018' },
  { id: 19, code: 'EMP-1019', firstName: 'Nikhil', lastName: 'Gowda', email: 'nikhil.g@demo.com', role: 'EMPLOYEE', deptId: 4, desigId: 8, shiftId: 3, basic: 37500, hra: 9000, transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-08-05', phone: '+91-9810010019' },
  { id: 20, code: 'EMP-1020', firstName: 'Tanvi', lastName: 'Agrawal', email: 'tanvi.a@demo.com', role: 'EMPLOYEE', deptId: 1, desigId: 4, shiftId: 2, basic: 33000, hra: 8200, transport: 2000, special: 2800, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-09-02', phone: '+91-9810010020' },
  { id: 21, code: 'EMP-1021', firstName: 'Rajat', lastName: 'Bhatia', email: 'rajat.b@demo.com', role: 'EMPLOYEE', deptId: 3, desigId: 7, shiftId: 1, basic: 49000, hra: 12000, transport: 3000, special: 3500, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-10-01', phone: '+91-9810010021' },
  { id: 22, code: 'EMP-1022', firstName: 'Sneha', lastName: 'Pillai', email: 'sneha.p@demo.com', role: 'EMPLOYEE', deptId: 2, desigId: 6, shiftId: 1, basic: 41000, hra: 10000, transport: 2500, special: 3000, medical: 1500, workingDays: 25, lateMode: 'PROPORTIONAL_PER_MINUTE', joinDate: '2024-10-14', phone: '+91-9810010022' },
];

function initLocalDatabase() {
  const localDbPath = path.join(__dirname, 'local_db.json');
  const payload = {
    initializedAt: new Date().toISOString(),
    departments: DEPARTMENTS,
    designations: DESIGNATIONS,
    shifts: SHIFTS,
    holidays: HOLIDAYS,
    employees: EMPLOYEES_SEED,
  };
  fs.writeFileSync(localDbPath, JSON.stringify(payload, null, 2), 'utf8');
  return localDbPath;
}

async function runSeed() {
  initLocalDatabase();
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (e) {
    console.log('[SEED] Seeded local database store (`database/local_db.json`) with 22 DEMO DATA employees.');
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'attendance_payroll_db',
      multipleStatements: true,
    });

    console.log('[SEED] Applying SQL seed data (`database/seed.sql`)...');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await connection.query(seedSql);

    for (const emp of EMPLOYEES_SEED) {
      await connection.execute(
        `INSERT INTO employees
          (id, user_id, employee_code, first_name, last_name, phone, department_id, designation_id, shift_id, date_of_joining, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name)`,
        [emp.id, emp.id, emp.code, emp.firstName, emp.lastName, emp.phone, emp.deptId, emp.desigId, emp.shiftId, emp.joinDate]
      );

      await connection.execute(
        `INSERT INTO salary_structures
          (employee_id, basic_salary, hra_allowance, transport_allowance, special_allowance, medical_allowance,
           payroll_working_days, standard_hours_per_day, late_deduction_mode, late_per_minute_rate, effective_from, is_active, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 8.00, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE basic_salary = VALUES(basic_salary)`,
        [emp.id, emp.basic, emp.hra, emp.transport, emp.special, emp.medical, emp.workingDays, emp.lateMode, emp.lateRate || null, emp.joinDate]
      );

      await connection.execute(
        `INSERT INTO leave_balances (employee_id, leave_year, is_demo)
         VALUES (?, 2026, 1)
         ON DUPLICATE KEY UPDATE is_demo = 1`,
        [emp.id]
      );
    }
    console.log('[SEED] Successfully seeded 22 DEMO DATA employees, salary structures, and leave balances in MySQL.');
  } catch (err) {
    console.warn(`[SEED] MySQL seed notice (${err.message}). Local database store ('database/local_db.json') is ready.`);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = {
  DEMO_PASSWORD_PLAIN,
  DEMO_PASSWORD_BCRYPT_HASH,
  DEPARTMENTS,
  DESIGNATIONS,
  SHIFTS,
  HOLIDAYS,
  EMPLOYEES_SEED,
  initLocalDatabase,
  runSeed,
};
