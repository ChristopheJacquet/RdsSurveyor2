import { BitStreamSynchronizer } from "./bitstream";

// This file is mostly a port of the code in RDS Surveyor v1.
// https://github.com/ChristopheJacquet/RdsSurveyor/blob/master/RDSSurveyor/src/eu/jacquet80/rds/input/AudioBitReader.java
// Copyright (c) 2015 Michael von Glasow
// Portions Copyright (c) Oona Räisänen OH2EIQ (windyoona@gmail.com)
// Used under the GNU Lesser Public License.

// Automatic Gain Control.
const AGC_ATTACK_TIME = 0.00001;
const AGC_RELEASE_TIME = 1;

// Filter coefficients.
const LP_2400_COEFFS_A = [
  1.0, -4.837342474770194, 9.362520173574179, -9.062853383573557,
  4.387535946426435, -0.8498599655283411];
const LP_2400_COEFFS_B = [
  9.254016278964494E-9, 4.627008139482247E-8, 9.254016278964494E-8,
  9.254016278964494E-8, 4.627008139482247E-8, 9.254016278964494E-9];
const LP_PLL_COEFFS_A = [1.0, -0.9461821078275034];
const LP_PLL_COEFFS_B = [0.026908946086248272, 0.026908946086248272];

const PLL_BETA = 5;    // Reduced 50 -> 5 to make the PLL more stable.

// Number of out symbols kept (for drawing the constellation diagram).
const SYNC_OUT_LENGTH = 100;

// Duration, in seconds, of the MPX sample window analyzed to compute the spectrum. Kept short
// since the FFT cost grows with window length, while the display (a few hundred pixels wide)
// can't show more detail than this already provides.
const SPECTRUM_WINDOW_DURATION = 0.25;

// How many times per second the spectrum is recomputed.
const SPECTRUM_UPDATES_PER_SECOND = 4;

// Highest frequency, in Hz, kept in the computed spectrum.
const SPECTRUM_MAX_FREQUENCY = 85000;

export class Demodulator {
  // Automatic Gain Control.
  private agcEnvelope = 0;

  // Subcarrier frequency.
  fSub: number;

  // Subcarrier to bitrate ratio, e.g. 57000/1187.5 = 48 for Stream 0.
  subcarrierBitrateRatio: number;

  // Oscillator frequency.
  fsc: number;

  // Subcarrier phase.
  subcarr_phi = 0;
  
  // Clock phase offset.
  clock_offset = 0;
  
  // Previous RDS clock.
  prevclock = 0;

  // Previous baseband sample (on the I axis).
  prev_bb = 0;
  
  acc = 0;
  
	// Demodulated sample from RDS data stream (NRZ-M encoded).
	private dbit = 0;

  // TODO: Make this a parameter.
  sampleRate = 250000;
  decimate = Math.floor(this.sampleRate / 7125);
  private decimPhase = 0;

	// Used by biphase().
	private prev_acc = 0;
	private counter = 0;
	private reading_frame = 0;
	private tot_errs = [0, 0];

  lp2400iFilter = new IirFilter(LP_2400_COEFFS_A, LP_2400_COEFFS_B);
  lp2400qFilter = new IirFilter(LP_2400_COEFFS_A, LP_2400_COEFFS_B);
  lpPllFilter = new IirFilter(LP_PLL_COEFFS_A, LP_PLL_COEFFS_B);

  syncOutI: number[] = [];
  syncOutQ: number[] = [];

  // Lock detection.
  sumDistI = 0;
  sumDistQ = 0;
  locked = false;

  bitstreamSynchronizer: BitStreamSynchronizer;

  constructor(subcarrierFreq: number, bitstreamSynchronizer: BitStreamSynchronizer) {
    this.fSub = subcarrierFreq;
    this.subcarrierBitrateRatio = subcarrierFreq / BIT_RATE;
    this.fsc = subcarrierFreq;
    this.bitstreamSynchronizer = bitstreamSynchronizer;
  }

  reset() {
    this.locked = false;
  }

