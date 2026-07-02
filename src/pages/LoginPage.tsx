import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/components/ui/input-otp";
import { useNavigate } from "@tanstack/react-router";

const ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user: "No account found for that email. Contact an administrator.",
};

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  function startCooldown() {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  const errorCode = new URLSearchParams(window.location.search).get("error");
  const urlError = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Sign in failed. Please try again.") : null;

  async function handleSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (email.endsWith("@domain.com")) {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: "/",
          errorCallbackURL: "/login",
        });
      } else {
        console.log("[login] sending OTP to", email);
        const result = await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        });
        console.log("[login] sendVerificationOtp result", result);
        if (result.error) {
          setError(result.error.message ?? "Failed to send code. Please try again.");
        } else {
          setStep("otp");
          startCooldown();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (result.error) {
        setError(result.error.message ?? "Failed to resend code. Please try again.");
      } else {
        startCooldown();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitOtp(e?: React.FormEvent, otpOverride?: string) {
    e?.preventDefault();
    const code = otpOverride ?? otp;
    setError(null);
    setLoading(true);
    try {
      console.log("[login] verifying OTP for", email, "otp:", code);
      const result = await authClient.signIn.emailOtp({
        email,
        otp: code,
        callbackURL: "/",
      });
      console.log("[login] signIn.emailOtp result", result);
      if (result.error) {
        setError(result.error.message ?? "Invalid code. Please try again.");
      } else {
        navigate({ to: '/', search: { page: 1, filters: undefined } })
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Payroll Comparison</CardTitle>
          <CardDescription>
            {step === "email" ? "Sign in to continue" : `We sent a code to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(urlError ?? error) && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {urlError ?? error}
            </p>
          )}

          {step === "email" ? (
            <form onSubmit={handleSubmitEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Continuing…" : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmitOtp} className="space-y-3">
              <div className="flex flex-col items-stretch mx-auto w-fit gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <Label htmlFor="otp">Code</Label>
                  <InputOTP
                    id="otp"
                    maxLength={6}
                    value={otp}
                    onChange={(val) => { setOtp(val); if (val.length === 6) handleSubmitOtp(undefined, val); }}
                    autoFocus
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </div>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => { setStep("email"); setOtp(""); setError(null); }}
              >
                Use a different email
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
