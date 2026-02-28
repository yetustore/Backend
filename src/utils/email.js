import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const hasResend = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const sendEmailCode = async ({ to, code }) => {
  if (!hasResend() || !resend) {
    console.warn('Resend disabled: missing RESEND_API_KEY or RESEND_FROM');
    console.log(`Email code for ${to}: ${code}`);
    return;
  }
  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to,
      subject: 'YetuStore - Codigo de verificacao',
      text: `Seu codigo de verificacao: ${code}`,
    });
    if (result?.error) {
      console.error('Resend email error:', result.error);
    }
  } catch (err) {
    console.error('Resend email failed:', err);
  }
};

