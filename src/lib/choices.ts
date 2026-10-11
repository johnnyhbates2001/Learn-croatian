// Multiple-choice options for Croatian → English cards.
import { getCard } from './progress';
import { WORDS, type Pos, type Word } from './words';

/** Nouns and verbs are grouped regardless of gender/aspect; everything else must match exactly. */
const posGroup = (p: Pos) => (p.startsWith('n-') ? 'n' : p.startsWith('v-') ? 'v' : p);

/** The individual meanings in a gloss like "yes; that (conj.)" → ["yes", "that"]. */
export function meanings(en: string) {
  return en
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[;,/]/)
    .map((s) => s.replace(/^\s*to\s+/, '').trim())
    .filter(Boolean);
}

/** True if two glosses share a meaning, so one can't fairly be a wrong option for the other. */
export function overlaps(a: string, b: string) {
  const mb = new Set(meanings(b));
  return meanings(a).some((m) => mb.has(m));
}

function shuffle<T>(xs: T[], rand: () => number) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/**
 * Pick believable wrong options: same kind of word, preferring words already studied
 * (the ones most likely to be confused), then words of similar frequency.
 */
export function distractors(word: Word, n = 3, rand = Math.random, words: Word[] = WORDS): Word[] {
  const out: Word[] = [];
  const ok = (w: Word) => w.id !== word.id && !overlaps(w.en, word.en) && out.every((o) => !overlaps(o.en, w.en));
  const group = posGroup(word.pos);
  const same = words.filter((w) => posGroup(w.pos) === group);
  const near = (pool: Word[]) => shuffle(pool.sort((a, b) => Math.abs(a.rank - word.rank) - Math.abs(b.rank - word.rank)).slice(0, 30), rand);
  const seen = shuffle(same.filter((w) => getCard(w.id, 'r')), rand);
  const unseen = near(same.filter((w) => !getCard(w.id, 'r')));
  const others = near(words.filter((w) => posGroup(w.pos) !== group));
  for (const w of [...seen, ...unseen, ...others]) {
    if (out.length >= n) break;
    if (ok(w)) out.push(w);
  }
  return out;
}

/** The correct word plus distractors, in random order. */
export const choicesFor = (word: Word, rand = Math.random) => shuffle([word, ...distractors(word, 3, rand)], rand);
