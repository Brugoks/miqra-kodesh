import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../lib/supabaseClient';
import { defaultNotificationPreference, NOTIFICATION_CATEGORIES } from './notificationUtils';

const DEFAULT_SETTINGS = {
  quiet_hours_start: '',
  quiet_hours_end: '',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
};

export default function useNotifications({ userId, organizationId }) {
  const [items, setItems] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!hasSupabaseConfig || !supabase || !userId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError('');
    const notificationsQuery = supabase
      .from('user_notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);

    const [notificationsResult, preferencesResult, settingsResult] = await Promise.all([
      notificationsQuery,
      supabase.from('notification_preferences').select('*').eq('user_id', userId),
      supabase.from('notification_settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    if (notificationsResult.error) {
      // Rolling deployments can briefly serve the frontend before the migration.
      // Hide the center without breaking navigation, then retry on the next load.
      setAvailable(false);
      setItems([]);
      setError('Notifications are still being connected.');
    } else {
      setAvailable(true);
      setItems((notificationsResult.data || []).filter((item) => (
        !item.archived_at
        && (item.organization_id === null || item.organization_id === organizationId)
      )));
    }

    const preferenceMap = {};
    for (const category of NOTIFICATION_CATEGORIES) {
      preferenceMap[category.id] = defaultNotificationPreference(userId, category.id);
    }
    for (const preference of preferencesResult.data || []) {
      preferenceMap[preference.category] = preference;
    }
    setPreferences(preferenceMap);

    if (settingsResult.data) {
      setSettings({
        quiet_hours_start: settingsResult.data.quiet_hours_start?.slice(0, 5) || '',
        quiet_hours_end: settingsResult.data.quiet_hours_end?.slice(0, 5) || '',
        timezone: settingsResult.data.timezone || DEFAULT_SETTINGS.timezone,
      });
    }
    setLoading(false);
  }, [organizationId, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    if (!hasSupabaseConfig || !supabase || !userId || typeof supabase.channel !== 'function') {
      return () => window.clearTimeout(timer);
    }
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notifications', filter: `recipient_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const visibleItems = useMemo(() => items.filter((item) => (
    preferences[item.category]?.in_app_enabled !== false
  )), [items, preferences]);

  const unreadCount = useMemo(
    () => visibleItems.reduce((count, item) => count + (item.read_at ? 0 : 1), 0),
    [visibleItems],
  );

  const markRead = useCallback(async (id) => {
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: item.read_at || readAt } : item));
    if (hasSupabaseConfig && supabase) {
      await supabase.from('user_notifications').update({ read_at: readAt }).eq('id', id).eq('recipient_id', userId);
    }
  }, [userId]);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const ids = visibleItems.filter((item) => !item.read_at).map((item) => item.id);
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, read_at: readAt } : item));
    if (ids.length && hasSupabaseConfig && supabase) {
      await supabase
        .from('user_notifications')
        .update({ read_at: readAt })
        .eq('recipient_id', userId)
        .in('id', ids);
    }
  }, [userId, visibleItems]);

  const archive = useCallback(async (id) => {
    const archivedAt = new Date().toISOString();
    setItems((current) => current.filter((item) => item.id !== id));
    if (hasSupabaseConfig && supabase) {
      await supabase.from('user_notifications').update({ archived_at: archivedAt }).eq('id', id).eq('recipient_id', userId);
    }
  }, [userId]);

  const savePreference = useCallback(async (category, patch) => {
    const next = {
      ...(preferences[category] || defaultNotificationPreference(userId, category)),
      ...patch,
      user_id: userId,
      category,
      updated_at: new Date().toISOString(),
    };
    setPreferences((current) => ({ ...current, [category]: next }));
    if (hasSupabaseConfig && supabase) {
      const { error: saveError } = await supabase
        .from('notification_preferences')
        .upsert(next, { onConflict: 'user_id,category' });
      if (saveError) setError('Could not save that notification preference.');
    }
  }, [preferences, userId]);

  const saveSettings = useCallback(async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (hasSupabaseConfig && supabase) {
      const { error: saveError } = await supabase.from('notification_settings').upsert({
        user_id: userId,
        quiet_hours_start: next.quiet_hours_start || null,
        quiet_hours_end: next.quiet_hours_end || null,
        timezone: next.timezone || DEFAULT_SETTINGS.timezone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (saveError) setError('Could not save quiet hours.');
    }
  }, [settings, userId]);

  return {
    items: visibleItems,
    unreadCount,
    preferences,
    settings,
    loading,
    available,
    error,
    reload: load,
    markRead,
    markAllRead,
    archive,
    savePreference,
    saveSettings,
  };
}
