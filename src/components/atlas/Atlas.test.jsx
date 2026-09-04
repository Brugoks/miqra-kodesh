import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Atlas from './Atlas';

// AtlasMap owns the actual Leaflet instance, which is near-untestable in
// jsdom (see docs/ancient-atlas-plan.md §Testing) — stubbed out so this test
// covers what it safely can: data loading, the loading state, and the
// surrounding chrome (scrubber, controls) that Atlas itself renders. The
// stub surfaces `pinnedPlaces` and `activeJourney` as data attributes so the
// ?chapters= and ?person= deep-link tests below can assert on them without a
// real Leaflet instance.
vi.mock('./AtlasMap', () => ({
  default: ({ pinnedPlaces, activeJourney }) => (
    <div
      data-testid="atlas-map-stub"
      data-pinned={pinnedPlaces?.map((p) => p.s).join(',') || ''}
      data-journey-name={activeJourney?.n || ''}
      data-journey-stops={activeJourney?.stops?.length ?? ''}
    />
  ),
}));

describe('Atlas', () => {
  it('shows a loading state, then renders against the real generated atlas data', async () => {
    render(<MemoryRouter><Atlas /></MemoryRouter>);

    expect(screen.getByText(/Loading the ancient world/i)).toBeInTheDocument();

    expect(await screen.findByTestId('atlas-map-stub')).toBeInTheDocument();
    // Starts at Creation, in the Primeval era (the era name appears both in
    // the scrubber's readout and its own segment label, hence getAllByText).
    expect(screen.getAllByText('Primeval').length).toBeGreaterThan(0);
    expect(screen.getByText('4003 BC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exit the atlas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /territories/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /journeys/i })).toBeInTheDocument();
  });

  // The actual year advance is timer-driven (see ERA_TICK_MS in Atlas.jsx)
  // and left to the maintainer's visual check per CLAUDE.md; eraAutoplayStep
  // itself is unit-tested in lib/atlas.test.js. This only guards the
  // set-state-in-effect derived-state wiring (play/pause toggling).
  it('toggles the era-autoplay button between play and pause', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Atlas /></MemoryRouter>);
    await screen.findByTestId('atlas-map-stub');

    const playButton = screen.getByRole('button', { name: /play through the eras/i });
    await user.click(playButton);
    expect(screen.getByRole('button', { name: /pause playing through the eras/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pause playing through the eras/i }));
    expect(screen.getByRole('button', { name: /play through the eras/i })).toBeInTheDocument();
  });

  it('resolves a ?chapters= deep link to real atlas places and pins them on the map', async () => {
    render(<MemoryRouter initialEntries={['/atlas?chapters=ACT.17']}><Atlas /></MemoryRouter>);
    const mapStub = await screen.findByTestId('atlas-map-stub');

    await waitFor(() => expect(mapStub.dataset.pinned).not.toBe(''));
    const pinned = mapStub.dataset.pinned.split(',');
    // Acts 17 mentions Thessalonica, Berea, and Athens by name.
    expect(pinned).toEqual(expect.arrayContaining(['map-thessalonica', 'map-berea', 'map-athens']));
  });

  it('resolves a ?person= deep link into a journey-shaped trace, reusing the journey layer', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/atlas?person=paul_2479']}><Atlas /></MemoryRouter>);
    const mapStub = await screen.findByTestId('atlas-map-stub');

    await waitFor(() => expect(mapStub.dataset.journeyStops).not.toBe(''));
    expect(mapStub.dataset.journeyName).toMatch(/places associated with paul/i);
    // Real measured count (docs/atlas-enhancements-plan.md §6): 30 placed events.
    expect(Number(mapStub.dataset.journeyStops)).toBeGreaterThan(0);
    expect(Number(mapStub.dataset.journeyStops)).toBeLessThanOrEqual(30);

    // A resolved trace is a selection too, so it collapses the chrome the
    // same as a map tap or search pick — expand it back to reach the panel.
    await user.click(screen.getByRole('button', { name: /show map controls/i }));

    // Reusing the journey layer means the Journeys panel's own transport
    // controls (distinct from the scrubber's own play/pause) light up for a
    // trace too, per the hasActiveJourney wiring — not just activeJourneyId,
    // which stays null for a trace.
    await user.click(screen.getByRole('button', { name: /^journeys$/i }));
    expect(screen.getByRole('button', { name: /^(play|pause)$/i })).toBeInTheDocument();
  });

  it('collapses the chrome when a curated journey is picked from the Journeys panel', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Atlas /></MemoryRouter>);
    await screen.findByTestId('atlas-map-stub');

    await user.click(screen.getByRole('button', { name: /^journeys$/i }));
    await user.click(screen.getByRole('button', { name: /the exodus/i }));

    // Picking an actual journey (not "None") collapses the chrome — the
    // still-open panel was covering most of a phone-sized map otherwise.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^none$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show map controls/i })).toBeInTheDocument();
  });

  it('collapses the chrome on a fresh selection, then expands again from its own Controls chip', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Atlas /></MemoryRouter>);
    await screen.findByTestId('atlas-map-stub');

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^controls$/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    await user.click(await screen.findByText('Jerusalem'));

    // Search/chips give way to a single "Controls" chip once a selection
    // (here, a search pick) is made, so the map underneath isn't obscured.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^territories$/i })).not.toBeInTheDocument();
    const controlsChip = screen.getByRole('button', { name: /show map controls/i });

    await user.click(controlsChip);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('collapses the scrubber track alongside the topbar, keeping the era/year readout visible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Atlas /></MemoryRouter>);
    await screen.findByTestId('atlas-map-stub');

    expect(screen.getByRole('slider', { name: /scrub through biblical history/i })).toBeInTheDocument();

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    await user.click(await screen.findByText('Jerusalem'));

    expect(screen.queryByRole('slider', { name: /scrub through biblical history/i })).not.toBeInTheDocument();
    expect(screen.getByText('4003 BC')).toBeInTheDocument(); // readout itself stays visible

    await user.click(screen.getByRole('button', { name: /show the time scrubber/i }));
    expect(screen.getByRole('slider', { name: /scrub through biblical history/i })).toBeInTheDocument();
  });

  it('re-expands the chrome when the detail sheet is closed', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Atlas /></MemoryRouter>);
    await screen.findByTestId('atlas-map-stub');

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    await user.click(await screen.findByText('Jerusalem'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('offers no trace for someone below the placed-events threshold — silently no-ops', async () => {
    render(<MemoryRouter initialEntries={['/atlas?person=david_994']}><Atlas /></MemoryRouter>);
    const mapStub = await screen.findByTestId('atlas-map-stub');
    // Give the async resolution a moment, then confirm nothing was pinned.
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(mapStub.dataset.journeyStops).toBe('');
  });
});
