import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { bookAuthor, bookImage, discountLabel, formatPrice } from '../utils/format';
import StarRating from './StarRating';

export default function ProductCard({ book, showAddToCart = false, compact = false }) {
  const { addItem } = useCart();
  if (!book) return null;

  const slug = book.slug;
  const title = book.title;
  const author = bookAuthor(book);
  const sale = Number(book.sale_price ?? book.salePrice ?? 0);
  const mrp = Number(book.mrp ?? 0);
  const discount =
    book.discount_percent ??
    book.discountPercent ??
    (mrp > sale && mrp > 0 ? Math.round(((mrp - sale) / mrp) * 100) : 0);
  const off = discountLabel(discount);
  const img = bookImage(book);
  const rating = Number(book.averageRating ?? book.average_rating ?? 0);
  const reviewCount = Number(book.reviewCount ?? book.review_count ?? 0);
  const bestseller = book.isBestseller || book.is_bestseller;

  async function handleAdd(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await addItem(book.id, 1);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`product-card ${compact ? 'product-card-rich' : ''}`}>
      <Link to={`/books/${slug}`} className="product-card-link">
        <div className="product-cover">
          {bestseller ? <span className="badge-bestseller">Best Seller</span> : null}
          <img
            src={img}
            alt={title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/placeholder-book.svg';
            }}
          />
        </div>
        <h3 className="product-title">{title}</h3>
        <p className="product-author">by {author}{book.publisher ? `, ${book.publisher}` : ''}</p>
        {(rating > 0 || reviewCount > 0) && (
          <div className="product-rating-row">
            <StarRating value={rating} size="sm" />
            <span className="review-count">({reviewCount})</span>
          </div>
        )}
        <div className="product-prices">
          <span className="sale-price">{formatPrice(sale || mrp)}</span>
          {mrp > sale && sale > 0 ? <span className="mrp-price">{formatPrice(mrp)}</span> : null}
          {off ? <span className="discount-badge">{off}</span> : null}
        </div>
      </Link>
      {showAddToCart ? (
        <button type="button" className="btn-add-cart" onClick={handleAdd}>
          ADD TO CART
        </button>
      ) : null}
    </div>
  );
}
