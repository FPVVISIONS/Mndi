import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('drops the local 0 after the country code', () => {
    expect(normalizePhone('+9720552481897')).toBe('+972552481897');
    expect(normalizePhone('+972 055-248-1897')).toBe('+972552481897');
    expect(normalizePhone('00447700900123')).toBe('+447700900123');
    expect(normalizePhone('+4407700900123')).toBe('+447700900123');
  });
  it('leaves correct numbers alone', () => {
    expect(normalizePhone('+972552481897')).toBe('+972552481897');
    expect(normalizePhone('+15550100199')).toBe('+15550100199');
    expect(normalizePhone('+390612345678')).toBe('+390612345678');
  });
});
