import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'AOA' },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  imageUrl: { type: String, default: '' },
  media: [{
    type: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true, trim: true },
  }],
  rating: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  affiliatePercent: { type: Number, default: 5, min: 0, max: 100 },
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);
