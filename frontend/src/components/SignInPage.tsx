import { useState } from 'react';
import { login, register, type LoginPayload, type RegisterPayload } from '../api/auth';

interface Props {
  onAuthenticated: (accessToken: string, refreshToken: string) => void;
}

type Mode = 'login' | 'register';

export default function SignInPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === 'register') {
        const payload: RegisterPayload = { email, password, displayName };
        await register(payload);
      }
      const payload: LoginPayload = { email, password };
      const tokens = await login(payload);
      onAuthenticated(tokens.accessToken, tokens.refreshToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <main className="auth-layout">
      <div className="auth-header">
        <h1>Digital Wave — Sales Intelligence</h1>
        <p>منصة ذكاء مبيعات الشركات. سجّل الدخول للمتابعة.</p>
      </div>

      <form className="auth-card" onSubmit={(event) => void handleSubmit(event)}>
        {mode === 'register' && (
          <label>
            الاسم
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={255}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={320}
            autoComplete="email"
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'جارٍ التحقق…' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
        </button>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              ليس لديك حساب؟{' '}
              <button type="button" className="link" onClick={() => switchMode('register')}>
                إنشاء حساب جديد
              </button>
            </>
          ) : (
            <>
              لديك حساب بالفعل؟{' '}
              <button type="button" className="link" onClick={() => switchMode('login')}>
                تسجيل الدخول
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
