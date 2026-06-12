import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinOrgModal from './JoinOrgModal';

describe('JoinOrgModal', () => {
  let onJoin;
  let onClose;

  beforeEach(() => {
    onJoin = vi.fn();
    onClose = vi.fn();
  });

  it('renders the modal with input and buttons', () => {
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Join Organization' })).toBeInTheDocument();
    expect(screen.getByLabelText('Join Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('disables submit when input is empty', () => {
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.click(screen.getByTestId('join-org-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onJoin with trimmed code on submit', async () => {
    const user = userEvent.setup();
    onJoin.mockResolvedValue({ name: 'Test Church' });
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.type(screen.getByLabelText('Join Code'), '  TEST-CODE  ');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalledWith('TEST-CODE');
    });
  });

  it('shows success message after joining', async () => {
    const user = userEvent.setup();
    onJoin.mockResolvedValue({ name: 'Grace Fellowship' });
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.type(screen.getByLabelText('Join Code'), 'VALID-CODE');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Joined Grace Fellowship!')).toBeInTheDocument();
  });

  it('shows error message on invalid code', async () => {
    const user = userEvent.setup();
    onJoin.mockRejectedValue(new Error('Invalid organization join code.'));
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.type(screen.getByLabelText('Join Code'), 'BAD-CODE');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Invalid organization join code.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows Joining... while submitting', async () => {
    const user = userEvent.setup();
    let resolveJoin;
    onJoin.mockReturnValue(new Promise((resolve) => { resolveJoin = resolve; }));
    render(<JoinOrgModal onJoin={onJoin} onClose={onClose} />);

    await user.type(screen.getByLabelText('Join Code'), 'SLOW-CODE');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByRole('button', { name: 'Joining...' })).toBeDisabled();

    resolveJoin({ name: 'Slow Org' });
    await waitFor(() => {
      expect(screen.getByText('Joined Slow Org!')).toBeInTheDocument();
    });
  });
});
