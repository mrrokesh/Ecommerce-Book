import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="container notfound">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has moved.</p>
      <div className="notfound-actions">
        <Link to="/" className="btn btn-navy">
          Go to home
        </Link>
        <Link to="/shop" className="btn btn-outline">
          Browse books
        </Link>
      </div>
    </div>
  );
}
