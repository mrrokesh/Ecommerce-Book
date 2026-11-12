import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadCategories } from '../api/cache';
import type { CategoryNode } from '../types';

const MAPS = 'https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic';
const INSTAGRAM = 'https://www.instagram.com/salembookhouse';
const WHATSAPP = 'https://wa.me/919487724584';

const EXPLORE_LINKS = [
  { label: 'All Products', to: '/shop' },
  { label: 'Competitive Exams Hub', to: '/exams' },
  { label: 'Retail Store', to: '/stores' },
  { label: 'Publishers', to: '/publishers' },
  { label: 'Track Order', to: '/track' },
];

const HELP_LINKS = [
  { label: 'My Account', to: '/account' },
  { label: 'Orders', to: '/account/orders' },
  { label: 'Wishlist', to: '/wishlist' },
  { label: 'Cart', to: '/cart' },
  { label: 'About Us', to: '/about' },
  { label: 'Contact Us', to: '/contact' },
  { label: 'Help Centre', to: '/help' },
  { label: 'Raise a Complaint', to: '/complaint' },
  { label: 'Shipping & Delivery', to: '/shipping' },
  { label: 'Returns & Refunds', to: '/returns' },
  { label: 'Terms & Conditions', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
];

export default function Footer() {
  const [shopCats, setShopCats] = useState<CategoryNode[]>([]);

  useEffect(() => {
    let alive = true;
    loadCategories().then((data) => {
      if (alive) setShopCats(data.tree || []);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <p className="footer-logo">Salem Book House</p>
          <p className="footer-tag">Salem&apos;s Favourite Book Mall</p>
          <p className="footer-about">
            Your destination for Tamil &amp; English books, school &amp; board guides, competitive exam
            prep, college texts, stationery, toys, gifts and e-gift cards. Shop online with delivery
            across Tamil Nadu, or visit our Salem store.
          </p>
          <Link className="know-more" to="/about">
            Know More →
          </Link>
          <div className="footer-social">
            <a href={WHATSAPP} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
              <WhatsAppIcon />
              <span>WhatsApp</span>
            </a>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram">
              <InstagramIcon />
              <span>Instagram</span>
            </a>
            <a href={MAPS} target="_blank" rel="noreferrer" aria-label="Store location" title="Location">
              <LocationIcon />
              <span>Store Map</span>
            </a>
          </div>
        </div>

        <div>
          <h4>Shop</h4>
          {shopCats.map((c) => (
            <Link key={c.slug} to={`/shop/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>

        <div>
          <h4>Explore</h4>
          {EXPLORE_LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </div>

        <div>
          <h4>Help &amp; Account</h4>
          {HELP_LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </div>

        <div>
          <h4>Support</h4>
          <p className="support-line">
            <a href="tel:9487724584">
              <PhoneIcon />
              <span>9487724584</span>
            </a>
          </p>
          <p className="support-line">
            <a href="tel:7904957436">
              <PhoneIcon />
              <span>7904957436</span>
            </a>
          </p>
          <p className="support-line">
            <a href="tel:04272411315">
              <PhoneIcon />
              <span>0427-2411315</span>
            </a>
          </p>
          <p className="support-line">
            <a href="mailto:support@salembookhouse.com">
              <MailIcon />
              <span>support@salembookhouse.com</span>
            </a>
          </p>
          <p className="support-hours">Mon – Sat: 9:30 AM – 9:00 PM</p>
          <p className="support-hours">Sun: 10:00 AM – 8:00 PM</p>
          <p className="support-hours muted">* Subject to change</p>
          <p className="footer-address">
            Salem, Tamil Nadu
            <br />
            <a href={MAPS} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>© {new Date().getFullYear()} Salem Book House. All rights reserved.</span>
          <span className="footer-credit">
            Developed by{' '}
            <a href="https://www.mrrokesh.com/" target="_blank" rel="noopener noreferrer">
              MR ROKESH SOFTWARES
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function PhoneIcon() {
  return (
    <svg className="support-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.6 3.8c.4-.4 1.1-.5 1.6-.2l2.3 1.3c.5.3.7.9.5 1.4l-.8 2.1a1 1 0 0 0 .2 1l1.7 1.7a1 1 0 0 0 1 .2l2.1-.8c.5-.2 1.1 0 1.4.5l1.3 2.3c.3.5.2 1.2-.2 1.6l-1.1 1.1c-.5.5-1.2.7-1.9.5-1.7-.4-3.7-1.7-5.7-3.7s-3.3-4-3.7-5.7c-.2-.7 0-1.4.5-1.9l1.1-1.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="support-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 7.5 12 13l7.5-5.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="social-ico" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.96.52 3.87 1.5 5.55L2 22l4.78-1.55a9.9 9.9 0 0 0 5.26 1.48h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.02c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.96-4.4-.15-.19-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.26-.29.57-.36.76-.36h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.14.07.15.12.32.02.51-.1.19-.15.32-.29.49-.15.17-.3.37-.43.5-.15.14-.3.29-.13.57.17.28.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.17-.19.73-.85.93-1.14.2-.29.39-.24.66-.14.27.1 1.72.81 2.01.96.29.15.49.22.56.34.08.13.08.73-.16 1.41z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="social-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg className="social-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s6.5-5.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.8 6.5 11 6.5 11z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
