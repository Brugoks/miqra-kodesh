import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TtsLoadingToast from './TtsLoadingToast';

const baseProps = {
  open: true,
  voiceLabel: 'Pastor Mark',
  etaMs: 10_000,
  startedAt: Date.now(),
  part: 1,
  totalParts: 1,
};

describe('TtsLoadingToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when closed', () => {
    render(<TtsLoadingToast {...baseProps} open={false} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the voice and an estimated wait', () => {
    render(<TtsLoadingToast {...baseProps} />);
    expect(screen.getByText(/preparing narration/i)).toBeInTheDocument();
    expect(screen.getByText(/Pastor Mark/)).toHaveTextContent('about 10s');
  });

  it('names the current part when the passage is chunked', () => {
    render(<TtsLoadingToast {...baseProps} part={2} totalParts={5} />);
    expect(screen.getByText(/part 2 of 5/i)).toBeInTheDocument();
  });

  it('counts down as time passes and stops claiming to know once overrun', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(<TtsLoadingToast {...baseProps} etaMs={4000} startedAt={startedAt} />);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('lets the user bail out', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TtsLoadingToast {...baseProps} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /stop preparing/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('never blocks the page behind it', () => {
    const { baseElement } = render(<TtsLoadingToast {...baseProps} />);
    const layer = baseElement.querySelector('.tts-toast-layer');
    expect(layer).toBeInTheDocument();
    // No backdrop element: only the pill itself is interactive.
    expect(layer.children).toHaveLength(1);
    expect(layer.firstElementChild).toHaveClass('tts-toast');
  });
});
