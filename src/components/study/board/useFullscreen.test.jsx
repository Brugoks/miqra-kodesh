import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useFullscreen from './useFullscreen';

function Probe({ initial = false }) {
  const root = useRef(null);
  const { fullscreen, enter, exit } = useFullscreen(root, { initial });
  return <div ref={root} data-testid="root">
    <button onClick={enter}>enter</button><button onClick={exit}>exit</button>
    <span data-testid="state">{fullscreen ? 'on' : 'off'}</span><Where />
  </div>;
}
function Where() { return <span data-testid="path">{useLocation().pathname}</span>; }
const mount = (props) => render(<BrowserRouter><Probe {...props} /></BrowserRouter>);
const state = () => screen.getByTestId('state').textContent;
const locked = () => document.body.classList.contains('lc-fullscreen-lock') && document.documentElement.classList.contains('lc-fullscreen-lock');

// A browser that grants real full screen: tracks the element and announces changes like the real thing.
function grantFullscreen() {
  let current = null;
  const announce = () => document.dispatchEvent(new Event('fullscreenchange'));
  const request = vi.fn(function request() { current = this; return Promise.resolve().then(announce); });
  const exit = vi.fn(() => { current = null; return Promise.resolve().then(announce); });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Element.prototype.requestFullscreen = request;
  document.exitFullscreen = exit;
  return { request, exit, leaveBySystemGesture: () => { current = null; announce(); } };
}

beforeEach(() => { window.history.replaceState(null, '', '/study-canvas'); });
// jsdom has no matchMedia: give it one, answering (pointer: coarse) for a touch screen or a mouse.
const pointer = (coarse) => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query) => ({ matches: coarse && query.includes('coarse'), media: query, addEventListener() {}, removeEventListener() {} }) });
afterEach(() => {
  delete window.matchMedia;
  delete Element.prototype.requestFullscreen; delete document.exitFullscreen; delete document.fullscreenElement;
  document.body.classList.remove('lc-fullscreen-lock'); document.documentElement.classList.remove('lc-fullscreen-lock');
});

describe('full screen without the browser\'s help (iPhone)', () => {
  it('fills the viewport, locks the page behind it, and gives both back on exit', async () => {
    const user = userEvent.setup(); mount();
    expect(state()).toBe('off'); expect(locked()).toBe(false);
    await user.click(screen.getByText('enter'));
    expect(state()).toBe('on'); expect(locked()).toBe(true);
    await user.click(screen.getByText('exit'));
    expect(state()).toBe('off'); expect(locked()).toBe(false);
  });

  it('closes on Back and leaves the page where it was', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBe(true)); // Back has an entry of its own to consume
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(state()).toBe('off'));
    expect(locked()).toBe(false);
    expect(screen.getByTestId('path')).toHaveTextContent('/study-canvas');
  });

  it('puts the lock back when it is torn down while still open', async () => {
    const user = userEvent.setup(); const view = mount();
    await user.click(screen.getByText('enter'));
    view.unmount();
    expect(locked()).toBe(false);
  });
});

describe('starting full window, because that is how the person likes it', () => {
  it('is on from the first render, locks the page, and asks the browser for nothing', () => {
    pointer(true); // even a touch screen: real full screen needs a tap, and nobody has tapped
    const api = grantFullscreen(); mount({ initial: true });
    expect(state()).toBe('on'); expect(locked()).toBe(true);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('is the page, not an overlay: it makes no Back entry, so Back leaves the page as it always did', async () => {
    mount({ initial: true });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(window.history.state?.usr?.miqraBackDismiss).toBeUndefined();
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(state()).toBe('on'); // there was nothing to consume
  });

  it('gives the lock back on exit, and becomes an overlay with a Back entry once the person opens it again', async () => {
    const user = userEvent.setup(); mount({ initial: true });
    await user.click(screen.getByText('exit'));
    expect(state()).toBe('off'); expect(locked()).toBe(false);
    await user.click(screen.getByText('enter'));
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBe(true));
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(state()).toBe('off'));
  });

  it('puts the lock back when it is torn down while open', () => {
    const view = mount({ initial: true });
    view.unmount();
    expect(locked()).toBe(false);
  });
});

describe('a desktop with a mouse', () => {
  it('fills the window and leaves the rest of the screen alone: no real full screen is requested', async () => {
    pointer(false);
    const api = grantFullscreen(); const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    expect(state()).toBe('on'); expect(locked()).toBe(true);
    expect(api.request).not.toHaveBeenCalled();
    await user.click(screen.getByText('exit'));
    expect(api.exit).not.toHaveBeenCalled();
    expect(state()).toBe('off');
  });
});

describe('real full screen where the browser allows it (Android, iPad)', () => {
  beforeEach(() => pointer(true));

  it('asks for it on the workspace, with the browser\'s own bars hidden, and gives it up on exit', async () => {
    const api = grantFullscreen(); const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.contexts[0]).toBe(screen.getByTestId('root'));
    expect(api.request).toHaveBeenCalledWith({ navigationUI: 'hide' });
    await waitFor(() => expect(document.fullscreenElement).toBe(screen.getByTestId('root')));
    expect(state()).toBe('on');
    await user.click(screen.getByText('exit'));
    await waitFor(() => expect(api.exit).toHaveBeenCalledTimes(1));
    expect(state()).toBe('off');
  });

  it('leaves ours too when the person leaves real full screen with a swipe or Escape', async () => {
    const api = grantFullscreen(); const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    await waitFor(() => expect(document.fullscreenElement).not.toBeNull());
    act(() => api.leaveBySystemGesture());
    expect(state()).toBe('off'); expect(locked()).toBe(false);
    expect(api.exit).not.toHaveBeenCalled(); // already out: nothing to exit
  });

  it('stays full screen in the page when the browser refuses, and ignores later changes', async () => {
    const api = grantFullscreen(); api.request.mockRejectedValue(new Error('Permissions check failed'));
    const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe('on');
    act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
    expect(state()).toBe('on');
  });

  it('gives up real full screen for the Scripture reader but keeps the workspace full screen', async () => {
    const api = grantFullscreen(); const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    await waitFor(() => expect(document.fullscreenElement).not.toBeNull());
    act(() => { window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: 'John 3:16' } })); });
    await waitFor(() => expect(api.exit).toHaveBeenCalledTimes(1));
    expect(state()).toBe('on'); expect(locked()).toBe(true);
    await user.click(screen.getByText('exit'));
    expect(api.exit).toHaveBeenCalledTimes(1);
  });

  it('lets go if the browser grants real full screen after the person has already left', async () => {
    const api = grantFullscreen();
    let grant; api.request.mockImplementation(function request() { return new Promise((resolve) => { grant = () => { document.dispatchEvent(new Event('fullscreenchange')); resolve(); }; }); });
    const user = userEvent.setup(); mount();
    await user.click(screen.getByText('enter'));
    await user.click(screen.getByText('exit'));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => screen.getByTestId('root') });
    await act(async () => { grant(); await Promise.resolve(); });
    await waitFor(() => expect(api.exit).toHaveBeenCalled());
    expect(state()).toBe('off');
  });

  it('exits real full screen when unmounted while open', async () => {
    const api = grantFullscreen(); const user = userEvent.setup(); const view = mount();
    await user.click(screen.getByText('enter'));
    await waitFor(() => expect(document.fullscreenElement).not.toBeNull());
    view.unmount();
    expect(api.exit).toHaveBeenCalledTimes(1);
  });
});
