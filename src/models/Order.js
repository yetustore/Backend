import mongoose from 'mongoose';

const statusEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['agendado', 'em_progresso', 'comprado', 'cancelado'], required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
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
