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
      html: getEmailTemplate(code),
    });
    if (result?.error) {
      console.error('Resend email error:', result.error);
    }
  } catch (err) {
    console.error('Resend email failed:', err);
  }
};

const getEmailTemplate = (code) => `
  <div style="margin:0; padding:0; background-color:#F4F4F4; font-family: Arial, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0;">
      <tr>
        <td align="center">
          
          <!-- Card principal -->
          <table width="500" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(90deg, #E91E63, #FF4081); padding:20px; text-align:center;">
                <h1 style="color:#FFFFFF; margin:0; font-size:24px;">
                  YetuStore
                </h1>
                <p style="color:#FFE4EC; margin:5px 0 0; font-size:14px;">
                  Compras fáceis têm nome
                </p>
              </td>
            </tr>

            <!-- Conteúdo -->
            <tr>
              <td style="padding:30px; text-align:center;">
                
                <h2 style="color:#333333; margin-bottom:10px;">
                  Código de Verificação
                </h2>
                
                <p style="color:#666; font-size:16px;">
                  Use o código abaixo para continuar:
                </p>

                <!-- Código -->
                <div style="
                  margin:25px 0;
                  font-size:32px;
                  font-weight:bold;
                  letter-spacing:6px;
                  color:#E91E63;
                ">
                  ${code}
                </div>

                <p style="color:#999; font-size:13px;">
                  Este código expira em poucos minutos.
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#F4F4F4; padding:20px; text-align:center;">
                <p style="font-size:12px; color:#777; margin:0;">
                  © ${new Date().getFullYear()} YetuStore
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </div>
`;