import { useState } from 'react';
import { Link } from 'react-router-dom';
import './docs-hub.css';

export type DocTopic = {
  id: string;
  title: string;
  summary?: string;
  paragraphs: string[];
  links?: { label: string; to: string }[];
};

export function DocLinks({ links }: { links: NonNullable<DocTopic['links']> }) {
  return <div className="docs-links">{links.map(({ label, to }) => to.startsWith('/')
    ? <Link key={to} to={to}>{label} <span aria-hidden="true">→</span></Link>
    : <a key={to} href={to}>{label} <span aria-hidden="true">↗</span></a>)}</div>;
}

export default function DocsHub({ label, title, intro, topics, shortcuts }: {
  label: string; title: string; intro: string; topics: DocTopic[]; shortcuts?: NonNullable<DocTopic['links']>;
}) {
  const [search, setSearch] = useState('');
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = topics.filter(topic => {
    const index = [topic.title, topic.summary, ...topic.paragraphs].join(' ').toLowerCase();
    return words.every(word => index.includes(word));
  });
  return <div className="docs-hub">
    <header className="docs-hero">
      <p className="docs-label">{label}</p>
      <h1>{title}</h1>
      <p>{intro}</p>
      {shortcuts && <DocLinks links={shortcuts} />}
    </header>
    <div className="docs-layout">
      <nav className="docs-nav" aria-label="Guide topics">
        <strong>On this page</strong>
        {results.map(topic => <a key={topic.id} href={`#${topic.id}`}>{topic.title}</a>)}
      </nav>
      <div className="docs-content">
        <label className="docs-search">Search topics
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try delivery, returns or payments" />
        </label>
        <p className="docs-count" role="status">{words.length ? `${results.length} matching ${results.length === 1 ? 'topic' : 'topics'}` : ''}</p>
        {results.length === 0 && <p>Try a shorter search, or <button type="button" onClick={() => setSearch('')}>show all topics</button>.</p>}
        {results.map(topic => <section className="docs-section" key={topic.id} id={topic.id}>
          <h2>{topic.title}</h2>
          {topic.summary && <p className="docs-summary">{topic.summary}</p>}
          {topic.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {topic.links && <DocLinks links={topic.links} />}
        </section>)}
      </div>
    </div>
  </div>;
}
