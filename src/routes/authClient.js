import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { issueTokens, rotateRefreshToken, revokeRefreshToken } from '../utils/tokens.js';
import { generateNumericCode, hashCode, verifyCode } from '../utils/otp.js';
import { sendEmailCode } from '../utils/email.js';
import { sendSmsCode } from '../utils/sms.js';
import { verifyGoogleIdToken } from '../utils/google.js';

const router = express.Router();

const normalizePhone = (phone) => phone.replace(/\s+/g, '').trim();
const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().min(7));

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: phoneSchema,
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const googleSchema = z.object({
  idToken: z.string().min(10),
});

const codeSchema = z.object({
  code: z.string().min(4).max(6),
});

const setPhoneSchema = z.object({
  phone: phoneSchema,
});

const forgotRequestSchema = z.object({
  email: z.string().email(),
  channel: z.enum(['email', 'phone']),
});

const forgotConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(6),
  newPassword: z.string().min(6),
});

const profileSchema = z.object({
  name: z.string().min(2).optional(),
});

const sanitizeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  emailVerified: user.emailVerified,
  phoneVerified: user.phoneVerified,
  createdAt: user.createdAt,
});

const setEmailCode = async (user) => {
  const code = generateNumericCode(6);
  user.emailVerificationCodeHash = await hashCode(code);
  user.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendEmailCode({ to: user.email, code });
};

const setPhoneCode = async (user) => {
  if (!user.phone) return;
  const code = generateNumericCode(4);
  user.phoneVerificationCodeHash = await hashCode(code);
  user.phoneVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendSmsCode({ to: user.phone, code });
};

const setResetCode = async (user, channel) => {
  const code = generateNumericCode(6);
  user.resetPasswordCodeHash = await hashCode(code);
  user.resetPasswordExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  if (channel === 'phone') {
    await sendSmsCode({ to: user.phone, code });
  } else {
    await sendEmailCode({ to: user.email, code });
  }
};

router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await User.findOne({ email: data.email });
    if (exists) return res.status(400).json({ error: 'Email ja registrado' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await User.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      provider: 'local',
      emailVerified: false,
      phoneVerified: false,
    });

    const tokens = await issueTokens({ userId: user._id, userType: 'client' });
    res.json({ user: sanitizeUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await User.findOne({ email: data.email });
    if (!user || !user.passwordHash) return res.status(400).json({ error: 'Credenciais invalidas' });
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Credenciais invalidas' });

    const tokens = await issueTokens({ userId: user._id, userType: 'client' });
    res.json({ user: sanitizeUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = googleSchema.parse(req.body);
    const payload = await verifyGoogleIdToken(idToken);
    const email = payload?.email;
    if (!email) return res.status(400).json({ error: 'Token invalido' });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: payload.name || 'Cliente',
        email,
        phone: '',
        passwordHash: undefined,
        provider: 'google',
        googleSub: payload.sub,
        emailVerified: true,
        phoneVerified: false,
      });
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    const tokens = await issueTokens({ userId: user._id, userType: 'client' });
    res.json({ user: sanitizeUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth('client'), async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/profile', requireAuth('client'), async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body || {});
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (data.name) user.name = data.name;
    await user.save();
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', requireAuth('client'), async (req, res, next) => {
  try {
    const { code } = codeSchema.parse(req.body);
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.emailVerified) return res.json({ user: sanitizeUser(user) });
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Codigo expirado' });
    }
    const ok = await verifyCode(code, user.emailVerificationCodeHash);
    if (!ok) return res.status(400).json({ error: 'Codigo invalido' });
    user.emailVerified = true;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-phone', requireAuth('client'), async (req, res, next) => {
  try {
    const { code } = codeSchema.parse(req.body);
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (!user.phone) return res.status(400).json({ error: 'Telefone nao informado' });
    if (user.phoneVerified) return res.json({ user: sanitizeUser(user) });
    if (!user.phoneVerificationExpiresAt || user.phoneVerificationExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Codigo expirado' });
    }
    const ok = await verifyCode(code, user.phoneVerificationCodeHash);
    if (!ok) return res.status(400).json({ error: 'Codigo invalido' });
    user.phoneVerified = true;
    user.phoneVerificationCodeHash = undefined;
    user.phoneVerificationExpiresAt = undefined;
    await user.save();
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-email', requireAuth('client'), async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    await setEmailCode(user);
    res.json({ message: 'Email enviado' });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-phone', requireAuth('client'), async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (!user.phone) return res.status(400).json({ error: 'Telefone nao informado' });
    await setPhoneCode(user);
    res.json({ message: 'SMS enviado' });
  } catch (err) {
    next(err);
  }
});

router.post('/set-phone', requireAuth('client'), async (req, res, next) => {
  try {
    const { phone } = setPhoneSchema.parse(req.body);
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    user.phone = phone;
    user.phoneVerified = false;
    await user.save();
    await setPhoneCode(user);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password/request', async (req, res, next) => {
  try {
    const { email, channel } = forgotRequestSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'Codigo enviado' });
    if (user.provider !== 'local' || !user.passwordHash) {
      return res.status(400).json({ error: 'Conta sem senha local' });
    }
    if (channel === 'phone' && !user.phone) {
      return res.status(400).json({ error: 'Telefone nao informado' });
    }
    await setResetCode(user, channel);
    res.json({ message: 'Codigo enviado' });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password/confirm', async (req, res, next) => {
  try {
    const { email, code, newPassword } = forgotConfirmSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Codigo invalido' });
    if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Codigo expirado' });
    }
    const ok = await verifyCode(code, user.resetPasswordCodeHash);
    if (!ok) return res.status(400).json({ error: 'Codigo invalido' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordCodeHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();
    res.json({ message: 'Senha atualizada' });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token ausente' });
    const tokens = await rotateRefreshToken(refreshToken, 'client');
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token ausente' });
    await revokeRefreshToken(refreshToken, 'client');
    res.json({ message: 'Ok' });
  } catch (err) {
    next(err);
  }
});

export default router;




