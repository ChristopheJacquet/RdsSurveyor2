import { formatMhz, parseFrequencyKhz } from './frequency';

describe('parseFrequencyKhz', () => {
  it('parses MHz with a decimal point or comma', () => {
    expect(parseFrequencyKhz('94.8')).toBe(94800);
    expect(parseFrequencyKhz('94,8')).toBe(94800);
    expect(parseFrequencyKhz(' 101.15 ')).toBe(101150);
    expect(parseFrequencyKhz('94.')).toBe(94000);
  });

  it('infers the scale of bare digits', () => {
    expect(parseFrequencyKhz('94')).toBe(94000);
    expect(parseFrequencyKhz('101')).toBe(101000);
    expect(parseFrequencyKhz('948')).toBe(94800);
    expect(parseFrequencyKhz('1011')).toBe(101100);
    expect(parseFrequencyKhz('9480')).toBe(94800);
    expect(parseFrequencyKhz('10110')).toBe(101100);
    expect(parseFrequencyKhz('94800')).toBe(94800);
  });

  it('rejects garbage and out-of-band digits', () => {
    expect(parseFrequencyKhz('')).toBeNull();
    expect(parseFrequencyKhz('abc')).toBeNull();
    expect(parseFrequencyKhz('9.4.8')).toBeNull();
    expect(parseFrequencyKhz('50')).toBeNull();
    expect(parseFrequencyKhz('1100')).toBeNull();
  });
});

describe('formatMhz', () => {
  it('formats with two decimals', () => {
    expect(formatMhz(94800)).toBe('94.80');
  });
});
