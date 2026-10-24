import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SceneScriptureReader from './SceneScriptureReader';
import { getScene } from '../../lib/scenes';
import { fetchHelloaoPassage } from '../../lib/helloao';

vi.mock('../../lib/helloao', () => ({
  fetchHelloaoPassage: vi.fn(() => Promise.resolve(
    '[12] Shallum repaired with the help of his daughters. '
    + '[13] Hanun repaired the Valley Gate as far as the Dung Gate. '
    + '[14] Malchijah repaired the Dung Gate.',
  )),
}));

describe('SceneScriptureReader', () => {
  it('continues at the verse that arrived from Scripture Lookup', async () => {
    render(
      <SceneScriptureReader
        scene={getScene('nehemiahs-wall')}
        focus={{ kind: 'hotspot', id: 'valley-gate' }}
        initialRef="Nehemiah 3:13-14"
        onFocus={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Verse 13')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /13\s*Hanun repaired the Valley Gate/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Valley Gate' })).toHaveAttribute('aria-pressed', 'true');
    expect(fetchHelloaoPassage).toHaveBeenCalledWith('BSB', 'NEH.3', 3);
  });
});
