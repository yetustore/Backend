import nodemailer from 'nodemailer';

const hasSmtp = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

export const sendEmailCode = async ({ to, code }) => {
  if (!hasSmtp()) {
    console.log(`Email code for ${to}: ${code}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@yetustore.ao',
    to,
    subject: 'YetuStore - Codigo de verificacao',
    text: `Seu codigo de verificacao: ${code}`,
  });
};
