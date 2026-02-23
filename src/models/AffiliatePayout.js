import mongoose from 'mongoose';

const affiliatePayoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['requested', 'paid', 'denied'], default: 'requested' },
}, { timestamps: true });

export const AffiliatePayout = mongoose.model('AffiliatePayout', affiliatePayoutSchema);
