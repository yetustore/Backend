import jwt from 'jsonwebtoken';

export const signAccessToken = ({ sub, userType }) => {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  const expiresIn = process.env.ACCESS_TOKEN_TTL || '15m';
  return jwt.sign({ sub, userType }, secret, { expiresIn });
};

export const signRefreshToken = ({ sub, userType, jti }) => {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  const expiresIn = process.env.REFRESH_TOKEN_TTL || '7d';
  return jwt.sign({ sub, userType, jti }, secret, { expiresIn });
};

export const verifyAccessToken = (token) => {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  return jwt.verify(token, secret);
};

export const verifyRefreshToken = (token) => {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  return jwt.verify(token, secret);
};
