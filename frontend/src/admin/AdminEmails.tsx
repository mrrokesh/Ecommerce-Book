import { useEffect, useState } from 'react';
import api from '../api/client';

export default function AdminEmails() {
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/emails')
      .then(({ data }) => setEmails(data.emails || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="erp-card">
      <p className="muted" style={{ padding: '0.85rem' }}>
        Messages are stored here. SMTP sends them when SMTP_HOST is set.
      </p>
      {error ? <p className="erp-error" style={{ padding: '0 0.85rem' }}>{error}</p> : null}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>To</th>
            <th>Subject</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((m) => (
            <tr key={m.id}>
              <td>
                <span className={`erp-pill ${m.sent ? 'ok' : 'warn'}`}>{m.sent ? 'sent' : 'queued'}</span>
              </td>
              <td>{m.to}</td>
              <td>{m.subject}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
