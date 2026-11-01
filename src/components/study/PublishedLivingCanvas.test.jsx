import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PublishedLivingCanvas from './PublishedLivingCanvas';
import { applyIntegrationChange, publicationSnapshot } from '../../lib/canvasIntegration';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), flow: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@xyflow/react', () => ({ ReactFlow: (props) => { mocks.flow(props); return <div aria-label="Canvas graph" />; }, Background: () => null, Controls: () => null, Handle: () => null, Position: { Top: 'top' } }));
vi.mock('./board/ConnectionEdge', () => ({ default: () => null }));
beforeEach(() => vi.clearAllMocks());
const mount = (token = '00000000-0000-4000-8000-000000000099') => render(<MemoryRouter initialEntries={[`/study-canvas/published/${token}`]}><Routes><Route path="/study-canvas/published/:token" element={<PublishedLivingCanvas />} /></Routes></MemoryRouter>);
it('loads the anonymous allowlisted RPC and renders only a read-only snapshot', async () => {
  const row = applyIntegrationChange(null, 'create_canvas', { title: 'Wisdom', moment: 'Private question', insights: [{ category: 'observation', text: 'Moses listened.' }, { category: 'reflection', text: 'PRIVATE' }] });
  mocks.rpc.mockResolvedValue({ data: publicationSnapshot(row, [row.journey.entries[0].id]) });
  mount();
  expect(await screen.findByRole('heading', { name: 'Wisdom' })).toBeInTheDocument();
  expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  expect(screen.queryByText('Private question')).not.toBeInTheDocument();
  expect(mocks.flow.mock.calls.at(-1)[0]).toMatchObject({ nodesDraggable: false, nodesConnectable: false, edgesReconnectable: false, deleteKeyCode: null });
  expect(mocks.rpc).toHaveBeenCalledWith('get_published_living_canvas', { p_token: '00000000-0000-4000-8000-000000000099' });
  expect(screen.queryByRole('button', { name: /save|edit|publish/i })).not.toBeInTheDocument();
});
it('shows a revoked or missing link without disclosing why', async () => {
  mocks.rpc.mockResolvedValue({ data: null }); mount();
  expect(await screen.findByRole('heading', { name: 'Canvas unavailable' })).toBeInTheDocument();
});
it('rejects malformed tokens without sending an RPC', async () => {
  mount('bad'); await waitFor(() => expect(screen.getByRole('heading', { name: 'Canvas unavailable' })).toBeInTheDocument());
  expect(mocks.rpc).not.toHaveBeenCalled();
});
