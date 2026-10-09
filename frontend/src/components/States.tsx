import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <div className="brand-loader" aria-hidden="true">
        <span className="brand-loader-mark">SBH</span>
        <span className="brand-loader-ring" />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card skeleton-card" aria-hidden="true">
      <div className="product-cover skeleton" />
      <div className="skeleton skeleton-line" style={{ width: '90%', marginTop: 10 }} />
      <div className="skeleton skeleton-line" style={{ width: '60%' }} />
      <div className="skeleton skeleton-line" style={{ width: '45%', height: 16 }} />
    </div>
  );
}

export function CarouselSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="carousel-track" aria-busy="true" aria-label="Loading books">
      {Array.from({ length: count }, (_, i) => (
        <div className="carousel-item" key={i}>
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="home-page" aria-busy="true" aria-label="Loading Salem Book House">
      <div className="hero-banner skeleton hero-skeleton" />
      {[0, 1, 2].map((i) => (
        <section className="product-carousel" key={i}>
          <div className="container">
            <div className="skeleton skeleton-line skeleton-title" />
            <CarouselSkeleton />
          </div>
        </section>
      ))}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-box empty">
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action || null}
    </div>
  );
}
