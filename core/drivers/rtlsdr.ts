import { ConfigWBFM, DemodWBFMStage1, DemodWBFMStage2, ModeWBFM } from "@jtarrio/webrtlsdr/demod/demod-wbfm";
import { Demodulator } from "@jtarrio/webrtlsdr/demod/demodulator";
import { Demod, DemodConstructor, Demodulated, getMode, registerDemod } from "@jtarrio/webrtlsdr/demod/modes";
import { RealDownsampler } from "@jtarrio/webrtlsdr/dsp/resamplers";
import { Radio } from "@jtarrio/webrtlsdr/radio";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr";

import { RdsPipeline, RdsSource, SeekDirection } from "./input";

export class RtlSdr implements RdsSource {
  rtlSdrRadio?: Radio;
  pipeline: RdsPipeline;

  public name = "RTL-SDR USB dongle";

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

    this.rtlSdrRadio.setFrequency(frequencyKhz * 1000);
    this.pipeline.reportFrequency(frequencyKhz);
  }

  public async start(): Promise<boolean> {
    const sampleRate = 1024000;

    const demodulator = new Demodulator();
    this.rtlSdrRadio = new Radio(new RTL2832U_Provider(), demodulator);
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

function DemodWBFMWithMpxProc(mpxProc: (s: Float32Array) => void): DemodConstructor<ModeWBFM> {
  return class implements Demod<ModeWBFM> {
    constructor(inRate: number, outRate: number, private mode: ModeWBFM) {
      let interRate = Math.min(inRate, 336000);
      this.stage1 = new DemodWBFMStage1(inRate, interRate, mode);
      this.mpxSampler = new RealDownsampler(interRate, 250000, 41);
      this.mpxProc = mpxProc;
      this.stage2 = new DemodWBFMStage2(interRate, outRate, mode);
    }

    private stage1: DemodWBFMStage1;
    private mpxSampler: RealDownsampler;
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
      const mpx = this.mpxSampler.downsample(o1.left);
      this.mpxProc(mpx);
      let o2 = this.stage2.demodulate(o1.left);

      o2.snr = o1.snr;
      return o2;
    }
  };
}
