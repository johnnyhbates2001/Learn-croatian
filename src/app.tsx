import { useEffect, useState } from 'preact/hooks';
import { loadAll } from './lib/store';
import { useStore } from './lib/hooks';
import { initSpeech } from './lib/speech';
import { reconcileStreak } from './lib/progress';
import { checkAchievements } from './lib/achievements';
import { sync } from './lib/sync';
import { toast } from './lib/ui';
import { Home } from './screens/Home';
import { Study } from './screens/Study';
import { Words } from './screens/Words';
import { Stats } from './screens/Stats';
import { Settings } from './screens/Settings';
import { Toasts } from './components/Toasts';

export type Tab = 'home' | 'words' | 'stats' | 'settings';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Today' },
  { id: 'words', icon: '📖', label: 'Words' },
  { id: 'stats', icon: '📊', label: 'Progress' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

function afterLoad() {
  const frozen = reconcileStreak();
  if (frozen) toast('🧊', 'Streak saved!', `Used ${frozen} streak freeze${frozen > 1 ? 's' : ''} for missed days.`, 5000);
  checkAchievements();
}

export function App() {
  useStore();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [studying, setStudying] = useState<null | { extraNew: number }>(null);

  useEffect(() => {
    (async () => {
      await loadAll();
      afterLoad();
      setReady(true);
      initSpeech();
      // Pull changes from other devices, then re-check streak (remote days may fill gaps).
      if (await sync()) afterLoad();
    })();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') sync();
      else sync().then((r) => r && afterLoad());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!ready) return <div class="splash">Riječi</div>;

  if (studying)
    return (
      <>
        <Study
          extraNew={studying.extraNew}
          onExit={() => {
            setStudying(null);
            sync();
          }}
        />
        <Toasts />
      </>
    );

  return (
    <div class="shell">
      <main class="screen">
        {tab === 'home' && <Home onStudy={(extraNew = 0) => setStudying({ extraNew })} />}
        {tab === 'words' && <Words />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span class="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
