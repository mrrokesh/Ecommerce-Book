import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StarRating from './StarRating';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function ReviewsSection({ bookId, initialSummary, initialReviews = [], onSubmitted }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(
    initialSummary || { total: 0, average: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } }
  );
  const [reviews, setReviews] = useState(initialReviews);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const maxBar = useMemo(() => {
    const d = summary.distribution || {};
    return Math.max(1, d[5] || 0, d[4] || 0, d[3] || 0, d[2] || 0, d[1] || 0);
  }, [summary]);

  async function submitReview(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/reviews', {
        bookId,
        rating,
        comment,
        reviewerName: isAuthenticated ? undefined : name,
      });
      if (data.summary) setSummary(data.summary);
      if (data.review) setReviews((prev) => [data.review, ...prev]);
      setComment('');
      setShowForm(false);
      onSubmitted?.(data);
    } catch (err) {
      setError(err.message || 'Could not submit review');
    } finally {
      setBusy(false);
    }
  }

  function openForm() {
    if (!isAuthenticated && !name) {
      // allow guest reviews with name
    }
    setShowForm(true);
  }

  return (
    <section className="reviews-section container" id="reviews">
      <div className="reviews-box">
        <div className="reviews-summary">
          <h2>Reviews &amp; Ratings</h2>
          <div className="reviews-average">
            <StarRating value={summary.average} size="lg" />
            <p>
              <strong>{summary.average || 0}</strong> out of 5 stars
            </p>
            <p className="muted">{summary.total || 0} customer reviews</p>
          </div>
          <div className="rating-bars">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.distribution?.[star] || 0;
              const pct = Math.round((count / maxBar) * 100);
              return (
                <div key={star} className="rating-bar-row">
                  <span className="bar-label">
                    {star} <span className="star filled">★</span>
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="bar-count">{count}</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-write-review" onClick={openForm}>
            ✎ WRITE YOUR REVIEW
          </button>
          {showForm ? (
            <form className="review-form" onSubmit={submitReview}>
              {!isAuthenticated ? (
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
              ) : null}
              <label>
                Rating
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} star{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your review
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  minLength={5}
                  placeholder="Share your thoughts about this book…"
                />
              </label>
              {error ? <p className="form-msg error">{error}</p> : null}
              <div className="review-form-actions">
                <button type="submit" className="btn btn-navy" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit Review'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                {!isAuthenticated ? (
                  <button type="button" className="linkish" onClick={() => navigate('/login')}>
                    Or login to review
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>

        <div className="reviews-list">
          {!reviews.length ? (
            <p className="no-reviews">No reviews found.</p>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="review-item">
                <header>
                  <strong>{r.reviewerName}</strong>
                  <StarRating value={r.rating} size="sm" />
                  <time>{formatDate(r.createdAt)}</time>
                </header>
                <p>{r.comment}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
