// Feedback ticket d332b7e0: pressing Back with the scripture reader open took
// users all the way out to the page they had navigated in from. These cover the
// contract that fixes it — Back closes the overlay and leaves the route alone,
// and no dead history entries pile up when it is closed any other way.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import useBackDismiss from './useBackDismiss';

function Overlay({ onDismissSpy }) {
  const [open, setOpen] = useState(false);
  useBackDismiss(open, () => {
    onDismissSpy?.();
    setOpen(false);
  });
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <button onClick={() => setOpen(false)}>close</button>
      {open && <div data-testid="overlay">overlay</div>}
    </>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderAt(path, props = {}) {
  window.history.pushState({}, '', path);
  return render(
    <BrowserRouter>
      <LocationProbe />
      <Routes>
        <Route path="*" element={<Overlay {...props} />} />
      </Routes>
    </BrowserRouter>,
  );
}

// jsdom runs history.back() as a task, so let the popstate land.
async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useBackDismiss', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/studies');
  });

  it('closes the overlay on Back and stays on the same route', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderAt('/studies', { onDismissSpy: onDismiss });

    await user.click(screen.getByText('open'));
    expect(await screen.findByTestId('overlay')).toBeInTheDocument();

    await pressBack();

    await waitFor(() => expect(screen.queryByTestId('overlay')).not.toBeInTheDocument());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The whole point of the ticket: still on /studies, not bounced to the
    // page the user came from.
    expect(screen.getByTestId('path')).toHaveTextContent('/studies');
  });

  it('leaves the URL untouched while the overlay is open', async () => {
    const user = userEvent.setup();
    renderAt('/studies');

    await user.click(screen.getByText('open'));
    await screen.findByTestId('overlay');

    expect(window.location.pathname).toBe('/studies');
  });

  it('does not swallow the next Back when the overlay is closed by other means', async () => {
    const user = userEvent.setup();
    renderAt('/studies');

    // Arrive at /studies from somewhere else, so there is a real entry to go
    // back to once the overlay is out of the way.
    window.history.pushState({}, '', '/studies');

    await user.click(screen.getByText('open'));
    await screen.findByTestId('overlay');
    await user.click(screen.getByText('close'));
    await waitFor(() => expect(screen.queryByTestId('overlay')).not.toBeInTheDocument());

    // The placeholder must already be gone, or this Back would be spent
    // closing an overlay that is no longer on screen.
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBeFalsy());
  });

  it('re-arms after reopening, so Back keeps working', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderAt('/studies', { onDismissSpy: onDismiss });

    await user.click(screen.getByText('open'));
    await screen.findByTestId('overlay');
    await pressBack();
    await waitFor(() => expect(screen.queryByTestId('overlay')).not.toBeInTheDocument());

    await user.click(screen.getByText('open'));
    await screen.findByTestId('overlay');
    await pressBack();

    await waitFor(() => expect(screen.queryByTestId('overlay')).not.toBeInTheDocument());
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('path')).toHaveTextContent('/studies');
  });

  it('does nothing at all while inactive', async () => {
    renderAt('/studies');
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBeFalsy());
  });
});
