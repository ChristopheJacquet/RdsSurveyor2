import { DemodWBFMStage1 } from "@jtarrio/signals/demod/demod-wbfm.js";
import { getRealResampler, RealResampler } from "@jtarrio/signals/dsp/resamplers.js";
import { SampleBlock } from "@jtarrio/signals/radio/sample_block.js";
import { Radio, RtlProvider, SampleReceiver } from "@jtarrio/webrtlsdr/radio.js";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr.js";

import { DecoderLevel, RdsPipeline, RdsSource, RdsSourceCapabilities, SeekDirection, SupportedStreams } from "./input";

// Sample buffers read from the dongle per second (library default: 20). If the main thread is busy
// for longer than one bufer, the dongle overflows and samples are lost. Larger buffers give more
// slack, and trigger fewer UI refreshes.
const BUFFERS_PER_SECOND = 5;

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
    realtime: true,
    reportsSync: true,
    reportsLock: true,
    supportedStreams: SupportedStreams.ALL_STREAMS,
  };

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
    const receiver = new MpxReceiver((s) => this.pipeline.processMpxSamples(s));
    this.rtlSdrRadio = new Radio(new RtlProvider(new RTL2832U_Provider()), receiver, { buffersPerSecond: BUFFERS_PER_SECOND });
    await this.rtlSdrRadio.setGain(this.gain);
    await this.rtlSdrRadio.setFrequencyCorrection(this.frequencyCorrection);

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

// FM-demodulates the dongle's I/Q samples into a 250 kHz MPX signal, fed to mpxProc. Audio
// playback is done downstream, from the MPX signal.
class MpxReceiver implements SampleReceiver {
  private stage1?: DemodWBFMStage1;
  private mpxSampler?: RealResampler;

  constructor(private mpxProc: (s: Float32Array) => void) {}

  setSampleRate(inRate: number) {
    const interRate = Math.min(inRate, 336000);
    this.stage1 = new DemodWBFMStage1(inRate, interRate, { scheme: "WBFM", stereo: true });
    this.mpxSampler = getRealResampler(interRate, 250000, { taps: 41 });
  }

  receiveSamples(block: SampleBlock) {
    const o1 = this.stage1!.demodulate(block.I, block.Q, 0);
    this.mpxProc(this.mpxSampler!.resample(o1.left));
  }
}
