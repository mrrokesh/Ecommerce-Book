import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const token = params.get('token') || '';
  const [state, setState] = useState<'working' | 'ok' | 'error'>(token ? 'working' : 'error');
  const [msg, setMsg] = useState(token ? '' : 'This verification link is incomplete.');

  // The token is single-use: send it once even if React runs this effect twice (StrictMode in development).
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        refresh();
      })
      .catch((err) => {
        setState('error');
        setMsg(err.message);
      });
  }, [token, refresh]);

  return (
    <div className="auth-page container">
      <div className="auth-card">
        <h1>Email verification</h1>
        {state === 'working' ? <p>Verifying your email…</p> : null}
        {state === 'ok' ? <p className="form-msg">Your email is verified. Thank you!</p> : null}
        {state === 'error' ? <p className="form-error">{msg}</p> : null}
        <p className="auth-switch">
          <Link to="/">Continue shopping</Link>
        </p>
      </div>
    </div>
  );
}
