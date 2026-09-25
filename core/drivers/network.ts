import { DecoderLevel, RdsPipeline, RdsSource, RdsSourceCapabilities, SeekDirection, SupportedStreams } from "./input";

// The Demodulator (see signals/mpx.ts) assumes MPX samples arrive at this
// fixed rate, so network samples are resampled to it before being processed.
const MPX_SAMPLE_RATE = 250000;

// Resamples via linear interpolation, carrying fractional phase and the last
// input sample across calls so chunking doesn't affect the result.
class LinearResampler {
  private readonly ratio: number;
  private prevSample = 0;
  private phase = 0;

  constructor(inRate: number, outRate: number) {
    this.ratio = inRate / outRate;
  }

  process(input: Float32Array): Float32Array {
    const len = input.length;
    if (len === 0) {
      return new Float32Array(0);
    }

    // Upper bound on this chunk's output size; trimmed to the actual count below.
    const output = new Float32Array(Math.ceil((len - this.phase) / this.ratio) + 1);
    let p = this.phase;
    let n = 0;
    while (p < len) {
      const idx = Math.floor(p);
      const frac = p - idx;
      const a = idx === 0 ? this.prevSample : input[idx - 1];
      const b = input[idx];
      output[n++] = a + frac * (b - a);
      p += this.ratio;
    }
    this.phase = p - len;
    this.prevSample = input[len - 1];
    return output.subarray(0, n);
  }
}

// Reads RDS data from a network stream: connects to an HTTP(S) URL and treats
// the response body as a live MPX sample stream (16-bit signed little-endian
// samples), processing samples in real time until the peer closes the connection.
export class NetworkSource implements RdsSource {
  public name = "Network (experimental)";
  public description: string | undefined = undefined;
  public readonly capabilities: RdsSourceCapabilities = {
    reportsFrequency: false,
    supportsTune: false,
    supportsSeek: false,
    decoderLevel: DecoderLevel.MPX,
    realtime: true,
    reportsSync: true,
    reportsLock: true,
    supportedStreams: SupportedStreams.ALL_STREAMS,
  };

  // URL to read the MPX byte stream from, set from the UI.
  public url: string = "";
  // Sample rate of the incoming MPX stream, set from the UI.
  public sampleRate: number = 192000;

  private abortController?: AbortController;
  // Set just before abort() is called from stop(), so the read loop can tell
  // an intentional stop apart from a peer-initiated close or a real error.
  private stopping = false;
  private resampler?: LinearResampler;

  constructor(private pipeline: RdsPipeline) {}

  async seek(direction: SeekDirection): Promise<void> {
    console.log("network: seek not supported.");
  }

  async tune(frequencyKhz: number): Promise<void> {
    console.log("network: tune not supported.");
  }

  async start(): Promise<boolean> {
    if (this.abortController != undefined) {
      // Already running.
      return true;
    }

    if (!this.url) {
      console.log("network: no URL specified.");
      return false;
    }

    this.abortController = new AbortController();
    this.stopping = false;

    let response: Response;
    try {
      response = await fetch(this.url, { signal: this.abortController.signal });
    } catch (e) {
      console.error("network: could not connect.", e);
      this.abortController = undefined;
      return false;
    }

    if (!response.ok || response.body == null) {
      console.error(`network: could not connect (HTTP status ${response.status}).`);
      this.abortController = undefined;
      return false;
    }

    this.description = this.url;
    this.resampler = new LinearResampler(this.sampleRate, MPX_SAMPLE_RATE);
    // Not awaited: this runs for the lifetime of the connection, while
    // start() itself only needs to report whether the connection succeeded.
    this.readLoop(response.body.getReader());
    return true;
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>) {
    // Holds a single odd leftover byte across chunk boundaries, since a
    // 2-byte sample can straddle two separately-delivered chunks.
    let leftover: Uint8Array | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value == undefined || value.length === 0) {
          continue;
        }

        let bytes = value;
        if (leftover != undefined) {
          const combined = new Uint8Array(leftover.length + bytes.length);
          combined.set(leftover);
          combined.set(bytes, leftover.length);
          bytes = combined;
          leftover = undefined;
        }

        const sampleCount = Math.floor(bytes.length / 2);
        if (bytes.length % 2 !== 0) {
          leftover = bytes.slice(sampleCount * 2);
        }

        if (sampleCount > 0) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
          const samples = new Float32Array(sampleCount);
          for (let i = 0; i < sampleCount; i++) {
            samples[i] = view.getInt16(i * 2, true) / 32768;
          }
          this.pipeline.processMpxSamples(this.resampler!.process(samples));
        }
      }
    } catch (e) {
      if (!this.stopping) {
        console.error("network: connection error.", e);
      }
    }

    const wasStopping = this.stopping;
    this.abortController = undefined;
    this.resampler = undefined;
    this.stopping = false;
    if (!wasStopping) {
      // Not a user-requested stop: tell the pipeline so the UI resets, same
      // as e.g. a finished file playback.
      this.pipeline.reportSourceEnd();
    }
  }

  async stop(): Promise<void> {
    if (this.abortController == undefined) {
      return;
    }
    this.stopping = true;
    this.abortController.abort();
    this.abortController = undefined;
  }
}
