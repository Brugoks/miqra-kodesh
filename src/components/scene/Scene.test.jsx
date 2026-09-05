import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Scene from './Scene';
import { getScene } from '../../lib/scenes';
import { BARRIERS } from './templeNavigation';

// jsdom has no WebGL, so every render here takes the unsupported branch. That
// is the point: the branch is a real user path (old phones, blocked GPUs, the
// software-rendering blocklist) and it is the only part of the route that can
// be exercised headlessly at all. The three.js half is covered by the geometry
// builder's own numbers in scenes.test.js and by eyeballing the scene.

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderScene(slug) {
  return render(
    <MemoryRouter initialEntries={[`/scene/${slug}`]}>
      <Routes>
        <Route path="/scene/:slug" element={<Scene />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  navigate.mockClear();
});

describe('Scene route', () => {
  it('falls back to the walk-through in words when WebGL is unavailable', async () => {
    renderScene('second-temple');
    const scene = getScene('second-temple');

    expect(await screen.findByRole('heading', { name: scene.title })).toBeInTheDocument();
    expect(screen.getByText(/can’t render the 3D scene/i)).toBeInTheDocument();
    // Every hotspot's prose is reachable, so the content survives the loss of
    // the renderer rather than being locked inside it.
    scene.hotspots.forEach((hotspot) => {
      expect(screen.getByRole('heading', { name: hotspot.label })).toBeInTheDocument();
    });
  });

  it('explains the barriers a walker would meet, without needing to walk', async () => {
    renderScene('second-temple');
    // Where there is no renderer there is nothing to walk into, so the places
    // the architecture refuses you have to be readable as prose.
    for (const barrier of Object.values(BARRIERS)) {
      expect(await screen.findByRole('heading', { name: barrier.label })).toBeInTheDocument();
    }
    expect(screen.getByText(/No foreigner is to enter/i)).toBeInTheDocument();
  });

  it('says the scene is a reconstruction', async () => {
    renderScene('second-temple');
    expect(await screen.findByText(/artist’s reconstruction/i)).toBeInTheDocument();
  });

  it('opens the reader when a scripture reference is tapped', async () => {
    const listener = vi.fn();
    window.addEventListener('scripture:open', listener);
    renderScene('second-temple');

    fireEvent.click(await screen.findByRole('button', { name: /Mark 13:1-2/ }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ ref: 'Mark 13:1-2' });
    window.removeEventListener('scripture:open', listener);
  });

  it('resolves the place slug as well as the scene slug', async () => {
    renderScene('jerusalem');
    expect(await screen.findByRole('heading', { name: 'Herod’s Temple' })).toBeInTheDocument();
  });

  it('offers a way back for a place with no scene', async () => {
    renderScene('nineveh');
    expect(await screen.findByText(/No scene has been built/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to the atlas/i }));
    expect(navigate).toHaveBeenCalledWith('/atlas');
  });

  it('exits to the atlas from the fallback', async () => {
    renderScene('second-temple');
    fireEvent.click(await screen.findByRole('button', { name: /Exit/i }));
    expect(navigate).toHaveBeenCalledWith('/atlas');
  });
});
