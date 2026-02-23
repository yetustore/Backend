import mongoose from 'mongoose';

export const connectDb = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  return mongoose.connection;
};
