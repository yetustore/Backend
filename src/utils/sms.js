import twilio from 'twilio';

const hasTwilio = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

export const sendSmsCode = async ({ to, code }) => {
  if (!hasTwilio()) {
    console.log(`SMS code for ${to}: ${code}`);
    return;
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: process.env.TWILIO_FROM,
    to,
    body: `Seu codigo de verificacao: ${code}`,
  });
};
