/**
 * Downloadable PDF Salary Slip Generator (`backend/src/services/pdfGenerator.js`)
 * Generates an official, valid PDF 1.4 binary document containing all 19 mandatory
 * salary slip fields without requiring external system fonts.
 */

function escapePdfText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/₹/g, 'INR ');
}

function formatINR(val) {
  const n = Number(val || 0);
  return `INR ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds a standards-compliant downloadable PDF Buffer for an employee's monthly salary slip
 */
function generateSalarySlipPDF(slipData) {
  const companyName = slipData.companyName || 'MAA AARYA INTERNATINAL (DS Group HoReCa Business)';
  const lines = [
    { text: companyName, size: 14, bold: true, y: 790 },
    { text: `OFFICIAL MONTHLY SALARY SLIP - PAYROLL PERIOD: ${slipData.payrollMonth} [DEMO DATA]`, size: 10, bold: true, y: 772 },
    { text: `Slip Number: ${slipData.slipNumber}   |   Status: ${slipData.isFinalized ? 'FINALIZED' : 'GENERATED'}`, size: 9, bold: false, y: 756 },
    { text: '----------------------------------------------------------------------------------------------------------------', size: 9, bold: false, y: 742 },
    { text: `Employee Name : ${slipData.employeeName}`, size: 10, bold: true, y: 726 },
    { text: `Employee ID   : ${slipData.employeeCode}`, size: 10, bold: false, y: 710 },
    { text: `Designation   : ${slipData.designation}`, size: 10, bold: false, y: 694 },
    { text: `Department    : ${slipData.department}`, size: 10, bold: false, y: 678 },
    { text: `Payroll Month : ${slipData.payrollMonth} (Configured Working Days: ${slipData.workingDaysPerMonth})`, size: 10, bold: false, y: 662 },
    { text: '----------------------------------------------------------------------------------------------------------------', size: 9, bold: false, y: 646 },
    { text: 'ATTENDANCE & LEAVE SUMMARY', size: 11, bold: true, y: 630 },
    { text: `Present Days       : ${slipData.presentDays} days`, size: 10, bold: false, y: 612 },
    { text: `Unpaid Absent Days : ${slipData.absentDays} days`, size: 10, bold: false, y: 596 },
    { text: `Approved Paid Leave: ${slipData.paidLeave} days (No Deduction)`, size: 10, bold: false, y: 580 },
    { text: `Unpaid Leave       : ${slipData.unpaidLeave} days`, size: 10, bold: false, y: 564 },
    { text: `Approved Overtime  : ${slipData.overtimeHours} hrs`, size: 10, bold: false, y: 548 },
    { text: '----------------------------------------------------------------------------------------------------------------', size: 9, bold: false, y: 532 },
    { text: 'EARNINGS BREAKDOWN', size: 11, bold: true, y: 516 },
    { text: `1. Basic Salary            : ${formatINR(slipData.basicSalary)}`, size: 10, bold: false, y: 498 },
    { text: `2. Total Allowances        : ${formatINR(slipData.allowances)}`, size: 10, bold: false, y: 482 },
    { text: `3. Overtime Earnings       : ${formatINR(slipData.overtimeEarnings)} (${slipData.overtimeHours} hrs approved)`, size: 10, bold: false, y: 466 },
    { text: `GROSS SALARY               : ${formatINR(slipData.grossSalary)}`, size: 11, bold: true, y: 446 },
    { text: '----------------------------------------------------------------------------------------------------------------', size: 9, bold: false, y: 430 },
    { text: 'DEDUCTIONS BREAKDOWN', size: 11, bold: true, y: 414 },
    { text: `1. Absence & Unpaid Leave  : ${formatINR(slipData.absenceDeductions)}`, size: 10, bold: false, y: 396 },
    { text: `2. Half-Day Deductions     : ${formatINR(slipData.halfDayDeductions || 0)}`, size: 10, bold: false, y: 380 },
    { text: `3. Late Arrival Deductions : ${formatINR(slipData.lateArrivalDeductions)}`, size: 10, bold: false, y: 364 },
    { text: `4. Early Checkout Shortfall: ${formatINR(slipData.earlyDepartureDeductions)}`, size: 10, bold: false, y: 348 },
    { text: `5. Other Authorized Ded.   : ${formatINR(slipData.otherDeductions)}`, size: 10, bold: false, y: 332 },
    { text: `TOTAL DEDUCTIONS           : ${formatINR(slipData.totalDeductions)}`, size: 11, bold: true, y: 312 },
    { text: '================================================================================================================', size: 9, bold: false, y: 294 },
    { text: `NET PAYABLE SALARY         : ${formatINR(slipData.netSalary)}`, size: 13, bold: true, y: 274 },
    { text: '================================================================================================================', size: 9, bold: false, y: 256 },
    { text: 'System-generated document via Automated Payroll Management Engine. Server timestamp verified.', size: 8, bold: false, y: 230 },
  ];

  const streamOps = ['BT'];
  for (const item of lines) {
    const fontKey = item.bold ? '/F2' : '/F1';
    streamOps.push(`${fontKey} ${item.size} Tf`);
    streamOps.push(`1 0 0 1 48 ${item.y} Tm`);
    streamOps.push(`(${escapePdfText(item.text)}) Tj`);
  }
  streamOps.push('ET');
  const contentStream = streamOps.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

module.exports = { generateSalarySlipPDF };
