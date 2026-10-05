import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

export { Rating, State };
export type { Grade };

/** FSRS card with dates stored as epoch milliseconds (JSON/IndexedDB friendly). */
export interface StoredCard {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: number;
}

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 3650,
    enable_fuzz: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  }),
);

const toCard = (c: StoredCard): Card => ({
  ...c,
  due: new Date(c.due),
  last_review: c.last_review ? new Date(c.last_review) : undefined,
});

const fromCard = (c: Card): StoredCard => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  ...(c.last_review && { last_review: c.last_review.getTime() }),
});

export const newCard = (now = Date.now()): StoredCard => fromCard(createEmptyCard(new Date(now)));

export const review = (c: StoredCard, rating: Grade, now = Date.now()): StoredCard =>
  fromCard(scheduler.next(toCard(c), new Date(now), rating).card);

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function formatInterval(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/** Next interval for each grade, e.g. { Again: "1m", Good: "3d", ... }. */
export function previewIntervals(c: StoredCard, now = Date.now()): Record<Grade, string> {
  const p = scheduler.repeat(toCard(c), new Date(now));
  const out = {} as Record<Grade, string>;
  for (const g of GRADES) out[g] = formatInterval(p[g].card.due.getTime() - now);
  return out;
}

/** Words count as "known" once the recognition card has graduated to review. */
export const isKnown = (c?: StoredCard) => !!c && (c.state === State.Review || (c.state === State.Relearning && c.reps > 2));
/** "Mastered" = expected to be remembered for 3+ weeks. */
export const isMastered = (c?: StoredCard) => !!c && c.state === State.Review && c.stability >= 21;