  addSample(sample: number) {
    // Automatic Gain Control (AGC).
    const sampleAbs = Math.abs(sample);
    const coef = sampleAbs > this.agcEnvelope ? AGC_ATTACK_TIME : AGC_RELEASE_TIME;
    const alpha = Math.exp(-1.0 / (this.sampleRate * coef));
    this.agcEnvelope = (1.0 - alpha) * sampleAbs + alpha * this.agcEnvelope;
    const normSample = sample / (this.agcEnvelope + 1e-6);

    // Subcarrier downmix & phase recovery.
    this.subcarr_phi += 2 * Math.PI * this.fsc / this.sampleRate;
    const subcarr_bb_i = this.lp2400iFilter.step(normSample * Math.cos(this.subcarr_phi));
    const subcarr_bb_q = this.lp2400qFilter.step(normSample * Math.sin(this.subcarr_phi));

    const d_phi_sc = this.lpPllFilter.step(subcarr_bb_i * subcarr_bb_q);   // Subcarrier phase error.
    const err = Math.max(-0.05, Math.min(0.05, d_phi_sc));   // Clamp error to prevent jumps.
    this.subcarr_phi -= PLL_BETA * err;
    this.fsc -= 0.1 * PLL_BETA * err;    // Reduced 0.5 -> 0.1.

    // Decimate band-limited signal.
    if (this.decimPhase >= this.decimate) {
      this.decimPhase -= this.decimate;
      // Reset subcarrier frequency if it is outside tolerance range.
      if ((this.fsc > this.fSub + FC_TOLERANCE) || (this.fsc < this.fSub - FC_TOLERANCE)) {
        this.fsc = this.fSub;
      }

      // 1187.5 Hz clock.
      const clock_phi = this.subcarr_phi / this.subcarrierBitrateRatio + this.clock_offset;   // Clock phase.
      const lo_clock  = (clock_phi % (2 * Math.PI)) < Math.PI ? 1 : -1;

      // Clock phase recovery.
      if (sign(this.prev_bb) != sign(subcarr_bb_i)) {
        let d_cphi = clock_phi % Math.PI;   // Clock phase error.
        if (d_cphi >= (Math.PI / 2)) d_cphi -= Math.PI;
        this.clock_offset -= 0.005 * d_cphi;
      }

      // Correct I value: phase aligned projection instead of using subcarr_bb_i directly.
      const phase_err = Math.atan2(subcarr_bb_q, subcarr_bb_i);
      const i_corr = Math.cos(phase_err);

      // Biphase symbol integrate & dump.
      this.acc += i_corr * lo_clock;

      if (sign(lo_clock) != sign(this.prevclock)) {
        this.biphase(this.acc);
        this.acc = 0;

        this.syncOutI.push(subcarr_bb_i);
        this.syncOutQ.push(subcarr_bb_q);
        this.sumDistI += Math.abs(subcarr_bb_i);
        this.sumDistQ += Math.abs(subcarr_bb_q);
        if (this.syncOutI.length > SYNC_OUT_LENGTH) {
          const i = this.syncOutI.shift();
          const q = this.syncOutQ.shift();
          if (i != undefined && q != undefined) {
            this.sumDistI -= Math.abs(i);
            this.sumDistQ -= Math.abs(q);
          }
        }
        this.locked = (this.sumDistI - this.sumDistQ) / this.sumDistI >= 0.5;
    }

      this.prevclock = lo_clock;
      this.prev_bb = subcarr_bb_i;
    }
    
    this.decimPhase++;
  }

	/**
	 * Performs differential decoding and reports the new bit as received.
	 * 
	 * @param b The new bit received. If it is different from the last bit that was received, 1 is
	 * stored, else 0 is stored.
	 */
	private differentialDecodeAndReportBit(b: number) {
    this.bitstreamSynchronizer.addBit((b ^ this.dbit) != 0);
		this.dbit = b;
	}

	private biphase(acc: number) {
		if (sign(acc) != sign(this.prev_acc)) {
			this.tot_errs[this.counter % 2] ++;
		}

		if (this.counter % 2 == this.reading_frame) {
			this.differentialDecodeAndReportBit(sign(acc + this.prev_acc));
		}
		if (this.counter == 0) {
			if (this.tot_errs[1 - this.reading_frame] < this.tot_errs[this.reading_frame]) {
				this.reading_frame = 1 - this.reading_frame;
			}
			this.tot_errs[0] = 0;
			this.tot_errs[1] = 0;
		}

		this.prev_acc = acc;
		this.counter = (this.counter + 1) % 800;
	}
}

/**
 * Computes the spectrum of the raw MPX signal, using the FFT algorithm.
 *
 * Raw samples are accumulated into a ring buffer spanning SPECTRUM_WINDOW_DURATION seconds.
 * A few times per second, the FFT is computed over that buffer (windowed with a Hann window),
 * yielding a magnitude spectrum, expressed in dB, spanning 0 Hz to SPECTRUM_MAX_FREQUENCY. Bins
 * above SPECTRUM_MAX_FREQUENCY are not computed.
 */
