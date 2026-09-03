import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AtlasSearch from './AtlasSearch';
import atlasAsset from '../../assets/bible-atlas.json';
import journeysAsset from '../../assets/atlas-journeys.json';

// AtlasSearch has no Leaflet dependency (unlike AtlasMap), so unlike the rest
// of the atlas it's fully renderable/interactive in jsdom — tested against
// the real generated assets, same as WikiTimeline.test.jsx.
const atlas = { ...atlasAsset, placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])) };
const journeys = journeysAsset.journeys;

describe('AtlasSearch', () => {
  it('shows nothing until the query is at least 2 characters', async () => {
    const user = userEvent.setup();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'j');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('finds a place, an event, and a journey by name and reports their kind', async () => {
    const user = userEvent.setup();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={vi.fn()} />);

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    expect(await screen.findByText('Jerusalem')).toBeInTheDocument();
    expect(screen.getAllByText('Place').length).toBeGreaterThan(0);

    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'goliath');
    expect(await screen.findByText('David Kills Goliath')).toBeInTheDocument();
    expect(screen.getAllByText('Event').length).toBeGreaterThan(0);

    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), "paul's first");
    expect(await screen.findByText("Paul's First Missionary Journey")).toBeInTheDocument();
    expect(screen.getAllByText('Journey').length).toBeGreaterThan(0);
  });

  it('shows a "no matches" message for a query that matches nothing', async () => {
    const user = userEvent.setup();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'xyzxyzxyz');
    expect(await screen.findByText(/No matches for/)).toBeInTheDocument();
  });

  it('selecting a result calls onSelectResult with the full result and clears the query', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={onSelectResult} />);

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    await user.click(await screen.findByText('Jerusalem'));

    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', slug: 'jerusalem' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('Enter selects the first result', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={onSelectResult} />);

    await user.type(screen.getByRole('combobox'), 'jerusalem');
    await screen.findByText('Jerusalem');
    await user.keyboard('{Enter}');

    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', slug: 'jerusalem' }));
  });

  it('Escape clears the query and closes the dropdown', async () => {
    const user = userEvent.setup();
    render(<AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'jerusalem');
    await screen.findByText('Jerusalem');
    await user.keyboard('{Escape}');

    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
