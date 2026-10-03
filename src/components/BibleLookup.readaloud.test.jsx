// "Read aloud" in a custom (Fish Audio) voice. Safari only lets a page start
// sound inside the tap that asked for it, and a fresh synthesis takes longer
// than the tap lasts — so the reader must unlock its audio element in the tap
// itself and play the voice on that same element when it arrives, instead of
// making a new one then (which Safari refuses, dropping the reader to the
// default voice). See lib/speechAudio.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, configure, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';
import { resetOnboardingCache } from '../lib/onboarding';
import { SILENT_WAV } from '../lib/speechAudio';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 15000 });

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
  },
}));
vi.mock('../lib/bibleWiki', () => ({ loadBibleWiki: () => Promise.resolve({ entries: [] }), buildNameIndex: () => new Map() }));
vi.mock('../lib/wikiEntityLinker', () => ({ loadEntityLinkIndex: () => Promise.resolve(new Map()) }));
vi.mock('../lib/scriptureEngagement', () => ({ recordEngagement: () => Promise.resolve(), passageIdsToChapters: () => [] }));

const PASSAGE = '[1] Then Pharisees and scribes came to Jesus from Jerusalem and said, [2] Why do your disciples break the tradition of the elders?';

function queryChain(result) {
  const chain = {
    eq: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

// A stand-in <audio>: records every play() with what it was playing and
// whether it happened while the click was still being handled.
let inClick = false;
const plays = [];
const elements = [];
class FakeAudio {
  constructor(src = '') {
    this.src = src;
    this.paused = true;
    elements.push(this);
  }

  play() {
    plays.push({ element: this, src: this.src, inClick });
    this.paused = false;
    const { onplay } = this;
    setTimeout(() => onplay?.(), 0);
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

let resolveFish;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  plays.length = 0;
  elements.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:fish-chunk');
  URL.revokeObjectURL = vi.fn();
  localStorage.setItem('bibleLookupVoice', 'voice-custom');
  mockInvoke.mockImplementation((name, options = {}) => {
    if (name === 'fish-tts' && options.method === 'GET') {
      return Promise.resolve({ data: { voices: [{ id: 'voice-custom', label: 'My Voice' }] }, error: null });
    }
    if (name === 'fish-tts') {
      // A fresh synthesis: the audio arrives only when the test says so.
      return new Promise((resolve) => { resolveFish = () => resolve({ data: new Blob(['mp3']), error: null }); });
    }
    if (name === 'hf-proxy') return Promise.resolve({ data: null, error: { message: 'should not be needed' } });
    return Promise.resolve({ data: { data: { content: PASSAGE } }, error: null });
  });
  mockFrom.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { onboarding: { scriptureReader: true } }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    return {
      select: () => queryChain({ data: [], error: null }),
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  });
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BibleLookup — reading aloud in a custom voice', () => {
  it('unlocks its audio in the tap, then plays the voice on that same element when it arrives', async () => {
    render(
      <MemoryRouter>
        <BibleLookup session={{ user: { id: 'user-1' } }} />
      </MemoryRouter>,
    );
    await act(async () => {
      window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: 'Matthew 15:1-2' } }));
    });
    // The custom voice is offered and still chosen.
    const picker = await screen.findByRole('combobox', { name: 'Narration voice' });
    expect(picker).toHaveValue('voice-custom');

    const button = await screen.findByTitle(/Read aloud/);
    inClick = true;
    fireEvent.click(button);
    inClick = false;

    // Inside the tap, before anything has been fetched: one element plays
    // silence. That is what lets it play again later in Safari.
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ src: SILENT_WAV, inClick: true });
    const speaker = plays[0].element;

    // Seconds later the synthesis comes back.
    await act(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      resolveFish();
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    });

    const voice = plays.find((play) => play.src === 'blob:fish-chunk');
    expect(voice, 'the custom voice was played').toBeTruthy();
    expect(voice.element).toBe(speaker);
    expect(voice.inClick).toBe(false);
    // And the reader never fell back to the default voice.
    expect(mockInvoke.mock.calls.some(([name]) => name === 'hf-proxy')).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('fish-tts', { body: expect.objectContaining({ voice_id: 'voice-custom' }) });
  });
});
