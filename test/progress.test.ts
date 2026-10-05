import { beforeEach, describe, expect, it } from 'vitest';
import { clearProgress, put } from '../src/lib/store';
import { addDays, daysBetween } from '../src/lib/dates';
import { addToDay, getStreakMeta, levelInfo, reconcileStreak, streakInfo } from '../src/lib/progress';

const TODAY = '2026-03-10';
const met = (key: string) => put(`d:${key}`, { xp: 120, reviews: 10, again: 0, newWords: 0, ms: 0, met: true });

beforeEach(async () => {
  await clearProgress();
});

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
  });
});

describe('levels', () => {
  it('follows the triangular XP curve', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(300).level).toBe(3);
    expect(levelInfo(350)).toMatchObject({ level: 3, into: 50, span: 300 });
  });
});

describe('streaks', () => {
  it('counts consecutive goal days, including yesterday if today is not done yet', () => {
    [-3, -2, -1].forEach((d) => met(addDays(TODAY, d)));
    expect(streakInfo(TODAY)).toMatchObject({ current: 3, best: 3, todayDone: false });
    met(TODAY);
    expect(streakInfo(TODAY)).toMatchObject({ current: 4, todayDone: true });
  });

  it('breaks after a missed day', () => {
    met(addDays(TODAY, -3));
    met(addDays(TODAY, -1));
    expect(streakInfo(TODAY).current).toBe(1);
    expect(streakInfo(TODAY).best).toBe(1);
  });

  it('spends freezes to cover missed days', () => {
    [-5, -4, -3].forEach((d) => met(addDays(TODAY, d)));
    put('m:streak', { freezes: 2, frozen: [] });
    expect(reconcileStreak(TODAY)).toBe(2);
    expect(getStreakMeta().freezes).toBe(0);
    expect(streakInfo(TODAY).current).toBe(5);
  });

  it('does not spend freezes if the gap is too big', () => {
    met(addDays(TODAY, -5));
    put('m:streak', { freezes: 2, frozen: [] });
    expect(reconcileStreak(TODAY)).toBe(0);
    expect(getStreakMeta().freezes).toBe(2);
  });

  it('marks the day as met once XP reaches the goal', () => {
    expect(addToDay({ xp: 60 }, TODAY)).toBe(false);
    expect(addToDay({ xp: 60 }, TODAY)).toBe(true);
    expect(addToDay({ xp: 60 }, TODAY)).toBe(false);
  });
});
