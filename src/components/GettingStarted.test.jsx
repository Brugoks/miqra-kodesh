// Getting-started checklist (ticket 032815b7). The contract worth pinning is
// that every tick comes from what the user actually did, and that the card
// gets out of the way for good once it has nothing left to say.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockRpc = vi.fn();
const mockUpdateEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockNavigate = vi.fn();

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      update: (...args) => mockUpdate(...args),
    }),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { default: GettingStarted, GETTING_STARTED_KEY } = await import('./GettingStarted');
const { resetOnboardingCache } = await import('../lib/onboarding');

const session = { user: { id: 'user-1' } };

const NOTHING_DONE = { photo: false, reading: false, rsvp: false, chat: false, highlight: false };
const ALL_DONE = { photo: true, reading: true, rsvp: true, chat: true, highlight: true };

function renderCard() {
  return render(
    <MemoryRouter>
      <GettingStarted session={session} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  mockUpdateEq.mockResolvedValue({ error: null });
  mockMaybeSingle.mockResolvedValue({ data: { onboarding: {} }, error: null });
  mockRpc.mockResolvedValue({ data: NOTHING_DONE, error: null });
});

describe('GettingStarted', () => {
  it('lists every step with none ticked for a brand-new member', async () => {
    renderCard();

    expect(await screen.findByText('Getting started')).toBeInTheDocument();
    expect(screen.getByText('0 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a profile photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /say hello in chat/i })).toBeInTheDocument();
  });

  it('ticks only what the checklist RPC reports as done', async () => {
    mockRpc.mockResolvedValue({ data: { ...NOTHING_DONE, photo: true, chat: true }, error: null });
    renderCard();

    expect(await screen.findByText('2 of 5')).toBeInTheDocument();
    // A finished step is text, not a link to somewhere it can't help.
    expect(screen.queryByRole('button', { name: /add a profile photo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start a reading plan/i })).toBeInTheDocument();
  });

  it('sends an unfinished step to the page that completes it', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /rsvp to something/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
  });

  it('asks for the profile menu rather than routing, for the photo step', async () => {
    const user = userEvent.setup();
    const opened = vi.fn();
    window.addEventListener('profile:open', opened);
    renderCard();

    await user.click(await screen.findByRole('button', { name: /add a profile photo/i }));

    expect(opened).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    window.removeEventListener('profile:open', opened);
  });

  it('hides itself and records that, once every step is done', async () => {
    mockRpc.mockResolvedValue({ data: ALL_DONE, error: null });
    renderCard();

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
      onboarding: { [GETTING_STARTED_KEY]: true },
    }));
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });

  it('stays gone after being dismissed, and does not re-query', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCard();

    await user.click(await screen.findByRole('button', { name: /hide getting started/i }));
    await waitFor(() => expect(screen.queryByText('Getting started')).not.toBeInTheDocument());

    mockRpc.mockClear();
    mockMaybeSingle.mockResolvedValue({ data: { onboarding: { [GETTING_STARTED_KEY]: true } }, error: null });
    unmount();
    renderCard();

    await waitFor(() => expect(screen.queryByText('Getting started')).not.toBeInTheDocument());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('renders nothing rather than an empty shell when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    renderCard();

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });
});
