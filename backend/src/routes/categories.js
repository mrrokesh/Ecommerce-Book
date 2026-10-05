import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, parent_id, badge, sort_order, image_url
       FROM categories
       ORDER BY sort_order, name`
    );
    const categories = rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parent_id,
      badge: c.badge,
      sortOrder: c.sort_order,
      imageUrl: c.image_url,
    }));
    const byParent = new Map();
    for (const c of categories) {
      const key = c.parentId || 0;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const tree = (byParent.get(0) || []).map((c) => ({
      ...c,
      children: byParent.get(c.id) || [],
    }));
    return res.json({ success: true, data: { categories, tree } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, parent_id, badge, sort_order, image_url
       FROM categories WHERE slug = $1`,
      [req.params.slug]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    const c = rows[0];
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM book_categories WHERE category_id = $1`,
      [c.id]
    );
    return res.json({
      success: true,
      data: {
        category: {
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentId: c.parent_id,
          badge: c.badge,
          sortOrder: c.sort_order,
          imageUrl: c.image_url,
          bookCount: countRes.rows[0].total,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch category' });
  }
});

export default router;
