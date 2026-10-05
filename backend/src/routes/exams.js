import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, category, exam_date, description FROM exams ORDER BY exam_date NULLS LAST, name`
    );
    return res.json({
      success: true,
      data: {
        exams: rows.map((e) => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          category: e.category,
          examDate: e.exam_date,
          description: e.description,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch exams' });
  }
});

export default router;
