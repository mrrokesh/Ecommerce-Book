import { useEffect, useState } from 'react';
import api from '../api/client';
import { showToast } from './Toast';

type Line = { id: string; title: string; quantity: number; returned_quantity?: number; returnedQuantity?: number };

/** Customer item-level return: pick items and quantities, give a reason. */
export default function ReturnItems({ orderId, onDone, onCancel }: { orderId: string; onDone: () => void; onCancel: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/orders/' + orderId)
      .then(({ data }) => setLines(data.order.items || []))
      .catch((e) => setError(e.message));
  }, [orderId]);

  const left = (l: Line) => l.quantity - Number(l.returned_quantity ?? l.returnedQuantity ?? 0);
  const chosen = lines.filter((l) => (qty[l.id] || 0) > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/returns/' + orderId, { items: chosen.map((l) => ({ id: l.id, quantity: qty[l.id] })), reason: reason.trim() });
      showToast('Return requested. Shipping is not included in item refunds.');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="order-action-form" onSubmit={submit}>
      <p>Choose the items to return. Unused items only; we review each request before refunding.</p>
      {lines.map((l) => (
        <label key={l.id} className="return-line">
          <span>{l.title} (bought {l.quantity})</span>
          <select value={qty[l.id] || 0} disabled={left(l) < 1} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })}>
            {Array.from({ length: Math.max(left(l), 0) + 1 }, (_, n) => (
              <option key={n} value={n}>{n === 0 ? 'Keep' : `Return ${n}`}</option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Reason (required)
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="dialog-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-navy" disabled={busy || !chosen.length || !reason.trim()}>Request return</button>
      </div>
    </form>
  );
}
