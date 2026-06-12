import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const ORG_A = { id: 'org-a', name: 'First Church', slug: 'first-church', logo_url: null, primary_color: '#2e52be', secondary_color: '#ffffff' };
const ORG_B = { id: 'org-b', name: 'Second Church', slug: 'second-church', logo_url: null, primary_color: '#ff0000', secondary_color: '#f0f0f0' };

const mockSession = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
  },
};

const mockSubscription = { unsubscribe: vi.fn() };

function createChain(finalValue = { data: null, error: null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(finalValue),
    single: vi.fn().mockResolvedValue(finalValue),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve(finalValue)),
  };
  return chain;
}

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
    exchangeCodeForSession: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: mockSupabase,
}));

import App from '../App';

describe('Organization switching and joining', () => {
  let profilesChain;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } });
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      callback('SIGNED_IN', mockSession);
      return { data: { subscription: mockSubscription } };
    });

    profilesChain = createChain({
      data: {
        role: 'student',
        active_organization: ORG_A,
        profile_organizations: [
          { organization: ORG_A },
          { organization: ORG_B },
        ],
      },
      error: null,
    });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return profilesChain;
      return createChain();
    });
  });

  it('displays the active organization name in the footer', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/First Church\. Student Small Groups\./)).toBeInTheDocument();
    });
  });

  it('shows organization list in the profile menu', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Test User' }));

    expect(screen.getByText('Your Organizations')).toBeInTheDocument();
    expect(screen.getAllByText('First Church').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Second Church')).toBeInTheDocument();
  });

  it('switches organization when a different org is clicked in profile menu', async () => {
    const user = userEvent.setup();
    const updateChain = createChain({ data: null, error: null });
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return { ...profilesChain, update: vi.fn(() => updateChain) };
      if (table === 'profile_organizations') return createChain();
      return createChain();
    });

    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Test User' }));
    await user.click(screen.getByText('Second Church'));

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
    });
  });

  it('opens JoinOrgModal from profile menu', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Test User' }));
    await user.click(screen.getByText('+ Join Another Org'));

    expect(screen.getByRole('dialog', { name: 'Join Organization' })).toBeInTheDocument();
    expect(screen.getByLabelText('Join Code')).toBeInTheDocument();
  });

  it('joins a new organization with valid code via the modal', async () => {
    const user = userEvent.setup();
    const orgChain = createChain({ data: { id: 'org-c', name: 'Third Church' }, error: null });
    const joinChain = createChain();

    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Test User' }));
    await user.click(screen.getByText('+ Join Another Org'));

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'organizations') return orgChain;
      if (table === 'profile_organizations') return joinChain;
      if (table === 'profiles') return profilesChain;
      return createChain();
    });

    await user.type(screen.getByLabelText('Join Code'), 'NEW-ORG-CODE');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('organizations');
    });
  });

  it('shows error in modal for invalid join code', async () => {
    const user = userEvent.setup();
    const orgChain = createChain({ data: null, error: null });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'organizations') return orgChain;
      if (table === 'profiles') return profilesChain;
      return createChain();
    });

    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Test User' }));
    await user.click(screen.getByText('+ Join Another Org'));

    await user.type(screen.getByLabelText('Join Code'), 'BAD-CODE');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Invalid organization join code.')).toBeInTheDocument();
  });
});
