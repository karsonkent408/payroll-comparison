import { render } from '@react-email/components';
import { OTPTemplate } from '@/server/api/emails/otp';
import { env } from "cloudflare:workers";

const FROM = { email: 'auth@payroll-comparisons.domain.dev', name: 'Payroll Comparisons' };

export async function sendOTPEmail(to: string, otp: string) {
  if (!env.SEND_EMAIL) {
    throw new Error('SEND_EMAIL binding is not configured');
  }

  const html = await render(<OTPTemplate otp={otp} email={to} />);
  const text = `Payroll Comparison sign-in code for ${to}: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;
  await env.SEND_EMAIL.send({
    from: FROM,
    to,
    subject: `${otp} is your Payroll Comparison sign-in code`,
    html,
    text,
  });
}
