// Croatian text-to-speech via the browser's built-in voices.
// On iPhone the Croatian voice ("Lana") may need downloading:
// Settings → Accessibility → Spoken Content → Voices → Croatian.
let voice: SpeechSynthesisVoice | null = null;
let ready: Promise<void> | null = null;
let unlocked = false;
/** A real (non-unlock) utterance is queued or playing. */
let busy = false;
/** Keep a reference so the utterance isn't garbage-collected mid-speech (Chrome drops it otherwise). */
let current: SpeechSynthesisUtterance | null = null;

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

/** Android reports "hr_HR"; normalise to a BCP 47 tag. */
const tag = (lang: string) => lang.replace('_', '-');

function pick() {
  const voices = synth()?.getVoices() ?? [];
  voice =
    voices.find((v) => tag(v.lang).toLowerCase() === 'hr-hr') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('hr')) ??
    null;
}

/**
 * iOS only plays speech once it has been started from a tap, and Safari can route web audio
 * through the ringer (muted by the silent switch). On the first tap anywhere, speak a silent
 * utterance and ask for the media audio channel, so later auto-play and taps are heard.
 */
function unlock() {
  if (unlocked) return;
  unlocked = true;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  try {
    if (session) session.type = 'playback';
  } catch {
    // Not supported: nothing to do.
  }
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  s.speak(u);
}

export function initSpeech() {
  return (ready ??= new Promise<void>((resolve) => {
    const s = synth();
    if (!s) return resolve();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, once: true });
    pick();
    if (voice) return resolve();
    s.addEventListener?.('voiceschanged', () => {
      pick();
      resolve();
    });
    // Some browsers never fire voiceschanged; don't wait forever.
    setTimeout(resolve, 1500);
  }));
}

export const hasCroatianVoice = () => !!voice;
export const voiceName = () => voice?.name ?? null;

function utter(text: string, rate: number, withVoice: boolean) {
  const s = synth()!;
  const u = new SpeechSynthesisUtterance(text);
  // Voice objects can go stale when the list reloads; look ours up again.
  const v = withVoice && voice ? (s.getVoices().find((x) => x.voiceURI === voice!.voiceURI) ?? voice) : null;
  if (v) u.voice = v;
  u.lang = v ? tag(v.lang) : 'hr-HR';
  u.rate = rate;
  let started = false;
  let blocked = false;
  u.onstart = () => (started = true);
  u.onend = () => {
    if (current === u) busy = false;
  };
  u.onerror = (e) => {
    if (current === u) busy = false;
    blocked = e.error === 'not-allowed';
  };
  // If the chosen voice silently fails to start, try once more letting the system pick the Croatian voice.
  if (withVoice)
    setTimeout(() => {
      if (!started && !blocked && current === u) {
        s.cancel();
        sayLater(utter(text, rate, false));
      }
    }, 1500);
  return u;
}

function say(u: SpeechSynthesisUtterance) {
  const s = synth()!;
  current = u;
  busy = true;
  s.speak(u);
}

/** Speaking straight after cancel() is dropped by Safari and Chrome, so give it a moment. */
function sayLater(u: SpeechSynthesisUtterance) {
  current = u;
  setTimeout(() => current === u && say(u), 80);
}

export function speak(text: string, rate = 0.9) {
  const s = synth();
  if (!s || !voice) return;
  unlock();
  // A stuck (paused) engine swallows new utterances.
  if (s.paused) s.resume();
  const u = utter(text, rate, true);
  // Only interrupt our own speech; the silent unlock utterance can just play out first.
  if (busy) {
    s.cancel();
    sayLater(u);
  } else say(u);
}
