# Employee Attendance & Automated Payroll Management System

A production-oriented, full-stack **Employee Attendance & Automated Payroll Management System** built with **React.js (JavaScript)**, **Tailwind CSS**, **Node.js**, **Express.js**, and **MySQL**.

---

## 1. Technology Stack

- **Frontend:** React.js (JavaScript ES6+, no TypeScript), Tailwind CSS, React Router v6, Axios, React Hook Form, Day.js, Lucide React icons
- **Backend:** Node.js, Express.js, REST APIs, JWT Authentication (`HS256`), `bcrypt` password hashing, rate limiting, Helmet security headers
- **Database:** MySQL 8.0+ (17 normalized relational tables with `InnoDB`, foreign keys, unique constraints, indexes, and ACID transactions)

---

## 2. Demo Accounts & Credentials (`[DEMO DATA]`)

All demo accounts share the documented password (stored only as a `bcrypt` cost-10 hash `$2b$10$...` in the database):

| Role | Email | Password | Employee ID | Name |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin@demo.com` | `Demo@12345` | `EMP-1001` | Rajesh Kumar Gupta (Owner) `[DEMO DATA]` |
| **HR / Payroll Manager** | `hr@demo.com` | `Demo@12345` | `EMP-1002` | Abhishek `[DEMO DATA]` |
| **Employee** | `employee@demo.com` | `Demo@12345` | `EMP-1003` | Vivek `[DEMO DATA]` |

The seed dataset (`database/seed.js` & `database/seed.sql`) generates **22 realistic employees (`EMP-1001` to `EMP-1022`)**, **4 departments**, **8 designations**, **3 shifts**, **5 official holidays**, **35+ days of attendance history** (October & November 2026), **overtime requests**, **leave applications & balances**, and **monthly payroll runs**.

---

## 3. Automated Salary Calculation Engine (`backend/src/services/salaryEngine.js`)

All monetary calculations are performed on the backend using decimal-safe two-decimal rounding (`roundCurrency`):

1. **Base Rates:**
   - $\text{Daily Salary} = \frac{\text{Monthly Basic Salary}}{\text{Monthly Payroll Working Days}}$
   - $\text{Hourly Salary} = \frac{\text{Daily Salary}}{\text{Standard Working Hours Per Day}}$
2. **Absence Deduction:**
   - $\text{Absence Deduction} = \text{Daily Salary} \times (\text{Unpaid Absent Days} + \text{Unpaid Leave Days})$
   - *Spec Verification:* Basic Salary = ₹30,000, Working Days = 25 $\Rightarrow$ Daily Salary = ₹1,200. For 2 unpaid absent days, Deduction = ₹2,400, Remaining Basic = ₹27,600.
   - Approved **Paid Leave**, **Weekly Offs**, and **Official Holidays** never trigger deductions, and duplicate attendance dates are deduplicated to prevent double deductions.
3. **Late Arrival Deduction:**
   - Evaluates arrival against shift start time + configurable grace period (default `10 minutes`).
   - Supports 4 HR-configurable policies: `PROPORTIONAL_PER_MINUTE`, `FIXED_PER_MINUTE`, `HALF_DAY_AFTER_THRESHOLD`, and `RECORD_ONLY`.
   - **Single-Penalty Guarantee:** When a late arrival exceeds the half-day conversion threshold (or the day is already marked `HALF_DAY`), the engine applies only the half-day deduction and never stacks per-minute late or early-departure penalties on the same day.
4. **Early Check-Out Deduction:**
   - Deducts only unapproved shortfall minutes before scheduled shift end time.
5. **Overtime Calculation:**
   - $\text{Overtime Hours} = \max(0, \text{Actual Eligible Working Hours} - \text{Standard Working Hours})$
   - Configurable multipliers: **1.5×** Normal Overtime, **2.0×** Weekend Overtime, **2.0×** Holiday Overtime.
   - Only `APPROVED` overtime requests are included in payroll; duplicate dates are blocked to prevent double payment.
6. **Final Net Salary Formula:**
   $$\text{Net Salary} = \text{Basic Salary} + \text{Allowances} + \text{Approved Overtime Pay} - \text{Absence Deductions} - \text{Half-Day Deductions} - \text{Late Deductions} - \text{Early Checkout Deductions} - \text{Other Authorized Deductions}$$

---

## 4. Local Setup & Testing Instructions

### Prerequisites
- Node.js `v18+`
- MySQL `8.0+`

### Step 1: Initialize MySQL Schema & Seed Demo Data
```bash
cd backend
cp .env.example .env
# Edit .env with your local MySQL credentials
npm install
npm run migrate
mysql -u root -p attendance_payroll_db < ../database/seed.sql
```

### Step 2: Run Automated Backend & Salary Engine Tests
```bash
cd backend
npm test
```

### Step 3: Start Backend & Frontend Servers
```bash
# Terminal 1 - Backend REST API (Port 5000)
cd backend
npm run dev

# Terminal 2 - React Frontend (Port 5173)
cd frontend
npm install
npm run dev
```

---

## 5. Deployment Guide

- **Database (Managed MySQL — Railway / Aiven / PlanetScale):**
  Import `database/schema.sql`, `database/migrations/001_initial_schema.sql`, and `database/seed.sql`.
- **Backend (Render / Railway):**
  Set root directory to `backend`, build command `npm install`, start command `npm start`, health check path `/api/health`, and configure environment variables from `backend/.env.example`.
- **Frontend (Vercel):**
  Set root directory to `frontend`, build command `npm run build`, output directory `dist`, and set `VITE_API_BASE_URL` to your deployed backend URL.
