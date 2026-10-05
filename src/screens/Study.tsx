import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { applyGrade, buildQueue, type QueueItem } from '../lib/session';
import { getCard, getDay, getSettings } from '../lib/progress';
import { GRADES, newCard, previewIntervals, Rating, State, type Grade } from '../lib/srs';
import { checkAnswer, type AnswerResult } from '../lib/answer';
import { hasCroatianVoice, speak } from '../lib/speech';
import { posHint, posLabel, speakable, WORD_BY_ID, type Word } from '../lib/words';
import { checkAchievements, type SessionFacts } from '../lib/achievements';
import { confetti, toast } from '../lib/ui';
import { Bar } from '../components/Ring';

const GRADE_LABEL: Record<Grade, string> = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' };
const GRADE_CLASS: Record<Grade, string> = { [Rating.Again]: 'again', [Rating.Hard]: 'hard', [Rating.Good]: 'good', [Rating.Easy]: 'easy' };
const SUGGESTED: Record<AnswerResult, Grade> = { correct: Rating.Good, accents: Rating.Hard, typo: Rating.Hard, wrong: Rating.Again };
const LETTERS = ['č', 'ć', 'đ', 'š', 'ž'];

type Mode = 'intro' | 'recognize' | 'listen' | 'recall-type' | 'recall-flip';

interface Stats {
  reviews: number;
  again: number;
  xp: number;
  newWords: number;
  /** Words that became available for English → Croatian practice. */
  unlocked: number;
  combo: number;
  bestCombo: number;
  goalReached: boolean;
  startedAt: number;
}

function pickMode(item: QueueItem, listening: boolean, typing: boolean): Mode {
  if (item.dir === 'p') return typing ? 'recall-type' : 'recall-flip';
  if (item.isNew) return 'intro';
  const card = getCard(item.wordId, 'r');
  if (listening && hasCroatianVoice() && card?.state === State.Review && Math.random() < 0.3) return 'listen';
  return 'recognize';
}

