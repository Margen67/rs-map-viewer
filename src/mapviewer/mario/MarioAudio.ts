import { LibSM64 } from "./LibSM64";

/** Queue short stereo PCM buffers. AudioBuffer's sample rate handles device resampling. */
export class MarioAudio {
    readonly context: AudioContext;
    readonly gain: GainNode;
    private sources = new Set<AudioBufferSourceNode>();
    private nextTime = 0;
    private disposed = false;
    private module?: LibSM64;
    private playing = false;
    private timer: number;
    muted = false;
    music = true;
    volume = 0.7;
    error?: string;

    constructor(private isFocused: () => boolean = () => document.hasFocus()) {
        // Construct and resume synchronously in the file-picker change/click gesture.
        this.context = new AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0.7;
        this.gain.connect(this.context.destination);
        this.resume();
        this.timer = window.setInterval(() => {
            if (!this.playing || !this.module) return;
            if (document.hidden || !this.isFocused()) {
                this.pause();
                return;
            }
            this.pump(this.module);
        }, 20);
        window.addEventListener("blur", this.pause);
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    resume(): void {
        if (this.disposed) return;
        this.error = undefined;
        void this.context.resume().catch(() => {
            if (!this.disposed) this.error = "Audio could not start. Click Enable audio to retry.";
        });
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        // Set the intrinsic gain directly, including while the context is suspended.
        this.gain.gain.value = muted ? 0 : this.volume;
    }

    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        this.setMuted(this.muted);
    }

    setMusic(music: boolean, module: LibSM64): void {
        this.music = music;
        module._rs64_music(Number(music));
    }

    play(module: LibSM64): void {
        this.module = module;
        this.playing = true;
        this.pump(module);
    }

    pump(module: LibSM64): void {
        if (this.disposed || this.context.state !== "running") return;
        const now = this.context.currentTime;
        this.nextTime = Math.max(this.nextTime, now + 0.005);
        // Roughly 70 ms lookahead; never accumulate stale audio after a slow frame.
        for (let i = 0; i < 3 && this.nextTime < now + 0.07; i++) {
            const queued = Math.max(0, Math.round((this.nextTime - now) * 32000));
            const frames = module._rs64_audio_tick(queued);
            if (!frames) break;
            if (frames > 1088) throw new Error("Invalid libsm64 audio buffer length.");
            const pointer = module._rs64_audio_buffer() / 2;
            const pcm = module.HEAP16;
            const buffer = this.context.createBuffer(2, frames, 32000);
            for (let channel = 0; channel < 2; channel++) {
                const samples = buffer.getChannelData(channel);
                for (let frame = 0; frame < frames; frame++)
                    samples[frame] = pcm[pointer + frame * 2 + channel] / 32768;
            }
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.gain);
            this.sources.add(source);
            source.onended = () => {
                source.disconnect();
                this.sources.delete(source);
            };
            source.start(this.nextTime);
            this.nextTime += frames / 32000;
        }
    }

    pause = (): void => {
        this.playing = false;
        for (const source of this.sources) {
            source.onended = null;
            source.stop();
            source.disconnect();
        }
        this.sources.clear();
        this.nextTime = 0;
    };

    private onVisibilityChange = () => {
        if (document.hidden) this.pause();
    };

    dispose(): void {
        this.disposed = true;
        window.clearInterval(this.timer);
        this.module = undefined;
        this.pause();
        window.removeEventListener("blur", this.pause);
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.gain.disconnect();
        void this.context.close().catch(() => {});
    }
}
