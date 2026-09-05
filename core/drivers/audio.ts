import { RdsPipeline, RdsSource, SeekDirection } from "./input";

const WORKLET_NAME = "audio-input-source-forwarder";

// AudioWorkletProcessor that forwards at each instant two input channels
// (data, clock) to the main thread, untouched. Inlined as a string (loaded
// via a Blob URL) so this class stays self-contained, with no separate
// worklet module file to ship or host.
const WORKLET_SOURCE = `
class Forwarder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length < 2) {
      return true;
    }
    const data = input[0].slice();
    const clock = input[1].slice();
    this.port.postMessage({ data, clock }, [data.buffer, clock.buffer]);
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", Forwarder);
`;

// Reads data and clock signals from a selectable stereo audio input device
// (e.g. an RDS demodulator chip like the TDA7330 connected into a sound card),
// sample bits and feeds the bitstream into the pipeline.
export class AudioBitstream implements RdsSource {
  public name = "Data/clock signals via audio input";
  // Id of the input device to use, as returned by listDevices(). Leave
  // undefined to let the browser pick its default input.
  public deviceId?: string;

  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;

  constructor(private pipeline: RdsPipeline) {}

  // Lists available audio input devices. Device labels are only populated
  // once input permission has been granted, so callers may want to call this
  // again after a first start()/stop() cycle.
  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!("mediaDevices" in navigator)) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  // Once permission has been granted to an origin, getUserMedia() silently
  // reuses the previously picked device and never shows a chooser again.
  // Browsers don't offer a way to force that native dialog back open, so we
  // ask here instead, every time start() runs.
  private async selectDevice(): Promise<string | undefined> {
    let devices = await this.listDevices();

    // Labels (and on some browsers, the device list itself) are only
    // populated once permission has been granted. Request it via a
    // throwaway stream so the prompt below can show real device names.
    if (devices.length == 0 || devices.some((d) => d.label == "")) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.log("audio: could not get input permission.", e);
        return undefined;
      }
      devices = await this.listDevices();
    }

    if (devices.length == 0) {
      console.log("audio: no audio input devices found.");
      return undefined;
    }

    const listing = devices.map((d, i) => `${i}: ${d.label || d.deviceId}`).join("\n");
    const answer = window.prompt(`Select an audio input device:\n${listing}`, "0");
    if (answer == null) {
      return undefined;
    }

    const index = Number.parseInt(answer, 10);
    if (Number.isNaN(index) || index < 0 || index >= devices.length) {
      console.log(`audio: invalid device selection: ${answer}`);
      return undefined;
    }
    return devices[index].deviceId;
  }

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

    const deviceId = await this.selectDevice();
    if (deviceId == undefined) {
      console.log("audio: no device selected.");
      return false;
    }
    this.deviceId = deviceId;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: this.deviceId },
          channelCount: 2,
          // This are logic signals, not speech: don't let the browser
          // "clean it up".
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      console.log("audio: could not open input device.", e);
      return false;
    }

    this.audioContext = new AudioContext();

    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await this.audioContext.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    if (this.sourceNode.channelCount < 2) {
      console.log("audio: selected device does not provide 2 channels (data, clock).");
      await this.stop();
      return false;
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_NAME);
    let prevClock = -1;
    this.workletNode.port.onmessage = (event: MessageEvent<{ data: Float32Array; clock: Float32Array }>) => {
      const { data, clock } = event.data;
      for (let i = 0; i<data.length; i++) {
        if (prevClock >=0 && clock[i] < 0) {
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
