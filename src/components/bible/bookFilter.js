// Type-ahead matching for the book picker. Kept separate from the component so
// the ranking is unit-testable without rendering.

import { BOOK_ABBR, CODE_TO_NAME } from '../../lib/scripture';

// BOOK_ABBR maps many aliases → one code ('1co', '1 cor', '1 corinthians' → '1CO').
// Invert it so a query can be matched against every alias a book answers to.
export function buildAliasIndex() {
  const byCode = new Map();
  for (const [alias, code] of Object.entries(BOOK_ABBR)) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(alias);
  }
  return byCode;
}

// Lower rank sorts first. -1 means "no match".
// Prefix matches beat substring matches so typing "am" surfaces Amos before
// Lamentations and James.
export function matchRank(code, query, aliasIndex) {
  const name = (CODE_TO_NAME[code] || code).toLowerCase();
  const aliases = aliasIndex.get(code) || [];
  if (name.startsWith(query)) return 0;
  if (aliases.some((alias) => alias.startsWith(query))) return 1;
  if (name.includes(query)) return 2;
  if (aliases.some((alias) => alias.includes(query))) return 3;
  return -1;
}

// Filter + rank a list of book codes, preserving canonical order within a rank.
export function filterBooks(codes, rawQuery, aliasIndex) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return codes;
  return codes
    .map((code, order) => ({ code, order, rank: matchRank(code, query, aliasIndex) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.code);
}
