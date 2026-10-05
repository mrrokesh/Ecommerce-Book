import { Link } from 'react-router-dom';

const DEFAULT_EXAMS = [
  'UPSC',
  'Banking',
  'Govt Exam',
  'State Level Administration',
  'Engineering',
  'Management',
  'Medical',
  'Law',
  'International Exams',
  'Defence',
  'Software Certifications',
  'Finance',
];

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function ExamGrid({ exams = [], loading = false }) {
  const list = exams.length ? exams : DEFAULT_EXAMS;

  return (
    <section className="exam-grid-section">
      <div className="container">
        <h2 className="section-title">Shop by Exams</h2>
        {loading ? (
          <p className="state-msg">Loading exams…</p>
        ) : (
          <div className="exam-grid">
            {list.map((exam) => {
              const name = typeof exam === 'string' ? exam : exam.name;
              const slug = (typeof exam === 'object' && exam.slug) || slugify(name);
              return (
                <Link key={slug} to="/exams" className="exam-tile">
                  {name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
