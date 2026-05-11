import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

/* Wraps the app. Shows a sign-in/sign-up form until a session exists. */
export function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="boot">
        › connecting<span className="blink">_</span>
      </div>
    );
  }

  if (!session) return <AuthScreen />;
  return children;
}

function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <form onSubmit={submit} style={{
        width: 380, maxWidth: '100%',
        background: 'var(--cream)',
        border: 'var(--border)',
        borderRadius: 18,
        padding: 28,
        boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 12%, transparent)',
      }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', letterSpacing: '0.14em', fontWeight: 600, marginBottom: 8 }}>
          TASK.TRACKER
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 22, color: 'var(--ink)' }}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </div>

        <label className="micro" style={{ color: 'var(--olive-soft)' }}>EMAIL</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          style={inputStyle}
        />

        <label className="micro" style={{ color: 'var(--olive-soft)', marginTop: 14, display: 'block' }}>PASSWORD</label>
        <input
          type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          style={inputStyle}
        />

        {err && <div style={msgStyle('var(--danger)')}>{err}</div>}
        {info && <div style={msgStyle('var(--done)')}>{info}</div>}

        <button type="submit" disabled={busy} style={{
          marginTop: 18, width: '100%', padding: '12px 16px',
          background: 'var(--accent)', color: 'white',
          border: 'none', borderRadius: 10,
          fontWeight: 700, fontSize: 15,
          opacity: busy ? 0.7 : 1,
        }}>
          {busy ? '…' : (mode === 'signin' ? 'Sign in' : 'Sign up')}
        </button>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: 'var(--olive-soft)' }}>
          {mode === 'signin' ? (
            <>No account? <a href="#" onClick={e => { e.preventDefault(); setMode('signup'); setErr(''); }} style={linkStyle}>Create one</a></>
          ) : (
            <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode('signin'); setErr(''); }} style={linkStyle}>Sign in</a></>
          )}
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%', marginTop: 6, padding: '10px 12px',
  background: 'var(--cream-2)', border: 'none', borderRadius: 10,
  fontSize: 15, color: 'var(--ink)',
};
const linkStyle = { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 };
function msgStyle(color) {
  return {
    marginTop: 14, padding: '10px 12px',
    background: `color-mix(in oklab, ${color} 12%, var(--cream-2))`,
    color, borderRadius: 8, fontSize: 13,
  };
}

export async function signOut() {
  await supabase.auth.signOut();
}
