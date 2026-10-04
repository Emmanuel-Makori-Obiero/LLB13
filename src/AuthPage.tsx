import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import { supabase } from "./data/repository";

type Mode = "sign-in" | "sign-up";
type Notice = { tone: "error" | "info" | "success"; text: string } | null;

const EMAIL_COOLDOWN = 60;
const RATE_LIMIT_COOLDOWN = 300;
const EMAIL_REQUEST_KEY = "group13-auth-email-request";

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Wrong email or password. If you have just signed up, confirm your email first.";
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("email rate") ||
    m.includes("only request this after")
  )
    return "Too many email requests were made. Please wait a few minutes before trying again. Do not keep tapping the button.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "This email already has an account. Try signing in instead.";
  if (m.includes("password") && m.includes("weak"))
    return "That password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  if (m.includes("database error saving new user"))
    return "Sign-ups are limited to approved Group 13 emails. Ask the group admin to add yours.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Could not reach the server. Check your internet connection and try again.";
  return message;
}

function Logo() {
  return (
    <div className="auth-logo">
      <div className="brand-mark">13</div>
      <div className="auth-logo-text">
        <span>GROUP 13</span>
        <small>Law school hub</small>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-input-wrap">
        <input
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="auth-eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

export default function LoginPage({
  configured,
  onSignedIn,
  initialMode = "sign-in",
  onBackToHome,
}: {
  configured: boolean;
  onSignedIn?: (email: string) => void;
  initialMode?: Mode;
  onBackToHome?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null); // set once we are waiting for email confirmation
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => setMode(initialMode), [initialMode]);

  const readEmailCooldown = (target: string) => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(EMAIL_REQUEST_KEY) ?? "null",
      ) as { email?: string; until?: number } | null;
      if (saved?.email === target && typeof saved.until === "number")
        return Math.max(0, Math.ceil((saved.until - Date.now()) / 1000));
    } catch {
      // Local storage can be unavailable in private browsing; the in-memory guard still applies.
    }
    return 0;
  };

  const rememberEmailRequest = (target: string, seconds: number) => {
    try {
      window.localStorage.setItem(
        EMAIL_REQUEST_KEY,
        JSON.stringify({ email: target, until: Date.now() + seconds * 1000 }),
      );
    } catch {
      // The request can continue safely without persistence.
    }
    setCooldown(seconds);
  };

  // Expired or already-used email links come back as #error=...&error_description=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const description = params.get("error_description");
    if (description) {
      const expired = params.get("error_code") === "otp_expired";
      setNotice({
        tone: "error",
        text: expired
          ? "That email link has expired or was already used. Sign in, or request a new link."
          : description.replace(/\+/g, " "),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    setPendingEmail(null);
    setPassword("");
    setConfirmPassword("");
  };

  const resend = async (target: string) => {
    const savedCooldown = readEmailCooldown(target);
    if (!supabase || cooldown > 0 || savedCooldown > 0) {
      if (savedCooldown > 0) setCooldown(savedCooldown);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        const message = friendlyError(error.message);
        if (
          message !== error.message ||
          /rate|too many|only request this after/i.test(error.message)
        )
          rememberEmailRequest(target, RATE_LIMIT_COOLDOWN);
        setNotice({ tone: "error", text: message });
        return;
      }
      rememberEmailRequest(target, EMAIL_COOLDOWN);
      setNotice({
        tone: "success",
        text: `Confirmation email sent to ${target}. Check your spam folder too.`,
      });
    } catch (error) {
      const message = error instanceof Error ? friendlyError(error.message) : "Could not send the confirmation email. Check your connection and try again.";
      setNotice({ tone: "error", text: message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    const cleanEmail = email.trim().toLowerCase();
    setNotice(null);

    if (password.length < 8) {
      setNotice({
        tone: "error",
        text: "Password must be at least 8 characters.",
      });
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setNotice({ tone: "error", text: "Passwords do not match." });
      return;
    }

    const savedCooldown =
      mode === "sign-up" ? readEmailCooldown(cleanEmail) : 0;
    if (savedCooldown > 0) {
      setPendingEmail(cleanEmail);
      setCooldown(savedCooldown);
      setNotice({
        tone: "info",
        text: `A confirmation email was already requested for ${cleanEmail}. Check your inbox or spam folder; you can request another one when the timer ends.`,
      });
      return;
    }

    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          if (error.message.toLowerCase().includes("not confirmed")) {
            setPendingEmail(cleanEmail);
            setNotice({
              tone: "info",
              text: "Your email is not confirmed yet. Open the link we sent you, or request a new one below.",
            });
          } else {
            setNotice({ tone: "error", text: friendlyError(error.message) });
          }
          return;
        }
        onSignedIn?.(cleanEmail);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: name.trim() ? { display_name: name.trim() } : undefined,
        },
      });
      if (error) {
        const message = friendlyError(error.message);
        if (/rate|too many|only request this after/i.test(error.message))
          rememberEmailRequest(cleanEmail, RATE_LIMIT_COOLDOWN);
        setNotice({ tone: "error", text: message });
        return;
      }

      // Supabase hides duplicate signups: it returns a user with no identities and sends NO email.
      if (
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        setNotice({
          tone: "info",
          text: 'This email already has an account. Sign in instead, or use "Forgot password?" if you cannot remember it.',
        });
        setMode("sign-in");
        return;
      }

      if (data.session) {
        onSignedIn?.(cleanEmail);
        return;
      } // email confirmation is switched off in Supabase

      setPendingEmail(cleanEmail);
      rememberEmailRequest(cleanEmail, EMAIL_COOLDOWN);
      setNotice(null);
    } catch (err) {
      setNotice({
        tone: "error",
        text: friendlyError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setNotice({
        tone: "error",
        text: 'Enter your email above first, then tap "Forgot password?".',
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });
      setNotice(
        error
          ? { tone: "error", text: friendlyError(error.message) }
          : {
              tone: "success",
              text: "If that email has an account, a reset link is on its way.",
            },
      );
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error instanceof Error ? error.message : "Could not send a password reset email.") });
    } finally {
      setBusy(false);
    }
  };

  const isSignUp = mode === "sign-up";

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside">
          <Logo />
          <div>
            <h2>Everything Group 13 needs, in one calm place.</h2>
            <p>
              Units, materials, assignments and meeting rooms, private to your
              class.
            </p>
          </div>
          <small>Private workspace</small>
        </aside>

        <section className="auth-panel">
          <div className="auth-mobile-logo">
            <Logo />
          </div>

          {onBackToHome && (
            <button
              type="button"
              className="auth-home-link"
              onClick={onBackToHome}
            >
              ← Back to Group 13 home
            </button>
          )}

          {!configured ? (
            <div className="auth-notice error">
              <strong>We’ll be right back</strong>
              <span>
                Group 13 is being set up. Please try again in a little while.
              </span>
            </div>
          ) : pendingEmail ? (
            <div className="auth-pending">
              <div className="auth-pending-icon">
                <Mail size={26} />
              </div>
              <h1>Check your email</h1>
              <p className="auth-lead">
                We sent a confirmation link to <strong>{pendingEmail}</strong>.
                Open it, then come back and sign in.
              </p>
              {notice && (
                <div className={`auth-notice ${notice.tone}`}>
                  {notice.text}
                </div>
              )}
              <button
                type="button"
                className="auth-submit"
                disabled={busy || cooldown > 0}
                onClick={() => resend(pendingEmail)}
              >
                {cooldown > 0
                  ? `Resend email in ${cooldown}s`
                  : "Resend confirmation email"}
              </button>
              <p className="auth-hint">
                Nothing after a few minutes? Check spam or junk, and make sure
                the address is spelled correctly.
              </p>
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode("sign-in")}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="auth-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignUp}
                  className={!isSignUp ? "active" : ""}
                  onClick={() => switchMode("sign-in")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignUp}
                  className={isSignUp ? "active" : ""}
                  onClick={() => switchMode("sign-up")}
                >
                  Create account
                </button>
              </div>

              <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
              <p className="auth-lead">
                {isSignUp
                  ? "Use your email to join the Group 13 workspace."
                  : "Sign in to reach your classes, materials and assignments."}
              </p>

              <form className="auth-form" onSubmit={submit}>
                {isSignUp && (
                  <label className="auth-field">
                    <span>
                      Full name <em>(optional)</em>
                    </span>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder={
                    isSignUp ? "At least 8 characters" : "Your password"
                  }
                />
                {isSignUp && (
                  <PasswordField
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                  />
                )}

                {notice && (
                  <div className={`auth-notice ${notice.tone}`} role="status">
                    {notice.text}
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : isSignUp
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>

              {!isSignUp && (
                <button
                  type="button"
                  className="auth-link muted"
                  onClick={forgotPassword}
                  disabled={busy}
                >
                  Forgot password?
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    if (password.length < 8) {
      setNotice({
        tone: "error",
        text: "Password must be at least 8 characters.",
      });
      return;
    }
    if (password !== confirm) {
      setNotice({ tone: "error", text: "Passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setNotice({ tone: "error", text: friendlyError(error.message) });
        return;
      }
      window.history.replaceState({}, "", "/");
      onDone();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error instanceof Error ? error.message : "Could not update your password.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell single">
        <section className="auth-panel">
          <div className="auth-mobile-logo" style={{ display: "block" }}>
            <Logo />
          </div>
          <h1>Set a new password</h1>
          <p className="auth-lead">
            Choose a new password for your Group 13 account.
          </p>
          <form className="auth-form" onSubmit={submit}>
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Repeat your password"
            />
            {notice && (
              <div className={`auth-notice ${notice.tone}`} role="status">
                {notice.text}
              </div>
            )}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
