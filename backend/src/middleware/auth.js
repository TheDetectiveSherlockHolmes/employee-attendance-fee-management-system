/**
 * Authentication, RBAC Authorization, Rate Limiting & Audit Middleware (`backend/src/middleware/auth.js`)
 */
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_enterprise_payroll_jwt_key_2026';

/**
 * Zero-dependency HMAC-SHA256 JWT implementation (compatible with standard RFC 7519 JWT and jsonwebtoken)
 */
function signJwt(payload, expiresInSeconds = 8 * 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(fullPayload)}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token format');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }
  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  if (signature !== expectedSig) {
    throw new Error('Invalid JWT signature');
  }
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token has expired');
  }
  return payload;
}

/**
 * Express middleware: verifies Bearer token and attaches req.user
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }
  const token = authHeader.slice(7).trim();
  try {
    const decoded = verifyJwt(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: `Invalid or expired token: ${err.message}` });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware
 * @param  {...string} allowedRoles - e.g. 'ADMIN', 'HR_MANAGER', 'EMPLOYEE'
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: [${allowedRoles.join(', ')}], current role: ${req.user?.role || 'NONE'}`,
      });
    }
    return next();
  };
}

/**
 * Enforces that an EMPLOYEE can only access their own employee_id records,
 * whereas ADMIN and HR_MANAGER can access any employee record.
 */
function ensureSelfOrHR(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role === 'ADMIN' || req.user.role === 'HR_MANAGER') {
    return next();
  }
  const requestedEmpId = Number(req.params.employeeId || req.body.employeeId || req.query.employeeId);
  if (requestedEmpId && requestedEmpId !== Number(req.user.employeeId)) {
    return res.status(403).json({
      error: 'Forbidden: Employees may only access their own personal records.',
    });
  }
  return next();
}

module.exports = {
  signJwt,
  verifyJwt,
  authenticateJWT,
  authorizeRoles,
  ensureSelfOrHR,
};
