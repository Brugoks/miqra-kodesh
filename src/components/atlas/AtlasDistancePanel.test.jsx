import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AtlasDistancePanel from './AtlasDistancePanel';
import atlasAsset from '../../assets/bible-atlas.json';

// Leaflet-free (unlike AtlasMap), so fully testable — see AtlasSearch.test.jsx
// for the same reasoning. Uses the real generated atlas asset.
const atlas = { ...atlasAsset, placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])) };

const jerusalem = atlasAsset.places.find((p) => p.s === 'jerusalem');
const babylon = atlasAsset.places.find((p) => p.s === 'babylon');

describe('AtlasDistancePanel', () => {
  it('shows nothing but the two pickers until both origin and destination are set', () => {
    render(<AtlasDistancePanel atlas={atlas} origin={null} destination={null} onSetOrigin={vi.fn()} onSetDestination={vi.fn()} />);
    expect(screen.queryByText(/by common ancient routes/)).not.toBeInTheDocument();
  });

  it('computes a travel-mode breakdown once both places are chosen', () => {
    render(
      <AtlasDistancePanel
        atlas={atlas}
        origin={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        destination={{ slug: 'babylon', name: 'Babylon', la: babylon.la, lo: babylon.lo }}
        onSetOrigin={vi.fn()}
        onSetDestination={vi.fn()}
      />,
    );
    expect(screen.getByText(/by common ancient routes/)).toBeInTheDocument();
    expect(screen.getByText('On foot')).toBeInTheDocument();
    expect(screen.getByText('By donkey caravan')).toBeInTheDocument();
    expect(screen.getByText('By camel caravan')).toBeInTheDocument();
    expect(screen.getByText('By horse (messenger pace)')).toBeInTheDocument();
  });

  it('shows the vertical climb/descent when elevation data is available for both endpoints', () => {
    render(
      <AtlasDistancePanel
        atlas={atlas}
        origin={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        destination={{ slug: 'babylon', name: 'Babylon', la: babylon.la, lo: babylon.lo }}
        onSetOrigin={vi.fn()}
        onSetDestination={vi.fn()}
        elevations={{ jerusalem: 744, babylon: 30 }}
      />,
    );
    expect(screen.getByText(/That's a descent of.*from Jerusalem to Babylon\./)).toBeInTheDocument();
  });

  it('omits the vertical line when elevation data is missing for an endpoint', () => {
    render(
      <AtlasDistancePanel
        atlas={atlas}
        origin={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        destination={{ slug: 'babylon', name: 'Babylon', la: babylon.la, lo: babylon.lo }}
        onSetOrigin={vi.fn()}
        onSetDestination={vi.fn()}
        elevations={{ jerusalem: 744 }}
      />,
    );
    expect(screen.queryByText(/That's a/)).not.toBeInTheDocument();
  });

  it('warns instead of computing an estimate when origin and destination are the same place', () => {
    render(
      <AtlasDistancePanel
        atlas={atlas}
        origin={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        destination={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        onSetOrigin={vi.fn()}
        onSetDestination={vi.fn()}
      />,
    );
    expect(screen.getByText('Choose two different places to compare.')).toBeInTheDocument();
    expect(screen.queryByText(/by common ancient routes/)).not.toBeInTheDocument();
  });

  it('picking a place from the origin field calls onSetOrigin with its coordinates', async () => {
    const user = userEvent.setup();
    const onSetOrigin = vi.fn();
    render(<AtlasDistancePanel atlas={atlas} origin={null} destination={null} onSetOrigin={onSetOrigin} onSetDestination={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Choose a starting place…'), 'jerusalem');
    await user.click(await screen.findByText('Jerusalem'));

    expect(onSetOrigin).toHaveBeenCalledWith(expect.objectContaining({ slug: 'jerusalem', name: 'Jerusalem' }));
  });

  it('an already-chosen place renders as a clearable chip', async () => {
    const user = userEvent.setup();
    const onSetOrigin = vi.fn();
    render(
      <AtlasDistancePanel
        atlas={atlas}
        origin={{ slug: 'jerusalem', name: 'Jerusalem', la: jerusalem.la, lo: jerusalem.lo }}
        destination={null}
        onSetOrigin={onSetOrigin}
        onSetDestination={vi.fn()}
      />,
    );
    expect(screen.getByText('Jerusalem')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Clear Jerusalem'));
    expect(onSetOrigin).toHaveBeenCalledWith(null);
  });
});
