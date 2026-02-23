import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true, index: true },
  tokenHash: { type: String, required: true },
  userType: { type: String, enum: ['client', 'admin'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
}, { timestamps: true });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
