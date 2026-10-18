import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { requestCanvas } from '../../lib/studyCanvas';
import { CANVAS_MODELS } from '../../lib/canvasModels';

vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (original) => ({ ...await original(), requestCanvas: vi.fn() }));

const text = 'A friend brought dinner when I felt overwhelmed.';
const mount = (role, user = 'member-one') => render(<MemoryRouter><StudyCanvas session={{ user: { id: user } }} userRole={role} activeOrgId="org" /></MemoryRouter>);
const keyOf = (model) => CANVAS_MODELS.find((entry) => entry.model === model).key;
const suggestion = (reference = 'Galatians 6:2') => ({ reference, scripture: {
  translation: 'BSB', verses: [{ reference, text: 'Carry one another’s burdens, and in this way you will fulfill the law of Christ.' }],
  contextReference: 'Galatians 6:1–4', contextVerses: [{ reference: 'Galatians 6:1', text: 'Brothers, if someone is caught in a trespass…' }],
  context: 'Paul addresses a community learning to restore one another gently.',
  connection: 'Receiving your friend’s help may be one way to share a burden.', glimpse: text,
} });
const diagnostics = { provider: 'openrouter', model: 'openai/gpt-6.1-sol', calls: 2, inputTokens: 5200, outputTokens: 640, costUsd: 0.0123, ms: 14200 };
const capture = async () => {
  fireEvent.change(screen.getByLabelText("What's on your mind?"), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
  await screen.findByRole('heading', { name: 'Let this moment grow' });
};
const pull = () => fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));

// These flows are about the model switch, so they run in Outline; the board has its own tests.
beforeEach(() => { localStorage.clear(); localStorage.setItem('miqra_canvas_view_v1:member-one', 'outline'); vi.clearAllMocks(); });

describe('model picker in Living Canvas', () => {
  it('is hidden from every role except developer, and their requests carry no model choice', async () => {
    // A pick left in storage must not reach a request from a role that cannot use it (a demoted account, say).
    localStorage.setItem('miqra_canvas_model_v1:member-one', keyOf('openai/gpt-6.1-sol'));
    for (const role of ['student', 'leader', 'admin']) {
      const view = mount(role); await capture();
      expect(screen.queryByLabelText(/AI model/)).not.toBeInTheDocument();
      requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion()], diagnostics });
      pull();
      await screen.findByRole('button', { name: 'Add Galatians 6:2 to canvas' });
      expect(requestCanvas.mock.lastCall[0]).toEqual({ action: 'related', glimpse: text, focus: '', exclude: [] });
      expect(screen.queryByRole('status', { name: 'Model used for these results' })).not.toBeInTheDocument();
      view.unmount(); localStorage.removeItem('miqra_canvas_v1:member-one:org'); localStorage.setItem('miqra_canvas_view_v1:member-one', 'outline');
    }
  });

  it('lets a developer pick from both providers, groups them, and sends the pick with the pull', async () => {
    mount('developer'); await capture();
    const select = screen.getByLabelText(/AI model/);
    expect(select).toHaveValue('');
    expect(within(select).getByRole('option', { name: 'Server default' })).toBeInTheDocument();
    const groups = within(select).getAllByRole('group').map((group) => group.getAttribute('label'));
    expect(groups).toEqual(['SiliconFlow · Chinese models', 'OpenRouter · Frontier models']);
    expect(within(select).getByRole('option', { name: 'Kimi K3' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'GLM 5.3 · thinks first' })).toBeInTheDocument();
    for (const name of ['GPT-6.1 Sol', 'Claude Sonnet 5.5', 'Gemini 4 Argon']) expect(within(select).getByRole('option', { name })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: keyOf('openai/gpt-6.1-sol') } });
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion()], diagnostics });
    pull();
    await screen.findByRole('button', { name: 'Add Galatians 6:2 to canvas' });
    expect(requestCanvas.mock.lastCall[0]).toEqual({ action: 'related', glimpse: text, focus: '', exclude: [], modelChoice: 'openrouter:openai/gpt-6.1-sol' });
    expect(screen.getByRole('status', { name: 'Model used for these results' })).toHaveTextContent('GPT-6.1 Sol · 14.2s · 5,200 in / 640 out · $0.012');

    // Switching back to the default stops sending a choice.
    fireEvent.change(select, { target: { value: '' } });
    requestCanvas.mockResolvedValueOnce({ suggestions: [], diagnostics: { ...diagnostics, provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V4-Flash', costUsd: null } });
    pull();
    await screen.findByText('No new passages were returned. Try a different focus.');
    expect(requestCanvas.mock.lastCall[0]).not.toHaveProperty('modelChoice');
    expect(screen.getByRole('status', { name: 'Model used for these results' })).toHaveTextContent('DeepSeek V4 Flash · 14.2s · 5,200 in / 640 out');
    expect(screen.getByRole('status', { name: 'Model used for these results' })).not.toHaveTextContent('$');
  });

  it('remembers the pick for this account and device, and drops a pick that is no longer offered', async () => {
    const view = mount('developer'); await capture();
    fireEvent.change(screen.getByLabelText(/AI model/), { target: { value: keyOf('moonshotai/Kimi-K3') } });
    expect(localStorage.getItem('miqra_canvas_model_v1:member-one')).toBe('siliconflow:moonshotai/Kimi-K3');
    view.unmount();
    // The picker lives inside an open moment, so come back to it the way a person would.
    const reopen = async () => { fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) })); return screen.findByLabelText(/AI model/); };
    const again = mount('developer');
    expect(await reopen()).toHaveValue('siliconflow:moonshotai/Kimi-K3');

    again.unmount();
    localStorage.setItem('miqra_canvas_model_v1:member-one', 'openrouter:retired/model');
    mount('developer');
    expect(await reopen()).toHaveValue('');
  });

  it('keeps the picker out of reach while a request is running', async () => {
    mount('developer'); await capture();
    requestCanvas.mockImplementation(() => new Promise(() => {}));
    pull();
    await waitFor(() => expect(screen.getByLabelText(/AI model/)).toBeDisabled());
  });
});
