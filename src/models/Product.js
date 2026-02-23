import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'AOA' },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  imageUrl: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);
