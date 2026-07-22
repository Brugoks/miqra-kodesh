import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

import userEvent from '@testing-library/user-event';
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

describe('Studies component', () => {
  const session = { user: { id: 'user-123' } };
  const activeOrgId = 'org-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [] }),
    });
  });

  describe('closest next meeting pre-selection', () => {
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
        meeting_time: '11:59 PM',

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
          <Studies session={session} userRole="student" activeOrgId={activeOrgId} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gospel of John');
      });

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

      render(
        <MemoryRouter initialEntries={['/studies?group=group-thu']}>
          <Studies session={session} userRole="student" activeOrgId={activeOrgId} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Book of Romans');
      });
    });
  });

  describe('editing Scripture Readings, Lesson Summary & Discussion Guide', () => {
    const groupData = [{
      id: 'g-1',
      name: 'Men Fellowship',
      topic: 'Walking in Unity',
      meeting_day: 'Tuesday',
      meeting_time: '7:00 PM',
      frequency: 'Weekly',
      students: [{ linkedUserId: 'user-123' }],
    }];

    const seriesData = [{
      id: 's-1',
      name: 'Walking in Unity',
      translation: 'Ephesians 4',
      ref: 'Ephesians 4:1-16',
      group_id: 'g-1',
      readings: [{ ref: 'Ephesians 4:1-6', category: 'Epistle', badgeClass: 'badge-epistles' }],
      summary: ['Context: Walking in humility and unity.'],
      questions: ['How can we maintain unity in our group?'],
      sort_order: 1,
    }];

    beforeEach(() => {
      mockFrom.mockImplementation((table) => {
        if (table === 'attendance_groups') {
          return { select: () => Promise.resolve({ data: groupData }) };
        }
        if (table === 'study_series') {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: seriesData }),
            }),
            upsert: () => Promise.resolve({ data: seriesData, error: null }),
          };
        }
        if (table === 'study_reading_progress' || table === 'study_notes') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
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
    });

    it('renders Edit Study Content button for Leaders and opens modal on click', async () => {
      render(
        <MemoryRouter initialEntries={['/studies']}>
          <Studies session={session} userRole="leader" activeOrgId={activeOrgId} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Walking in Unity');
      });

      const editBtn = screen.getByRole('button', { name: /Edit Study Content/i });
      expect(editBtn).toBeInTheDocument();

      await userEvent.click(editBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Edit Study Content' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Scripture Readings/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Lesson Summary/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Discussion Guide/i })).toBeInTheDocument();
    });


    it('hides Edit Study Content button for regular Students', async () => {
      render(
        <MemoryRouter initialEntries={['/studies']}>
          <Studies session={session} userRole="student" activeOrgId={activeOrgId} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Walking in Unity');
      });

      expect(screen.queryByRole('button', { name: /Edit Study Content/i })).not.toBeInTheDocument();
    });
  });
});

