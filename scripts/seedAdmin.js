import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDb } from '../src/config/db.js';
import { Admin } from '../src/models/Admin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const username = 'manuelpiresluis';
const password = 'admin123456789';

const run = async () => {
  await connectDb(process.env.MONGO_URI);

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await Admin.findOne({ username });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.active = true;
    if (!existing.role) existing.role = 'Super Admin';
    await existing.save();
    console.log('Admin atualizado:', username);
  } else {
    await Admin.create({
      username,
      passwordHash,
      role: 'Super Admin',
      active: true,
      name: 'Manuel Pires Luis',
      email: 'manuel.luis@mundodaimportacao.com',
    });
    console.log('Admin criado:', username);
  }

  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
