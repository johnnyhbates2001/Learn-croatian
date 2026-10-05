import data from '../data/words.json';

export type Pos =
  | 'n-m' | 'n-f' | 'n-n' | 'n-pl'
  | 'v-ipf' | 'v-pf' | 'v-bi'
  | 'adj' | 'adv' | 'pron' | 'prep' | 'conj' | 'num' | 'part' | 'intj' | 'phr';

export interface Word {
  id: string;
  hr: string;
  en: string;
  pos: Pos;
  note?: string;
  ex?: [string, string];
  rank: number;
  /** Estimated share of everyday text this word accounts for (0..1). */
  cov: number;
}

export const WORDS = data as Word[];
export const WORD_BY_ID = new Map(WORDS.map((w) => [w.id, w]));
export const TOTAL_COVERAGE = WORDS.reduce((s, w) => s + w.cov, 0);

const POS_LABELS: Record<Pos, string> = {
  'n-m': 'noun · masculine',
  'n-f': 'noun · feminine',
  'n-n': 'noun · neuter',
  'n-pl': 'noun · plural',
  'v-ipf': 'verb · imperfective',
  'v-pf': 'verb · perfective',
  'v-bi': 'verb · both aspects',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  num: 'number',
  part: 'particle',
  intj: 'interjection',
  phr: 'phrase',
};

export const posLabel = (p: Pos) => POS_LABELS[p];

/** Short hint shown on English→Croatian cards so the expected form is unambiguous. */
export const posHint = (p: Pos) => {
  if (p.startsWith('n-')) return p === 'n-pl' ? 'noun (plural)' : `noun (${POS_LABELS[p].split(' · ')[1]})`;
  if (p.startsWith('v-')) return 'verb';
  return POS_LABELS[p];
};

/** The parts of a headword like "dobar / dobra / dobro". */
export const alternatives = (hr: string) => hr.split('/').map((s) => s.trim()).filter(Boolean);

/** Text to send to TTS: speak each alternative with a short pause. */
export const speakable = (hr: string) => alternatives(hr).join(', ');
