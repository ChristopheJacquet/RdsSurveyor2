import { RdsPipeline, RdsSource, SeekDirection } from "./input";

const WORKLET_NAME = "audio-input-source-forwarder";

// AudioWorkletProcessor that forwards each input channel, untouched, to the
// main thread. Inlined as a string (loaded via a Blob URL) so this class
// stays self-contained, with no separate worklet module file to ship or host.
const WORKLET_SOURCE = `
class Forwarder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channels = input.map((channel) => channel.slice());
    this.port.postMessage({ channels }, channels.map((channel) => channel.buffer));
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", Forwarder);
`;

// What an audio input device is expected to carry:
// - "bitstream": data and clock signals from an RDS demodulator chip (e.g. a
//   TDA7330), one per channel of a stereo input.
// - "mpx": a demodulated FM multiplex signal on the first channel, from a
//   mono or stereo input.
export type AudioInputMode = "bitstream" | "mpx";

// The Demodulator (see signals/mpx.ts) assumes MPX samples arrive at this
// rate. Requesting it from the AudioContext lets the browser resample from
// whatever rate the audio interface actually runs at.
const MPX_SAMPLE_RATE = 250000;

// Reads RDS data from a selectable audio input device: either a data/clock
// bitstream (e.g. from an RDS demodulator chip like the TDA7330 connected
// into a sound card) or a demodulated MPX signal.
export class AudioInput implements RdsSource {
  public name = "Audio input";
  public mode: AudioInputMode = "bitstream";
  // Id of the input device to use, as returned by mediaDevices.enumerateDevices().
  public deviceId?: string;

  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;

  constructor(private pipeline: RdsPipeline) {}

  async seek(direction: SeekDirection): Promise<void> {
    console.log("audio: seek not supported.");
  }

  async tune(frequencyKhz: number): Promise<void> {
    console.log("audio: tune not supported.");
  }

  async start(): Promise<boolean> {
    if (this.audioContext != undefined) {
      // Already running.
      return true;
    }

    if (!("mediaDevices" in navigator)) {
      console.log("audio: getUserMedia is not supported.");
      return false;
    }

    if (this.deviceId == undefined) {
      console.log("audio: no device selected.");
      return false;
    }

    const audioConstraints: MediaTrackConstraints = {
      deviceId: { exact: this.deviceId },
      // These are logic/MPX signals, not speech: don't let the browser
      // "clean them up".
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    // A bitstream needs its 2 channels kept apart; an MPX signal is read
    // from whatever channels the device offers (only the first is used).
    if (this.mode === "bitstream") {
      audioConstraints.channelCount = 2;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (e) {
      console.log("audio: could not open input device.", e);
      return false;
    }

    this.audioContext = new AudioContext(this.mode === "mpx" ? { sampleRate: MPX_SAMPLE_RATE } : undefined);

    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await this.audioContext.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    if (this.mode === "bitstream" && this.sourceNode.channelCount < 2) {
      console.log("audio: selected device does not provide 2 channels (data, clock).");
      await this.stop();
      return false;
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_NAME);
    let prevClock = -1;
    this.workletNode.port.onmessage = (event: MessageEvent<{ channels: Float32Array[] }>) => {
      const { channels } = event.data;
      if (this.mode === "mpx") {
        this.pipeline.processMpxSamples(channels[0]);
        return;
      }
      const [data, clock] = channels;
      for (let i = 0; i < data.length; i++) {
        if (prevClock >= 0 && clock[i] < 0) {
          this.pipeline.processBit(data[i] > 0);
        }
        prevClock = clock[i];
      }
    };

    this.sourceNode.connect(this.workletNode);
    // An AudioWorkletNode only gets its process() called while it's part of
    // the graph reaching the destination. We never write to its output, so
    // this stays silent.
    this.workletNode.connect(this.audioContext.destination);

    return true;
  }

  async stop(): Promise<void> {
    if (this.workletNode != undefined) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = undefined;
    }

    this.sourceNode?.disconnect();
    this.sourceNode = undefined;

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;

    if (this.audioContext != undefined) {
      await this.audioContext.close();
      this.audioContext = undefined;
    }
  }
}
