import mongoose from 'mongoose';

const normalizePhone = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\s+/g, '').trim();
};

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: false, trim: true, set: normalizePhone },
  passwordHash: { type: String, required: false },
  provider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleSub: { type: String },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  emailVerificationCodeHash: { type: String },
  emailVerificationExpiresAt: { type: Date },
  phoneVerificationCodeHash: { type: String },
  phoneVerificationExpiresAt: { type: Date },
  resetPasswordCodeHash: { type: String },
  resetPasswordExpiresAt: { type: Date },
  bankAccountName: { type: String, trim: true },
  bankName: { type: String, trim: true },
  bankIban: { type: String, trim: true },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
