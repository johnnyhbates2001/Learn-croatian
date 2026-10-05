import { useStore } from '../lib/hooks';
import { allDays, getStreakMeta, knowledge, levelInfo, MAX_FREEZES, streakInfo } from '../lib/progress';
import { ACHIEVEMENTS, getUnlocked } from '../lib/achievements';
import { addDays, dayKey, weekday } from '../lib/dates';
import { Bar } from '../components/Ring';

const WEEKS = 17;

export function Stats() {
  useStore();
  const lvl = levelInfo();
  const streak = streakInfo();
  const meta = getStreakMeta();
  const k = knowledge();
  const unlocked = getUnlocked();
  const days = new Map(allDays().map((d) => [d.key, d]));
  const frozen = new Set(meta.frozen);
  const totalReviews = [...days.values()].reduce((s, d) => s + d.reviews, 0);
  const totalAgain = [...days.values()].reduce((s, d) => s + d.again, 0);

  // Heatmap: columns are weeks (Mon–Sun), ending with the current week.
  const today = dayKey();
  const start = addDays(today, -(WEEKS - 1) * 7 - weekday(today));
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));
  const maxXp = Math.max(50, ...[...days.values()].map((d) => d.xp));

  return (
    <div class="stats">
      <header class="topbar">
        <h1>Progress</h1>
      </header>

      <section class="card level-card">
        <div class="level-badge">{lvl.level}</div>
        <div class="grow">
          <div class="row-between">
            <strong>Level {lvl.level}</strong>
            <span class="muted small">{lvl.xp.toLocaleString()} XP total</span>
          </div>
          <Bar value={lvl.into / lvl.span} />
          <div class="muted small mt-xs">{lvl.span - lvl.into} XP to level {lvl.level + 1}</div>
        </div>
      </section>

      <section class="stat-grid">
        <div class="card stat">
          <div class="count">🔥 {streak.current}</div>
          <div class="muted small">day streak</div>
        </div>
        <div class="card stat">
          <div class="count">{streak.best}</div>
          <div class="muted small">best streak</div>
        </div>
        <div class="card stat">
          <div class="count">
            🧊 {meta.freezes}/{MAX_FREEZES}
          </div>
          <div class="muted small">freezes (1 per 7-day streak)</div>
        </div>
        <div class="card stat">
          <div class="count">{totalReviews ? Math.round(((totalReviews - totalAgain) / totalReviews) * 100) : 0}%</div>
          <div class="muted small">{totalReviews.toLocaleString()} reviews</div>
        </div>
      </section>

      <section class="card">
        <h3>Words</h3>
        <div class="stat-row">
          <div>
            <div class="count">{k.known}</div>
            <div class="muted small">known</div>
          </div>
          <div>
            <div class="count">{k.mastered}</div>
            <div class="muted small">mastered</div>
          </div>
          <div>
            <div class="count">{k.learning}</div>
            <div class="muted small">learning</div>
          </div>
          <div>
            <div class="count">{k.productionKnown}</div>
            <div class="muted small">can recall</div>
          </div>
        </div>
        <div class="coverage mt">
          <span class="coverage-num">≈{Math.round(k.coverage * 100)}%</span>
          <span class="muted">everyday coverage</span>
        </div>
        <Bar value={k.coverage / 0.78} tone="good" />
      </section>

      <section class="card">
        <h3>Frequency milestones</h3>
        {k.bands.map((b) => (
          <div class="band" key={b.size}>
            <div class="row-between small">
              <span>
                {b.known >= b.size ? '✅' : '◻️'} Top {b.size}
              </span>
              <span class="muted">
                {b.known}/{b.size}
              </span>
            </div>
            <Bar value={b.known / b.size} tone={b.known >= b.size ? 'good' : 'blue'} />
          </div>
        ))}
      </section>

      <section class="card">
        <h3>Activity</h3>
        <div class="heatmap" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {cells.map((d) => {
            const day = days.get(d);
            const lvl = !day || day.xp === 0 ? 0 : Math.min(4, Math.ceil((day.xp / maxXp) * 4));
            return <div key={d} class={`hm l${lvl} ${frozen.has(d) ? 'frozen' : ''} ${d > today ? 'future' : ''}`} title={`${d}: ${day?.xp ?? 0} XP`} />;
          })}
        </div>
      </section>

      <section class="card">
        <h3>
          Achievements <span class="muted small">{Object.keys(unlocked).length}/{ACHIEVEMENTS.length}</span>
        </h3>
        <div class="ach-grid">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} class={`ach ${unlocked[a.id] ? 'on' : ''}`} title={a.desc}>
              <div class="ach-icon">{unlocked[a.id] ? a.icon : '🔒'}</div>
              <div class="ach-title">{a.title}</div>
              <div class="muted tiny">{a.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
