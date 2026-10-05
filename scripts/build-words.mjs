// Converts data/words.txt into src/data/words.json.
// IDs are derived from the Croatian headword (not the line number) so that
// reordering or inserting words never breaks saved progress.
import { readFileSync, writeFileSync } from 'node:fs';

const POS = new Set(['n-m', 'n-f', 'n-n', 'n-pl', 'v-ipf', 'v-pf', 'v-bi', 'adj', 'adv', 'pron', 'prep', 'conj', 'num', 'part', 'intj', 'phr']);
// Approximate share of everyday (spoken) text covered by the top 1000 lemmas.
const TOP_1000_COVERAGE = 0.78;

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const lines = readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8').split('\n');
const words = [];
const ids = new Set();
const errors = [];

lines.forEach((line, i) => {
  if (!line.trim() || line.startsWith('#')) return;
  const f = line.split('|').map((s) => s.trim());
  if (f.length !== 6) return errors.push(`line ${i + 1}: expected 6 fields, got ${f.length}`);
  const [hr, en, pos, note, exHr, exEn] = f;
  if (!POS.has(pos)) errors.push(`line ${i + 1}: unknown pos "${pos}"`);
  if (!hr || !en) errors.push(`line ${i + 1}: missing hr/en`);
  let id = slug(hr);
  if (ids.has(id)) id = `${id}-${slug(pos)}`;
  if (ids.has(id)) return errors.push(`line ${i + 1}: duplicate id "${id}"`);
  ids.add(id);
  words.push({ id, hr, en, pos, ...(note && { note }), ...(exHr && { ex: [exHr, exEn] }) });
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// Zipf–Mandelbrot weights: f(r) ∝ 1 / (r + 2.7). Normalised so the first 1000 sum to TOP_1000_COVERAGE.
const raw = words.map((_, r) => 1 / (r + 1 + 2.7));
const top = raw.slice(0, 1000).reduce((a, b) => a + b, 0);
words.forEach((w, r) => {
  w.rank = r + 1;
  w.cov = Number(((raw[r] / top) * TOP_1000_COVERAGE).toFixed(6));
});

writeFileSync(new URL('../src/data/words.json', import.meta.url), JSON.stringify(words));
console.log(`words.json: ${words.length} words`);