export class SpectrumAnalyzer {
  // TODO: Make this a parameter.
  sampleRate = 250000;

  // Ring buffer holding the last SPECTRUM_WINDOW_DURATION seconds of raw MPX samples.
  private buffer: Float32Array;
  private writePos = 0;
  private filled = false;

  private samplesSinceLastUpdate = 0;
  private readonly updateIntervalSamples: number;

  // Latest computed magnitude spectrum, in dB, spanning 0 Hz to sampleRate / 2.
  spectrum: Float32Array;

  // Reusable scratch buffers for computeSpectrum(), to avoid reallocating on every update.
  private re: Float64Array;
  private im: Float64Array;

  // Precomputed twiddle factors for the FFT, since the transform size never changes.
  private cosTable: Float64Array;
  private sinTable: Float64Array;

  constructor() {
    const windowLength = Math.round(this.sampleRate * SPECTRUM_WINDOW_DURATION);
    // Use the largest power of two that fits within the window, so the FFT can run
    // without needing to zero-pad a very large buffer.
    this.buffer = new Float32Array(largestPowerOfTwoAtMost(windowLength));
    const nyquistBins = this.buffer.length / 2;
    const maxBins = Math.ceil((SPECTRUM_MAX_FREQUENCY / (this.sampleRate / 2)) * nyquistBins);
    this.spectrum = new Float32Array(Math.min(nyquistBins, maxBins));
    this.updateIntervalSamples = Math.round(this.sampleRate / SPECTRUM_UPDATES_PER_SECOND);

    this.re = new Float64Array(this.buffer.length);
    this.im = new Float64Array(this.buffer.length);
    const twiddles = computeTwiddleFactors(this.buffer.length);
    this.cosTable = twiddles.cosTable;
    this.sinTable = twiddles.sinTable;
  }

  reset() {
    this.buffer.fill(0);
    this.writePos = 0;
    this.filled = false;
    this.samplesSinceLastUpdate = 0;
    this.spectrum.fill(0);
  }

  // Appends samples[0..length) to the ring buffer. Writes happen in bulk (via
  // TypedArray.set()) rather than one sample at a time, since with hundreds of thousands of
  // samples per second, the per-call overhead of a JS function invoked once per sample is
  // itself significant.
  addSamples(samples: Float32Array, length: number) {
    let offset = 0;
    while (offset < length) {
      const spaceToWrap = this.buffer.length - this.writePos;
      const spaceToUpdate = this.updateIntervalSamples - this.samplesSinceLastUpdate;
      const chunk = Math.min(length - offset, spaceToWrap, spaceToUpdate);

      this.buffer.set(samples.subarray(offset, offset + chunk), this.writePos);
      this.writePos += chunk;
      this.samplesSinceLastUpdate += chunk;
      offset += chunk;

      if (this.writePos >= this.buffer.length) {
        this.writePos = 0;
        this.filled = true;
      }
      if (this.samplesSinceLastUpdate >= this.updateIntervalSamples) {
        this.samplesSinceLastUpdate = 0;
        if (this.filled) {
          this.computeSpectrum();
        }
      }
    }
  }

  private computeSpectrum() {
    const n = this.buffer.length;
    const re = this.re;
    const im = this.im;

    // Copy the buffer in chronological order, applying a Hann window.
    for (let i = 0; i < n; i++) {
      const idx = (this.writePos + i) % n;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      re[i] = this.buffer[idx] * window;
      im[i] = 0;
    }

    fft(re, im, this.cosTable, this.sinTable);

    // Only the bins up to SPECTRUM_MAX_FREQUENCY are kept (the FFT itself, an inherently
    // all-at-once transform, still computes every bin up to the Nyquist frequency).
    for (let bin = 0; bin < this.spectrum.length; bin++) {
      const magnitude = Math.hypot(re[bin], im[bin]);
      this.spectrum[bin] = 20 * Math.log10(magnitude + 1e-9);
    }
  }
}

function largestPowerOfTwoAtMost(n: number): number {
  return 1 << (31 - Math.clz32(n));
}

// The IirFilter class was adapted from
// https://github.com/chdh/dsp-collection-java/blob/master/src/main/java/biz/source_code/dsp/filter/IirFilter.java
// Original code copyright 2013 Christian d'Heureuse, Inventec Informatik AG, Zurich, Switzerland.
// Used under the GNU Lesser General Public License, V2.1 or later.
class IirFilter {
  n1: number;   // Size of input delay line.
  n2: number;   // Size of output delay line.
  a: Array<number>;   // A coefficients, applied to output values (negative).
  b: Array<number>;   // B coefficients, applied to input values.
  
