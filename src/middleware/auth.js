const { verifyToken } = require('../auth');

/**
 * requireAuth — extracts and verifies the Bearer token from the
 * Authorization header. Attaches decoded payload to req.user.
 * Returns 401 if missing or invalid.
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireAdmin — calls requireAuth first, then asserts role === 'admin'.
 * Returns 403 if the authenticated user is not an admin.
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
