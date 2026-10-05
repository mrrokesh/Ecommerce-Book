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
      <h1>Exam Calendar</h1>
      <p>Shop prep titles by exam. Dates are indicative for planning your reading.</p>
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
                <Link to={`/shop/competitive-exams`}>Shop books</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
