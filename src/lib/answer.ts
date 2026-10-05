import { alternatives } from './words';

export type AnswerResult = 'correct' | 'accents' | 'typo' | 'wrong';

/** Lowercase, drop punctuation, collapse whitespace. Keeps diacritics. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,!?;:"'“”„()\-—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Remove Croatian diacritics: č ć → c, š → s, ž → z, đ → dj (also accepts d). */
export const fold = (s: string) =>
  s
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Accepted spellings for a headword, e.g. "bojati se" also accepts "bojati". */
function accepted(hr: string): string[] {
  const out = new Set<string>();
  for (const alt of [hr, ...alternatives(hr)]) {
    const n = normalize(alt);
    out.add(n);
    if (n.endsWith(' se')) out.add(n.slice(0, -3));
  }
  return [...out];
}

export function checkAnswer(input: string, hr: string): AnswerResult {
  const given = normalize(input);
  if (!given) return 'wrong';
  const targets = accepted(hr);
  if (targets.includes(given)) return 'correct';
  const g = fold(given);
  const gd = g.replace(/dj/g, 'd');
  if (targets.some((t) => fold(t) === g || fold(t).replace(/dj/g, 'd') === gd)) return 'accents';
  if (targets.some((t) => t.length >= 5 && levenshtein(fold(t), g) <= 1)) return 'typo';
  return 'wrong';
}
