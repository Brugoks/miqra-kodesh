import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import CanvasOAuthConsent from './CanvasOAuthConsent';
const oauth = vi.hoisted(() => ({ getAuthorizationDetails: vi.fn(), approveAuthorization: vi.fn(), denyAuthorization: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { oauth } } }));
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/oauth/consent?authorization_id=request-one'); });
const details = { authorization_id: 'request-one', client: { name: 'ChatGPT' }, redirect_uri: 'https://chatgpt.com/connector/oauth/test', scope: 'openid email' };
it('shows verified requesting client and privacy terms without automatically granting access', async () => {
  oauth.getAuthorizationDetails.mockResolvedValue({ data: details });
  render(<CanvasOAuthConsent />);
  expect(await screen.findByText(/ChatGPT wants/)).toBeInTheDocument();
  expect(screen.getByText(/private journal entries/)).toBeInTheDocument();
  expect(oauth.approveAuthorization).not.toHaveBeenCalled();
  oauth.approveAuthorization.mockResolvedValue({ error: new Error('Failed') });
  fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
  await waitFor(() => expect(oauth.approveAuthorization).toHaveBeenCalledWith('request-one', { skipBrowserRedirect: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish authorization');
});
it('handles expired requests without enabling consent', async () => {
  oauth.getAuthorizationDetails.mockResolvedValue({ error: new Error('Expired') });
  render(<CanvasOAuthConsent />);
  expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  expect(screen.getByRole('button', { name: 'Connect account' })).toBeDisabled();
});
it('does not request details when authorization_id is absent', () => {
  window.history.replaceState({}, '', '/oauth/consent');
  render(<CanvasOAuthConsent />);
  expect(screen.getByRole('alert')).toHaveTextContent('Missing authorization');
  expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled();
});
