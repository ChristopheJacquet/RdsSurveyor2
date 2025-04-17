import { Player } from "@jtarrio/webrtlsdr/audio/player";
import {  concatenateReceivers, SampleReceiver } from "@jtarrio/webrtlsdr/radio/sample_receiver";
import { Demodulated, ModulationScheme, Mode } from "@jtarrio/webrtlsdr/demod/modes";

import { SchemeAM } from "@jtarrio/webrtlsdr/demod/scheme-am";
import { SchemeCW } from "@jtarrio/webrtlsdr/demod/scheme-cw";
import { SchemeNBFM } from "@jtarrio/webrtlsdr/demod/scheme-nbfm";
import { SchemeSSB } from "@jtarrio/webrtlsdr/demod/scheme-ssb";

import { makeLowPassKernel } from "@jtarrio/webrtlsdr/dsp/coefficients";
import { StereoSeparator } from "@jtarrio/webrtlsdr/dsp/demodulators";
import { FrequencyShifter, Deemphasizer, FIRFilter } from "@jtarrio/webrtlsdr/dsp/filters";
import { getPower } from "@jtarrio/webrtlsdr/dsp/power";
import { ComplexDownsampler, RealDownsampler } from "@jtarrio/webrtlsdr/dsp/resamplers";

import { Radio } from "@jtarrio/webrtlsdr/radio";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr";
import { getMode } from "@jtarrio/webrtlsdr/demod/modes";

import { RdsPipeline, RdsSource, SeekDirection } from "./input";
import { FMDemodulator } from "../signals/iq";

export class RtlSdr implements RdsSource {
  rtlSdrRadio?: Radio;
  pipeline: RdsPipeline;

  public name = "RTL-SDR USB dongle";

  public constructor(input: RdsPipeline) {
    this.pipeline = input;
  }

  public async seek(direction: SeekDirection) {
    if (this.rtlSdrRadio == undefined) {
      throw new Error("rtlsdr: Trying to reference undefined device.")
    }

    console.error("rtlsdr: seek not implemented.");
  }

  public async tune(frequencyKhz: number) {
    if (this.rtlSdrRadio == undefined) {
      throw new Error("rtlsdr: Trying to reference undefined device.")
    }

    this.rtlSdrRadio.setFrequency(frequencyKhz * 1000);
    this.pipeline.reportFrequency(frequencyKhz);
  }

  public async start(): Promise<boolean> {
    const sampleRate = 1024000;

    let demodulator = new WebRtlSdrDemodulator(sampleRate, (s) => this.pipeline.processMpxSamples(s));
    this.rtlSdrRadio = new Radio(new RTL2832U_Provider(), demodulator, sampleRate);
    this.rtlSdrRadio.setGain(10);
    demodulator.setVolume(1);
    demodulator.setMode(getMode("WBFM"));

    this.rtlSdrRadio.start();

    return true;
  }

  public async stop() {
    if (this.rtlSdrRadio == undefined) {
      return;
    }
    this.rtlSdrRadio.stop();
  }
}

// The rest of this file is essentially a copy of code by Jacobo Barreiro under
// the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0),
// part of the webrtlsdr project.
// From https://github.com/jtarrio/webrtlsdr/blob/main/src/demod/demodulator.ts
//  and https://github.com/jtarrio/webrtlsdr/blob/main/src/demod/scheme-wbfm.ts
//
// The code is slightly modified to allow the processing of the MPX signal via
// the mpxProc callback.
//
// Copying mostly unchanged code here is a temporary workaround. The end goal is
// to use the classes directly from webrtlsdr.
class WebRtlSdrDemodulator extends EventTarget implements SampleReceiver {
  constructor(private inRate: number, mpxProc: (s: Float32Array) => void) {
    super();
    this.player = new Player();
    this.squelchControl = new SquelchControl(this.player.sampleRate);
    this.mode = { scheme: "WBFM", stereo: true };
    this.scheme = this.getScheme(this.mode);
    this.frequencyOffset = 0;
    this.latestStereo = false;
    this.mpxProc = mpxProc;
  }