  buf1: Array<number>;   // Input signal delay line (ring buffer).
  buf2: Array<number>;   // Output signal delay line (ring buffer).
  pos1 = 0;   // Current ring buffer position in buf1.
  pos2 = 0;   // Current ring buffer position in buf2.
  
  /**
  * Creates an IIR filter.
  *
  * @param coeffs
  *    The A and B coefficients. a[0] must be 1.
  **/
  constructor(coeffsA: Array<number>, coeffsB: Array<number>) {
    if (coeffsA.length < 1 || coeffsB.length < 1 || coeffsA[0] != 1.0) {
      throw "Invalid coefficients.";
    }
    this.a = coeffsA;
    this.b = coeffsB;
    this.n1 = coeffsB.length - 1;
    this.n2 = coeffsA.length - 1;
    this.buf1 = new Array<number>(this.n1);
    this.buf1.fill(0);
    this.buf2 = new Array<number>(this.n2);
    this.buf2.fill(0);
  }
  
  public step(inputValue: number): number {
    let acc = this.b[0] * inputValue;
    for (let j = 1; j <= this.n1; j++) {
      let p = this.pos1 + this.n1 - j;
      // Efficient modulo.
      while (p >= this.n1) {
        p -= this.n1;
      }
      acc += this.b[j] * this.buf1[p];
    }

    for (let j = 1; j <= this.n2; j++) {
      let p = this.pos2 + this.n2 - j;
      // Efficient modulo.
      while (p >= this. n2) {
        p -= this.n2;
      }
      acc -= this.a[j] * this.buf2[p];
    }
    
    if (this.n1 > 0) {
      this.buf1[this.pos1] = inputValue;
      this.pos1 = (this.pos1 + 1) % this.n1;
    }
    if (this.n2 > 0) {
      this.buf2[this.pos2] = acc;
      this.pos2 = (this.pos2 + 1) % this.n2;
    }
    return acc;
  }
}

/**
 * Precomputes the twiddle factors (e^(-2*pi*i*k/n), for k = 0..n/2-1) used by fft() for a
 * transform of size n, so that fft() can be called repeatedly on same-sized inputs without
 * recomputing trigonometric functions every time.
 */
function computeTwiddleFactors(n: number): { cosTable: Float64Array; sinTable: Float64Array } {
  const half = n / 2;
  const cosTable = new Float64Array(half);
  const sinTable = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    const angle = (-2 * Math.PI * k) / n;
    cosTable[k] = Math.cos(angle);
    sinTable[k] = Math.sin(angle);
  }
  return { cosTable, sinTable };
}

/**
 * Computes, in place, the iterative radix-2 Cooley-Tukey FFT of a complex signal whose length
 * must be a power of two, using twiddle factors precomputed by computeTwiddleFactors(re.length).
 */
function fft(re: Float64Array, im: Float64Array, cosTable: Float64Array, sinTable: Float64Array) {
  const n = re.length;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const wRe = cosTable[k * stride];
        const wIm = sinTable[k * stride];
        const evenIndex = i + k;
        const oddIndex = i + k + halfLen;
        const oddRe = re[oddIndex] * wRe - im[oddIndex] * wIm;
        const oddIm = re[oddIndex] * wIm + im[oddIndex] * wRe;
        re[oddIndex] = re[evenIndex] - oddRe;
        im[oddIndex] = im[evenIndex] - oddIm;
        re[evenIndex] += oddRe;
        im[evenIndex] += oddIm;
      }
    }
  }
}

// RDS carrier frequencies.
export const FREQ_STREAM_0 = 57000.0;
export const FREQ_STREAM_1 = 66500.0;
export const FREQ_STREAM_2 = 71250.0;
export const FREQ_STREAM_3 = 76000.0;

export const FREQ_STREAMS = [
  FREQ_STREAM_0,
  FREQ_STREAM_1,
  FREQ_STREAM_2,
  FREQ_STREAM_3,
];

/** 
 * Tolerance of RDS subcarrier frequency.
 * As per the specs, tolerance is +/- 6 Hz. We use twice the value to allow for some tolerance
 * in the processing chain.
 */
const FC_TOLERANCE = 12.0;

const BIT_RATE = 1187.5;

function sign(a: number) {
  return (a >= 0 ? 1 : 0);
}
