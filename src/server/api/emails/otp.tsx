import { Tailwind } from '@react-email/tailwind';


interface OTPTemplateProps {
  otp: string;
  email: string;
}

export function OTPTemplate({ otp, email }: OTPTemplateProps) {
  return (
    <Tailwind>
    <div className="max-w-xl mx-auto px-6 py-10 font-sans text-gray-900">
      <h1 className="text-xl font-semibold mb-2">Payroll Comparison</h1>
      <p className="text-sm text-gray-500 mb-8">
        Sign-in code for <strong className="text-gray-700">{email}</strong>
      </p>

      <div className="bg-gray-100 rounded-lg p-6 text-center mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Your code</p>
        <span className="text-4xl font-bold tracking-[0.2em] tabular-nums">{otp}</span>
      </div>

      <p className="text-xs text-gray-400">
        This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    </Tailwind>

  );
}
