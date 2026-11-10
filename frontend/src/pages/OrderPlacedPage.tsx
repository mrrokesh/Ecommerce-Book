import { Link, Navigate, useLocation } from 'react-router-dom';
import { formatPrice } from '../utils/format';

type GiftCode = { code: string; amount?: number };

export default function OrderPlacedPage() {
  const location = useLocation();
  const orderNumber: string | undefined = location.state?.orderNumber;
  const giftCodes: GiftCode[] = location.state?.giftCodes || [];

  if (!orderNumber) return <Navigate to="/" replace />;

  return (
    <div className="container cms-page">
      <h1>Thank you — order placed!</h1>
      <p className="notice success">
        Your order number is <strong>#{orderNumber}</strong>. We have sent the order details to your email.
      </p>
      {giftCodes.length ? (
        <div className="order-card">
          <h3>Your e-gift card codes</h3>
          <p className="muted">Save these codes now; they will also arrive by email.</p>
          <ul>
            {giftCodes.map((g) => (
              <li key={g.code}>
                <strong>{g.code}</strong>
                {g.amount ? ` — ${formatPrice(g.amount)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p>
        Order tracking and invoice downloads are available for signed-in customers.{' '}
        <Link to="/register">Create an account</Link> or <Link to="/login">sign in</Link> before your next order to
        track it online. For this order, contact us on WhatsApp or phone with your order number.
      </p>
      <p>
        <Link className="btn btn-navy" to="/shop">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
