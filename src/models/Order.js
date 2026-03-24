import mongoose from 'mongoose';

const statusEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['agendado', 'em_progresso', 'comprado', 'cancelado'], required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  adminName: { type: String },
  adminPhone: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [orderItemSchema], required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['agendado', 'em_progresso', 'comprado', 'cancelado'], default: 'agendado' },
  scheduledDate: { type: String, required: true },
  scheduledTime: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  affiliateId: { type: String },
  affiliateLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'AffiliateLink' },
  affiliateUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  affiliateCode: { type: String },
  statusHistory: { type: [statusEntrySchema], default: [] },
}, { timestamps: true });

export const Order = mongoose.model('Order', orderSchema);
