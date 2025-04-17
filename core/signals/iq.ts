// This file is essentially a copy of code by Jacobo Barreiro under the Apache
// License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0), part of
// the webrtlsdr project.
// From https://github.com/jtarrio/webrtlsdr/blob/main/src/dsp/demodulators.ts
//
// The code is slightly modified to fix a bug that causes the MPX signal to be
// distorted in some cases. The whole angle from the atan2 output needs to be
// multiplied by mul, but in the original code, the "circ" part is not.
//
// Copying mostly unchanged code here is a temporary workaround. The end goal is
// to use the classes directly from webrtlsdr.


/** A class to demodulate an FM signal. */
export class FMDemodulator {
  /**
   * @param maxDeviation The maximum deviation for the signal, as a fraction of the sample rate.
   */
  constructor(maxDeviation: number) {
    this.mul = 1 / (2 * Math.PI * maxDeviation);
    this.lI = 0;
    this.lQ = 0;
  }

  private mul: number;
  private lI: number;
  private lQ: number;

  /** Changes the maximum deviation. */
  setMaxDeviation(maxDeviation: number) {
    this.mul = 1 / (2 * Math.PI * maxDeviation);
  }

  /** Demodulates the given I/Q samples into the real output. */
  demodulate(I: Float32Array, Q: Float32Array, out: Float32Array) {
    const mul = this.mul;
    let lI = this.lI;
    let lQ = this.lQ;
    for (let i = 0; i < I.length; ++i) {
      let real = lI * I[i] + lQ * Q[i];
      let imag = lI * Q[i] - I[i] * lQ;
      lI = I[i];
      lQ = Q[i];
      let sgn = 1;
      let circ = 0;
      let ang = 0;
      let div = 1;
      // My silly implementation of atan2.
      if (real < 0) {
        sgn = -sgn;
        real = -real;
        circ = Math.PI;
      }
      if (imag < 0) {
        sgn = -sgn;
        imag = -imag;
        circ = -circ;
      }
      if (real > imag) {
        div = imag / real;
      } else if (real != imag) {
        ang = -Math.PI / 2;
        div = real / imag;
        sgn = -sgn;
      }
      const angle =
        circ +
        sgn *
          (ang +
            div /
              (0.98419158358617365 +
                div * (0.093485702629671305 + div * 0.19556307900617517)));
      // The whole angle needs to be multiplied by mul, including circ.
      out[i] = angle * mul;
    }
    this.lI = lI;
    this.lQ = lQ;
  }
}
