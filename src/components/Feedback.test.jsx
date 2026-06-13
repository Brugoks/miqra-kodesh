import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/feedbackApi', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchBoard: vi.fn(),
    searchSimilar: vi.fn().mockResolvedValue([]),
    fetchUserVotes: vi.fn().mockResolvedValue(new Set()),
    toggleVote: vi.fn().mockResolvedValue(true),
  };
});

// Stub the child views — they have their own tests.
vi.mock('./FeedbackSubmitForm', () => ({
  default: ({ onCancel }) => (
    <div>
      submit-form-stub
      <button onClick={onCancel}>stub-cancel</button>
    </div>
  ),
}));
vi.mock('./FeedbackTicketDetail', () => ({
  default: ({ ticketId }) => <div>detail-stub:{ticketId}</div>,
}));

import { fetchBoard, fetchUserVotes, toggleVote } from '../lib/feedbackApi';
import Feedback from './Feedback';

const SESSION = { user: { id: 'u1', email: 'user@example.com' } };

const TICKETS = [
  {
    id: 't1',
    title: 'Calendar crashes on RSVP',
    description: 'It crashes every time.',
    category: 'bug',
    app_area: 'calendar',
    status: 'open',
    priority: 'high',
    votes: 3,
    comments: 2,
    rank_score: 215,
    screenshot_paths: [],
    author_name: 'Alice',
    created_at: '2026-06-01T12:00:00Z',
  },
  {
    id: 't2',
    title: 'Add dark mode',
    description: 'Please.',
    category: 'feature',
    app_area: 'other',
    status: 'planned',
    priority: null,
    votes: 7,
    comments: 0,
    rank_score: 35,
    screenshot_paths: [],
    author_name: 'Bob',
    created_at: '2026-06-02T12:00:00Z',
  },
];

function renderBoard() {
  return render(<Feedback session={SESSION} userRole="student" />);
}

describe('Feedback board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBoard.mockResolvedValue(TICKETS);
    fetchUserVotes.mockResolvedValue(new Set());
    toggleVote.mockResolvedValue(true);
  });

  it('renders tickets from the API with badges and counts', async () => {
    renderBoard();

    expect(await screen.findByText('Calendar crashes on RSVP')).toBeInTheDocument();
    expect(screen.getByText('Add dark mode')).toBeInTheDocument();
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    const darkModeCard = screen.getByText('Add dark mode').closest('.feedback-card');
    expect(within(darkModeCard).getByText('Planned')).toBeInTheDocument();
    expect(fetchBoard).toHaveBeenCalledWith({ sort: 'trending', status: 'active' });
  });

  it('shows the empty state when there are no tickets', async () => {
    fetchBoard.mockResolvedValue([]);
    renderBoard();
    expect(await screen.findByText(/no feedback yet/i)).toBeInTheDocument();
  });

  it('optimistically updates the vote count on upvote', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Calendar crashes on RSVP');

    const [voteT1] = screen.getAllByRole('button', { name: 'Upvote' });
    expect(voteT1).toHaveTextContent('3');
    await user.click(voteT1);

    expect(voteT1).toHaveTextContent('4');
    expect(toggleVote).toHaveBeenCalledWith('t1', 'u1', false);
    expect(screen.getByRole('button', { name: 'Remove vote' })).toBeInTheDocument();
  });

  it('rolls back the optimistic vote when the API fails', async () => {
    const user = userEvent.setup();
    toggleVote.mockRejectedValue(new Error('nope'));
    renderBoard();
    await screen.findByText('Calendar crashes on RSVP');

    const [voteT1] = screen.getAllByRole('button', { name: 'Upvote' });
    await user.click(voteT1);

    await vi.waitFor(() => expect(voteT1).toHaveTextContent('3'));
    expect(screen.queryByRole('button', { name: 'Remove vote' })).not.toBeInTheDocument();
  });

  it('refetches when the status filter changes', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Calendar crashes on RSVP');

    await user.click(screen.getByRole('button', { name: 'In Progress' }));
    await vi.waitFor(() =>
      expect(fetchBoard).toHaveBeenCalledWith({ sort: 'trending', status: 'in_progress' })
    );
  });

  it('switches to the submit form and back', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Calendar crashes on RSVP');

    await user.click(screen.getByRole('button', { name: /submit feedback/i }));
    expect(screen.getByText('submit-form-stub')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'stub-cancel' }));
    expect(await screen.findByText('Calendar crashes on RSVP')).toBeInTheDocument();
  });

  it('opens the ticket detail when a card is clicked', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByText('Calendar crashes on RSVP'));
    expect(screen.getByText('detail-stub:t1')).toBeInTheDocument();
  });
});
