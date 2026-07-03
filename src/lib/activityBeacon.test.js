import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: null, error: null })));

vi.mock('./supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mockRpc },
}));

import {
  getActivityFeatureForPath,
  resetActivityBeaconForTests,
  shouldTrackActivity,
  trackActivity,
} from './activityBeacon';

describe('activityBeacon', () => {
  beforeEach(() => {
    mockRpc.mockClear();
    resetActivityBeaconForTests();
  });

  it('maps routes to stable activity feature keys', () => {
    expect(getActivityFeatureForPath('/')).toBe('dashboard');
    expect(getActivityFeatureForPath('/studies')).toBe('studies');
    expect(getActivityFeatureForPath('/chat?dm=user-1')).toBe('chat');
    expect(getActivityFeatureForPath('/discipleship/session/1')).toBe('discipleship');
    expect(getActivityFeatureForPath('/unknown')).toBeNull();
  });

  it('throttles the same org and feature for 30 minutes', () => {
    expect(shouldTrackActivity('org-1', 'chat', 1_000)).toBe(true);
    expect(shouldTrackActivity('org-1', 'chat', 2_000)).toBe(false);
    expect(shouldTrackActivity('org-1', 'studies', 2_000)).toBe(true);
    expect(shouldTrackActivity('org-2', 'chat', 2_000)).toBe(true);
    expect(shouldTrackActivity('org-1', 'chat', 1_000 + 30 * 60 * 1000)).toBe(true);
  });

  it('fires the RPC without awaiting and skips developer roles', () => {
    trackActivity('org-1', 'chat', { role: 'student', now: 1_000 });
    trackActivity('org-1', 'studies', { role: 'developer', now: 1_000 });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('track_activity', {
      p_org: 'org-1',
      p_feature: 'chat',
    });
  });
});
