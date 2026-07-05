import { describe, it, expect } from 'vitest';
import { BOOK_INTROS } from './bookIntros';
import { BOOK_CHAPTERS } from './readingPlans';

describe('BOOK_INTROS', () => {
  it('has an intro for every canonical book', () => {
    for (const code of Object.keys(BOOK_CHAPTERS)) {
      expect(BOOK_INTROS[code], `missing intro for ${code}`).toBeTruthy();
    }
  });

  it('has no stray keys beyond the 66 canonical books', () => {
    expect(Object.keys(BOOK_INTROS).sort()).toEqual(Object.keys(BOOK_CHAPTERS).sort());
  });
});
