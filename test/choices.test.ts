import { beforeEach, describe, expect, it } from 'vitest';
import { clearProgress } from '../src/lib/store';
import { choicesFor, distractors, meanings, overlaps } from '../src/lib/choices';
import { WORDS, WORD_BY_ID } from '../src/lib/words';

beforeEach(async () => {
  await clearProgress();
});

const group = (p: string) => (p.startsWith('n-') ? 'n' : p.startsWith('v-') ? 'v' : p);

describe('multiple choice', () => {
  it('splits glosses into meanings', () => {
    expect(meanings('yes; that (conj.)')).toEqual(['yes', 'that']);
    expect(meanings('to be')).toEqual(['be']);
    expect(overlaps('to go; to walk', 'to walk')).toBe(true);
    expect(overlaps('house', 'home')).toBe(false);
  });

  it('gives 4 distinct options including the answer for every word', () => {
    for (const w of WORDS) {
      const opts = choicesFor(w);
      expect(opts).toHaveLength(4);
      expect(opts.filter((o) => o.id === w.id)).toHaveLength(1);
      for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) expect(overlaps(opts[i].en, opts[j].en)).toBe(false);
    }
  });

  it('prefers wrong options of the same kind of word', () => {
    for (const id of ['biti', 'kuca']) {
      const w = WORD_BY_ID.get(id);
      if (!w) continue;
      expect(distractors(w).every((d) => group(d.pos) === group(w.pos))).toBe(true);
    }
  });
});
