import { useMemo, useState } from 'preact/hooks';
import { useStore } from '../lib/hooks';
import { getCard, wordStatus, type WordStatus } from '../lib/progress';
import { getSuspended, toggleSuspended } from '../lib/session';
import { get, put } from '../lib/store';
import { fold } from '../lib/answer';
import { formatInterval } from '../lib/srs';
import { hasCroatianVoice, speak } from '../lib/speech';
import { posLabel, speakable, WORDS, type Word } from '../lib/words';

type Filter = 'all' | WordStatus | 'suspended' | 'flagged';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'learning', label: 'Learning' },
  { id: 'known', label: 'Known' },
  { id: 'mastered', label: 'Mastered' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'suspended', label: 'Hidden' },
];

export const getFlags = () => new Set(get<string[]>('m:flags') ?? []);

export function Words() {
  useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Word | null>(null);
  const suspended = getSuspended();
  const flags = getFlags();

  const list = useMemo(() => {
    const query = fold(q.trim().toLowerCase());
    return WORDS.filter((w) => {
      if (query && !fold(w.hr.toLowerCase()).includes(query) && !w.en.toLowerCase().includes(query)) return false;
      if (filter === 'all') return true;
      if (filter === 'suspended') return suspended.has(w.id);
      if (filter === 'flagged') return flags.has(w.id);
      return wordStatus(w.id) === filter;
    });
  }, [q, filter, suspended.size, flags.size, open]);

  return (
    <div class="words">
      <header class="topbar">
        <h1>Words</h1>
        <span class="muted small">{list.length}</span>
      </header>
      <input class="search" placeholder="Search Croatian or English…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="filters">
        {FILTERS.map((f) => (
          <button key={f.id} class={`chip-btn ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <ul class="word-list">
        {list.slice(0, 400).map((w) => (
          <li key={w.id} onClick={() => setOpen(w)}>
            <span class="rank">{w.rank}</span>
            <span class="wl-hr">{w.hr}</span>
            <span class="wl-en muted">{w.en}</span>
            <span class={`dot ${suspended.has(w.id) ? 'hidden' : wordStatus(w.id)}`} />
          </li>
        ))}
      </ul>
      {list.length > 400 && <p class="muted small center">Showing the first 400 — search to narrow down.</p>}
      {open && <WordSheet word={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function WordSheet({ word, onClose }: { word: Word; onClose: () => void }) {
  useStore();
  const r = getCard(word.id, 'r');
  const p = getCard(word.id, 'p');
  const suspended = getSuspended().has(word.id);
  const flags = getFlags();
  const flagged = flags.has(word.id);
  const now = Date.now();
  const due = (c?: { due: number }) => (!c ? '—' : c.due <= now ? 'due now' : `in ${formatInterval(c.due - now)}`);

  const toggleFlag = () => {
    flagged ? flags.delete(word.id) : flags.add(word.id);
    put('m:flags', [...flags]);
  };

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-handle" />
        <div class="row-between">
          <span class="tag subtle">#{word.rank}</span>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div class="hr-word">
          {word.hr}
          {hasCroatianVoice() && (
            <button class="icon-btn speak inline" onClick={() => speak(speakable(word.hr))}>
              🔊
            </button>
          )}
        </div>
        <div class="en-word sm">{word.en}</div>
        <div class="muted small">{posLabel(word.pos)}</div>
        {word.note && <div class="note">{word.note}</div>}
        {word.ex && (
          <div class="example">
            <div class="ex-hr">
              {word.ex[0]}
              {hasCroatianVoice() && (
                <button class="icon-btn speak inline" onClick={() => speak(word.ex![0], 0.85)}>
                  🔊
                </button>
              )}
            </div>
            <div class="muted">{word.ex[1]}</div>
          </div>
        )}
        <div class="sheet-stats">
          <div>
            <div class="muted small">HR → EN</div>
            <div>{r ? `${due(r)} · ${r.reps} reviews` : 'not started'}</div>
          </div>
          <div>
            <div class="muted small">EN → HR</div>
            <div>{p ? `${due(p)} · ${p.reps} reviews` : 'locked'}</div>
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn" onClick={toggleFlag}>
            {flagged ? '⚑ Unflag' : '⚐ Flag as wrong'}
          </button>
          <button class="btn" onClick={() => toggleSuspended(word.id)}>
            {suspended ? 'Unhide' : 'Hide from study'}
          </button>
        </div>
      </div>
    </div>
  );
}
