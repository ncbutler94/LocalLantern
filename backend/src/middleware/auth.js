// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';

/**
 * Middleware to authenticate JWT from cookie or Authorization header.
 */
export default function authenticateToken(req, res, next) {
  // Try to get token from cookie
  let token = null;
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Access token missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}
