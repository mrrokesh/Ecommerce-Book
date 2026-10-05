import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { bookAuthor, bookImage, discountLabel, formatPrice } from '../utils/format';
import { EmptyState, LoadingState } from '../components/States';
import StarRating from '../components/StarRating';
import ReviewsSection from '../components/ReviewsSection';
import RecommendTabs from '../components/RecommendTabs';

export default function BookDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();
  const [book, setBook] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [recommendations, setRecommendations] = useState({ similar: [], fromAuthor: [] });
  const [qty, setQty] = useState(1);
  const [pincode, setPincode] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeImage, setActiveImage] = useState('');
  const [storesOpen, setStoresOpen] = useState(false);
  const [storeList, setStoreList] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    window.scrollTo(0, 0);
    api
      .get(`/books/${slug}`)
      .then(({ data }) => {
        if (!alive) return;
        setBook(data.book || data);
        setRatingSummary(data.ratingSummary || null);
        setReviews(data.reviews || []);
        setRecommendations(data.recommendations || { similar: [], fromAuthor: [] });
        const imgs = (data.book || data).images || [];
        setActiveImage(imgs[0] || (data.book || data).imageUrl || '');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'Book not found');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  async function handleAdd() {
    if (!book) return;
    setBusy(true);
    setMsg('');
    try {
      await addItem(book.id, qty);
      setMsg('Added to cart');
    } catch (err) {
      setMsg(err.message || 'Could not add to cart');
    } finally {
      setBusy(false);
    }
  }

  async function handleBuyNow() {
    await handleAdd();
    navigate('/checkout');
  }

  async function handleWishlist() {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      await api.post('/wishlist', { bookId: book.id });
      setMsg('Saved to wishlist');
    } catch (err) {
      setMsg(err.message || 'Could not update wishlist');
    }
  }

  async function checkPincode(e) {
    e.preventDefault();
    const pin = pincode.replace(/\D/g, '');
    if (pin.length !== 6) {
      setPinMsg('Enter a valid 6-digit pincode');
      return;
    }
    try {
      const { data } = await api.get(`/pincode/${pin}`);
      setPinMsg(data.message || `Delivery available for ${pin}`);
    } catch (err) {
      setPinMsg(err.message || 'Could not check pincode');
    }
  }

  async function openStores() {
    setStoresOpen(true);
    const { data } = await api.get(`/stores/availability`, {
      params: { bookId: book.id, pincode },
    });
    setStoreList(data.stores || []);
  }

  if (loading) return <LoadingState label="Loading book…" />;
  if (error || !book) {
    return (
      <EmptyState
        title="Book not found"
        message={error}
        action={<Link to="/shop">Back to shop</Link>}
      />
    );
  }

  const sale = Number(book.sale_price ?? book.salePrice ?? 0);
  const mrp = Number(book.mrp ?? 0);
  const discount =
    book.discount_percent ??
    book.discountPercent ??
    (mrp > sale && mrp > 0 ? Math.round(((mrp - sale) / mrp) * 100) : 0);
  const off = discountLabel(discount);
  const avg = Number(ratingSummary?.average ?? book.averageRating ?? 0);
  const reviewCount = Number(ratingSummary?.total ?? book.reviewCount ?? 0);

  return (
    <div className="book-detail-page">
      <div className="book-detail container">
        <div className="book-detail-grid">
          <div className="book-detail-media">
            <div className="book-detail-cover">
              {book.isBestseller ? <span className="badge-bestseller">Best Seller</span> : null}
              <img
                src={activeImage || bookImage(book)}
                alt={book.title}
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-book.svg';
                }}
              />
            </div>
            {(book.images || []).length > 1 ? (
              <div className="gallery-thumbs">
                {book.images.map((src) => (
                  <button type="button" key={src} className={src === activeImage ? 'active' : ''} onClick={() => setActiveImage(src)}>
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="book-detail-info">
            <p className="breadcrumb">
              <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / <span>{book.title}</span>
            </p>
            <h1>{book.title}</h1>
            <p className="book-author-lg">
              {book.authorId ? (
                <Link to={`/authors/${book.authorId}`}>{bookAuthor(book)}</Link>
              ) : (
                <Link to={`/search?q=${encodeURIComponent(bookAuthor(book))}`}>{bookAuthor(book)}</Link>
              )}{' '}
              (Author)
              {book.publisher ? (
                <>
                  {' · '}
                  <Link to={`/publishers/${String(book.publisher).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}>
                    {book.publisher} (Publisher)
                  </Link>
                </>
              ) : null}
            </p>

            <a href="#reviews" className="detail-rating-link">
              <StarRating value={avg} size="md" />
              <span>({reviewCount} Customers)</span>
            </a>

            <div className="product-prices lg">
              <span className="sale-price">{formatPrice(sale || mrp)}</span>
              {mrp > sale && sale > 0 ? <span className="mrp-price">{formatPrice(mrp)}</span> : null}
              {off ? <span className="discount-badge green">{off}</span> : null}
            </div>
            <p className="tax-note">Inclusive of all taxes.</p>

            <div className="qty-row">
              <label>
                Qty
                <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                  {Array.from({ length: Math.min(50, Math.max(10, Number(book.stock) || 10)) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-orange" disabled={busy || !book.stock} onClick={handleAdd}>
                ADD TO CART
              </button>
              <button type="button" className="btn btn-orange-outline" disabled={busy || !book.stock} onClick={handleBuyNow}>
                BUY NOW
              </button>
            </div>
            <button type="button" className="linkish wishlist-link" onClick={handleWishlist}>
              ♡ Add to Wishlist
            </button>
            {msg ? <p className="form-msg">{msg}</p> : null}

            <div className="service-icons">
              <div>
                <strong>In Stock</strong>
                <span>{Number(book.stock) > 0 ? `${book.stock} available` : 'Out of stock'}</span>
              </div>
              <div>
                <strong>Guaranteed Service</strong>
                <span>Genuine products</span>
              </div>
              <div>
                <strong>Free Delivery</strong>
                <span>Above ₹199</span>
              </div>
              <div>
                <strong>Secure Payment</strong>
                <span>100% safe checkout</span>
              </div>
            </div>
          </div>

          <aside className="book-detail-aside">
            <form className="check-delivery" onSubmit={checkPincode}>
              <h3>Check Delivery</h3>
              <div className="pin-row">
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Enter Pincode"
                  maxLength={6}
                />
                <button type="submit" aria-label="Check">
                  →
                </button>
              </div>
              {pinMsg ? <p className="pin-msg">{pinMsg}</p> : null}
            </form>
            <div className="store-check">
              Check Availability at Stores —{' '}
              <button type="button" className="linkish" onClick={openStores}>
                CLICK HERE
              </button>
            </div>
            {storesOpen ? (
              <ul className="store-mini">
                {storeList.map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    <span>{s.available ? 'Available' : 'Call to confirm'}</span>
                  </li>
                ))}
                <li>
                  <Link to={`/stores?bookId=${book.id}&pincode=${pincode}`}>All stores</Link>
                </li>
              </ul>
            ) : null}
          </aside>
        </div>

        <section className="product-specs">
          <h2>Product Specifications</h2>
          <h3>Book Description</h3>
          <p>{book.description || '(No description available for this product.)'}</p>
          <h3>Book Specifications</h3>
          <div className="specs-grid">
            <ul>
              <li>
                <span>ISBN-13</span>
                <strong>{book.isbn13 || '—'}</strong>
              </li>
              <li>
                <span>Language</span>
                <strong>{book.language || '—'}</strong>
              </li>
              <li>
                <span>Binding</span>
                <strong>{book.binding || 'Paper Back'}</strong>
              </li>
              <li>
                <span>Publisher</span>
                <strong>{book.publisher || 'Salem Book House'}</strong>
              </li>
            </ul>
            <ul>
              <li>
                <span>Publishing Date</span>
                <strong>{book.publishingDate || '—'}</strong>
              </li>
              <li>
                <span>Product Edition</span>
                <strong>{book.edition || '—'}</strong>
              </li>
              <li>
                <span>ISBN-10</span>
                <strong>{book.isbn10 || '—'}</strong>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <ReviewsSection
        bookId={book.id}
        initialSummary={ratingSummary}
        initialReviews={reviews}
        onSubmitted={({ summary: s }) => {
          if (s) setRatingSummary(s);
        }}
      />

      <RecommendTabs similar={recommendations.similar} fromAuthor={recommendations.fromAuthor} />

      <section className="value-props">
        <div className="container value-props-grid">
          <div>
            <span className="vp-icon">🚚</span>
            <div>
              <strong>Track Order</strong>
              <p>We offer fast delivery.</p>
            </div>
          </div>
          <div>
            <span className="vp-icon">🎁</span>
            <div>
              <strong>Discount Coupons</strong>
              <p>We offer E-Gift Cards.</p>
            </div>
          </div>
          <div>
            <span className="vp-icon">🎧</span>
            <div>
              <strong>Quality Support</strong>
              <p>Dedicated 24/7 support.</p>
            </div>
          </div>
          <div>
            <span className="vp-icon">💳</span>
            <div>
              <strong>Safe Payments</strong>
              <p>100% secure payment.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
