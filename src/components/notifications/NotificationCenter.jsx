import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BookOpenCheck, CalendarDays, Check, ChevronLeft, CircleHelp,
  Megaphone, MessageCircle, Settings2, Sprout, Users, X,
} from 'lucide-react';
import { enablePushNotifications, isPushSupported, pushPermission } from '../../lib/push';
import useNotifications from './useNotifications';
import {
  formatNotificationTime,
  notificationMatchesFilter,
  NOTIFICATION_CATEGORIES,
} from './notificationUtils';
import './NotificationCenter.css';

const CATEGORY_ICONS = {
  chat: MessageCircle,
  fellowship: Users,
  calendar: CalendarDays,
  qa: CircleHelp,
  reading: BookOpenCheck,
  discipleship: Sprout,
  announcements: Megaphone,
  system: Bell,
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'mentions', label: 'Mentions' },
];

export default function NotificationCenter({ session, organization }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('inbox');
  const [filter, setFilter] = useState('all');
  const [pushState, setPushState] = useState(() => pushPermission());
  const notifications = useNotifications({
    userId: session?.user?.id,
    organizationId: organization?.id,
  });

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const openSettings = () => {
      setOpen(true);
      setView('settings');
    };
    window.addEventListener('notifications:open-settings', openSettings);
    return () => window.removeEventListener('notifications:open-settings', openSettings);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notifications') !== 'open') return;
    const timer = window.setTimeout(() => {
      setOpen(true);
      setView('inbox');
      params.delete('notifications');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredItems = useMemo(
    () => notifications.items.filter((item) => notificationMatchesFilter(item, filter)),
    [filter, notifications.items],
  );

  const openItem = async (item) => {
    await notifications.markRead(item.id);
    setOpen(false);
    if (item.url) navigate(item.url);
  };

  const toggleOpen = () => {
    setOpen((current) => !current);
    setView('inbox');
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={`topbar-notifications-btn${open ? ' active' : ''}`}
        aria-label={`Notifications${notifications.unreadCount ? `, ${notifications.unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <Bell size={20} />
        {notifications.unreadCount > 0 && (
          <span className="notification-center-badge">
            {notifications.unreadCount > 99 ? '99+' : notifications.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-panel" aria-label="Notification center">
          {view === 'settings' ? (
            <NotificationSettings
              notifications={notifications}
              pushState={pushState}
              setPushState={setPushState}
              userId={session?.user?.id}
              organizationId={organization?.id}
              onBack={() => setView('inbox')}
            />
          ) : (
            <>
              <header className="notification-panel-header">
                <div>
                  <h2>Notifications</h2>
                  <p>{organization?.name || 'Your activity'}</p>
                </div>
                <div className="notification-panel-actions">
                  {notifications.unreadCount > 0 && (
                    <button type="button" onClick={notifications.markAllRead}>Mark all read</button>
                  )}
                  <button type="button" className="notification-icon-button" aria-label="Notification settings" onClick={() => setView('settings')}>
                    <Settings2 size={17} />
                  </button>
                  <button type="button" className="notification-icon-button" aria-label="Close notifications" onClick={() => setOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
              </header>

              <div className="notification-filters" role="tablist" aria-label="Notification filters">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === option.id}
                    className={filter === option.id ? 'active' : ''}
                    onClick={() => setFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="notification-list">
                {notifications.loading && notifications.items.length === 0 ? (
                  <p className="notification-empty">Loading notifications…</p>
                ) : notifications.error && !notifications.available ? (
                  <p className="notification-empty">{notifications.error}</p>
                ) : filteredItems.length === 0 ? (
                  <div className="notification-empty">
                    <Check size={24} />
                    <strong>You’re caught up</strong>
                    <span>No {filter === 'all' ? '' : `${filter} `}notifications here.</span>
                  </div>
                ) : filteredItems.map((item) => {
                  const Icon = CATEGORY_ICONS[item.category] || Bell;
                  return (
                    <article key={item.id} className={`notification-row${item.read_at ? '' : ' unread'}${item.priority === 'high' ? ' high-priority' : ''}`}>
                      <button type="button" className="notification-row-main" onClick={() => openItem(item)}>
                        <span className={`notification-category-icon ${item.category}`}><Icon size={17} /></span>
                        <span className="notification-copy">
                          <strong>{item.title}</strong>
                          {item.body && <span>{item.body}</span>}
                          <small>{formatNotificationTime(item.created_at)}</small>
                        </span>
                        {!item.read_at && <span className="notification-unread-dot" aria-label="Unread" />}
                      </button>
                      <button type="button" className="notification-dismiss" aria-label={`Dismiss ${item.title}`} onClick={() => notifications.archive(item.id)}>
                        <X size={14} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function NotificationSettings({ notifications, pushState, setPushState, userId, organizationId, onBack }) {
  return (
    <div className="notification-settings">
      <header className="notification-panel-header">
        <button type="button" className="notification-icon-button" aria-label="Back to notifications" onClick={onBack}>
          <ChevronLeft size={19} />
        </button>
        <div className="notification-settings-title">
          <h2>Notification settings</h2>
          <p>Choose what reaches you and when.</p>
        </div>
      </header>

      {isPushSupported() && pushState !== 'granted' && (
        <div className="notification-permission-card">
          <Bell size={19} />
          <div><strong>Browser notifications are {pushState === 'denied' ? 'blocked' : 'off'}</strong><p>In-app notifications still work. Enable browser alerts for reminders when Miqra Kodesh is closed.</p></div>
          {pushState !== 'denied' && (
            <button type="button" className="btn-primary" onClick={async () => setPushState(await enablePushNotifications(userId, organizationId))}>Enable</button>
          )}
        </div>
      )}

      <div className="notification-settings-grid notification-settings-labels">
        <span>Category</span><span>In app</span><span>Push</span><span>Delivery</span>
      </div>
      {NOTIFICATION_CATEGORIES.map((category) => {
        const preference = notifications.preferences[category.id] || {};
        return (
          <div className="notification-settings-grid" key={category.id}>
            <strong>{category.label}</strong>
            <label><input type="checkbox" checked={preference.in_app_enabled !== false} onChange={(event) => notifications.savePreference(category.id, { in_app_enabled: event.target.checked })} /><span className="sr-only">Show {category.label} in app</span></label>
            <label><input type="checkbox" checked={preference.push_enabled !== false} onChange={(event) => notifications.savePreference(category.id, { push_enabled: event.target.checked })} /><span className="sr-only">Push {category.label}</span></label>
            <select value={preference.digest_mode || 'instant'} onChange={(event) => notifications.savePreference(category.id, { digest_mode: event.target.value })} aria-label={`${category.label} delivery schedule`}>
              <option value="instant">Instant</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
              <option value="off">Off</option>
            </select>
          </div>
        );
      })}

      <div className="notification-quiet-hours">
        <h3>Quiet hours</h3>
        <p>Push alerts stay silent during quiet hours. In-app items still appear immediately.</p>
        <div>
          <label>From<input type="time" value={notifications.settings.quiet_hours_start || ''} onChange={(event) => notifications.saveSettings({ quiet_hours_start: event.target.value })} /></label>
          <label>Until<input type="time" value={notifications.settings.quiet_hours_end || ''} onChange={(event) => notifications.saveSettings({ quiet_hours_end: event.target.value })} /></label>
        </div>
        <small>{notifications.settings.timezone || 'UTC'}</small>
      </div>
      {notifications.error && <p className="notification-settings-error">{notifications.error}</p>}
    </div>
  );
}
