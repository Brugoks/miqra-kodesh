import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const loadVoices = vi.fn(async () => []);
const runTour = vi.fn(async () => 'finished');
const tourStops = vi.fn((scene) => (scene?.vantages || []).map((v) => ({
  id: v.id, text: v.blurb, vantage: v,
})));
const pickNarrationVoice = vi.fn((voices) => voices?.[0]?.id || null);
const speakLine = vi.fn(async () => 'played');

vi.mock('../../lib/sceneNarration', () => ({
  loadVoices: (...args) => loadVoices(...args),
  pickNarrationVoice: (...args) => pickNarrationVoice(...args),
  runTour: (...args) => runTour(...args),
  speakLine: (...args) => speakLine(...args),
  tourStops: (...args) => tourStops(...args),
}));

const { useSceneTour } = await import('./useSceneTour');

const scene = {
  vantages: [
    { id: 'a', label: 'One', blurb: 'First.' },
    { id: 'b', label: 'Two', blurb: 'Second.' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  loadVoices.mockResolvedValue([]);
  pickNarrationVoice.mockImplementation((voices) => voices?.[0]?.id || null);
  runTour.mockResolvedValue('finished');
  speakLine.mockResolvedValue('played');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSceneTour', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useSceneTour({ scene }));
    expect(result.current.touring).toBe(false);
    expect(result.current.speaking).toBe(false);
    expect(result.current.stopIndex).toBe(-1);
  });

  it('runs the tour and returns to idle when it finishes', async () => {
    const { result } = renderHook(() => useSceneTour({ scene }));
    await act(async () => { await result.current.start(); });
    expect(runTour).toHaveBeenCalledTimes(1);
    expect(result.current.touring).toBe(false);
    expect(result.current.stopIndex).toBe(-1);
  });

  it('refuses to start when the scene is not ready', async () => {
    const { result } = renderHook(() => useSceneTour({ scene, enabled: false }));
    await act(async () => { await result.current.start(); });
    expect(runTour).not.toHaveBeenCalled();
    expect(result.current.touring).toBe(false);
  });

  it('refuses to start a scene with nowhere to stand', async () => {
    const { result } = renderHook(() => useSceneTour({ scene: { vantages: [] } }));
    await act(async () => { await result.current.start(); });
    expect(runTour).not.toHaveBeenCalled();
  });

  it('asks for the voice list once, not once per stop or per tour', async () => {
    loadVoices.mockResolvedValue([{ id: 'v1', label: 'A voice' }]);
    const { result } = renderHook(() => useSceneTour({ scene }));
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.start(); });
    expect(loadVoices).toHaveBeenCalledTimes(1);
    expect(runTour.mock.calls[1][1].voiceId).toBe('v1');
  });

  it('runs silently when there are no voices, rather than not at all', async () => {
    loadVoices.mockResolvedValue([]);
    const { result } = renderHook(() => useSceneTour({ scene }));
    await act(async () => { await result.current.start(); });
    expect(runTour).toHaveBeenCalled();
    expect(runTour.mock.calls[0][1].voiceId).toBeUndefined();
  });

  it('reports which stop it is at, and who is speaking', async () => {
    runTour.mockImplementation(async (stops, options) => {
      options.onStop(stops[1], 1);
      options.onSpeaking(true);
      return 'finished';
    });
    const seen = [];
    const { result } = renderHook(() => useSceneTour({
      scene,
      onStop: (stop, i) => seen.push([stop.id, i]),
    }));
    await act(async () => { await result.current.start(); });
    expect(seen).toEqual([['b', 1]]);
  });

  it('flies the camera through the callback it was given', async () => {
    const goToVantage = vi.fn();
    runTour.mockImplementation(async (stops, options) => {
      options.goTo(stops[0].vantage, 0);
      return 'finished';
    });
    const { result } = renderHook(() => useSceneTour({ scene, goToVantage }));
    await act(async () => { await result.current.start(); });
    expect(goToVantage).toHaveBeenCalledWith(scene.vantages[0]);
  });

  it('aborts the run when stopped', async () => {
    let captured;
    runTour.mockImplementation(async (stops, options) => {
      captured = options.signal;
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      return options.signal.aborted ? 'cancelled' : 'finished';
    });
    const { result } = renderHook(() => useSceneTour({ scene }));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.touring).toBe(true));
    act(() => { result.current.stop(); });
    expect(captured.aborted).toBe(true);
    expect(result.current.touring).toBe(false);
    expect(result.current.stopIndex).toBe(-1);
  });

  it('resolves a settle early when the tour is stopped mid-wait', async () => {
    // The whole tour is a chain of waits. If one of them ignores the abort,
    // the walk carries on for as long as that wait had left to run.
    let settle;
    runTour.mockImplementation(async (stops, options) => {
      settle = options.settle;
      return 'finished';
    });
    const { result } = renderHook(() => useSceneTour({ scene }));
    await act(async () => { await result.current.start(); });

    // A fresh run, so the controller is live while the wait is outstanding.
    let waited = false;
    runTour.mockImplementation(async (stops, options) => {
      const pending = options.settle(100000).then(() => { waited = true; });
      return pending.then(() => 'finished');
    });
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.touring).toBe(true));
    act(() => { result.current.stop(); });
    await waitFor(() => expect(waited).toBe(true));
    expect(settle).toBeTypeOf('function');
  });

  it('treats a restart as one tour, not two', async () => {
    const signals = [];
    runTour.mockImplementation(async (stops, options) => {
      signals.push(options.signal);
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      return 'finished';
    });
    const { result } = renderHook(() => useSceneTour({ scene }));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.touring).toBe(true));
    await act(async () => { await result.current.start(); });
    // The first run's signal was aborted by the second starting.
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('does not clear the flag when a superseded run finishes late', async () => {
    // A cancelled tour resolving after its replacement has started must not
    // switch the UI back to idle underneath the live one.
    let resolveFirst;
    runTour
      .mockImplementationOnce(async () => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => new Promise(() => {}));
    const { result } = renderHook(() => useSceneTour({ scene }));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.touring).toBe(true));
    act(() => { result.current.start(); });
    await act(async () => { resolveFirst('cancelled'); });
    expect(result.current.touring).toBe(true);
  });

  it('stops when the component goes away', async () => {
    let captured;
    runTour.mockImplementation(async (stops, options) => {
      captured = options.signal;
      return new Promise(() => {});
    });
    const { result, unmount } = renderHook(() => useSceneTour({ scene }));
    act(() => { result.current.start(); });
    await waitFor(() => expect(captured).toBeTruthy());
    unmount();
    expect(captured.aborted).toBe(true);
  });

  it('leaves no timer running after it is stopped', async () => {
    vi.useFakeTimers();
    runTour.mockImplementation(async (options) => options);
    let settle;
    runTour.mockImplementation(async (stops, opts) => {
      settle = opts.settle;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useSceneTour({ scene }));
    act(() => { result.current.start(); });
    await vi.advanceTimersByTimeAsync(0);
    act(() => { settle(5000); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => { result.current.stop(); });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Reading one panel aloud from its speaker button. Not a tour: no camera
// moves, no stops, and the walk's own machinery must stay untouched by it.
describe('useSceneTour — reading one line aloud', () => {
  const line = { id: 'vantage:a', text: 'First.', audio: '/a.mp3' };

  it('reads a line and marks which one is speaking while it does', async () => {
    let resolvePlay;
    speakLine.mockImplementation(() => new Promise((r) => { resolvePlay = r; }));
    const { result } = renderHook(() => useSceneTour({ scene }));

    let pending;
    await act(async () => { pending = result.current.speak(line); });
    expect(result.current.speakingId).toBe('vantage:a');
    expect(result.current.touring).toBe(false);

    await act(async () => { resolvePlay('played'); await pending; });
    expect(result.current.speakingId).toBe(null);
  });

  it('stops rather than stacking when the same button is pressed again', async () => {
    let resolvePlay;
    speakLine.mockImplementation(() => new Promise((r) => { resolvePlay = r; }));
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { result.current.speak(line); });
    expect(result.current.speakingId).toBe('vantage:a');

    await act(async () => { await result.current.speak(line); });
    expect(result.current.speakingId).toBe(null);
    // The second press cancelled the first rather than starting a second read.
    expect(speakLine).toHaveBeenCalledTimes(1);
    resolvePlay?.('cancelled');
  });

  it('hands the voice over when a different line is asked for', async () => {
    speakLine.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { result.current.speak(line); });
    await act(async () => { result.current.speak({ id: 'hotspot:roof', text: 'A hole.' }); });

    expect(result.current.speakingId).toBe('hotspot:roof');
    expect(speakLine).toHaveBeenCalledTimes(2);
    expect(speakLine.mock.calls[0][1].signal.aborted).toBe(true);
    expect(speakLine.mock.calls[1][1].signal.aborted).toBe(false);
  });

  it('goes quiet when the visitor walks off, along with the walk', async () => {
    speakLine.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { result.current.speak(line); });
    act(() => { result.current.stop(); });

    expect(result.current.speakingId).toBe(null);
    expect(speakLine.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('stops a line being read when the guided walk starts', async () => {
    // Two voices on the same scene is the one thing neither control should be
    // able to produce between them.
    speakLine.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { result.current.speak(line); });
    await act(async () => { await result.current.start(); });

    expect(result.current.speakingId).toBe(null);
    expect(speakLine.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('stopSpeaking silences the line without ending the walk', async () => {
    // Moving between panels mid-tour must not be read as leaving the tour.
    runTour.mockImplementation(() => new Promise(() => {}));
    speakLine.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { result.current.start(); });
    await waitFor(() => expect(result.current.touring).toBe(true));

    act(() => { result.current.stopSpeaking(); });
    expect(result.current.touring).toBe(true);
  });

  it('refuses to speak before the scene is ready, or with nothing to say', async () => {
    const { result } = renderHook(() => useSceneTour({ scene, enabled: false }));
    await act(async () => { await result.current.speak(line); });
    expect(speakLine).not.toHaveBeenCalled();

    const ready = renderHook(() => useSceneTour({ scene }));
    await act(async () => { await ready.result.current.speak({ id: 'x', text: '' }); });
    expect(speakLine).not.toHaveBeenCalled();
  });

  it('asks for a voice once per scene, not once per line', async () => {
    loadVoices.mockResolvedValue([{ id: 'v1' }]);
    const { result } = renderHook(() => useSceneTour({ scene }));

    await act(async () => { await result.current.speak(line); });
    await act(async () => { await result.current.speak({ id: 'b', text: 'Second.' }); });

    expect(loadVoices).toHaveBeenCalledTimes(1);
    expect(speakLine.mock.calls[1][1].voiceId).toBe('v1');
  });
});
