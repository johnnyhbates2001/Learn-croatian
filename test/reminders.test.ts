import { describe, expect, it } from 'vitest';
import { localParts, reminderDue, reminderMessage, streakBefore, studyDay } from '../worker/schedule';

// 2026-10-11 18:30 UTC = 20:30 in Zagreb (CEST, UTC+2).
const at = (iso: string) => Date.parse(iso);

describe('reminders', () => {
  it('works in the subscriber’s time zone with a 03:00 day rollover', () => {
    expect(localParts(at('2026-10-11T18:30:00Z'), 'Europe/Zagreb')).toEqual({ date: '2026-10-11', time: '20:30' });
    expect(studyDay(at('2026-10-11T23:30:00Z'), 'Europe/Zagreb')).toBe('2026-10-11'); // 01:30 next day still counts
    expect(studyDay(at('2026-10-12T01:30:00Z'), 'Europe/Zagreb')).toBe('2026-10-12'); // 03:30
  });

  it('is due once the local time passes, once per day', () => {
    const sub = { remind_at: '20:00', tz: 'Europe/Zagreb', last_sent: null };
    expect(reminderDue(sub, at('2026-10-11T17:45:00Z'))).toBeNull(); // 19:45
    expect(reminderDue(sub, at('2026-10-11T18:00:00Z'))).toBe('2026-10-11'); // 20:00
    expect(reminderDue({ ...sub, last_sent: '2026-10-11' }, at('2026-10-11T19:00:00Z'))).toBeNull();
    expect(reminderDue({ ...sub, last_sent: '2026-10-11' }, at('2026-10-11T23:30:00Z'))).toBeNull(); // 01:30, same study day
    expect(reminderDue({ ...sub, tz: 'America/New_York' }, at('2026-10-11T18:00:00Z'))).toBeNull(); // 14:00 there
  });

  it('counts the streak from yesterday back', () => {
    expect(streakBefore('2026-10-11', new Set(['2026-10-10', '2026-10-09', '2026-10-07']))).toBe(2);
    expect(streakBefore('2026-10-11', new Set(['2026-10-11']))).toBe(0);
    expect(streakBefore('2026-03-01', new Set(['2026-02-28']))).toBe(1);
  });

  it('only nags when the goal isn’t met yet', () => {
    expect(reminderMessage({ due: 5, streak: 3, xp: 120, goal: 100, met: true })).toBeNull();
    expect(reminderMessage({ due: 5, streak: 3, xp: 40, goal: 100, met: false })?.body).toBe("60 XP to go to reach today's goal and keep your 3-day streak.");
    expect(reminderMessage({ due: 12, streak: 4, xp: 0, goal: 100, met: false })?.body).toBe('12 words are ready for review — keep your 4-day streak going!');
    expect(reminderMessage({ due: 1, streak: 0, xp: 0, goal: 100, met: false })?.body).toBe('1 word is ready for review.');
    expect(reminderMessage({ due: 0, streak: 0, xp: 0, goal: 100, met: false })?.body).toBe('Time to learn a few new words.');
  });
});