export function Study({ extraNew, onExit }: { extraNew: number; onExit: () => void }) {
  const settings = useMemo(getSettings, []);
  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(Date.now(), extraNew));
  const [initialSize] = useState(queue.length);
  const [done, setDone] = useState(0);
  /** Increments on every grade; used to re-pick the mode and reset card animations. */
  const [step, setStep] = useState(0);
  const [stats, setStats] = useState<Stats>({ reviews: 0, again: 0, xp: 0, newWords: 0, unlocked: 0, combo: 0, bestCombo: 0, goalReached: false, startedAt: Date.now() });
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [showText, setShowText] = useState(false);
  const [floater, setFloater] = useState<{ id: number; text: string } | null>(null);
  const [finished, setFinished] = useState(queue.length === 0);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownAt = useRef(Date.now());

  const item = queue[0];
  const word: Word | undefined = item && WORD_BY_ID.get(item.wordId);
  const mode = useMemo(() => (item ? pickMode(item, settings.listening, settings.typing) : 'recognize'), [item, step]);
  const showBack = revealed || mode === 'intro';

  // Auto-play audio when a Croatian prompt (or answer) appears.
  useEffect(() => {
    if (!word || !settings.autoplay) return;
    if (mode === 'recognize' || mode === 'intro' || mode === 'listen') speak(speakable(word.hr));
  }, [word, mode, step]);
  useEffect(() => {
    if (word && revealed && settings.autoplay && (mode === 'recall-type' || mode === 'recall-flip')) speak(speakable(word.hr));
  }, [revealed]);
  useEffect(() => {
    shownAt.current = Date.now();
    if (mode === 'recall-type') setTimeout(() => inputRef.current?.focus(), 50);
  }, [item, step]);

  const finish = (s: Stats) => {
    const facts: SessionFacts = { reviews: s.reviews, again: s.again, bestCombo: s.bestCombo, hour: new Date().getHours() };
    const fresh = checkAchievements(facts);
    setUnlocked(fresh.map((a) => `${a.icon} ${a.title}`));
    fresh.forEach((a, i) => setTimeout(() => toast(a.icon, `Achievement: ${a.title}`, a.desc), 400 + i * 600));
    setFinished(true);
  };

  const grade = (g: Grade) => {
    if (!item || !word) return;
    const combo = g === Rating.Again ? 0 : stats.combo + 1;
    const res = applyGrade(item, g, combo);
    const next: Stats = {
      ...stats,
      reviews: stats.reviews + 1,
      again: stats.again + (g === Rating.Again ? 1 : 0),
      xp: stats.xp + res.xp,
      newWords: stats.newWords + (item.isNew && item.dir === 'r' ? 1 : 0),
      unlocked: stats.unlocked + (res.unlockedProduction ? 1 : 0),
      combo,
      bestCombo: Math.max(stats.bestCombo, combo),
      goalReached: stats.goalReached || res.goalReached,
    };
    setStats(next);
    setFloater({ id: Date.now(), text: combo > 0 && combo % 10 === 0 ? `🔥 ${combo} combo! +${res.xp}` : `+${res.xp} XP` });
    if (res.goalReached) {
      confetti();
      toast('🎯', 'Daily goal reached!', 'Your streak is safe for today.');
    }

    const rest = queue.slice(1);
    if (res.requeue) {
      // Still learning: a failed card comes back after a few others, otherwise at the end of the queue.
      const at = g === Rating.Again ? Math.min(rest.length, 3) : rest.length;
      rest.splice(at, 0, { ...item, isNew: false });
    } else {
      setDone((d) => d + 1);
    }
    setStep((n) => n + 1);
    setQueue(rest);
    setRevealed(false);
    setTyped('');
    setResult(null);
    setShowText(false);
    if (!rest.length) finish(next);
  };

  const check = () => {
    if (!word) return;
    setResult(checkAnswer(typed, word.hr));
    setRevealed(true);
  };

  // Keyboard shortcuts (handy on desktop): space/enter = reveal, 1–4 = grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || !item) return;
      const inInput = e.target instanceof HTMLInputElement;
      if (!showBack) {
        if (e.key === 'Enter' && mode === 'recall-type') check();
        else if ((e.key === ' ' || e.key === 'Enter') && !inInput) {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (e.key === 'Enter' && result) return grade(SUGGESTED[result]);
      if (inInput) return;
      const n = Number(e.key);
      if (mode === 'intro') {
        if (n === 1) grade(Rating.Again);
        if (n === 2 || e.key === ' ' || e.key === 'Enter') grade(Rating.Good);
      } else if (n >= 1 && n <= 4) grade(GRADES[n - 1]);
      else if (e.key === ' ') grade(Rating.Good);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (finished) return <Summary stats={stats} unlocked={unlocked} onExit={onExit} />;
  if (!item || !word) return null;

  const card = getCard(item.wordId, item.dir) ?? newCard();
  const intervals = previewIntervals(card);
  const progress = done / Math.max(initialSize, done + queue.length);
  const voice = hasCroatianVoice();

  return (
    <div class="study">
      <header class="study-top">
        <button class="icon-btn" aria-label="End session" onClick={() => (stats.reviews ? finish(stats) : onExit())}>
          ✕
        </button>
        <div class="grow">
          <Bar value={progress} tone="good" />
        </div>
        <div class={`combo ${stats.combo >= 5 ? 'hot' : ''}`}>{stats.combo >= 3 ? `🔥${stats.combo}` : ''}</div>
        <div class="xp-chip">{stats.xp} XP</div>
      </header>

      {floater && (
        <div class="floater" key={floater.id}>
          {floater.text}
        </div>
      )}

      <div class="study-body">
        <div class={`flashcard ${showBack ? 'back' : 'front'} dir-${item.dir}`} key={`${item.wordId}-${item.dir}-${step}`}>
          <div class="card-tags">
            {mode === 'intro' && <span class="tag new">New word</span>}
            {item.dir === 'p' && item.isNew && <span class="tag blue">New: recall</span>}
            {mode === 'listen' && <span class="tag blue">Listening</span>}
            <span class="tag subtle">#{word.rank}</span>
          </div>

          {/* PROMPT */}
          {item.dir === 'r' ? (
            mode === 'listen' && !showBack && !showText ? (
              <div class="prompt">
                <button class="listen-btn" onClick={() => speak(speakable(word.hr), 0.85)} aria-label="Play audio">
                  🔊
                </button>
                <button class="link" onClick={() => setShowText(true)}>
                  Show the word
                </button>
              </div>
            ) : (
              <div class="prompt">
                <div class="hr-word">{word.hr}</div>
                {voice && (
                  <button class="icon-btn speak" onClick={() => speak(speakable(word.hr))} aria-label="Pronounce">
                    🔊
                  </button>
                )}
                {showBack && <div class="muted small">{posLabel(word.pos)}</div>}
              </div>
            )
          ) : (
            <div class="prompt">
              <div class="en-word">{word.en}</div>
              <div class="muted small">{posHint(word.pos)}</div>
            </div>
          )}

          {/* ANSWER */}
          {showBack && (
            <div class="answer">
              {item.dir === 'r' ? (
                <div class="en-word sm">{word.en}</div>
              ) : (
                <>
                  {result && <Feedback result={result} typed={typed} />}
                  <div class="hr-word sm">
                    {word.hr}
                    {voice && (
                      <button class="icon-btn speak inline" onClick={() => speak(speakable(word.hr))} aria-label="Pronounce">
                        🔊
                      </button>
                    )}
                  </div>
                  <div class="muted small">{posLabel(word.pos)}</div>
                </>
              )}
              {word.note && <div class="note">{word.note}</div>}
              {word.ex && (
                <div class="example">
                  <div class="ex-hr">
                    {word.ex[0]}
                    {voice && (
                      <button class="icon-btn speak inline" onClick={() => speak(word.ex![0], 0.85)} aria-label="Pronounce example">
                        🔊
                      </button>
                    )}
                  </div>
                  <div class="muted">{word.ex[1]}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer class="study-actions">
        {!showBack && mode === 'recall-type' && (
          <div class="typing">
            <div class="letters">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  class="letter"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTyped((t) => t + l);
                    inputRef.current?.focus();
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div class="type-row">
              <input
                ref={inputRef}
                class="type-input"
                value={typed}
                onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                placeholder="Type in Croatian…"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                lang="hr"
                enterKeyHint="done"
              />
              <button class="btn primary" onClick={check}>
                Check
              </button>
            </div>
            <button class="link" onClick={() => setRevealed(true)}>
              I don't know — show me
            </button>
          </div>
        )}
        {!showBack && mode !== 'recall-type' && (
          <button class="btn primary big" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        )}
        {showBack && mode === 'intro' && (
          <div class="grades two">
            <button class="grade again" onClick={() => grade(Rating.Again)}>
              <span>Show again soon</span>
              <small>{intervals[Rating.Again]}</small>
            </button>
            <button class="grade good" onClick={() => grade(Rating.Good)}>
              <span>Got it</span>
              <small>{intervals[Rating.Good]}</small>
            </button>
          </div>
        )}
        {showBack && mode !== 'intro' && (
          <div class="grades">
            {GRADES.map((g) => (
              <button key={g} class={`grade ${GRADE_CLASS[g]} ${result && SUGGESTED[result] === g ? 'suggested' : ''}`} onClick={() => grade(g)}>
                <span>{GRADE_LABEL[g]}</span>
                <small>{intervals[g]}</small>
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}

function Feedback({ result, typed }: { result: AnswerResult; typed: string }) {
  if (result === 'correct') return <div class="feedback ok">✓ Correct!</div>;
  if (result === 'accents') return <div class="feedback warn">Almost — watch the diacritics (you wrote “{typed}”)</div>;
  if (result === 'typo') return <div class="feedback warn">Close — small typo (you wrote “{typed}”)</div>;
  return <div class="feedback bad">{typed.trim() ? `Not quite — you wrote “${typed}”` : 'Here’s the answer:'}</div>;
}

function Summary({ stats, unlocked, onExit }: { stats: Stats; unlocked: string[]; onExit: () => void }) {
  const day = getDay();
  const settings = getSettings();
  const accuracy = stats.reviews ? Math.round(((stats.reviews - stats.again) / stats.reviews) * 100) : 0;
  const mins = Math.max(1, Math.round((Date.now() - stats.startedAt) / 60000));
  if (!stats.reviews)
    return (
      <div class="study summary">
        <div class="summary-body">
          <div class="big-emoji">✨</div>
          <h1>Nothing to study right now</h1>
          <p class="muted">All reviews are done. Come back later for more.</p>
        </div>
        <footer class="study-actions">
          <button class="btn primary big" onClick={onExit}>
            Back
          </button>
        </footer>
      </div>
    );
  return (
    <div class="study summary">
      <div class="summary-body">
        <div class="big-emoji">{accuracy >= 90 ? '🏆' : accuracy >= 70 ? '💪' : '🌱'}</div>
        <h1>{accuracy >= 90 ? 'Odlično!' : accuracy >= 70 ? 'Bravo!' : 'Dobar posao!'}</h1>
        <p class="muted">Session complete in about {mins} min.</p>
        <div class="summary-grid">
          <div>
            <div class="count">+{stats.xp}</div>
            <div class="muted small">XP</div>
          </div>
          <div>
            <div class="count">{stats.reviews}</div>
            <div class="muted small">cards</div>
          </div>
          <div>
            <div class="count">{accuracy}%</div>
            <div class="muted small">correct</div>
          </div>
          <div>
            <div class="count">{stats.bestCombo}</div>
            <div class="muted small">best combo</div>
          </div>
        </div>
        <div class="card mt">
          <div class="row-between small">
            <span>Daily goal</span>
            <span class="muted">
              {day.xp} / {settings.dailyGoal} XP
            </span>
          </div>
          <Bar value={day.xp / settings.dailyGoal} tone={day.met ? 'good' : 'accent'} />
        </div>
        {stats.unlocked > 0 && (
          <div class="card mt">
            🔓 <strong>{stats.unlocked}</strong> word{stats.unlocked > 1 ? 's' : ''} unlocked for English → Croatian practice, starting tomorrow.
          </div>
        )}
        {unlocked.length > 0 && (
          <div class="card mt">
            <h3>New achievements</h3>
            {unlocked.map((u) => (
              <div key={u}>{u}</div>
            ))}
          </div>
        )}
      </div>
      <footer class="study-actions">
        <button class="btn primary big" onClick={onExit}>
          Done
        </button>
      </footer>
    </div>
  );
}
