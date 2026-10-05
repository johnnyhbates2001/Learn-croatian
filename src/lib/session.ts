// Builds the study queue and applies grades (scheduling, XP, unlocking production cards).
import { byPrefix, get, put } from './store';
import { addToDay, cardKey, getCard, getDay, getSettings } from './progress';
import { dayKey } from './dates';
import { newCard, Rating, review, State, type Grade, type StoredCard } from './srs';
import { WORD_BY_ID, WORDS } from './words';

export type Dir = 'r' | 'p';

export interface QueueItem {
  wordId: string;
  /** r = recognition (Croatian → English), p = production (English → Croatian). */
  dir: Dir;
  /** First time this card is studied. */
  isNew: boolean;
}

export const MAX_REVIEWS = 200;
const RELEARN_WINDOW = 20 * 60_000;

export const getSuspended = () => new Set(get<string[]>('m:suspended') ?? []);

export function dueCards(now = Date.now()) {
  const suspended = getSuspended();
  return byPrefix<StoredCard>('c:')
    .map((r) => {
      const [, wordId, dir] = r.key.split(':');
      return { wordId, dir: dir as Dir, card: r.data };
    })
    .filter((c) => c.card.due <= now && WORD_BY_ID.has(c.wordId) && !suspended.has(c.wordId))
    .sort((a, b) => {
      const learnA = a.card.state === State.Learning || a.card.state === State.Relearning ? 0 : 1;
      const learnB = b.card.state === State.Learning || b.card.state === State.Relearning ? 0 : 1;
      return learnA - learnB || a.card.due - b.card.due;
    });
}

export function newWordsLeftToday() {
  return Math.max(0, getSettings().newPerDay - getDay().newWords);
}

export function nextNewWords(n: number) {
  if (n <= 0) return [];
  const suspended = getSuspended();
  const out: string[] = [];
  for (const w of WORDS) {
    if (out.length >= n) break;
    if (!getCard(w.id, 'r') && !suspended.has(w.id)) out.push(w.id);
  }
  return out;
}

export function buildQueue(now = Date.now(), extraNew = 0): QueueItem[] {
  const due = dueCards(now).slice(0, MAX_REVIEWS).map((c) => ({ wordId: c.wordId, dir: c.dir, isNew: c.card.state === State.New }));
  const fresh = nextNewWords(newWordsLeftToday() + extraNew).map((wordId) => ({ wordId, dir: 'r' as Dir, isNew: true }));
  // Interleave: one new word after every 3 reviews, so new material is spread out.
  const out: QueueItem[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) out.push(due[i++]);
    if (j < fresh.length) out.push(fresh[j++]);
  }
  return out;
}

export const XP: Record<Grade, number> = { [Rating.Again]: 2, [Rating.Hard]: 5, [Rating.Good]: 8, [Rating.Easy]: 10 };
export const NEW_WORD_BONUS = 5;
export const COMBO_STEP = 10;
export const COMBO_BONUS = 10;

export interface GradeResult {
  card: StoredCard;
  xp: number;
  /** Card should come back again in this session (still learning). */
  requeue: boolean;
  goalReached: boolean;
  unlockedProduction: boolean;
}

export function applyGrade(item: QueueItem, grade: Grade, combo: number, now = Date.now()): GradeResult {
  const key = cardKey(item.wordId, item.dir);
  const before = get<StoredCard>(key) ?? newCard(now);
  const card = review(before, grade, now);
  put(key, card);

  // Once a word is recognised reliably, start practising it the other way round (from tomorrow).
  let unlockedProduction = false;
  if (item.dir === 'r' && card.state === State.Review && !getCard(item.wordId, 'p')) {
    put(cardKey(item.wordId, 'p'), { ...newCard(now), due: now + 20 * 3600_000 });
    unlockedProduction = true;
  }

  const firstTime = before.state === State.New;
  let xp = XP[grade] + (firstTime && item.dir === 'r' ? NEW_WORD_BONUS : 0);
  if (grade !== Rating.Again && combo > 0 && combo % COMBO_STEP === 0) xp += COMBO_BONUS;

  const goalReached = addToDay({
    xp,
    reviews: 1,
    again: grade === Rating.Again ? 1 : 0,
    newWords: firstTime && item.dir === 'r' ? 1 : 0,
  });

  return { card, xp, requeue: card.due - now < RELEARN_WINDOW, goalReached, unlockedProduction };
}

export function toggleSuspended(wordId: string) {
  const s = getSuspended();
  s.has(wordId) ? s.delete(wordId) : s.add(wordId);
  put('m:suspended', [...s]);
}

