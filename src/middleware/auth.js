import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth = (userType) => (req, res, next) => {
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = verifyAccessToken(token);
    if (userType && payload.userType !== userType) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.auth = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
