import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScenePaceRow from './ScenePace';
import { JOG_SPEED } from './sceneThirdPerson';

// The pace row of the scene's settings. The route itself cannot be rendered
// headlessly past its no-WebGL branch, but this row is plain React, and it is
// where the visitor is told what each pace gives in the view they are in.

const row = (props = {}) => render(
  <ScenePaceRow pace="natural" onPace={() => {}} slug="nehemiahs-wall" third={false} canSwitchView={false} {...props} />,
);

describe('ScenePaceRow', () => {
  it('offers the three paces, each with the speed it gives in this scene', () => {
    row();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Natural1.6 m/s', 'Brisk3.6 m/s', 'Travel8 m/s']);
  });

  it('says which is on, to a screen reader as well as to the eye', () => {
    row({ pace: 'brisk' });
    expect(screen.getByRole('button', { name: /Brisk/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Natural/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Brisk/ }).className).toMatch(/--active/);
  });

  it('chooses a pace on a click', () => {
    const onPace = vi.fn();
    row({ onPace });
    fireEvent.click(screen.getByRole('button', { name: /Travel/ }));
    fireEvent.click(screen.getByRole('button', { name: /Natural/ }));
    expect(onPace.mock.calls.map((c) => c[0])).toEqual(['travel', 'natural']);
  });

  it('gives a scene on the default the default, and the big ones their own', () => {
    row({ slug: 'caesarea' });
    expect(screen.getByRole('button', { name: /Travel/ }).textContent).toBe('Travel5.5 m/s');
  });

  it('tells the truth from behind a figure: travel is capped at its jog, and the note says how to go faster', () => {
    row({ slug: 'mount-of-olives', third: true, canSwitchView: true });
    expect(screen.getByRole('button', { name: /Travel/ }).textContent).toBe(`Travel${JOG_SPEED} m/s`);
    expect(screen.getByText(/capped at the figure’s jog/)).toBeInTheDocument();
    expect(screen.getByText(/V for first person/)).toBeInTheDocument();
  });

  it('says nothing of a cap where there is no figure to see', () => {
    row({ slug: 'nehemiahs-wall', third: false, canSwitchView: false });
    expect(screen.queryByText(/capped/)).not.toBeInTheDocument();
    // Nor in a scene that offers the view, while the visitor is in first person.
    row({ slug: 'mount-of-olives', third: false, canSwitchView: true });
    expect(screen.queryByText(/capped/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Travel/ }).map((b) => b.textContent)).toContain('Travel7 m/s');
  });
});
