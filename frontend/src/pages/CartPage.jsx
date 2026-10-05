import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { bookAuthor, bookImage, formatPrice } from '../utils/format';
import { EmptyState, LoadingState } from '../components/States';

export default function CartPage() {
  const { items, subtotal, loading, updateItem, removeItem } = useCart();

  if (loading) return <LoadingState label="Loading cart…" />;

  if (!items.length) {
    return (
      <div className="container">
        <EmptyState
          title="Your cart is empty"
          message="Find something great to read."
          action={<Link to="/shop">Continue shopping</Link>}
        />
      </div>
    );
  }

  return (
    <div className="cart-page container">
      <h1>Shopping Cart</h1>
      <div className="cart-layout">
        <div className="cart-items">
          {items.map((item) => {
            const book = item.book || item;
            const id = item.id;
            const qty = item.quantity || 1;
            const price = Number(item.unit_price ?? item.sale_price ?? book.sale_price ?? book.salePrice ?? 0);
            return (
              <div key={id} className="cart-row">
                <Link to={`/books/${book.slug}`} className="cart-thumb">
                  <img src={bookImage(book)} alt={book.title} />
                </Link>
                <div className="cart-info">
                  <Link to={`/books/${book.slug}`}>
                    <h3>{book.title}</h3>
                  </Link>
                  <p>{bookAuthor(book)}</p>
                  <p className="sale-price">{formatPrice(price)}</p>
                </div>
                <div className="cart-qty">
                  <button type="button" onClick={() => updateItem(id, Math.max(1, qty - 1))} disabled={qty <= 1}>
                    −
                  </button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => updateItem(id, qty + 1)}>
                    +
                  </button>
                </div>
                <div className="cart-line-total">{formatPrice(price * qty)}</div>
                <button type="button" className="text-btn danger" onClick={() => removeItem(id)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        <aside className="cart-summary">
          <h2>Order Summary</h2>
          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal || items.reduce((s, i) => s + Number(i.unit_price ?? i.book?.sale_price ?? 0) * (i.quantity || 1), 0))}</strong>
          </div>
          <p className="muted">Shipping calculated at checkout.</p>
          <Link to="/checkout" className="btn btn-gold block">
            Proceed to Checkout
          </Link>
          <Link to="/shop" className="btn btn-outline block">
            Continue Shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
