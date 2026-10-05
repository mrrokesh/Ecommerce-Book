/**
 * Re-parse Sapna Online scrape into Salem Book House seed JSON with correct sections.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawPath = fs.existsSync(path.join(__dirname, 'raw-scrape-clean.json'))
  ? path.join(__dirname, 'raw-scrape-clean.json')
  : path.join(__dirname, 'raw-scrape.json');
let raw = fs.readFileSync(rawPath, 'utf8').replace(/^\uFEFF/, '');
if (!raw.trim().startsWith('{')) {
  const start = raw.indexOf('{');
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  raw = raw.slice(start, end + 1);
}
const markdown = JSON.parse(raw).items[0].markdown
  .replace(/â‚¹/g, '₹')
  .replace(/\u00a0/g, ' ');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const SECTION_RULES = [
  { test: /^Pre-Order$/i, name: 'Pre-Order', slug: 'pre-order' },
  { test: /^New Arrivals$/i, name: 'New Arrivals', slug: 'new-arrivals' },
  { test: /August Top 20 New Arrivals/i, name: 'Top New Arrivals', slug: 'new-arrivals' },
  { test: /Top 20 Non Fiction/i, name: 'Non Fiction', slug: 'non-fiction' },
  { test: /Top 20 Fiction/i, name: 'Fiction', slug: 'fiction' },
  { test: /Top 20 Young Adult/i, name: 'Young Adult', slug: 'young-adult' },
  { test: /Author of the day/i, name: 'Featured Author', slug: 'featured-author' },
  { test: /Sapna Best Seller|Best Seller/i, name: 'Best Sellers', slug: 'best-sellers' },
  { test: /Shop by Exams/i, name: 'Competitive Exams', slug: 'competitive-exams' },
];

const booksByKey = new Map();
let currentSection = { name: 'Featured', slug: 'featured' };
const lines = markdown.split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  for (const rule of SECTION_RULES) {
    if (rule.test.test(trimmed)) {
      currentSection = { name: rule.name, slug: rule.slug };
      break;
    }
  }

  // Product cards are multi-line: "[" then "![" image, title, author, prices, then "](book-url)"
  // Only start on bare "[" when the following lines contain a product image (avoid View All / nav).
  let startsCard = false;
  if (trimmed.startsWith('[![') || (trimmed.startsWith('[') && trimmed.includes('!['))) {
    startsCard = !/^\[\s*View All/i.test(trimmed);
    // Single-line markdown links that are not book product cards (top charts, logos, etc.)
    if (startsCard && /\]\(https?:\/\/[^)]+\)\s*$/.test(trimmed) && !/\/books\//i.test(trimmed)) {
      startsCard = false;
    }
  } else if (trimmed === '[') {
    const peek = lines.slice(i, i + 8).join('\n');
    startsCard =
      /!\[[^\]]*\]\(https?:\/\/[^)]*product_media[^)]*\)/.test(peek) && !/View All/i.test(peek);
  }

  if (!startsCard) continue;

  let block = trimmed;
  let j = i;
  while (j < lines.length && !/\]\(https?:\/\/[^)]+\/books\/[^)]+\)\s*$/.test(block.trim())) {
    j++;
    if (j >= lines.length) break;
    const next = lines[j].trim();
    // stop if we hit another card or a known section heading
    if (j > i && (next === '[' || SECTION_RULES.some((r) => r.test.test(next)))) break;
    block += '\n' + lines[j];
    if (j - i > 50) break;
  }

  const urlMatch = block.match(/\]\((https?:\/\/(?:www\.)?sapnaonline\.com\/books\/[^)\s]+)\)/i);
  if (!urlMatch) continue;
  i = j; // only skip consumed lines for confirmed book cards
  const url = urlMatch[1];

  const imgMatch = block.match(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/);
  const titleFromAlt = imgMatch?.[1]?.trim() || null;
  const image = imgMatch?.[2] || null;
  if (!image || !/product_media|cdn01\.sapnaonline/i.test(image)) continue;

  const plain = block
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[|\]/g, ' ')
    .replace(/\([^)]*sapnaonline[^)]*\)/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const prices = [...plain.matchAll(/₹\s*(\d+)/g)].map((x) => Number(x[1]));
  const offMatch = plain.match(/\((\d+)\s*%\s*Off\)/i);
  const discountPercent = offMatch ? Number(offMatch[1]) : 0;
  let salePrice = null;
  let mrp = null;
  if (prices.length >= 2) {
    salePrice = Math.min(...prices);
    mrp = Math.max(...prices);
  } else if (prices.length === 1) {
    salePrice = prices[0];
    mrp = prices[0];
  }

  const urlTail = url.split('/').pop();
  const parts = urlTail.split('-');
  let isbn13 = null;
  let isbn10 = null;
  for (let k = parts.length - 1; k >= 0; k--) {
    const p = parts[k];
    if (/^\d{13}$/.test(p)) isbn13 = p;
    else if (/^\d{9}[\dXx]$/.test(p) && !isbn10) isbn10 = p.toUpperCase();
  }
  if (!isbn13 && image) {
    const im = image.match(/(\d{13})/);
    if (im) isbn13 = im[1];
  }

  let rest = plain
    .replace(/₹\s*\d+/g, '')
    .replace(/\(\d+\s*%\s*Off\)/gi, '')
    .replace(/^\d+\s+/, '')
    .trim();

  let title = titleFromAlt || rest;
  let author = 'Unknown';
  if (titleFromAlt && rest.toLowerCase().includes(titleFromAlt.toLowerCase())) {
    author = rest.slice(rest.toLowerCase().indexOf(titleFromAlt.toLowerCase()) + titleFromAlt.length).trim() || author;
  } else if (!titleFromAlt) {
    const words = rest.split(' ');
    title = words.slice(0, Math.ceil(words.length * 0.6)).join(' ');
    author = words.slice(Math.ceil(words.length * 0.6)).join(' ') || author;
  }

  title = title.replace(/\s+/g, ' ').trim();
  author = author.replace(/\s+/g, ' ').trim() || 'Unknown';
  if (title.length < 2) continue;

  const key = isbn13 || isbn10 || slugify(`${title}-${author}`);
  const language = /kannada|samanyaralli|bettada|mookajji|charmadi|maarikaadu|chomana|yerilitada|etige|sanyasiya|maigallana/i.test(
    `${title} ${author}`
  )
    ? 'Kannada'
    : 'English';

  const existing = booksByKey.get(key);
  if (existing) {
    if (!existing.sections.includes(currentSection.name)) {
      existing.sections.push(currentSection.name);
      existing.sectionSlugs.push(currentSection.slug);
    }
    if (!existing.image && image) existing.image = image;
    continue;
  }

  booksByKey.set(key, {
    title,
    author,
    isbn13,
    isbn10,
    slug: `${slugify(title)}${isbn13 ? `-${isbn13}` : ''}`,
    image,
    salePrice,
    mrp,
    discountPercent: discountPercent || (mrp && salePrice && mrp > salePrice ? Math.round(((mrp - salePrice) / mrp) * 100) : 0),
    category: currentSection.name,
    categorySlug: currentSection.slug,
    sections: [currentSection.name],
    sectionSlugs: [currentSection.slug],
    sourceUrl: url,
    stock: 20 + ((isbn13 ? Number(isbn13.slice(-2)) : title.length) % 80),
    language,
    description: `${title} by ${author}. Available at Salem Book House — India's trusted bookstore experience for Salem readers.`,
  });
}

const books = [...booksByKey.values()].filter(
  (b) => b.image && b.salePrice != null && b.title.length < 180 && !/browse categories|express delivery|shop now/i.test(b.title)
);

// Enrich Kannada bestsellers as kannada category
for (const b of books) {
  if (b.language === 'Kannada' || b.sections.includes('Best Sellers')) {
    if (!b.sectionSlugs.includes('kannada') && b.language === 'Kannada') {
      b.sectionSlugs.push('kannada');
      b.sections.push('Kannada');
    }
  }
}

const categories = [
  { name: 'Books', slug: 'books', parent: null, sortOrder: 1 },
  { name: 'Fiction', slug: 'fiction', parent: 'books', sortOrder: 2 },
  { name: 'Non Fiction', slug: 'non-fiction', parent: 'books', sortOrder: 3 },
  { name: 'Young Adult', slug: 'young-adult', parent: 'books', sortOrder: 4 },
  { name: 'Kannada', slug: 'kannada', parent: null, sortOrder: 5 },
  { name: 'Stationery', slug: 'stationery', parent: null, sortOrder: 6, badge: 'NEW' },
  { name: 'Toys', slug: 'toys', parent: null, sortOrder: 7 },
  { name: 'Competitive Exams', slug: 'competitive-exams', parent: null, sortOrder: 8 },
  { name: 'Pre-Order', slug: 'pre-order', parent: 'books', sortOrder: 9 },
  { name: 'New Arrivals', slug: 'new-arrivals', parent: 'books', sortOrder: 10 },
  { name: 'Best Sellers', slug: 'best-sellers', parent: 'books', sortOrder: 11 },
  { name: 'Children', slug: 'children', parent: 'books', sortOrder: 12 },
  { name: 'Featured Author', slug: 'featured-author', parent: 'books', sortOrder: 13 },
];

const cover =
  books.find((b) => b.image && !/logo/i.test(b.image))?.image ||
  books[0]?.image;

const out = {
  scrapedAt: new Date().toISOString(),
  source: 'https://www.sapnaonline.com/',
  brand: 'Salem Book House',
  tagline: "Salem's Favourite Book Mall",
  categories,
  topCharts: [
    { name: 'Kannada', slug: 'kannada' },
    { name: 'Young Adult', slug: 'young-adult' },
    { name: 'Fiction', slug: 'fiction' },
    { name: 'Non Fiction', slug: 'non-fiction' },
  ],
  exams: [
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
  ],
  banners: [
    {
      title: 'Behind Every Masterpiece Lies a Story',
      subtitle: 'Discover curated reads handpicked for Salem Book House.',
      cta: 'BUY NOW',
      bgColor: '#f5c518',
      textColor: '#1a3a6b',
      link: '/shop/new-arrivals',
      image: cover,
    },
    {
      title: 'Your Ultimate Destination for Books & Beyond',
      subtitle: 'Fiction, non-fiction, exams & stationery — delivered across Salem.',
      cta: 'SHOP NOW',
      bgColor: '#1e4d8c',
      textColor: '#ffffff',
      link: '/shop/books',
      image: books[5]?.image || cover,
    },
    {
      title: 'Express Delivery on Selected Pin Codes',
      subtitle: 'Shop bestsellers and get them delivered faster.',
      cta: 'EXPLORE',
      bgColor: '#c62828',
      textColor: '#ffffff',
      link: '/shop/best-sellers',
      image: books[10]?.image || cover,
    },
  ],
  authors: [
    {
      name: 'Thibaut Meurisse',
      bio: 'Author of 20+ books including Master Your Emotions, translated into 30+ languages.',
      featured: true,
    },
    { name: 'Sudha Murty', bio: 'Acclaimed Indian author and philanthropist.', featured: true },
    { name: 'K Shivarama Karanth', bio: 'Jnanpith awardee and Kannada literary giant.', featured: true },
    { name: 'Kuvempu', bio: 'Rashtrakavi and pillar of Kannada literature.', featured: true },
    { name: 'S L Bhyrappa', bio: 'Renowned Kannada novelist.', featured: true },
  ],
  homepageSections: [
    { key: 'pre-order', title: 'Pre-Order', categorySlug: 'pre-order' },
    { key: 'new-arrivals', title: 'New Arrivals', categorySlug: 'new-arrivals' },
    { key: 'non-fiction', title: 'Top Non Fiction', categorySlug: 'non-fiction' },
    { key: 'fiction', title: 'Top Fiction', categorySlug: 'fiction' },
    { key: 'young-adult', title: 'Top Young Adult', categorySlug: 'young-adult' },
    { key: 'best-sellers', title: 'Best Sellers', categorySlug: 'best-sellers' },
    { key: 'featured-author', title: 'Author of the Day', categorySlug: 'featured-author' },
  ],
  books,
};

fs.writeFileSync(path.join(__dirname, 'seed-data.json'), JSON.stringify(out, null, 2));
const byCat = {};
for (const b of books) {
  byCat[b.category] = (byCat[b.category] || 0) + 1;
}
console.log(`Parsed ${books.length} books`, byCat);
