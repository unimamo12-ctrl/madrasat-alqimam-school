const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'alqimam-alnajah-school-super-secret-key-2026';
const TOKEN_TTL = '12h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// يتطلب تسجيل دخول
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً.' });
  }
}

// يتطلب دوراً معيناً
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية للوصول إلى هذا المورد.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, signToken, verifyToken, JWT_SECRET };