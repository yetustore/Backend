import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  name: { type: String, trim: true },
  role: { type: String, enum: ['Super Admin', 'Admin', 'Entregador'], default: 'Admin' },
  active: { type: Boolean, default: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

export const Admin = mongoose.model('Admin', adminSchema);
