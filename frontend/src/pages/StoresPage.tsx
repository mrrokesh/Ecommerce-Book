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
      <h1>Retail Store</h1>
      <p>
        Visit Salem Book House in Salem.{' '}
        <a href="https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic" target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </p>
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
      ) : !stores.length ? (
        <div className="store-card">
          <h3>Salem Book House</h3>
          <p>Salem, Tamil Nadu 636001</p>
          <p>
            <a href="tel:9487724584">9487724584</a> · <a href="tel:7904957436">7904957436</a> ·{' '}
            <a href="tel:04272411315">0427-2411315</a>
          </p>
          <p className="muted">Mon–Sat 9:30 AM – 9:00 PM · Sun 10:00 AM – 8:00 PM</p>
          <p>
            Owner: Parasuraman Muthusamy ·{' '}
            <a href="mailto:support@salembookhouse.com">support@salembookhouse.com</a>
          </p>
        </div>
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
