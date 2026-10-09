import { useEffect, useState } from 'react';
import type { Book } from '../types';
import { coverCandidates } from '../utils/format';

type Props = {
  book?: Book | null;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
};

/** Product cover: shimmer placeholder → real CDN → validated ISBN cover API → branded SVG. */
export default function CoverImage({ book, alt, className, loading = 'lazy' }: Props) {
  const candidates = coverCandidates(book);
  const bookKey = String(book?.id || book?.slug || book?.isbn13 || book?.isbn || candidates[0] || 'cover');
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStep(0);
    setReady(false);
  }, [bookKey]);

  const src = candidates[Math.min(step, candidates.length - 1)] || '/placeholder-book.svg';
  const next = () => {
    if (step + 1 < candidates.length) {
      setStep(step + 1);
    } else {
      setReady(true);
    }
  };

  return (
    <img
      className={`cover-img ${ready ? 'is-ready' : ''} ${className || ''}`}
      src={src}
      alt={alt || book?.title || 'Book cover'}
      loading={loading}
      decoding="async"
      onError={next}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth > 2 && el.naturalHeight > 2) setReady(true);
        else next();
      }}
    />
  );
}
