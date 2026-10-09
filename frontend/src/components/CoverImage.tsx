import { useEffect, useState } from 'react';
import type { Book } from '../types';
import { coverCandidates } from '../utils/format';

type Props = {
  book?: Book | null;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
};

/** Product cover: real CDN → validated ISBN cover API → branded SVG. */
export default function CoverImage({ book, alt, className, loading = 'lazy' }: Props) {
  const candidates = coverCandidates(book);
  const bookKey = String(book?.id || book?.slug || book?.isbn13 || book?.isbn || candidates[0] || 'cover');
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [bookKey]);

  const src = candidates[Math.min(step, candidates.length - 1)] || '/placeholder-book.svg';

  return (
    <img
      className={className}
      src={src}
      alt={alt || book?.title || 'Book cover'}
      loading={loading}
      onError={() => {
        setStep((s) => (s + 1 < candidates.length ? s + 1 : s));
      }}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth > 2 && el.naturalHeight > 2) return;
        setStep((s) => (s + 1 < candidates.length ? s + 1 : s));
      }}
    />
  );
}
