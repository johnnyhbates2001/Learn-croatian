// Croatian text-to-speech via the browser's built-in voices.
// On iPhone the Croatian voice ("Lana") may need downloading:
// Settings → Accessibility → Spoken Content → Voices → Croatian.
let voice: SpeechSynthesisVoice | null = null;
let ready: Promise<void> | null = null;

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

function pick() {
  const voices = synth()?.getVoices() ?? [];
  voice =
    voices.find((v) => v.lang.toLowerCase() === 'hr-hr') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('hr')) ??
    null;
}

export function initSpeech() {
  return (ready ??= new Promise<void>((resolve) => {
    const s = synth();
    if (!s) return resolve();
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

export function speak(text: string, rate = 0.9) {
  const s = synth();
  if (!s || !voice) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = rate;
  s.speak(u);
}
