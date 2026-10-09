import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../utils/format';

export default function HeroBanner({ banners = [], loading = false }) {
  const [index, setIndex] = useState(0);
  const slides = banners.length
    ? banners
    : [
        {
          title: 'Behind Every Masterpiece Lies a Story',
          subtitle: 'Discover curated reads handpicked for Salem Book House.',
          cta: 'BUY NOW',
          bg_color: '#f5c518',
          text_color: '#1a3a6b',
          link: '/shop/new-arrivals',
        },
      ];

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(id);
  }, [slides.length]);

  if (loading) {
    return <div className="hero-banner skeleton hero-skeleton" aria-busy="true" />;
  }

  const slide = slides[index % slides.length];
  const bg = slide.bg_color || slide.bgColor || '#f5c518';
  const color = slide.text_color || slide.textColor || '#163a6b';
  const link = slide.link || '/shop/books';
  const rawImage = slide.image_url || slide.imageUrl || slide.image;
  const image = rawImage && !/sapna/i.test(rawImage) ? mediaUrl(rawImage) : '';

  return (
    <section className="hero-banner" style={{ background: bg, color }}>
      <div className="container hero-inner">
        <div className="hero-copy">
          <h1>{slide.title}</h1>
          {slide.subtitle ? <p>{slide.subtitle}</p> : null}
          <Link to={link} className="hero-cta">
            {slide.cta || 'BUY NOW'}
          </Link>
        </div>
        {image ? (
          <div className="hero-media">
            <img src={image} alt="" />
          </div>
        ) : (
          <div className="hero-media hero-media-fallback" aria-hidden="true">
            <div className="hero-book-stack" />
          </div>
        )}
      </div>
      {slides.length > 1 ? (
        <div className="hero-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={i === index ? 'active' : ''}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
