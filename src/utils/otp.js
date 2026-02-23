import bcrypt from 'bcryptjs';

export const generateNumericCode = (length) => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

export const hashCode = async (code) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
};

export const verifyCode = async (code, hash) => {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
};
