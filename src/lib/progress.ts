// Settings, daily stats, XP/levels, streaks and word knowledge — all derived from the record store.
import { byPrefix, get, put } from './store';
import { addDays, dayKey, daysBetween } from './dates';
import { isKnown, isMastered, type StoredCard } from './srs';
import { WORDS } from './words';

export interface Settings {
  newPerDay: number;
  dailyGoal: number;
  /** Type the answer on English → Croatian cards (otherwise flip & self-grade). */
  typing: boolean;
  autoplay: boolean;
  /** Occasionally show recognition cards as audio-only listening drills. */
  listening: boolean;
}

export const DEFAULT_SETTINGS: Settings = { newPerDay: 10, dailyGoal: 100, typing: true, autoplay: true, listening: true };

export const getSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...get<Partial<Settings>>('m:settings') });
export const saveSettings = (s: Partial<Settings>) => put('m:settings', { ...getSettings(), ...s });

export interface DayStats {
  xp: number;
  reviews: number;
  again: number;
  newWords: number;
  ms: number;
  /** Daily goal reached (frozen at the time it happened, so later goal changes don't rewrite history). */
  met?: boolean;
}

const EMPTY_DAY: DayStats = { xp: 0, reviews: 0, again: 0, newWords: 0, ms: 0 };

export const getDay = (key = dayKey()): DayStats => ({ ...EMPTY_DAY, ...get<DayStats>(`d:${key}`) });

/** Add to today's stats. Returns true if this pushed the day over the daily goal. */
export function addToDay(delta: Partial<DayStats>, key = dayKey()) {
  const cur = getDay(key);
  const next: DayStats = {
    xp: cur.xp + (delta.xp ?? 0),
    reviews: cur.reviews + (delta.reviews ?? 0),
    again: cur.again + (delta.again ?? 0),
    newWords: cur.newWords + (delta.newWords ?? 0),
    ms: cur.ms + (delta.ms ?? 0),
    met: cur.met,
  };
  let reached = false;
  if (!next.met && next.xp >= getSettings().dailyGoal) {
    next.met = true;
    reached = true;
  }
  put(`d:${key}`, next);
  if (reached) awardFreezeIfDue();
  return reached;
}

export const allDays = () => byPrefix<DayStats>('d:').map((r) => ({ key: r.key.slice(2), ...r.data }));

export const totalXp = () => allDays().reduce((s, d) => s + d.xp, 0);

/** Level L needs 100·L(L−1)/2 XP: 100 for L2, 300 for L3, 600 for L4 ... */
export function levelInfo(xp = totalXp()) {
  const level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / 100)) / 2);
  const base = (100 * level * (level - 1)) / 2;
  const next = (100 * (level + 1) * level) / 2;
  return { level, xp, into: xp - base, span: next - base };
}

// ---- Streaks -------------------------------------------------------------

export interface StreakMeta {
  freezes: number;
  frozen: string[];
  /** Day on which a freeze was last awarded (one per 7-day milestone). */
  lastAward?: string;
}

export const MAX_FREEZES = 2;
export const getStreakMeta = (): StreakMeta => ({ freezes: 0, frozen: [], ...get<StreakMeta>('m:streak') });

function countedDays() {
  const set = new Set(allDays().filter((d) => d.met).map((d) => d.key));
  for (const f of getStreakMeta().frozen) set.add(f);
  return set;
}

export function streakInfo(today = dayKey()) {
  const days = countedDays();
  const todayDone = days.has(today);
  let current = 0;
  for (let k = todayDone ? today : addDays(today, -1); days.has(k); k = addDays(k, -1)) current++;
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of [...days].sort()) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { current, best, todayDone };
}

function awardFreezeIfDue(today = dayKey()) {
  const { current } = streakInfo(today);
  const meta = getStreakMeta();
  if (current > 0 && current % 7 === 0 && meta.lastAward !== today && meta.freezes < MAX_FREEZES) {
    put('m:streak', { ...meta, freezes: meta.freezes + 1, lastAward: today });
  }
}

/**
 * Called on launch: if days were missed since the last streak day and there are enough
 * freezes to cover the gap, spend them so the streak survives. Returns days frozen.
 */
export function reconcileStreak(today = dayKey()) {
  const days = countedDays();
  const yesterday = addDays(today, -1);
  if (days.has(yesterday)) return 0;
  const last = [...days].filter((k) => k < today).sort().pop();
  if (!last) return 0;
  const gap = daysBetween(last, yesterday);
  const meta = getStreakMeta();
  if (gap < 1 || gap > meta.freezes) return 0;
  const frozen = Array.from({ length: gap }, (_, i) => addDays(last, i + 1));
  put('m:streak', { ...meta, freezes: meta.freezes - gap, frozen: [...meta.frozen, ...frozen].slice(-60) });
  return gap;
}

// ---- Word knowledge ------------------------------------------------------

export const cardKey = (wordId: string, dir: 'r' | 'p') => `c:${wordId}:${dir}`;
export const getCard = (wordId: string, dir: 'r' | 'p') => get<StoredCard>(cardKey(wordId, dir));

export type WordStatus = 'new' | 'learning' | 'known' | 'mastered';

export function wordStatus(wordId: string): WordStatus {
  const r = getCard(wordId, 'r');
  if (!r) return 'new';
  if (isMastered(r)) return 'mastered';
  return isKnown(r) ? 'known' : 'learning';
}

export const BANDS = [100, 250, 500, 750, 1000];

export function knowledge() {
  let known = 0;
  let mastered = 0;
  let learning = 0;
  let coverage = 0;
  let productionKnown = 0;
  const bandKnown = BANDS.map(() => 0);
  for (const w of WORDS) {
    const r = getCard(w.id, 'r');
    if (!r) continue;
    if (isKnown(r)) {
      known++;
      coverage += w.cov;
      BANDS.forEach((b, i) => w.rank <= b && bandKnown[i]++);
      if (isMastered(r)) mastered++;
    } else learning++;
    if (isKnown(getCard(w.id, 'p'))) productionKnown++;
  }
  return { known, mastered, learning, coverage, productionKnown, bands: BANDS.map((b, i) => ({ size: b, known: bandKnown[i] })) };
}
