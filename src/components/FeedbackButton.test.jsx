import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedbackButton from './FeedbackButton';

describe('FeedbackButton', () => {
  it('renders the floating feedback pill', () => {
    render(<FeedbackButton onClick={() => {}} />);
    const button = screen.getByRole('button', { name: /open feedback board/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Feedback?');
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<FeedbackButton onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /open feedback board/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
