import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const loadVoices = vi.fn(async () => []);
const runTour = vi.fn(async () => 'finished');
const tourStops = vi.fn((scene) => (scene?.vantages || []).map((v) => ({
  id: v.id, text: v.blurb, vantage: v,
})));

vi.mock('../../lib/sceneNarration', () => ({
  loadVoices: (...args) => loadVoices(...args),
  runTour: (...args) => runTour(...args),
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
  runTour.mockResolvedValue('finished');
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
