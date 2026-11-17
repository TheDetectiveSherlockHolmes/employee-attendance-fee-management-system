# REST API Documentation — Employee Attendance & Automated Payroll System

Base URL: `http://localhost:5000/api`
Authentication: `Authorization: Bearer <JWT_TOKEN>`

## 1. System & Health
- `GET /api/health` — Returns API status, database connectivity check, and verified server timestamp.

## 2. Authentication
- `POST /api/auth/login`
  - **Body:** `{ "email": "employee@demo.com", "password": "Demo@12345" }`
  - **Response:** `{ "token": "<JWT>", "user": { "id", "email", "role", "employeeId", "employeeCode", "fullName", "isDemo" } }`

## 3. Employees & Salary Structures
- `GET /api/employees` (`ADMIN`, `HR_MANAGER`) — Lists all employees from `vw_employee_directory`.
- `GET /api/employees/:employeeId` (`ADMIN`, `HR_MANAGER`, or self `EMPLOYEE`) — Returns profile & salary structure.
- `POST /api/employees` (`ADMIN`) — Creates user, employee profile, salary structure, leave balance, and audit log inside a transaction.

## 4. Attendance Management
- `POST /api/attendance/check-in` (`EMPLOYEE`, `HR_MANAGER`, `ADMIN`) — Records daily check-in using server-side timestamp; blocks duplicate check-ins (`409 Conflict`).
- `POST /api/attendance/check-out` (`EMPLOYEE`, `HR_MANAGER`, `ADMIN`) — Records daily check-out using server-side timestamp; blocks check-out before check-in (`400 Bad Request`) and duplicate check-outs (`409 Conflict`).
- `PUT /api/attendance/:attendanceId/correct` (`ADMIN`, `HR_MANAGER`) — Corrects attendance status/timestamps and writes an immutable record to `audit_logs`.

## 5. Overtime Management
- `POST /api/overtime` — Submits an overtime request (`NORMAL` 1.5x, `WEEKEND` 2.0x, `HOLIDAY` 2.0x); prevents duplicate date entries (`409 Conflict`).
- `PATCH /api/overtime/:id/review` (`ADMIN`, `HR_MANAGER`) — Approves or rejects overtime request and logs audit trail.

## 6. Leave Management
- `POST /api/leaves` — Submits leave application (`CASUAL`, `SICK`, `EARNED`, `UNPAID`).
- `PATCH /api/leaves/:id/review` (`ADMIN`, `HR_MANAGER`) — Approves or rejects leave request and updates `leave_balances` inside a transaction.

## 7. Automated Payroll & PDF Salary Slips
- `POST /api/payroll/generate` (`ADMIN`, `HR_MANAGER`) — Runs the Automated Salary Calculation Engine across all active employees inside a MySQL transaction. Blocks regeneration if month is finalized (`is_locked = 1`).
- `POST /api/payroll/:payrollMonth/finalize` (`ADMIN`, `HR_MANAGER`) — Finalizes and permanently locks monthly payroll (`status = 'FINALIZED'`, `is_locked = 1`).
- `GET /api/payroll/:payrollMonth/slip/:employeeId/pdf` (`ADMIN`, `HR_MANAGER`, or self `EMPLOYEE`) — Generates and downloads the employee's PDF salary slip (`application/pdf`).
