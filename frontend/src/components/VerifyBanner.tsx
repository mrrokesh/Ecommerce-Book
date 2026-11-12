import { useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/** Shown to signed-in customers whose email is not verified yet. */
export default function VerifyBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.role !== 'customer' || user.emailVerified !== false) return null;

  async function resend() {
    setBusy(true);
    try {
      await api.post('/auth/resend-verification');
      setSent(true);
    } catch {
      /* the next click retries */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verify-banner" role="status">
      <span>Please verify your email ({user.email}) using the link we sent.</span>
      <button type="button" className="link-btn" onClick={resend} disabled={busy || sent}>
        {sent ? 'Link sent' : 'Resend link'}
      </button>
    </div>
  );
}
