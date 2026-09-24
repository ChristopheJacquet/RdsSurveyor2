import { ConfigWBFM, DemodWBFMStage1, DemodWBFMStage2, ModeWBFM } from "@jtarrio/signals/demod/demod-wbfm.js";
import { Demodulator } from "@jtarrio/signals/demod/demodulator.js";
import { Demod, DemodConstructor, Demodulated, getMode, registerDemod } from "@jtarrio/signals/demod/modes.js";
import { getRealResampler, RealResampler } from "@jtarrio/signals/dsp/resamplers.js";
import { Radio, RtlProvider } from "@jtarrio/webrtlsdr/radio.js";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr.js";

import { DecoderLevel, RdsPipeline, RdsSource, RdsSourceCapabilities, SeekDirection, SupportedStreams } from "./input";

export class RtlSdr implements RdsSource {
  rtlSdrRadio?: Radio;
  pipeline: RdsPipeline;
  // RF gain in dB, or null for automatic gain control.
  private gain: number | null = null;
  // Frequency correction, in ppm.
  private frequencyCorrection = 0;

  public name = "RTL-SDR USB dongle";
  public description: string | undefined = undefined;
  public readonly capabilities: RdsSourceCapabilities = {
    reportsFrequency: true,
    supportsTune: true,
    supportsSeek: false,
    decoderLevel: DecoderLevel.MPX,
    reportsSync: true,
    reportsLock: true,
    supportedStreams: SupportedStreams.ALL_STREAMS,
  };

  public constructor(input: RdsPipeline) {
    this.pipeline = input;
    registerDemod("WBFM", DemodWBFMWithMpxProc((s) => this.pipeline.processMpxSamples(s)), ConfigWBFM);
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

    await this.rtlSdrRadio.setFrequency(frequencyKhz * 1000);
    this.pipeline.reportReceiverStatus(frequencyKhz, 0, false);
  }

  public async setGain(gain: number | null) {
    this.gain = gain;
    await this.rtlSdrRadio?.setGain(gain);
  }

  public async setFrequencyCorrection(ppm: number) {
    this.frequencyCorrection = ppm;
    await this.rtlSdrRadio?.setFrequencyCorrection(ppm);
  }

  public async start(): Promise<boolean> {
    const sampleRate = 1024000;

    const demodulator = new Demodulator();
    this.rtlSdrRadio = new Radio(new RtlProvider(new RTL2832U_Provider()), demodulator);
    await this.rtlSdrRadio.setGain(this.gain);
    await this.rtlSdrRadio.setFrequencyCorrection(this.frequencyCorrection);
    demodulator.setVolume(1);
    demodulator.setMode(getMode("WBFM"));

    await this.rtlSdrRadio.start();

    return true;
  }

  public async stop() {
    if (this.rtlSdrRadio == undefined) {
      return;
    }
    await this.rtlSdrRadio.stop();
  }
}

function DemodWBFMWithMpxProc(mpxProc: (s: Float32Array) => void): DemodConstructor<ModeWBFM> {
  return class implements Demod<ModeWBFM> {
    constructor(inRate: number, outRate: number, private mode: ModeWBFM) {
      let interRate = Math.min(inRate, 336000);
      this.stage1 = new DemodWBFMStage1(inRate, interRate, mode);
      this.mpxSampler = getRealResampler(interRate, 250000, { taps: 41 });
      this.mpxProc = mpxProc;
      this.stage2 = new DemodWBFMStage2(interRate, outRate, mode);
    }

    private stage1: DemodWBFMStage1;
    private mpxSampler: RealResampler;
    private mpxProc: (s: Float32Array) => void;
    private stage2: DemodWBFMStage2;

    getMode(): ModeWBFM {
      return this.mode;
    }

    setMode(mode: ModeWBFM) {
      this.mode = mode;
      this.stage1.setMode(mode);
      this.stage2.setMode(mode);
    }

    demodulate(
      samplesI: Float32Array,
      samplesQ: Float32Array,
      freqOffset: number
    ): Demodulated {
      let o1 = this.stage1.demodulate(samplesI, samplesQ, freqOffset);
      const mpx = this.mpxSampler.resample(o1.left);
      this.mpxProc(mpx);
      let o2 = this.stage2.demodulate(o1.left);

      o2.snr = o1.snr;
      return o2;
    }
  };
}
