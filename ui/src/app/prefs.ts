import { signal, WritableSignal } from '@angular/core';

export type PrefControl<T> =
  | { kind: 'choice', choices: { value: T, label: string }[] }
  | { kind: 'boolean' }
  | { kind: 'slider', min: number, max: number, unit: string }
  | { kind: 'number' };

// A value persisted in local storage. Reading `value` inside an effect()
// subscribes to changes, whether they come from the main UI or the
// preferences dialog.
export class Pref<T> {
  private readonly state: WritableSignal<T>;

  constructor(
      readonly key: string,
      defaultValue: T,
      readonly title = '',
      readonly control?: PrefControl<T>) {
    const stored = localStorage[key];
    this.state = signal(stored != undefined ? JSON.parse(stored) : defaultValue);
  }

  get value(): T {
    return this.state();
  }

  set value(value: T) {
    localStorage[this.key] = JSON.stringify(value);
    this.state.set(value);
  }
}

const choices = <T>(...c: [T, string][]) =>
  ({ kind: 'choice' as const, choices: c.map(([value, label]) => ({ value, label })) });

// All user-facing preferences, in the order shown in the preferences dialog.
export const prefs = {
  rdsVariant: new Pref('pref.rds_variant', 'rds', 'Standard',
    choices(['rds', 'RDS'], ['rbds', 'RBDS'])),
  statsUi: new Pref('pref.stats_ui', 'used_groups_channels', 'Group statistics',
    choices(['all_groups', 'All groups'], ['used_groups_channels', 'Received only'])),
  maxErrors: new Pref('pref.max_errors', 0, 'Max corrected bit errors per block',
    { kind: 'choice', choices: [0, 1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n}` })) }),
  playbackSpeed: new Pref('pref.playback_speed', 'fast', 'File playback speed',
    choices(['fast', 'Fast'], ['realtime', 'Real time'])),
  autoPauseOnStationChange: new Pref('pref.auto_pause_on_station_change', false,
    'Auto-pause file playback on station change', { kind: 'boolean' }),
  volume: new Pref('pref.volume', 100, 'MPX audio volume',
    { kind: 'slider', min: 0, max: 100, unit: '%' }),
  preemphasis: new Pref('pref.preemphasis', 50, 'MPX audio de-emphasis',
    choices<number>([50, '50 μs'], [75, '75 μs'])),
  rtlSdrAgc: new Pref('pref.rtlsdr_agc', true, 'RTL-SDR AGC', { kind: 'boolean' }),
  rtlSdrGain: new Pref('pref.rtlsdr_gain', 10, 'RTL-SDR gain',
    { kind: 'slider', min: 0, max: 50, unit: 'dB' }),
  rtlSdrPpm: new Pref('pref.rtlsdr_ppm', 0, 'RTL-SDR frequency correction (ppm)',
    { kind: 'number' }),
};
