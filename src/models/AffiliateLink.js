import mongoose from 'mongoose';

const affiliateLinkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  code: { type: String, required: true, unique: true, trim: true },
  url: { type: String, required: true },
  clicks: { type: Number, default: 0 },
  ordersCount: { type: Number, default: 0 },
}, { timestamps: true });

export const AffiliateLink = mongoose.model('AffiliateLink', affiliateLinkSchema);
