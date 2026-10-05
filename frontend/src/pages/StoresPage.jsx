import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { LoadingState } from '../components/States';

export default function StoresPage() {
  const [params] = useSearchParams();
  const bookId = params.get('bookId');
  const [stores, setStores] = useState([]);
  const [pincode, setPincode] = useState(params.get('pincode') || '');
  const [loading, setLoading] = useState(true);

  function load(pin) {
    setLoading(true);
    const q = bookId ? `/stores/availability?bookId=${bookId}&pincode=${pin || ''}` : `/stores?pincode=${pin || ''}`;
    api
      .get(q)
      .then(({ data }) => setStores(data.stores || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(pincode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  return (
    <div className="container cms-page">
      <h1>Retail Stores</h1>
      <p>Three Salem Book House locations. Check stock near your pincode.</p>
      <form
        className="pin-row"
        onSubmit={(e) => {
          e.preventDefault();
          load(pincode);
        }}
      >
        <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" maxLength={6} />
        <button type="submit">Check</button>
      </form>
      {loading ? (
        <LoadingState />
      ) : (
        <ul className="store-list">
          {stores.map((s) => (
            <li key={s.id} className="store-card">
              <h3>{s.name}</h3>
              <p>
                {s.address}, {s.city} {s.pincode}
              </p>
              <p>{s.phone}</p>
              <p className="muted">{s.hours}</p>
              {s.available === true ? <p className="notice success">In stock at this store</p> : null}
              {s.available === false ? <p className="muted">Call to confirm stock</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
