import type { CategoriesPayload } from '../types';
import api from './client';

let categoriesPromise: Promise<CategoriesPayload> | null = null;

export function loadCategories(): Promise<CategoriesPayload> {
  if (!categoriesPromise) {
    categoriesPromise = api
      .get('/categories')
      .then(({ data }) => data as CategoriesPayload)
      .catch(() => {
        categoriesPromise = null;
        return { tree: [], categories: [] };
      });
  }
  return categoriesPromise;
}
