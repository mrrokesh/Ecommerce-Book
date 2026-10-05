import { Link } from 'react-router-dom';

const ICONS = {
  kannada: 'ಕ',
  'young-adult': 'YA',
  fiction: 'F',
  'non-fiction': 'NF',
  children: 'K',
  books: 'B',
  stationery: 'S',
  toys: 'T',
};

export default function TopCharts({ items = [], loading = false }) {
  if (loading) {
    return (
      <section className="top-charts">
        <div className="container">
          <h2 className="section-title">Top Charts of October 2026</h2>
          <p className="state-msg">Loading charts…</p>
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className="top-charts">
      <div className="container">
        <h2 className="section-title">Top Charts of October 2026</h2>
        <div className="charts-row">
          {items.map((item) => {
            const slug = item.slug || item.categorySlug;
            const name = item.name || item.title;
            return (
              <Link key={slug || name} to={`/shop/${slug}`} className="chart-item">
                <span className="chart-circle">{ICONS[slug] || (name?.[0] || '?')}</span>
                <span className="chart-label">{name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
