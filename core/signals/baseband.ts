import { RdsReportEventListener } from "../drivers/input";
import { BitStreamSynchronizer } from "./bitstream";

// Credits go to Marc Lichtman, the author of the awesome Software-Defined-Radio
// textbook PySDR. The Demodulator code in this file is strongly inspired by the
// RDS end-to-end example in PySDR.
// PySDR: https://pysdr.org/  -  https://github.com/777arc/PySDR
// RDS end-to-end example in PySDR: https://pysdr.org/content/rds.html

export class Demodulator {
  sampleIndex = 0;
  sampleRate = 250000;
  last: Buffer = new Buffer(LP_FILTER_COEFFS.length);

  sps = this.sampleRate / 1187.5;       // Samples per symbol.
  mu = 0.01                             // Phase estimate; that's the sampleIndex we read symbols at.
  outI: number[] = [0, 0];              // Output "soft symbols", real part.
  outQ: number[] = [0, 0];              // Output "soft symboles", imaginary part.
  outRailI: number[] = [0, 0, 0];       // Past values, real part.
  outRailQ: number[] = [0, 0, 0];       // Past values, imaginary part.
  syncOutI: number[] = [0, 0];
  syncOutQ: number[] = [0, 0];

  // Costas loop.
  costasPhase = 0;
  costasFreq = 0;
  costasAlpha = 8.0;
  costasBeta = 0.02;

  // Bit stream.
  prevBit: boolean = false;
  bitstreamSynchronizer: BitStreamSynchronizer;

  constructor(bitstreamSynchronizer: BitStreamSynchronizer) {
    this.bitstreamSynchronizer = bitstreamSynchronizer;
  }

  addSample(sample: number) {
    const carrierFreq = 57000;
    const demI = sample * Math.cos(2 * Math.PI * carrierFreq / this.sampleRate * this.sampleIndex);
    const demQ = sample * Math.sin(2 * Math.PI * carrierFreq / this.sampleRate * this.sampleIndex);

    this.last.addSample(demI, demQ);
    let [inI, inQ] = this.last.applyFilter(LP_FILTER_COEFFS);
    let symbolSampled = false;

    // Is it time to sample a new symbol? In this section, we not only read the
    // symbol, but also update the control loops, decode bits and send them to
    // the bitstream synchronize.
    if (this.sampleIndex == Math.floor(this.mu)) {
      /*** Symbol sampling using the Mueller and Muller algorithm. ***/
      // Grab sample.
      this.outI.push(inI);
      this.outQ.push(inQ);
      symbolSampled = true;

      this.outRailI.shift();
      this.outRailI.push(inI > 0 ? 1 : 0);
      this.outRailQ.shift();
      this.outRailQ.push(inQ > 0 ? 1 : 0);

      // Note: we only need the real part.
      const xI = (this.outRailI[2] - this.outRailI[0]) * this.outRailI[1]
        - (this.outRailQ[2] - this.outRailQ[0]) * this.outRailQ[1];
      
      // Note: we only need the real part.
      const yI = (this.outI[this.outI.length-1] - this.outI[this.outI.length-1-2]) * this.outRailI[1]
        - (this.outQ[this.outQ.length-1] - this.outQ[this.outQ.length-1-2]) * this.outRailQ[1];

      const mm_val = yI - xI;
      this.mu += this.sps + 0.01 * mm_val;

      // We're not removing what we have "consumed" of mu because we do not
      // sample symbols at integer number of samples, so for the time being we
      // keep the total phase in mu. Therefore mu *is the index* of the next
      // sample.

      /*** Fine sync using a Costas loop. ***/
      const cosPhase = Math.cos(this.costasPhase);
      const sinPhase = Math.sin(this.costasPhase);
      const costasOutI = inI * cosPhase + inQ * sinPhase;
      const costasOutQ = inQ * cosPhase - inI * sinPhase;

      const error = costasOutI * costasOutQ;

      this.costasFreq += (this.costasBeta * error);

      this.costasPhase += this.costasFreq + (this.costasAlpha * error);

      while (this.costasPhase >= 2 * Math.PI) {
        this.costasPhase -= 2 * Math.PI;
      }

      while (this.costasPhase < 0) {
        this.costasPhase += 2 * Math.PI;
      }

      this.syncOutI.push(costasOutI);
      this.syncOutQ.push(costasOutQ);

      /*** Differential decoding and output to bitstream synchronizer. ***/
      const bit = costasOutI > 0;
      const diffDecodedBit = bit != this.prevBit;
      this.prevBit = bit;

      this.bitstreamSynchronizer.addBit(diffDecodedBit);
    }


    // At the end.
    this.sampleIndex++;
    return [inI, inQ, symbolSampled ? 1.0 : 0.0];
  }
}

