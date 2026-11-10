import { Link } from 'react-router-dom';

const MAPS = 'https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic';
const INSTAGRAM = 'https://www.instagram.com/salembookhouse';
const WHATSAPP = 'https://wa.me/919487724584';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <p className="footer-logo">Salem Book House</p>
          <p className="footer-about">
            Salem&apos;s favourite book mall — competitive exams, school &amp; college texts, novels,
            stationery, gifts and more. Shop online or visit our Salem store.
          </p>
          <Link className="know-more" to="/about">
            Know More →
          </Link>
          <div className="footer-social">
            <a href={WHATSAPP} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href={MAPS} target="_blank" rel="noreferrer">
              Location
            </a>
          </div>
        </div>
        <div>
          <h4>Useful Links</h4>
          <Link to="/about">About Us</Link>
          <Link to="/contact">Contact Us</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/faq">FAQs</Link>
        </div>
        <div>
          <h4>More Services</h4>
          <Link to="/shop/e-gift-card">E-Gift Cards</Link>
          <Link to="/track">Track your Order</Link>
          <Link to="/stores">Retail Store</Link>
          <Link to="/exams">Competitive Exams</Link>
          <Link to="/shop/school-board">School &amp; Board</Link>
          <Link to="/shop/new-arrivals">New Arrivals</Link>
        </div>
        <div>
          <h4>Support</h4>
          <p className="support-line">
            <a href="tel:9487724584">9487724584</a>
          </p>
          <p className="support-line">
            <a href="tel:7904957436">7904957436</a>
          </p>
          <p className="support-line">
            <a href="tel:04272411315">0427-2411315</a>
          </p>
          <p className="support-line">
            <a href="mailto:support@salembookhouse.com">support@salembookhouse.com</a>
          </p>
          <p className="support-hours">Mon – Sat: 9:30 AM – 9:00 PM</p>
          <p className="support-hours">Sun: 10:00 AM – 8:00 PM</p>
          <p className="support-hours muted">* Subject to change</p>
        </div>
      </div>
      <div className="footer-payments">
        <div className="container payments-row">
          <span className="ssl-badge">🔒 256 Bit SSL</span>
          <span className="pay-logo">VISA</span>
          <span className="pay-logo">Mastercard</span>
          <span className="pay-logo">Amex</span>
          <span className="pay-logo">RuPay</span>
          <span className="pay-logo">Net Banking</span>
          <span className="pay-logo">Cash on Delivery</span>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">© {new Date().getFullYear()} Salem Book House. All rights reserved.</div>
      </div>
    </footer>
  );
}
