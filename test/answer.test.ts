import { describe, expect, it } from 'vitest';
import { checkAnswer, fold } from '../src/lib/answer';

describe('checkAnswer', () => {
  it('accepts the exact word, ignoring case and punctuation', () => {
    expect(checkAnswer('Kuća', 'kuća')).toBe('correct');
    expect(checkAnswer('  kuća! ', 'kuća')).toBe('correct');
  });
  it('accepts any of the slash-separated alternatives', () => {
    expect(checkAnswer('dobra', 'dobar / dobra / dobro')).toBe('correct');
    expect(checkAnswer('dobar / dobra / dobro', 'dobar / dobra / dobro')).toBe('correct');
  });
  it('makes the reflexive "se" optional', () => {
    expect(checkAnswer('bojati', 'bojati se')).toBe('correct');
    expect(checkAnswer('bojati se', 'bojati se')).toBe('correct');
  });
  it('flags missing diacritics separately', () => {
    expect(checkAnswer('kuca', 'kuća')).toBe('accents');
    expect(checkAnswer('dosao', 'došao')).toBe('accents');
    expect(checkAnswer('dodji', 'dođi')).toBe('accents');
    expect(checkAnswer('dodi', 'dođi')).toBe('accents');
  });
  it('tolerates a single typo on longer words only', () => {
    expect(checkAnswer('prijatel', 'prijatelj')).toBe('typo');
    expect(checkAnswer('kuda', 'kuća')).toBe('wrong');
  });
  it('rejects wrong or empty answers', () => {
    expect(checkAnswer('', 'kuća')).toBe('wrong');
    expect(checkAnswer('stan', 'kuća')).toBe('wrong');
  });
  it('folds Croatian letters', () => {
    expect(fold('čćšžđ')).toBe('ccszdj');
  });
});
