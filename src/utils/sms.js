import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const hasTelcoSms = () => Boolean(process.env.TELCOSMS_API_KEY_APP);

export const sendSmsCode = async ({ to, code }) => {
  if (!hasTelcoSms()) {
    console.warn('TelcoSMS disabled: missing TELCOSMS_API_KEY_APP');
    console.log(`SMS code for ${to}: ${code}`);
    return;
  }
  try {
    const response = await fetch('https://telcosms.co.ao/send_message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          api_key_app: process.env.TELCOSMS_API_KEY_APP,
          phone_number: String(to),
          message_body: `Seu codigo de verificacao: ${code}`,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
  } catch (err) {
    console.error('TelcoSMS send failed:', err);
  }
};