class Buffer {
  private length: number;
  private lastSamplesI: Float32Array;
  private lastSamplesQ: Float32Array;
  private index: number;

  constructor(length: number) {
    this.length = length;
    this.lastSamplesI = new Float32Array(length);
    this.lastSamplesQ = new Float32Array(length);
    this.index = 0;
  }

  public addSample(sampleI: number, sampleQ: number) {
    this.lastSamplesI[this.index] = sampleI;
    this.lastSamplesQ[this.index] = sampleQ;
    // This could be written: this.index = (this.index + 1) % this.length;
    // But that is much slower than the following:
    this.index++;
    if (this.index >= this.length) {
      this.index = 0;
    }
  }

  public applyFilter(coeffs: Float32Array): Array<number> {
    let bufferIndex = this.index;
    let valueI = 0;
    let valueQ = 0;
    // Convolve the filter and the last samples.
    for (let i=0; i<this.length; i++) {
      valueI += this.lastSamplesI[bufferIndex] * coeffs[i];
      valueQ += this.lastSamplesQ[bufferIndex] * coeffs[i];
      bufferIndex++;
      // This could be written: bufferIndex = (bufferIndex + 1) % this.length;
      // But that is much slower than the following:
      if (bufferIndex >= this.length) {
        bufferIndex = 0;
      }
    }
    return [valueI, valueQ];
  }
}

// Output of scipy.signal.firwin(numtaps=101, cutoff=7.5e3, fs=250000).
const LP_FILTER_COEFFS = new Float32Array([
  1.86764843e-19,  9.83021736e-05,  2.03771919e-04,  3.19287123e-04,
  4.46579244e-04,  5.85559941e-04,  7.33747418e-04,  8.85850463e-04,
  1.03356064e-03,  1.16559182e-03,  1.26799156e-03,  1.32473211e-03,
  1.31856985e-03,  1.23214349e-03,  1.04926278e-03,  7.56323340e-04,
  3.43769689e-04, -1.92480664e-04, -8.49744309e-04, -1.61750179e-03,
  -2.47663618e-03, -3.39905509e-03, -4.34775486e-03, -5.27736527e-03,
  -6.13518948e-03, -6.86272804e-03, -7.39764943e-03, -7.67614329e-03,
  -7.63556865e-03, -7.21728926e-03, -6.36957156e-03, -5.05041150e-03,
  -3.23015196e-03, -8.93755943e-04,  1.95738909e-03,  5.30424418e-03,
  9.10955444e-03,  1.33180050e-02,  1.78571240e-02,  2.26389244e-02,
  2.75622448e-02,  3.25157116e-02,  3.73812192e-02,  4.20377958e-02,
  4.63657021e-02,  5.02505966e-02,  5.35875964e-02,  5.62850612e-02,
  5.82679412e-02,  5.94805436e-02,  5.98886000e-02,  5.94805436e-02,
  5.82679412e-02,  5.62850612e-02,  5.35875964e-02,  5.02505966e-02,
  4.63657021e-02,  4.20377958e-02,  3.73812192e-02,  3.25157116e-02,
  2.75622448e-02,  2.26389244e-02,  1.78571240e-02,  1.33180050e-02,
  9.10955444e-03,  5.30424418e-03,  1.95738909e-03, -8.93755943e-04,
  -3.23015196e-03, -5.05041150e-03, -6.36957156e-03, -7.21728926e-03,
  -7.63556865e-03, -7.67614329e-03, -7.39764943e-03, -6.86272804e-03,
  -6.13518948e-03, -5.27736527e-03, -4.34775486e-03, -3.39905509e-03,
  -2.47663618e-03, -1.61750179e-03, -8.49744309e-04, -1.92480664e-04,
  3.43769689e-04,  7.56323340e-04,  1.04926278e-03,  1.23214349e-03,
  1.31856985e-03,  1.32473211e-03,  1.26799156e-03,  1.16559182e-03,
  1.03356064e-03,  8.85850463e-04,  7.33747418e-04,  5.85559941e-04,
  4.46579244e-04,  3.19287123e-04,  2.03771919e-04,  9.83021736e-05,
  1.86764843e-19]);
