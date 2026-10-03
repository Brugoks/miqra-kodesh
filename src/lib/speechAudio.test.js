import { describe, it, expect, vi } from 'vitest';
import { SILENT_WAV, primeSpeechAudio } from './speechAudio';

function fakeAudio() {
  return {
    src: '',
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    onplay: () => {},
    onended: () => {},
    onpause: () => {},
    onerror: () => {},
  };
}

describe('SILENT_WAV', () => {
  it('is a real, short, silent PCM wave', () => {
    expect(SILENT_WAV.startsWith('data:audio/wav;base64,')).toBe(true);
    const bytes = Uint8Array.from(atob(SILENT_WAV.split(',')[1]), (c) => c.charCodeAt(0));
    const text = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    const view = new DataView(bytes.buffer);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(text(36, 40)).toBe('data');
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    const seconds = view.getUint32(40, true) / view.getUint32(28, true);
    expect(seconds).toBeGreaterThan(0.02);
    expect(seconds).toBeLessThan(0.5);
    expect(bytes.slice(44).every((b) => b === 0)).toBe(true);
  });
});

describe('primeSpeechAudio', () => {
  it('plays silence on the element right away, with no stale handlers left on it', () => {
    const audio = fakeAudio();
    expect(primeSpeechAudio(audio)).toBe(audio);
    expect(audio.src).toBe(SILENT_WAV);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.onplay).toBeNull();
    expect(audio.onended).toBeNull();
    expect(audio.onpause).toBeNull();
    expect(audio.onerror).toBeNull();
  });

  it('stops the silence afterwards, but never the real audio given to it meanwhile', async () => {
    const quiet = fakeAudio();
    primeSpeechAudio(quiet);
    await Promise.resolve();
    await Promise.resolve();
    expect(quiet.pause).toHaveBeenCalledTimes(1);

    const busy = fakeAudio();
    primeSpeechAudio(busy);
    busy.src = 'blob:the-voice';
    await Promise.resolve();
    await Promise.resolve();
    expect(busy.pause).not.toHaveBeenCalled();
  });

  it('makes its own element when given none, and survives a refused play', async () => {
    const made = [];
    vi.stubGlobal('Audio', class {
      constructor() { this.src = ''; made.push(this); }

      play() { return Promise.reject(new Error('NotAllowedError')); }

      pause() {}
    });
    const audio = primeSpeechAudio();
    expect(made).toEqual([audio]);
    await Promise.resolve();
    vi.unstubAllGlobals();
  });
});
