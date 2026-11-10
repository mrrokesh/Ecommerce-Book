import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { LoadingState } from '../components/States';

export default function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/exams')
      .then(({ data }) => setExams(data.exams || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="container cms-page">
      <h1>Competitive Exams Hub</h1>
      <p>
        Prep for TNPSC, NEET, JEE, UPSC, Banking and more. Browse books under Competitive Exams, or use the
        calendar below when dates are published.
      </p>
      <p>
        <Link className="btn btn-navy" to="/shop/competitive-exams">
          Shop exam books
        </Link>
      </p>
      {!exams.length ? (
        <div className="empty-hint">
          <h2>Popular exam categories</h2>
          <ul className="plain-list">
            <li>
              <Link to="/shop/tnpsc">TNPSC</Link>
            </li>
            <li>
              <Link to="/shop/neet">NEET</Link>
            </li>
            <li>
              <Link to="/shop/jee">JEE</Link>
            </li>
            <li>
              <Link to="/shop/upsc">UPSC</Link>
            </li>
            <li>
              <Link to="/shop/banking">Banking</Link>
            </li>
          </ul>
        </div>
      ) : (
        <table className="exam-table">
          <thead>
            <tr>
              <th>Exam</th>
              <th>Category</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.name}</strong>
                  <div className="muted">{e.description}</div>
                </td>
                <td>{e.category}</td>
                <td>{e.examDate ? new Date(e.examDate).toLocaleDateString('en-IN') : 'TBA'}</td>
                <td>
                  <Link to="/shop/competitive-exams">Shop books</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
