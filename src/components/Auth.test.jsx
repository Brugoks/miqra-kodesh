import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSupabase = vi.hoisted(() => ({
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signInWithOAuth: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: mockSupabase,
}));

import Auth from './Auth';

const mockSelect = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

describe('Auth Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSelect);
    mockSelect.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
  });

  it('renders sign-in form with generic portal headers', () => {
    render(<Auth />);
    expect(screen.getByRole('heading', { name: 'Students Portal' })).toBeInTheDocument();
    expect(screen.getByText('Miqra Kodesh Student Small Groups')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Organization Join Code')).not.toBeInTheDocument();
  });

  it('toggles to sign-up mode and displays join code field', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const toggleBtn = screen.getByRole('button', { name: 'Create New Account' });
    await user.click(toggleBtn);

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Organization Join Code')).toBeInTheDocument();
  });

  it('rejects sign-up with invalid join code', async () => {
    const user = userEvent.setup();
    mockSelect.maybeSingle.mockResolvedValue({ data: null, error: new Error('Not found') });
    render(<Auth />);

    // Switch to sign up
    await user.click(screen.getByRole('button', { name: 'Create New Account' }));

    // Type fields
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Organization Join Code'), 'INVALID-CODE');

    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Invalid organization join code. Please check with your leader.')).toBeInTheDocument();
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('completes sign-up with a valid join code', async () => {
    const user = userEvent.setup();
    mockSelect.maybeSingle.mockResolvedValue({ data: { id: 'org-1', name: 'Test Org' }, error: null });
    mockSupabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    render(<Auth />);

    await user.click(screen.getByRole('button', { name: 'Create New Account' }));

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Organization Join Code'), 'VALID-CODE');

    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    await vi.waitFor(() => {
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: {
          data: { invite_code: 'VALID-CODE' }
        }
      });
    });
  });

  it('rejects OAuth signup without a join code', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    await user.click(screen.getByRole('button', { name: 'Create New Account' }));

    const googleBtn = screen.getByRole('button', { name: 'Continue with Google' });
    await user.click(googleBtn);

    expect(screen.getByText('Please enter an organization join code before signing up.')).toBeInTheDocument();
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('validates and stores join code on OAuth signup', async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockSelect.maybeSingle.mockResolvedValue({ data: { id: 'org-1' }, error: null });

    render(<Auth />);
    await user.click(screen.getByRole('button', { name: 'Create New Account' }));
    await user.type(screen.getByLabelText('Organization Join Code'), 'OAUTH-CODE');

    const googleBtn = screen.getByRole('button', { name: 'Continue with Google' });
    await user.click(googleBtn);

    await vi.waitFor(() => {
      expect(storageSpy).toHaveBeenCalledWith('pending_invite_code', 'OAUTH-CODE');
      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    });
    storageSpy.mockRestore();
  });
});
