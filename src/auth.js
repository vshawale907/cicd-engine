const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT containing { id, email, role }.
 * Expires in 7 days.
 * @param {{ id: number, email: string, role: string }} user
 * @returns {string} signed JWT
 */
function generateToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set in environment');
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws if the token is invalid or expired.
 * @param {string} token
 * @returns {{ id: number, email: string, role: string }}
 */
function verifyToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set in environment');
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, comparePassword, generateToken, verifyToken };
