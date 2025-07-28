// backend/src/middleware/optionalAuth.js
import jwt from 'jsonwebtoken';

export default function optionalAuth(req, _res, next) {
    // 1️⃣  pull the token if it exists (cookie OR bearer header)
    const token =
        req.cookies?.token ||
        (_res.req.headers.authorization?.split(' ')[1]);

    if (!token) return next();          // guest – just carry on

    // 2️⃣  try to decode; NEVER send a response here
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (!err) req.user = user;        // make user info available
        next();                           // always continue
    });
}