  /** The audio output device. */
  private player: Player;
  /** Controller that silences the output if the SNR is low. */
  private squelchControl: SquelchControl;
  /** The modulation parameters as a Mode object. */
  private mode: Mode;
  /** The demodulator class. */
  private scheme: ModulationScheme;
  /** The frequency offset to demodulate from. */
  private frequencyOffset: number;
  /** Whether the latest samples were in stereo. */
  private latestStereo: boolean;
  /** A frequency change we are expecting. */
  private expectingFrequency?: Frequency;
  /** A callback that processes the MPX signal samples. */
  mpxProc: (s: Float32Array) => void;

  /** Changes the modulation parameters. */
  setMode(mode: Mode) {
    this.scheme = this.getScheme(mode, this.scheme);
    this.mode = mode;
  }

  /** Returns the current modulation parameters. */
  getMode(): Mode {
    return this.mode;
  }

  /** Changes the frequency offset. */
  setFrequencyOffset(offset: number) {
    this.frequencyOffset = offset;
  }

  /** Returns the current frequency offset. */
  getFrequencyOffset() {
    return this.frequencyOffset;
  }

  /** Waits until samples arrive with the given center frequency and then sets the offset. */
  expectFrequencyAndSetOffset(center: number, offset: number) {
    this.expectingFrequency = { center, offset };
  }

  /** Sets the audio volume level, from 0 to 1. */
  setVolume(volume: number) {
    this.player.setVolume(volume);
  }

  /** Returns the current audio volume level. */
  getVolume() {
    return this.player.getVolume();
  }

  /** Returns an appropriate instance of ModulationScheme for the requested mode. */
  private getScheme(mode: Mode, scheme?: ModulationScheme): ModulationScheme {
    if (mode.scheme == scheme?.getMode().scheme) {
      scheme.setMode(mode);
      return scheme;
    }

    switch (mode.scheme) {
      case "AM":
        return new SchemeAM(this.inRate, this.player.sampleRate, mode);
      case "NBFM":
        return new SchemeNBFM(this.inRate, this.player.sampleRate, mode);
      case "WBFM":
        return new SchemeWBFM(this.inRate, this.player.sampleRate, mode, this.mpxProc);
      case "LSB":
      case "USB":
        return new SchemeSSB(this.inRate, this.player.sampleRate, mode);
      case "CW":
        return new SchemeCW(this.inRate, this.player.sampleRate, mode);
    }
  }

  /** Changes the sample rate. */
  setSampleRate(sampleRate: number): void {
    this.inRate = sampleRate;
    this.scheme = this.getScheme(this.mode, undefined);
  }

  /** Receives radio samples. */
  receiveSamples(I: Float32Array, Q: Float32Array, frequency: number): void {
    if (this.expectingFrequency?.center === frequency) {
      this.frequencyOffset = this.expectingFrequency.offset;
      this.expectingFrequency = undefined;
    }

    let { left, right, stereo, snr } = this.scheme.demodulate(
      I,
      Q,
      this.frequencyOffset
    );
    this.squelchControl.applySquelch(this.mode, left, right, snr);
    this.player.play(left, right);
    if (stereo != this.latestStereo) {
      this.dispatchEvent(new StereoStatusEvent(stereo));
      this.latestStereo = stereo;
    }
  }

  andThen(next: SampleReceiver): SampleReceiver {
    return concatenateReceivers(this, next);
  }

  override addEventListener(
    type: "stereo-status",
    callback: (e: StereoStatusEvent) => void | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  override addEventListener(
    type: string,
    callback: any,
    options?: boolean | AddEventListenerOptions | undefined
  ): void {
    super.addEventListener(
      type,
      callback as EventListenerOrEventListenerObject | null,
      options
    );
  }
}

class SquelchControl {
  constructor(private sampleRate: number) {}

  private countdown: number = 0;

