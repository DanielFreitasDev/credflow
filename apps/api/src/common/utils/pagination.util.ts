import { PaginatedResult, PaginationQueryDto } from '../dto/pagination.dto';

export function buildPagination(query: PaginationQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/**
 * Builds a Prisma `orderBy` from an untrusted `sortBy`, restricted to an
 * explicit allow-list of sortable (and ideally indexed) columns. Anything not
 * on the list falls back to `createdAt`, so a client can neither sort by an
 * arbitrary/unindexed column nor trigger a PrismaClientValidationError (500)
 * with a bogus field name.
 */
export function resolveOrderBy(
  sortBy: string | undefined,
  allowed: readonly string[],
  sortOrder: 'asc' | 'desc' = 'desc',
  fallback = 'createdAt',
): Record<string, 'asc' | 'desc'> {
  const column = sortBy && allowed.includes(sortBy) ? sortBy : fallback;
  return { [column]: sortOrder };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
