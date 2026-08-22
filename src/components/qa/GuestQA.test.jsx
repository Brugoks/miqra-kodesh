import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const invoke = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: { functions: { invoke: (...args) => invoke(...args) } },
}));

import GuestQA from './GuestQA';

const SESSION = {
  found: true,
  session: {
    id: 's1',
    title: 'CV Students Q&R',
    topic: 'The Book of Revelation',
    accepting: true,
    voting_enabled: true,
  },
  organization: { name: 'Charleston Baptist', primary_color: '#2e52be' },
  questions: [
    { id: 'q1', title: 'Who is the beast?', vote_count: 5, voted: false, created_at: '2026-08-03T18:00:00Z' },
    { id: 'q2', title: 'What is the millennium?', vote_count: 9, voted: false, created_at: '2026-08-03T18:05:00Z' },
  ],
};

const renderGuest = (path = '/q/ABCD2345') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/q/:code" element={<GuestQA />} />
    </Routes>
  </MemoryRouter>,
);

const lastBodyFor = (action) => invoke.mock.calls
  .map(([, opts]) => opts.body)
  .filter((body) => body.action === action)
  .at(-1);

describe('GuestQA', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: SESSION, error: null });
    localStorage.clear();
  });

  it('loads the session by its join code, upper-cased', async () => {
    renderGuest('/q/abcd2345');

    expect(await screen.findByText('CV Students Q&R')).toBeInTheDocument();
    expect(screen.getByText('The Book of Revelation')).toBeInTheDocument();
    expect(lastBodyFor('load').code).toBe('ABCD2345');
  });

  it('ranks questions by vote count rather than recency', async () => {
    renderGuest();

    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]).getByText('What is the millennium?')).toBeInTheDocument();
    expect(within(items[1]).getByText('Who is the beast?')).toBeInTheDocument();
  });

  it('submits anonymously unless a name is added', async () => {
    const user = userEvent.setup();
    renderGuest();
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'Is hell forever?');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit')).toBeTruthy());
    expect(lastBodyFor('submit')).toMatchObject({ title: 'Is hell forever?', name: '' });
  });

  it('sends the typed name when the guest opts in', async () => {
    const user = userEvent.setup();
    renderGuest();
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'Why does God allow suffering?');
    await user.click(screen.getByRole('checkbox', { name: /add my name/i }));
    await user.type(screen.getByPlaceholderText('Your name'), 'Sam');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit')).toBeTruthy());
    expect(lastBodyFor('submit')).toMatchObject({ name: 'Sam' });
  });

  // The shared laptop in the room is used by a queue of different students, so
  // one person's device token must not carry over to the next.
  it('rotates the device token after each submission in kiosk mode', async () => {
    const user = userEvent.setup();
    renderGuest('/q/ABCD2345?kiosk=1');
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'First question');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit')).toBeTruthy());
    const firstToken = lastBodyFor('submit').deviceToken;

    await user.type(screen.getByLabelText('Your question'), 'Second question');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit').title).toBe('Second question'));
    expect(lastBodyFor('submit').deviceToken).not.toBe(firstToken);
  });

  it('keeps the same device token outside kiosk mode', async () => {
    const user = userEvent.setup();
    renderGuest();
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'First question');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit')).toBeTruthy());
    const firstToken = lastBodyFor('submit').deviceToken;

    await user.type(screen.getByLabelText('Your question'), 'Second question');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit').title).toBe('Second question'));
    expect(lastBodyFor('submit').deviceToken).toBe(firstToken);
  });

  it('clears the name field between kiosk submissions', async () => {
    const user = userEvent.setup();
    renderGuest('/q/ABCD2345?kiosk=1');
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'First question');
    await user.click(screen.getByRole('checkbox', { name: /add my name/i }));
    await user.type(screen.getByPlaceholderText('Your name'), 'Sam');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => expect(lastBodyFor('submit')).toBeTruthy());
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /add my name/i })).not.toBeChecked();
  });

  it('tells the guest their question is waiting on a leader when review is on', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValueOnce({ data: SESSION, error: null });
    invoke.mockResolvedValueOnce({
      data: { ...SESSION, submitted: { id: 'q3', status: 'pending' } },
      error: null,
    });

    renderGuest();
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'Something sensitive');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    expect(await screen.findByText(/a leader will review it/i)).toBeInTheDocument();
  });

  it('surfaces the server message when the rate limit rejects a submission', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValueOnce({ data: SESSION, error: null });
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'You are sending questions too quickly. Give it a minute.' }) },
      },
    });

    renderGuest();
    await screen.findByText('CV Students Q&R');

    await user.type(screen.getByLabelText('Your question'), 'Spam spam spam');
    await user.click(screen.getByRole('button', { name: /send question/i }));

    expect(await screen.findByText(/too quickly/i)).toBeInTheDocument();
  });

  it('hides the form but keeps the list when the session stops accepting', async () => {
    invoke.mockResolvedValue({
      data: { ...SESSION, session: { ...SESSION.session, accepting: false } },
      error: null,
    });

    renderGuest();

    expect(await screen.findByText(/isn't taking new questions/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send question/i })).not.toBeInTheDocument();
    expect(screen.getByText('Who is the beast?')).toBeInTheDocument();
  });

  it('hides upvote controls when guest voting is turned off', async () => {
    invoke.mockResolvedValue({
      data: { ...SESSION, session: { ...SESSION.session, voting_enabled: false } },
      error: null,
    });

    renderGuest();
    await screen.findByText('Who is the beast?');

    expect(screen.queryByRole('button', { name: /upvote this question/i })).not.toBeInTheDocument();
  });

  it('reports an unknown code instead of rendering an empty board', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'That code did not match a session.' }) },
      },
    });

    renderGuest('/q/NOPENOPE');

    expect(await screen.findByText(/did not match a session/i)).toBeInTheDocument();
  });
});
