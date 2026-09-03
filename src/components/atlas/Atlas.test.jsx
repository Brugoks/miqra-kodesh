import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Atlas from './Atlas';

// AtlasMap owns the actual Leaflet instance, which is near-untestable in
// jsdom (see docs/ancient-atlas-plan.md §Testing) — stubbed out so this test
// covers what it safely can: data loading, the loading state, and the
// surrounding chrome (scrubber, controls) that Atlas itself renders.
vi.mock('./AtlasMap', () => ({ default: () => <div data-testid="atlas-map-stub" /> }));

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
});