  applySquelch(
    mode: Mode,
    left: Float32Array,
    right: Float32Array,
    snr: number
  ) {
    const SQUELCH_TAIL = 0.1;
    if (mode.scheme == "WBFM" || mode.scheme == "CW") return;
    if (mode.squelch < snr) {
      this.countdown = SQUELCH_TAIL * this.sampleRate;
      return;
    }
    if (this.countdown > 0) {
      this.countdown -= left.length;
      return;
    }
    left.fill(0);
    right.fill(0);
  }
}

type Frequency = {
  center: number;
  offset: number;
};

class StereoStatusEvent extends CustomEvent<boolean> {
  constructor(stereo: boolean) {
    super("stereo-status", { detail: stereo, bubbles: true, composed: true });
  }
}


/** A demodulator for wideband FM signals. */
class SchemeWBFM implements ModulationScheme {
  /**
   * @param inRate The sample rate of the input samples.
   * @param outRate The sample rate of the output audio.
   * @param stereo Whether to try to demodulate a stereo signal, if present.
   */
  constructor(
    inRate: number,
    outRate: number,
    private mode: Mode & { scheme: "WBFM" },
    mpxProc: (s: Float32Array) => void
  ) {
    const maxF = 75_000;
    const pilotF = 19000;
    const deemphTc = 50;
    this.interRate = Math.min(inRate, 336000);
    this.shifter = new FrequencyShifter(inRate);
    if (this.interRate != inRate) {
      this.downsampler = new ComplexDownsampler(inRate, this.interRate, 151);
    }
    const kernel = makeLowPassKernel(this.interRate, maxF, 151);
    this.filterI = new FIRFilter(kernel);
    this.filterQ = new FIRFilter(kernel);
    this.demodulator = new FMDemodulator(maxF / this.interRate);
    this.monoSampler = new RealDownsampler(this.interRate, outRate, 41);
    this.mpxSampler = new RealDownsampler(this.interRate, 250000, 41);
    this.stereoSampler = new RealDownsampler(this.interRate, outRate, 41);
    this.stereoSeparator = new StereoSeparator(this.interRate, pilotF);
    this.leftDeemph = new Deemphasizer(outRate, deemphTc);
    this.rightDeemph = new Deemphasizer(outRate, deemphTc);
    this.mpxProc = mpxProc;
  }

  private interRate: number;
  private shifter: FrequencyShifter;
  private downsampler?: ComplexDownsampler;
  private filterI: FIRFilter;
  private filterQ: FIRFilter;
  private demodulator: FMDemodulator;
  private monoSampler: RealDownsampler;
  private mpxSampler: RealDownsampler;
  private stereoSampler: RealDownsampler;
  private stereoSeparator: StereoSeparator;
  private leftDeemph: Deemphasizer;
  private rightDeemph: Deemphasizer;
  private mpxProc: (s: Float32Array) => void;

  getMode(): Mode {
    return this.mode;
  }

  setMode(mode: Mode & { scheme: "WBFM" }) {
    this.mode = mode;
  }

  /**
   * Demodulates the signal.
   * @param samplesI The I components of the samples.
   * @param samplesQ The Q components of the samples.
   * @param freqOffset The offset of the signal in the samples.
   * @param inStereo Whether to try decoding the stereo signal.
   * @returns The demodulated audio signal.
   */
  demodulate(
    samplesI: Float32Array,
    samplesQ: Float32Array,
    freqOffset: number
  ): Demodulated {
    this.shifter.inPlace(samplesI, samplesQ, -freqOffset);
    let [I, Q] = this.downsampler
      ? this.downsampler.downsample(samplesI, samplesQ)
      : [samplesI, samplesQ];
    let allPower = getPower(I, Q);
    this.filterI.inPlace(I);
    this.filterQ.inPlace(Q);
    let signalPower = (getPower(I, Q) * this.interRate) / 150000;
    this.demodulator.demodulate(I, Q, I);
    const leftAudio = this.monoSampler.downsample(I);
    const mpx = this.mpxSampler.downsample(I);
    this.mpxProc(mpx);
    const rightAudio = new Float32Array(leftAudio);
    let stereoOut = false;

    if (this.mode.stereo) {
      const stereo = this.stereoSeparator.separate(I);
      if (stereo.found) {
        stereoOut = true;
        const diffAudio = this.stereoSampler.downsample(stereo.diff);
        for (let i = 0; i < diffAudio.length; ++i) {
          rightAudio[i] -= diffAudio[i];
          leftAudio[i] += diffAudio[i];
        }
      }
    }

    this.leftDeemph.inPlace(leftAudio);
    this.rightDeemph.inPlace(rightAudio);
    return {
      left: leftAudio,
      right: rightAudio,
      stereo: stereoOut,
      snr: signalPower / allPower,
    };
  }
}
