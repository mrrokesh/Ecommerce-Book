import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <p className="footer-logo">Salem Book House</p>
          <p className="footer-about">
            Salem Book House is your neighbourhood book mall — fiction, non-fiction, Kannada,
            competitive exams, stationery and more. Trusted by readers across Salem for quality
            titles and reliable delivery.
          </p>
          <Link className="know-more" to="/about">
            Know More →
          </Link>
          <div className="excellence-badge">
            <strong>Trusted</strong>
            <span>Local Book Mall</span>
          </div>
          <div className="footer-stats">
            <span>
              <strong>10k+</strong> happy readers
            </span>
            <span>
              <strong>1</strong> flagship store — Salem
            </span>
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
          <Link to="/stores">Retail Stores</Link>
          <Link to="/exams">Competitive Exams</Link>
        </div>
        <div>
          <h4>Support</h4>
          <p className="support-line">📞 +91 427 123 4567</p>
          <p className="support-line">✉️ care@salembookhouse.com</p>
          <p className="support-hours">9:30 AM to 6:30 PM (Mon–Sat)</p>
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
