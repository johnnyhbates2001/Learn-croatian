import { useStore } from '../lib/hooks';
import { getDay, getSettings, getStreakMeta, knowledge, levelInfo, streakInfo } from '../lib/progress';
import { dueCards, newWordsLeftToday, nextNewWords } from '../lib/session';
import { addDays, dayKey, weekday } from '../lib/dates';
import { Bar, Ring } from '../components/Ring';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Home({ onStudy }: { onStudy: (extraNew?: number) => void }) {
  useStore();
  const settings = getSettings();
  const today = getDay();
  const streak = streakInfo();
  const freezes = getStreakMeta().freezes;
  const lvl = levelInfo();
  const k = knowledge();
  const due = dueCards().length;
  const newLeft = nextNewWords(newWordsLeftToday()).length;
  const nothingLeft = due === 0 && newLeft === 0;
  const nextBand = k.bands.find((b) => b.known < b.size) ?? k.bands[k.bands.length - 1];
  const todayKey = dayKey();
  const week = Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - 6));
  const frozen = new Set(getStreakMeta().frozen);

  return (
    <div class="home">
      <header class="topbar">
        <div class="brand">
          Riječi<span class="brand-dot">.</span>
        </div>
        <div class="chips">
          <span class="chip" title="Current streak">
            🔥 {streak.current}
          </span>
          {freezes > 0 && (
            <span class="chip" title="Streak freezes">
              🧊 {freezes}
            </span>
          )}
          <span class="chip level" title="Level">
            Lv {lvl.level}
          </span>
        </div>
      </header>

      <section class="card goal">
        <Ring value={today.xp / settings.dailyGoal}>
          <div class="ring-big">{today.xp}</div>
          <div class="muted small">/ {settings.dailyGoal} XP</div>
        </Ring>
        <div class="goal-text">
          <h2>{today.met ? 'Daily goal done! 🎉' : streak.current > 0 && !streak.todayDone ? 'Keep your streak alive' : "Today's goal"}</h2>
          <p class="muted">
            {today.met
              ? `${streak.current}-day streak. Extra practice still earns XP.`
              : `${settings.dailyGoal - today.xp} XP to go${streak.current ? ` · 🔥 ${streak.current} day streak` : ''}`}
          </p>
          <div class="week">
            {week.map((d) => {
              const day = getDay(d);
              return (
                <div key={d} class={`week-day ${day.met ? 'met' : frozen.has(d) ? 'frozen' : day.xp > 0 ? 'some' : ''} ${d === todayKey ? 'today' : ''}`}>
                  <span>{WEEKDAYS[weekday(d)][0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {nothingLeft ? (
        <section class="card cta done">
          <h2>All caught up ✨</h2>
          <p class="muted">No reviews due right now. Come back later, or learn a few extra words.</p>
          <button class="btn primary big" onClick={() => onStudy(5)}>
            Learn 5 more words
          </button>
        </section>
      ) : (
        <section class="card cta">
          <div class="cta-counts">
            <div>
              <div class="count">{due}</div>
              <div class="muted small">to review</div>
            </div>
            <div>
              <div class="count new">{newLeft}</div>
              <div class="muted small">new words</div>
            </div>
          </div>
          <button class="btn primary big" onClick={() => onStudy()}>
            {today.reviews ? 'Continue' : 'Start'} session →
          </button>
        </section>
      )}

      <section class="card">
        <div class="row-between">
          <h3>Everyday coverage</h3>
          <span class="pill">{k.known} words</span>
        </div>
        <div class="coverage">
          <span class="coverage-num">≈{Math.round(k.coverage * 100)}%</span>
          <span class="muted">of the words in everyday Croatian conversation</span>
        </div>
        <Bar value={k.coverage / 0.78} tone="good" />
        <div class="row-between small muted mt">
          <span>
            Next milestone: Top {nextBand.size} — {nextBand.known}/{nextBand.size}
          </span>
        </div>
        <Bar value={nextBand.known / nextBand.size} tone="blue" />
      </section>

      <section class="card">
        <div class="row-between">
          <h3>Level {lvl.level}</h3>
          <span class="muted small">
            {lvl.into} / {lvl.span} XP
          </span>
        </div>
        <Bar value={lvl.into / lvl.span} />
      </section>
    </div>
  );
}
