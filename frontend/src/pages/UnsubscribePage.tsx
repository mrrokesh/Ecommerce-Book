import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

/** Landing page for the unsubscribe link in promotional emails. Works without signing in. */
export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [msg, setMsg] = useState(token ? '' : 'This unsubscribe link is incomplete.');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post('/auth/unsubscribe', { token })
      .then(() => setState('done'))
      .catch((err) => { setState('error'); setMsg(err.message); });
  }, [token]);

  return (
    <div className="auth-page container">
      <div className="auth-card">
        <h1>Email preferences</h1>
        {state === 'working' ? <p>Updating your preferences…</p> : null}
        {state === 'done' ? <p className="form-msg">You are unsubscribed. You will not receive promotional emails from us. Order and account emails will still reach you.</p> : null}
        {state === 'error' ? <p className="form-error">{msg}</p> : null}
        <p className="auth-switch">
          <Link to="/">Back to the shop</Link>
        </p>
      </div>
    </div>
  );
}
