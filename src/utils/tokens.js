import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken } from './jwt.js';
import { parseDurationToMs } from './time.js';
import { RefreshToken } from '../models/RefreshToken.js';

export const issueTokens = async ({ userId, userType }) => {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({ sub: userId, userType });
  const refreshToken = signRefreshToken({ sub: userId, userType, jti });

  const refreshTtl = process.env.REFRESH_TOKEN_TTL || '7d';
  const expiresAt = new Date(Date.now() + parseDurationToMs(refreshTtl, 7 * 24 * 60 * 60 * 1000));

  const tokenHash = await bcrypt.hash(refreshToken, 10);
  await RefreshToken.create({
    jti,
    tokenHash,
    userType,
    userId,
    expiresAt,
  });

  return { accessToken, refreshToken };
};

export const revokeRefreshToken = async (refreshToken, userType) => {
  const { verifyRefreshToken } = await import('./jwt.js');
  const payload = verifyRefreshToken(refreshToken);
  if (payload.userType !== userType) return null;
  const record = await RefreshToken.findOne({ jti: payload.jti, userType });
  if (!record) return null;
  record.revokedAt = new Date();
  await record.save();
  return record;
};

export const rotateRefreshToken = async (refreshToken, userType) => {
  const { verifyRefreshToken } = await import('./jwt.js');
  const payload = verifyRefreshToken(refreshToken);
  if (payload.userType !== userType) {
    throw new Error('Invalid token type');
  }
  const record = await RefreshToken.findOne({ jti: payload.jti, userType });
  if (!record || record.revokedAt) {
    throw new Error('Token revoked');
  }
  if (record.expiresAt < new Date()) {
    throw new Error('Token expired');
  }
  const match = await bcrypt.compare(refreshToken, record.tokenHash);
  if (!match) {
    throw new Error('Token mismatch');
  }
  record.revokedAt = new Date();
  await record.save();
  return issueTokens({ userId: payload.sub, userType });
};
