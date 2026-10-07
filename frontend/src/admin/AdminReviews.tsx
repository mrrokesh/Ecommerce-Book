import { useEffect, useState } from 'react';
import api from '../api/client';

export default function AdminReviews() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  function load() {
    api
      .get('/reviews/admin')
      .then(({ data }) => setRows(data.reviews || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, isHidden: boolean) {
    try {
      await api.patch(`/reviews/admin/${id}`, { isHidden });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="erp-card">
      {error ? <p className="erp-error">{error}</p> : null}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Book</th>
            <th>Reviewer</th>
            <th>Rating</th>
            <th>Comment</th>
            <th>Flags</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.bookTitle}</td>
              <td>{r.reviewerName}</td>
              <td>{r.rating}★</td>
              <td>{r.comment}</td>
              <td>
                {r.isVerified ? <span className="erp-pill ok">verified</span> : null}{' '}
                {r.isHidden ? <span className="erp-pill off">hidden</span> : null}
              </td>
              <td>
                <button type="button" className="erp-btn ghost" onClick={() => toggle(r.id, !r.isHidden)}>
                  {r.isHidden ? 'Show' : 'Hide'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="muted" style={{ padding: '1rem' }}>No reviews yet.</p> : null}
    </div>
  );
}
