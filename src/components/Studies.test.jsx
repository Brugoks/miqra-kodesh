import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Studies from './Studies';

// Mock Supabase client
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

describe('Studies component closest next meeting pre-selection', () => {
  const session = { user: { id: 'user-123' } };
  const userRole = 'student';
  const activeOrgId = 'org-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [] }),
    });
  });

  it('pre-selects the group with the closest upcoming meeting date when multiple groups exist', async () => {
    const groupThursday = {
      id: 'group-thu',
      name: 'Thursday Study',
      topic: 'Book of Romans',
      meeting_day: 'Thursday',
      meeting_time: '7:00 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    };
    const groupTuesday = {
      id: 'group-tue',
      name: 'Tuesday Study',
      topic: 'Gospel of John',
      meeting_day: 'Tuesday',
      meeting_time: '6:30 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    };
    const groupWednesday = {
      id: 'group-wed',
      name: 'Wednesday Study',
      topic: 'Acts of the Apostles',
      meeting_day: 'Wednesday',
      meeting_time: '6:00 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    };

    mockFrom.mockImplementation((table) => {
      if (table === 'attendance_groups') {
        return {
          select: () => Promise.resolve({ data: [groupThursday, groupTuesday, groupWednesday] }),
        };
      }
      if (table === 'study_series') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [] }),
          }),
        };
      }
      if (table === 'study_reading_progress' || table === 'study_notes') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [] }),
          }),
        };
      }
      if (table === 'group_meetings') {
        const queryChain = {
          eq: () => queryChain,
          lt: () => queryChain,
          in: () => queryChain,
          order: () => queryChain,
          limit: () => Promise.resolve({ data: [] }),
          maybeSingle: () => Promise.resolve({ data: null }),
          then: (resolve) => resolve({ data: [] }),
        };
        return { select: () => queryChain };
      }
      return { select: () => Promise.resolve({ data: [] }) };
    });

    render(
      <MemoryRouter initialEntries={['/studies']}>
        <Studies session={session} userRole={userRole} activeOrgId={activeOrgId} />
      </MemoryRouter>
    );

    // Tuesday Study (closest upcoming meeting) should be pre-selected and visible in header
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gospel of John');
    });

    // Closest Meeting badge should be rendered
    const closestBadges = screen.getAllByText('Closest Meeting');
    expect(closestBadges.length).toBeGreaterThan(0);
  });

  it('respects URL group parameter override when specified', async () => {
    const groupThursday = {
      id: 'group-thu',
      name: 'Thursday Study',
      topic: 'Book of Romans',
      meeting_day: 'Thursday',
      meeting_time: '7:00 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    };
    const groupTuesday = {
      id: 'group-tue',
      name: 'Tuesday Study',
      topic: 'Gospel of John',
      meeting_day: 'Tuesday',
      meeting_time: '6:30 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    };

    mockFrom.mockImplementation((table) => {
      if (table === 'attendance_groups') {
        return {
          select: () => Promise.resolve({ data: [groupThursday, groupTuesday] }),
        };
      }
      if (table === 'study_series') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [] }),
          }),
        };
      }
      if (table === 'study_reading_progress' || table === 'study_notes') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [] }),
          }),
        };
      }
      if (table === 'group_meetings') {
        const queryChain = {
          eq: () => queryChain,
          lt: () => queryChain,
          in: () => queryChain,
          order: () => queryChain,
          limit: () => Promise.resolve({ data: [] }),
          maybeSingle: () => Promise.resolve({ data: null }),
          then: (resolve) => resolve({ data: [] }),
        };
        return { select: () => queryChain };
      }
      return { select: () => Promise.resolve({ data: [] }) };
    });

    // Deep link specifies group-thu
    render(
      <MemoryRouter initialEntries={['/studies?group=group-thu']}>
        <Studies session={session} userRole={userRole} activeOrgId={activeOrgId} />
      </MemoryRouter>
    );

    // Thursday Study should be selected because of deep link param
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Book of Romans');
    });
  });
});
