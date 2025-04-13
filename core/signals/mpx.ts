import { BitStreamSynchronizer } from "./bitstream";

// This file is mostly a port of the code in RDS Surveyor v1.
// https://github.com/ChristopheJacquet/RdsSurveyor/blob/master/RDSSurveyor/src/eu/jacquet80/rds/input/AudioBitReader.java
// Copyright (c) 2015 Michael von Glasow
// Portions Copyright (c) Oona Räisänen OH2EIQ (windyoona@gmail.com)
// Used under the GNU Lesser Public License.

// Filter coefficients.
const LP_2400_COEFFS_A = [
  1.0, -4.837342474770194, 9.362520173574179, -9.062853383573557,
  4.387535946426435, -0.8498599655283411];
const LP_2400_COEFFS_B = [
  9.254016278964494E-9, 4.627008139482247E-8, 9.254016278964494E-8,
  9.254016278964494E-8, 4.627008139482247E-8, 9.254016278964494E-9];
const LP_PLL_COEFFS_A = [1.0, -0.9461821078275034];
const LP_PLL_COEFFS_B = [0.026908946086248272, 0.026908946086248272];

const PLL_BETA = 50;

// Number of out symbols kept (for drawing the constellation diagram).
const SYNC_OUT_LENGTH = 100;

export class Demodulator {
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
  
  numsamples = 0;

	// Demodulated sample from RDS data stream (NRZ-M encoded).
	private dbit = 0;

  // TODO: Make this a parameter.
  sampleRate = 250000;
  decimate = Math.floor(this.sampleRate / 7125);

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

  addSample(sample: number) {
    // Subcarrier downmix & phase recovery.
    this.subcarr_phi += 2 * Math.PI * this.fsc / this.sampleRate;
    const subcarr_bb_i = this.lp2400iFilter.step(sample /* / 32768.0*/ * Math.cos(this.subcarr_phi));
    const subcarr_bb_q = this.lp2400qFilter.step(sample /* / 32768.0*/ * Math.sin(this.subcarr_phi));

    const d_phi_sc = this.lpPllFilter.step(subcarr_bb_i * subcarr_bb_q);   // Subcarrier phase error.
    this.subcarr_phi -= PLL_BETA * d_phi_sc;
    this.fsc -= 0.5 * PLL_BETA * d_phi_sc;

    // Decimate band-limited signal.
    if (this.numsamples % this.decimate == 0) {
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

      // Biphase symbol integrate & dump.
      this.acc += subcarr_bb_i * lo_clock;

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
    
    this.numsamples++;
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
