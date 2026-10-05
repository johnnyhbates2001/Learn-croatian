import { beforeEach, describe, expect, it } from 'vitest';
import { clearProgress, get } from '../src/lib/store';
import { applyGrade, buildQueue } from '../src/lib/session';
import { Rating, State, type StoredCard } from '../src/lib/srs';
import { WORDS } from '../src/lib/words';

beforeEach(async () => {
  await clearProgress();
});

describe('session', () => {
  it('starts with the most frequent new words', () => {
    const q = buildQueue();
    expect(q).toHaveLength(10);
    expect(q.map((i) => i.wordId)).toEqual(WORDS.slice(0, 10).map((w) => w.id));
    expect(q.every((i) => i.isNew && i.dir === 'r')).toBe(true);
  });

  it('requeues learning cards and unlocks recall once a word graduates', () => {
    const item = { wordId: 'kuca', dir: 'r' as const, isNew: true };
    let now = Date.now();
    const first = applyGrade(item, Rating.Good, 1, now);
    expect(first.requeue).toBe(true);
    expect(first.xp).toBeGreaterThan(8); // includes new-word bonus
    // Keep answering Good until the card graduates.
    let res = first;
    for (let i = 0; i < 5 && res.card.state !== State.Review; i++) {
      now += 11 * 60_000;
      res = applyGrade({ ...item, isNew: false }, Rating.Good, 2, now);
    }
    expect(res.card.state).toBe(State.Review);
    expect(res.requeue).toBe(false);
    const p = get<StoredCard>('c:kuca:p');
    expect(p?.state).toBe(State.New);
    expect(p!.due).toBeGreaterThan(now);
  });
});
