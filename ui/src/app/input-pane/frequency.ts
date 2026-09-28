import { BAND_LIMITS_KHZ, Band } from "../../../../core/drivers/input";

// The widest band, used to infer the scale of bare digits.
const FM_LIMITS_KHZ = BAND_LIMITS_KHZ[Band.BAND_76_108];

export function formatMhz(frequencyKhz: number): string {
  return (frequencyKhz / 1000).toFixed(2);
}

// Parses a user-typed frequency into kHz, or returns null if it can't.
// Accepts MHz with a decimal point or comma ("94.8", "94,8"), or bare digits
// scaled to land in the FM band: "94" is 94 MHz, "948" and "9480" are
// 94.8 MHz, "94800" is in kHz. The candidate ranges never overlap.
export function parseFrequencyKhz(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (/^\d+\.\d*$/.test(s)) {
    return Math.round(Number.parseFloat(s) * 1000);
  }
  if (!/^\d+$/.test(s)) {
    return null;
  }
  const n = Number.parseInt(s);
  for (const scale of [1000, 100, 10, 1]) {
    const khz = n * scale;
    if (khz >= FM_LIMITS_KHZ.min && khz <= FM_LIMITS_KHZ.max) {
      return khz;
    }
  }
  return null;
}
