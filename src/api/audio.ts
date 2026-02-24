import { JumpAnalyzer } from '../core/jump-analyzer';

export class AudioCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyzer: JumpAnalyzer;
  private onJump: () => void;

  constructor(analyzer: JumpAnalyzer, onJump: () => void) {
    this.analyzer = analyzer;
    this.onJump = onJump;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(this.stream);

    // ScriptProcessorNode: deprecated but widely supported and simple.
    // 2048 buffer size at 44.1kHz = ~46ms per callback.
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      // Convert float [-1,1] to int16 range for JumpAnalyzer
      const buf = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        buf[i] = Math.round(input[i] * 32767);
      }
      if (this.analyzer.processBuffer(buf, buf.length, Date.now())) {
        this.onJump();
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}
