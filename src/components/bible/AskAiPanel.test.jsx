// Coverage for the reader's "Ask AI" panel: the passage has to stay on screen
// alongside the conversation, the split between the two has to follow what the
// reader is actually doing (and stop following once they size it themselves),
// questions must go out through openrouter-proxy on a free model with the
// passage and the brevity rules as context, and a failed turn must be
// recoverable without retyping the question.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
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

// The split is expressed as the fraction of the pane area given to the passage.
const splitFraction = () =>
  Number(screen.getByRole('separator').getAttribute('aria-valuenow'));

// jsdom has no layout, so the shrink-to-fit measurement reads zeroes and stays
// disabled. Feed it the heights a browser would report, then let the resize
// listener re-measure.
function stubLayout(container, { areaHeight = 600, chrome = 30, contentHeight }) {
  const area = container.querySelector('.bl-ask-split');
  const section = container.querySelector('.bl-ask-scripture');
  const body = container.querySelector('.bl-ask-scripture-body');
  const bodyHeight = 200;
  area.getBoundingClientRect = () => ({ height: areaHeight, top: 0 });
  section.getBoundingClientRect = () => ({ height: bodyHeight + chrome });
  body.getBoundingClientRect = () => ({ height: bodyHeight });
  Object.defineProperty(body, 'scrollHeight', { value: contentHeight, configurable: true });
  act(() => { fireEvent(window, new Event('resize')); });
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

  it('instructs the model to keep answers short and to the point', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: { content: 'Short answer.' }, error: null });
    renderPanel();

    await user.type(screen.getByLabelText(/ask a question/i), 'Why?{Enter}');
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    const { body } = mockInvoke.mock.calls[0][1];
    const system = body.messages[0].content;
    expect(system).toContain('Put the answer in the first sentence');
    expect(system).toContain('under 120 words');
    expect(system).toContain('No sign-off');
    // The token ceiling backs the instruction up, since prompts drift.
    expect(body.maxTokens).toBeLessThanOrEqual(500);
  });

  it('renders a bulleted answer as a list rather than a run of dashes', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      data: { content: '- God loved\n- God gave\n- We believe' },
      error: null,
    });
    renderPanel();

    await user.type(screen.getByLabelText(/ask a question/i), 'Summarise?{Enter}');

    expect(await screen.findByText('God loved')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('sends a starter question on tap', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: { content: 'Here is the background.' }, error: null });
    renderPanel();

    await user.click(screen.getByRole('button', { name: /what was going on here/i }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke.mock.calls[0][1].body.messages.at(-1).content)
      .toBe('What was going on here?');
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

  describe('the split between passage and conversation', () => {
    it('opens with the passage dominant and hands the screen over once answers arrive', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ data: { content: 'An answer.' }, error: null });
      renderPanel();

      const opening = splitFraction();
      expect(opening).toBeGreaterThan(55);

      await user.type(screen.getByLabelText(/ask a question/i), 'Why?{Enter}');
      await screen.findByText('An answer.');

      expect(splitFraction()).toBeLessThan(40);
    });

    it('gives the composer room while a first question is being typed', async () => {
      const user = userEvent.setup();
      renderPanel();

      const opening = splitFraction();
      await user.click(screen.getByLabelText(/ask a question/i));

      expect(splitFraction()).toBeLessThan(opening);
    });

    it('stops moving on its own once the reader resizes it', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ data: { content: 'An answer.' }, error: null });
      renderPanel();

      const separator = screen.getByRole('separator');
      separator.focus();
      await user.keyboard('{ArrowUp}');
      const chosen = splitFraction();
      expect(chosen).toBeLessThan(66);

      await user.type(screen.getByLabelText(/ask a question/i), 'Why?{Enter}');
      await screen.findByText('An answer.');

      expect(splitFraction()).toBe(chosen);
    });

    it('swaps which pane is focused on Enter', async () => {
      const user = userEvent.setup();
      renderPanel();

      const separator = screen.getByRole('separator');
      separator.focus();
      expect(splitFraction()).toBeGreaterThan(50);

      await user.keyboard('{Enter}');
      expect(splitFraction()).toBeLessThan(50);

      await user.keyboard('{Enter}');
      expect(splitFraction()).toBeGreaterThan(50);
    });

    it('shrinks to fit a short passage so the conversation gets the blank space', () => {
      const { container } = renderPanel();
      expect(splitFraction()).toBeGreaterThan(55);

      // Two verses' worth of text in a 600px pane area.
      stubLayout(container, { contentHeight: 60 });

      expect(splitFraction()).toBeLessThan(25);
    });

    it('leaves a long passage at the reading size rather than growing it', () => {
      const { container } = renderPanel();
      const opening = splitFraction();

      // A full chapter — far more than the pane could show at any size.
      stubLayout(container, { contentHeight: 2000 });

      expect(splitFraction()).toBe(opening);
    });

    it('does not shrink to fit once the reader has sized the panes', async () => {
      const user = userEvent.setup();
      const { container } = renderPanel();

      screen.getByRole('separator').focus();
      await user.keyboard('{End}');
      const chosen = splitFraction();

      stubLayout(container, { contentHeight: 60 });

      expect(splitFraction()).toBe(chosen);
    });

    it('clamps the passage pane so neither half can be dragged away entirely', async () => {
      const user = userEvent.setup();
      renderPanel();

      const separator = screen.getByRole('separator');
      separator.focus();
      await user.keyboard('{End}');
      expect(splitFraction()).toBe(Number(separator.getAttribute('aria-valuemax')));

      await user.keyboard('{Home}');
      expect(splitFraction()).toBe(Number(separator.getAttribute('aria-valuemin')));
    });
  });
});
