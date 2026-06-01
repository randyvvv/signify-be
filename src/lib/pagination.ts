export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Baca query page/limit dengan batas aman.
 */
export function parsePagination(
  query: { page?: string; limit?: string },
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): PageParams {
  const defaultLimit = opts.defaultLimit ?? 12;
  const maxLimit = opts.maxLimit ?? 50;

  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));

  return { page, limit, offset: (page - 1) * limit };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function paginated<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): Paginated<T> {
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}
