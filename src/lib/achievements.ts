import { get, put } from './store';
import { knowledge, levelInfo, streakInfo, totalXp } from './progress';

export interface SessionFacts {
  reviews: number;
  again: number;
  bestCombo: number;
  hour: number;
}

interface Ctx {
  known: number;
  productionKnown: number;
  streak: number;
  xp: number;
  level: number;
  session?: SessionFacts;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (c: Ctx) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', icon: '🌱', title: 'Prvi korak', desc: 'Finish your first session', test: (c) => !!c.session && c.session.reviews > 0 },
  { id: 'known10', icon: '🔟', title: 'Deset riječi', desc: 'Know 10 words', test: (c) => c.known >= 10 },
  { id: 'known50', icon: '📗', title: 'Pedeset', desc: 'Know 50 words', test: (c) => c.known >= 50 },
  { id: 'known100', icon: '💯', title: 'Stotka', desc: 'Know 100 words', test: (c) => c.known >= 100 },
  { id: 'known250', icon: '🏖️', title: 'Turist', desc: 'Know 250 words', test: (c) => c.known >= 250 },
  { id: 'known500', icon: '⛵', title: 'Mornar', desc: 'Know 500 words', test: (c) => c.known >= 500 },
  { id: 'known750', icon: '🏰', title: 'Domaći', desc: 'Know 750 words', test: (c) => c.known >= 750 },
  { id: 'known1000', icon: '👑', title: 'Tisuću riječi', desc: 'Know 1000 words', test: (c) => c.known >= 1000 },
  { id: 'prod50', icon: '✍️', title: 'Pisac', desc: 'Recall 50 words from English', test: (c) => c.productionKnown >= 50 },
  { id: 'prod250', icon: '🗣️', title: 'Govornik', desc: 'Recall 250 words from English', test: (c) => c.productionKnown >= 250 },
  { id: 'streak3', icon: '🔥', title: 'Zagrijavanje', desc: '3-day streak', test: (c) => c.streak >= 3 },
  { id: 'streak7', icon: '📅', title: 'Tjedan dana', desc: '7-day streak', test: (c) => c.streak >= 7 },
  { id: 'streak30', icon: '🌙', title: 'Mjesec dana', desc: '30-day streak', test: (c) => c.streak >= 30 },
  { id: 'streak100', icon: '☀️', title: 'Stotinu dana', desc: '100-day streak', test: (c) => c.streak >= 100 },
  { id: 'perfect', icon: '🎯', title: 'Savršeno', desc: '20+ cards in a session without "Again"', test: (c) => !!c.session && c.session.reviews >= 20 && c.session.again === 0 },
  { id: 'combo25', icon: '⚡', title: 'Munja', desc: '25-card combo', test: (c) => !!c.session && c.session.bestCombo >= 25 },
  { id: 'owl', icon: '🦉', title: 'Noćna ptica', desc: 'Study after 11pm', test: (c) => !!c.session && c.session.hour >= 23 },
  { id: 'lark', icon: '🐓', title: 'Ranoranilac', desc: 'Study before 7am', test: (c) => !!c.session && c.session.hour >= 4 && c.session.hour < 7 },
  { id: 'level5', icon: '⭐', title: 'Razina 5', desc: 'Reach level 5', test: (c) => c.level >= 5 },
  { id: 'level10', icon: '🌟', title: 'Razina 10', desc: 'Reach level 10', test: (c) => c.level >= 10 },
  { id: 'xp10k', icon: '💎', title: 'Dijamant', desc: 'Earn 10,000 XP', test: (c) => c.xp >= 10000 },
];

export const getUnlocked = () => get<Record<string, number>>('m:ach') ?? {};

/** Check every achievement and persist new unlocks. Returns the newly unlocked ones. */
export function checkAchievements(session?: SessionFacts): Achievement[] {
  const k = knowledge();
  const xp = totalXp();
  const ctx: Ctx = {
    known: k.known,
    productionKnown: k.productionKnown,
    streak: Math.max(streakInfo().current, 0),
    xp,
    level: levelInfo(xp).level,
    session,
  };
  const unlocked = getUnlocked();
  const fresh = ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.test(ctx));
  if (fresh.length) {
    const now = Date.now();
    put('m:ach', { ...unlocked, ...Object.fromEntries(fresh.map((a) => [a.id, now])) });
  }
  return fresh;
}
