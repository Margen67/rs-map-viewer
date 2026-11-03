import { LibSM64 } from "./LibSM64";
import { MarioAudio } from "./MarioAudio";

test("queues 32kHz stereo PCM, mutes, and cancels queued audio on pause and disposal", () => {
    const buffers: { sampleRate: number; channels: Float32Array[] }[] = [];
    const sources: { start: jest.Mock; stop: jest.Mock; disconnect: jest.Mock }[] = [];
    const gain = {
        gain: { value: 0, setValueAtTime: jest.fn() },
        connect: jest.fn(),
        disconnect: jest.fn(),
    };
    const context = {
        currentTime: 1,
        state: "running",
        destination: {},
        createGain: () => gain,
        resume: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        createBuffer: (count: number, frames: number, sampleRate: number) => {
            const channels = Array.from({ length: count }, () => new Float32Array(frames));
            buffers.push({ sampleRate, channels });
            return { getChannelData: (c: number) => channels[c] };
        },
        createBufferSource: () => {
            const source = {
                start: jest.fn(),
                stop: jest.fn(),
                connect: jest.fn(),
                disconnect: jest.fn(),
                onended: null,
            };
            sources.push(source);
            return source;
        },
    };
    const original = window.AudioContext;
    window.AudioContext = jest.fn(() => context) as unknown as typeof AudioContext;
    jest.useFakeTimers();
    try {
        const audio = new MarioAudio(() => true);
        const pcm = new Int16Array(544 * 4);
        pcm[0] = -32768;
        pcm[1] = 16384;
        const module = {
            _rs64_audio_tick: jest.fn(() => 1088),
            _rs64_audio_buffer: () => 0,
            HEAP16: pcm,
            _rs64_music: jest.fn(),
        } as unknown as LibSM64;
        audio.play(module);
        expect(buffers).toHaveLength(2);
        expect(buffers[0].sampleRate).toBe(32000);
        expect(buffers[0].channels[0][0]).toBe(-1);
        expect(buffers[0].channels[1][0]).toBe(0.5);
        expect(sources[0].start).toHaveBeenCalledWith(1.005);
        expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(1.039);
        context.currentTime = 1.1;
        jest.advanceTimersByTime(20);
        expect(buffers.length).toBeGreaterThan(2); // Audio advances without a render frame.
        audio.setMuted(true);
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 1.1);
        audio.setMusic(false, module);
        expect(module._rs64_music).toHaveBeenCalledWith(0);
        audio.pause();
        expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
        audio.dispose();
        expect(context.close).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    } finally {
        window.AudioContext = original;
        jest.useRealTimers();
    }
});
