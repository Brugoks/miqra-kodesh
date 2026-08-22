// Coverage for the reader's "Ask AI" panel: the passage has to stay on screen
// alongside the conversation, questions must go out through openrouter-proxy on
// a free model with the passage as context, and a failed turn must be
// recoverable without retyping the question.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AskAiPanel from './AskAiPanel';

const mockInvoke = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: { functions: { invoke: (...args) => mockInvoke(...args) } },
}));

const passage = {
  ref: 'John 3:16-17',
  label: 'ESV',
  verses: [
    { chapter: 3, verse: 16, text: 'For God so loved the world.' },
    { chapter: 3, verse: 17, text: 'For God did not send his Son to condemn.' },
  ],
  text: '[16] For God so loved the world. [17] For God did not send his Son to condemn.',
};

function renderPanel(props = {}) {
  return render(
    <AskAiPanel passage={passage} onClose={() => {}} userId="user-1" {...props} />,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('AskAiPanel', () => {
  it('shows the looked-up passage above the prompt window', () => {
    renderPanel();
    expect(screen.getAllByText('John 3:16-17').length).toBeGreaterThan(0);
    expect(screen.getByText('For God so loved the world.')).toBeInTheDocument();
    expect(screen.getByLabelText(/ask a question about john 3:16-17/i)).toBeInTheDocument();
  });

  it('sends the question to openrouter-proxy on a free model with the passage as context', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: { content: 'It means God gave his Son.' }, error: null });
    renderPanel();

    await user.type(screen.getByLabelText(/ask a question/i), 'What does this mean?');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    const [fn, { body }] = mockInvoke.mock.calls[0];
    expect(fn).toBe('openrouter-proxy');
    expect(body.model).toBe('openrouter/free');
    expect(body.userId).toBe('user-1');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('John 3:16-17');
    expect(body.messages[0].content).toContain('For God so loved the world.');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'What does this mean?' });

    expect(await screen.findByText('It means God gave his Son.')).toBeInTheDocument();
  });

  it('sends a starter question on tap', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: { content: 'Here is the background.' }, error: null });
    renderPanel();

    await user.click(screen.getByRole('button', { name: /what was going on when this was written/i }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke.mock.calls[0][1].body.messages.at(-1).content)
      .toBe('What was going on when this was written?');
  });

  it('replays the question when a failed turn is retried', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Rate limited' } });
    renderPanel();

    await user.type(screen.getByLabelText(/ask a question/i), 'Why?');
    await user.click(screen.getByRole('button', { name: /send question/i }));
    expect(await screen.findByText('Rate limited')).toBeInTheDocument();

    mockInvoke.mockResolvedValueOnce({ data: { content: 'Because of love.' }, error: null });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Because of love.')).toBeInTheDocument();
    // The failed turn is replaced rather than duplicated.
    expect(screen.getAllByText('Why?')).toHaveLength(1);
  });

  it('carries earlier turns into the next question', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: { content: 'An answer.' }, error: null });
    renderPanel();

    const input = screen.getByLabelText(/ask a question/i);
    await user.type(input, 'First question?{Enter}');
    expect(await screen.findByText('An answer.')).toBeInTheDocument();

    await user.type(input, 'Second question?{Enter}');
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));

    const { messages } = mockInvoke.mock.calls[1][1].body;
    expect(messages.map((m) => m.content)).toEqual([
      expect.stringContaining('John 3:16-17'),
      'First question?',
      'An answer.',
      'Second question?',
    ]);
  });
});
