import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../lib/hooks';
import { getSettings, saveSettings, type Settings as S } from '../lib/progress';
import { clearProgress, dirtyRecords, exportRecords, importRecords } from '../lib/store';
import { getSyncState, resetRemote, setToken, sync, testConnection } from '../lib/sync';
import { hasCroatianVoice, initSpeech, speak, voiceName } from '../lib/speech';
import { WORD_BY_ID } from '../lib/words';
import { getFlags } from './Words';
import { toast } from '../lib/ui';

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="setting">
      <div>
        <div>{label}</div>
        {hint && <div class="muted small">{hint}</div>}
      </div>
      <input type="checkbox" class="switch" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

function Stepper({ label, value, options, onChange, unit }: { label: string; value: number; options: number[]; onChange: (v: number) => void; unit?: string }) {
  return (
    <div class="setting">
      <div>{label}</div>
      <div class="segmented">
        {options.map((o) => (
          <button key={o} class={o === value ? 'active' : ''} onClick={() => onChange(o)}>
            {o}
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  useStore();
  const s = getSettings();
  const set = (patch: Partial<S>) => saveSettings(patch);
  const syncState = getSyncState();
  const [tokenInput, setTokenInput] = useState(syncState.token ?? '');
  const [busy, setBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(hasCroatianVoice());
  const pending = dirtyRecords().length;

  useEffect(() => {
    initSpeech().then(() => setVoiceReady(hasCroatianVoice()));
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await testConnection(tokenInput.trim());
      setToken(tokenInput);
      toast('☁️', 'Connected', `${res.records} records on the server. Syncing…`);
      const r = await sync();
      if (r) toast('✅', 'Synced', `Sent ${r.pushed}, received ${r.pulled}.`);
    } catch (e) {
      toast('⚠️', 'Could not connect', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    const r = await sync();
    setBusy(false);
    if (r) toast('✅', 'Synced', `Sent ${r.pushed}, received ${r.pulled}.`);
    else toast('⚠️', 'Sync failed', getSyncState().lastError ?? 'Offline?');
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify({ app: 'learn-croatian', version: 1, exportedAt: new Date().toISOString(), records: exportRecords() })], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rijeci-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (json.app !== 'learn-croatian' || !Array.isArray(json.records)) throw new Error('Not a Riječi backup file');
      if (!confirm(`Replace all progress with this backup (${json.records.length} records)?`)) return;
      await importRecords(json.records);
      toast('✅', 'Backup restored');
      sync();
    } catch (e) {
      toast('⚠️', 'Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const doReset = async () => {
    if (!confirm('Delete ALL progress on this device' + (syncState.token ? ' and on the server' : '') + '? This cannot be undone.')) return;
    try {
      await resetRemote();
    } catch (e) {
      toast('⚠️', 'Could not reset server', e instanceof Error ? e.message : String(e));
      return;
    }
    await clearProgress();
    toast('🧹', 'Progress reset');
  };

  const copyFlags = async () => {
    const lines = [...getFlags()].map((id) => WORD_BY_ID.get(id)).filter(Boolean).map((w) => `${w!.hr} | ${w!.en} | ${w!.note ?? ''}`);
    if (!lines.length) return toast('⚐', 'No flagged words', 'Flag words from the Words tab.');
    await navigator.clipboard?.writeText(lines.join('\n'));
    toast('📋', `Copied ${lines.length} flagged words`);
  };

  return (
    <div class="settings">
      <header class="topbar">
        <h1>Settings</h1>
      </header>

      <section class="card">
        <h3>Study</h3>
        <Stepper label="New words per day" value={s.newPerDay} options={[5, 10, 15, 20, 30]} onChange={(v) => set({ newPerDay: v })} />
        <Stepper label="Daily XP goal" value={s.dailyGoal} options={[50, 100, 150, 250]} onChange={(v) => set({ dailyGoal: v })} />
        <Toggle label="Type answers" hint="Type the Croatian word on English → Croatian cards. Off = flip and self-grade." value={s.typing} onChange={(v) => set({ typing: v })} />
      </section>

      <section class="card">
        <h3>Audio</h3>
        <Toggle label="Auto-play pronunciation" value={s.autoplay} onChange={(v) => set({ autoplay: v })} />
        <Toggle label="Listening drills" hint="Sometimes hear a word without seeing it." value={s.listening} onChange={(v) => set({ listening: v })} />
        <div class="setting">
          <div>
            <div>Croatian voice</div>
            <div class="muted small">{voiceReady ? voiceName() : 'Not found on this device'}</div>
          </div>
          <button class="btn" disabled={!voiceReady} onClick={() => speak('Dobar dan! Kako ste?')}>
            Test
          </button>
        </div>
        {!voiceReady && (
          <p class="muted small">
            On iPhone: Settings → Accessibility → Spoken Content → Voices → Croatian, download “Lana”, then restart the app.
          </p>
        )}
      </section>

      <section class="card">
        <h3>Sync &amp; backup</h3>
        <p class="muted small">
          Progress is saved on this device and synced to your Cloudflare D1 database. Enter the <code>SYNC_TOKEN</code> you set on the Worker.
        </p>
        <div class="type-row">
          <input class="type-input" type="password" placeholder="Sync token" value={tokenInput} onInput={(e) => setTokenInput((e.target as HTMLInputElement).value)} autocomplete="off" />
          <button class="btn primary" disabled={busy || !tokenInput.trim()} onClick={connect}>
            {syncState.token && syncState.token === tokenInput.trim() ? 'Reconnect' : 'Connect'}
          </button>
        </div>
        {syncState.token && (
          <div class="setting">
            <div>
              <div>{syncState.lastError ? `⚠️ ${syncState.lastError}` : syncState.lastSyncAt ? '✅ Synced' : 'Not synced yet'}</div>
              <div class="muted small">
                {syncState.lastSyncAt ? `Last sync ${new Date(syncState.lastSyncAt).toLocaleString()}` : ''}
                {pending ? ` · ${pending} change${pending > 1 ? 's' : ''} waiting` : ''}
              </div>
            </div>
            <button class="btn" disabled={busy} onClick={syncNow}>
              Sync now
            </button>
          </div>
        )}
        <div class="btn-row">
          <button class="btn" onClick={doExport}>
            Export backup
          </button>
          <label class="btn">
            Import backup
            <input type="file" accept="application/json" hidden onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) doImport(f);
              (e.target as HTMLInputElement).value = '';
            }} />
          </label>
        </div>
      </section>

      <section class="card">
        <h3>Word list</h3>
        <p class="muted small">Spotted a mistake? Flag the word in the Words tab, then copy the list here to fix in <code>data/words.txt</code>.</p>
        <button class="btn" onClick={copyFlags}>
          Copy flagged words
        </button>
      </section>

      <section class="card danger">
        <h3>Danger zone</h3>
        <button class="btn danger" onClick={doReset}>
          Reset all progress
        </button>
      </section>

      <p class="muted small center">Riječi · {WORD_BY_ID.size} words · install via Share → Add to Home Screen</p>
    </div>
  );
}
