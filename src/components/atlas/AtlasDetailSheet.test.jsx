import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AtlasDetailSheet from './AtlasDetailSheet';
import atlasAsset from '../../assets/bible-atlas.json';

// AtlasDetailSheet has no Leaflet dependency, so — like AtlasSearch — it's
// fully renderable in jsdom. wikiImageUrl is mocked directly rather than
// exercised for real: it depends on env vars / Supabase config that aren't
// set in the test environment, and the sheet's own logic (only fetch art
// for `place.w`, hide on load failure) is what's under test here, not the
// URL-building helper itself (which has no test of its own to begin with).
vi.mock('../../lib/wikiImageUrls', () => ({
  wikiImageUrl: (path) => `https://wiki-images.test/${path}`,
}));

// MemoryRouter is kept real (the sheet renders inside one); only the navigate
// handle is swapped so the CTA destinations can be asserted directly.
const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const atlas = {
  ...atlasAsset,
  placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])),
  eventsBySlug: new Map(atlasAsset.events.map((e) => [e.s, e])),
};

const jerusalem = atlasAsset.places.find((p) => p.s === 'jerusalem'); // w: true
const mapOnlyPlace = atlasAsset.places.find((p) => p.w === false);

function renderSheet(props) {
  return render(
    <MemoryRouter>
      <AtlasDetailSheet atlas={atlas} politiesBySlug={null} elevations={null} onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe('AtlasDetailSheet place imagery', () => {
  it('renders the full-resolution image for a wiki-backed place', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s } });
    const img = screen.getByRole('img', { name: jerusalem.n });
    expect(img).toHaveAttribute('src', `https://wiki-images.test/_default/${jerusalem.s}.jpg`);
  });

  it('renders no thumbnail for a map-only place (w: false)', () => {
    renderSheet({ selection: { kind: 'place', slug: mapOnlyPlace.s } });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to the thumbnail, then hides the image if both fail to load', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s } });
    let img = screen.getByRole('img', { name: jerusalem.n });
    fireEvent.error(img);
    img = screen.getByRole('img', { name: jerusalem.n });
    expect(img).toHaveAttribute('src', `https://wiki-images.test/_default/thumbs/${jerusalem.s}.jpg`);
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it("shows a place's own elevation when measured", () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s }, elevations: { [jerusalem.s]: 744 } });
    expect(screen.getByText('744 m (2,441 ft) above sea level')).toBeInTheDocument();
  });

  it('omits the elevation line when unmeasured', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s }, elevations: {} });
    expect(screen.queryByText(/above sea level|below sea level/)).not.toBeInTheDocument();
  });

  it('renders a thumbnail for an event resolved to a wiki-backed place', () => {
    // primaryPlace uses the FIRST resolved place, not just any of them.
    const event = atlasAsset.events.find((e) => atlas.placesBySlug.get(e.pl[0])?.w);
    renderSheet({ selection: { kind: 'event', slug: event.s } });
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});

describe('AtlasDetailSheet 3D scene link', () => {
  // Jerusalem is the one place with a walkable reconstruction behind it, so the
  // sheet is where that gets discovered — nothing else on the map advertises it.
  const withoutScene = atlasAsset.places.find((p) => p.w && p.s !== jerusalem.s);

  beforeEach(() => navigate.mockClear());

  it('offers "Step inside" for a place with a scene', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s } });
    fireEvent.click(screen.getByRole('button', { name: /Step inside/i }));
    expect(navigate).toHaveBeenCalledWith(
      '/scene/second-temple',
      expect.objectContaining({
        state: expect.objectContaining({
          sceneReturnContext: expect.objectContaining({ source: 'atlas', placeSlug: 'jerusalem' }),
        }),
      }),
    );
  });

  it('still offers the wiki page alongside it', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s } });
    fireEvent.click(screen.getByRole('button', { name: /Open wiki page/i }));
    expect(navigate).toHaveBeenCalledWith(`/wiki/${jerusalem.s}`);
  });

  it('offers no scene link for a wiki-backed place that has no scene', () => {
    renderSheet({ selection: { kind: 'place', slug: withoutScene.s } });
    expect(screen.queryByRole('button', { name: /Step inside/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open wiki page/i })).toBeInTheDocument();
  });
});

describe('AtlasDetailSheet present-day link', () => {
  const mapOnly = atlasAsset.places.find((p) => p.w === false);

  it('links a place to a satellite view of where it is now', () => {
    renderSheet({ selection: { kind: 'place', slug: jerusalem.s } });
    const link = screen.getByRole('link', { name: new RegExp(`See ${jerusalem.n} today`, 'i') });
    const url = new URL(link.getAttribute('href'));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/@');
    expect(url.searchParams.get('center')).toBe(`${jerusalem.la},${jerusalem.lo}`);
    expect(url.searchParams.get('basemap')).toBe('satellite');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  // Coordinates are what the link needs, and every atlas place has them —
  // including the ~1,100 with no wiki entry behind them.
  it('offers it for map-only places too', () => {
    renderSheet({ selection: { kind: 'place', slug: mapOnly.s } });
    expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument();
  });
});

