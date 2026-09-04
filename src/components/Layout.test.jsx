import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Layout from './Layout';

const ORG_A = { id: 'org-a', name: 'First Church', slug: 'first-church', logo_url: 'https://example.com/logo.png', primary_color: '#2e52be', secondary_color: '#ffffff' };
const ORG_B = { id: 'org-b', name: 'Second Church', slug: 'second-church', logo_url: null, primary_color: '#ff0000', secondary_color: '#f0f0f0' };

const mockSession = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
  },
};

const defaultProps = {
  onSignOut: vi.fn(),
  userRole: 'student',
  session: mockSession,
  organization: ORG_A,
  organizationsList: [ORG_A, ORG_B],
  primaryOrgId: ORG_A.id,
  onSwitchOrganization: vi.fn(),
  onSetPrimaryOrganization: vi.fn(),
  onJoinOrganization: vi.fn(),
};

function renderLayout(props = {}, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Layout {...defaultProps} {...props}>
        <div data-testid="page-content">Page</div>
      </Layout>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('drawer', () => {
    it('starts closed in jsdom (no matchMedia)', () => {
      renderLayout();
      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(drawer).not.toHaveClass('open');
    });

    it('opens when hamburger is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(drawer).toHaveClass('open');
    });

    it('closes when close button is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      await user.click(screen.getByRole('button', { name: 'Close menu' }));

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(drawer).not.toHaveClass('open');
    });

    it('closes when overlay backdrop is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      const overlay = screen.getByTestId('drawer-overlay');
      expect(overlay).toBeInTheDocument();

      await user.click(overlay);

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(drawer).not.toHaveClass('open');
      expect(screen.queryByTestId('drawer-overlay')).not.toBeInTheDocument();
    });

    it('navigates to home page and closes drawer when drawer logo/title button is clicked', async () => {
      const user = userEvent.setup();
      renderLayout({}, { route: '/studies' });

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      const logoBtn = screen.getByRole('button', { name: 'Go to home' });
      await user.click(logoBtn);

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(drawer).not.toHaveClass('open');
    });

    it('renders standard nav items for student role', () => {
      renderLayout({ userRole: 'student' });

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Bible Study')).toBeInTheDocument();
      expect(within(drawer).getByText('Sermons & Messages')).toBeInTheDocument();
      expect(within(drawer).getByText('Discipleship')).toBeInTheDocument();
      expect(within(drawer).queryByText('Leader Portal')).not.toBeInTheDocument();
      expect(within(drawer).queryByText('Admin')).not.toBeInTheDocument();
    });

    it('renders leader items for leader role', () => {
      renderLayout({ userRole: 'leader' });

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Leader Portal')).toBeInTheDocument();
      expect(within(drawer).getByText('Integrations')).toBeInTheDocument();
      expect(within(drawer).queryByText('Admin')).not.toBeInTheDocument();
    });

    it('renders admin items for admin role', () => {
      renderLayout({ userRole: 'admin' });

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Admin')).toBeInTheDocument();
      expect(within(drawer).getByText('Leader Portal')).toBeInTheDocument();
    });

    it('keeps admin access visible when a developer previews a student role', () => {
      renderLayout({ userRole: 'student', actualUserRole: 'developer' });

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Admin')).toBeInTheDocument();
    });

    it('marks the active nav item', () => {
      renderLayout({}, { route: '/studies' });

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      const studiesBtn = within(drawer).getByText('Bible Study').closest('button');
      expect(studiesBtn).toHaveClass('active');
    });

    it('calls onSignOut from desktop sign out button', async () => {
      const user = userEvent.setup();
      const onSignOut = vi.fn();
      renderLayout({ onSignOut });

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      const signOutButtons = within(drawer).getAllByText('Sign Out');
      const desktopSignOut = signOutButtons.find(el =>
        el.closest('.drawer-desktop-only')
      );
      await user.click(desktopSignOut);

      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(drawer).not.toHaveClass('open');
    });
  });

  describe('drawer org switcher', () => {
    it('renders org switcher when organizations exist', () => {
      renderLayout();
      expect(screen.getByText('Organization')).toBeInTheDocument();
    });

    it('does not render org switcher when no organizations', () => {
      renderLayout({ organizationsList: [] });
      expect(screen.queryByText('Organization')).not.toBeInTheDocument();
    });

    it('shows current org name in the trigger', () => {
      renderLayout();
      expect(screen.getByText('First Church', { selector: '.drawer-org-current' })).toBeInTheDocument();
    });

    it('opens org list when trigger is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));

      expect(screen.getByText('Second Church', { selector: '.drawer-org-item span' })).toBeInTheDocument();
    });

    it('calls onSwitchOrganization when a different org is clicked', async () => {
      const user = userEvent.setup();
      const onSwitch = vi.fn();
      renderLayout({ onSwitchOrganization: onSwitch });

      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));
      await user.click(screen.getByText('Second Church', { selector: '.drawer-org-item span' }));

      expect(onSwitch).toHaveBeenCalledWith('org-b');
    });

    it('does not call onSwitchOrganization when the active org is clicked', async () => {
      const user = userEvent.setup();
      const onSwitch = vi.fn();
      renderLayout({ onSwitchOrganization: onSwitch });

      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));

      const orgItems = screen.getAllByRole('button').filter(btn =>
        btn.classList.contains('drawer-org-item')
      );
      const activeItem = orgItems.find(btn => btn.classList.contains('active'));
      await user.click(activeItem);

      expect(onSwitch).not.toHaveBeenCalled();
    });

    it('opens JoinOrgModal from the drawer org switcher', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));
      await user.click(screen.getByText('+ Join Another Org', { selector: '.drawer-join-btn' }));

      expect(screen.getByRole('dialog', { name: 'Join Organization' })).toBeInTheDocument();
    });

    it('sets primary organization from the drawer org switcher', async () => {
      const user = userEvent.setup();
      const onSetPrimaryOrganization = vi.fn().mockResolvedValue();
      renderLayout({ onSetPrimaryOrganization });

      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));
      await user.click(screen.getByRole('button', { name: 'Make Second Church primary' }));

      expect(onSetPrimaryOrganization).toHaveBeenCalledWith('org-b');
    });
  });

  describe('drawer profile bar', () => {
    it('renders profile bar with user info', () => {
      renderLayout();
      expect(screen.getByText('Test User', { selector: '.drawer-profile-name' })).toBeInTheDocument();
      expect(screen.getByText('test@example.com', { selector: '.drawer-profile-email' })).toBeInTheDocument();
    });

    it('shows initials when no avatar', () => {
      renderLayout();
      const avatar = document.querySelector('.drawer-profile-avatar');
      expect(avatar.textContent).toBe('TU');
    });

    it('opens profile popover with Sign Out', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      const popover = document.querySelector('.drawer-profile-popover');
      expect(popover).toBeInTheDocument();
      expect(within(popover).getByText('Sign Out')).toBeInTheDocument();
    });

    it('shows DevTools option for developer role', async () => {
      const user = userEvent.setup();
      renderLayout({ userRole: 'developer', actualUserRole: 'developer' });

      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      const popover = document.querySelector('.drawer-profile-popover');
      expect(within(popover).getByText('DevTools')).toBeInTheDocument();
    });

    it('keeps DevTools visible when a developer previews a student role', async () => {
      const user = userEvent.setup();
      renderLayout({ userRole: 'student', actualUserRole: 'developer' });

      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      const popover = document.querySelector('.drawer-profile-popover');
      expect(within(popover).getByText('DevTools')).toBeInTheDocument();
    });

    it('hides DevTools option for non-developer roles', async () => {
      const user = userEvent.setup();
      renderLayout({ userRole: 'student' });

      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      const popover = document.querySelector('.drawer-profile-popover');
      expect(within(popover).queryByText('DevTools')).not.toBeInTheDocument();
    });

    it('calls onSignOut from profile popover', async () => {
      const user = userEvent.setup();
      const onSignOut = vi.fn();
      renderLayout({ onSignOut });

      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      const popover = document.querySelector('.drawer-profile-popover');
      await user.click(within(popover).getByText('Sign Out'));

      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('closeDrawer resets profile popover when drawer close is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      await user.click(screen.getByText('Test User', { selector: '.drawer-profile-name' }).closest('button'));

      expect(document.querySelector('.drawer-profile-popover')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close menu' }));

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      expect(document.querySelector('.drawer-profile-popover')).not.toBeInTheDocument();
    });

    it('closeDrawer resets org dropdown when drawer close is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      await user.click(screen.getByText('First Church', { selector: '.drawer-org-current' }).closest('button'));

      expect(document.querySelector('.drawer-org-list')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close menu' }));

      await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
      expect(document.querySelector('.drawer-org-list')).not.toBeInTheDocument();
    });
  });

  describe('topbar', () => {
    it('renders primary tabs', () => {
      renderLayout();
      const topbar = document.querySelector('.primary-tabs');
      expect(within(topbar).getByText('Dashboard')).toBeInTheDocument();
      expect(within(topbar).getByText('Calendar')).toBeInTheDocument();
      expect(within(topbar).getByText('Fellowship')).toBeInTheDocument();
      expect(within(topbar).getByText('Chat')).toBeInTheDocument();
    });

    it('marks active primary tab', () => {
      renderLayout({}, { route: '/calendar' });
      const topbar = document.querySelector('.primary-tabs');
      const calendarTab = within(topbar).getByText('Calendar').closest('button');
      expect(calendarTab).toHaveClass('active');
    });

    it('renders centered logo when organization has logo_url', () => {
      renderLayout({ organization: ORG_A });
      const centerLogo = document.querySelector('.topbar-center-logo img');
      expect(centerLogo).toBeInTheDocument();
      expect(centerLogo).toHaveAttribute('src', ORG_A.logo_url);
    });

    it('does not render centered logo when no logo_url', () => {
      renderLayout({ organization: ORG_B });
      expect(document.querySelector('.topbar-center-logo')).not.toBeInTheDocument();
    });

    it('renders profile trigger in topbar', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: 'Test User' })).toBeInTheDocument();
    });

    it('opens profile menu when profile trigger is clicked', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Test User' }));

      expect(screen.getByText('Your Organizations')).toBeInTheDocument();
    });

    it('sets primary organization from the profile menu', async () => {
      const user = userEvent.setup();
      const onSetPrimaryOrganization = vi.fn().mockResolvedValue();
      renderLayout({ onSetPrimaryOrganization });

      await user.click(screen.getByRole('button', { name: 'Test User' }));
      await user.click(screen.getByRole('button', { name: 'Make Second Church primary' }));

      expect(onSetPrimaryOrganization).toHaveBeenCalledWith('org-b');
    });

    it('hides profile trigger when onSignOut is null', () => {
      renderLayout({ onSignOut: null });
      expect(screen.queryByRole('button', { name: 'Test User' })).not.toBeInTheDocument();
    });

    it('renders chat icon button in topbar', () => {
      renderLayout();
      const chatBtn = document.querySelector('.topbar-chat-btn');
      expect(chatBtn).toBeInTheDocument();
      expect(chatBtn).toHaveAccessibleName('Chat activity');
    });

    it('renders a distinct cross-app notification center', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    });

    it('marks chat button active on /chat route', () => {
      renderLayout({}, { route: '/chat' });
      const chatBtn = document.querySelector('.topbar-chat-btn');
      expect(chatBtn).toHaveClass('active');
    });

    it('shows unread badge on chat button when there are unread mentions', () => {
      renderLayout({ unreadMentions: 5, chatGlow: true });
      const chatBtn = document.querySelector('.topbar-chat-btn');
      const badge = within(chatBtn).getByText('5');
      expect(badge).toHaveClass('topbar-chat-badge');
    });

    it('applies glow class when chatGlow is true', () => {
      renderLayout({ chatGlow: true });
      const chatBtn = document.querySelector('.topbar-chat-btn');
      expect(chatBtn).toHaveClass('glow');
    });
  });

  describe('bottom tabs', () => {
    it('renders bottom tab bar with chat tab', () => {
      renderLayout();
      const bottomTabs = screen.getByRole('navigation', { name: 'Primary navigation' });
      expect(within(bottomTabs).getByText('Dashboard')).toBeInTheDocument();
      expect(within(bottomTabs).getByText('Calendar')).toBeInTheDocument();
      expect(within(bottomTabs).getByText('Fellowship')).toBeInTheDocument();
      expect(within(bottomTabs).getByText('Chat')).toBeInTheDocument();
    });

    it('marks active bottom tab', () => {
      renderLayout({}, { route: '/fellowship' });
      const bottomTabs = screen.getByRole('navigation', { name: 'Primary navigation' });
      const fellowshipTab = within(bottomTabs).getByText('Fellowship').closest('button');
      expect(fellowshipTab).toHaveClass('active');
    });

    it('marks dashboard tab active on root route', () => {
      renderLayout({}, { route: '/' });
      const bottomTabs = screen.getByRole('navigation', { name: 'Primary navigation' });
      const dashboardTab = within(bottomTabs).getByText('Dashboard').closest('button');
      expect(dashboardTab).toHaveClass('active');
    });

    it('shows unread badge on chat bottom tab', () => {
      renderLayout({ unreadMentions: 3, chatGlow: true });
      const bottomTabs = screen.getByRole('navigation', { name: 'Primary navigation' });
      const badge = within(bottomTabs).getByText('3');
      expect(badge).toHaveClass('bottom-tab-badge');
    });

    it('applies glow class to chat bottom tab', () => {
      renderLayout({ chatGlow: true });
      const bottomTabs = screen.getByRole('navigation', { name: 'Primary navigation' });
      const chatTab = within(bottomTabs).getByText('Chat').closest('button');
      expect(chatTab).toHaveClass('glow');
    });
  });

  describe('content', () => {
    it('renders children in the main area', () => {
      renderLayout();
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });

    it('shows feedback FAB on non-feedback pages', () => {
      renderLayout({}, { route: '/' });
      expect(screen.getByRole('button', { name: /open feedback board/i })).toBeInTheDocument();
    });

    it('hides feedback FAB on feedback page', () => {
      renderLayout({}, { route: '/feedback' });
      expect(screen.queryByRole('button', { name: /open feedback board/i })).not.toBeInTheDocument();
    });

    it('shows feedback item in drawer on non-feedback pages', () => {
      renderLayout({}, { route: '/' });
      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Feedback')).toBeInTheDocument();
    });

    it('hides feedback item in drawer on feedback page', () => {
      renderLayout({}, { route: '/feedback' });
      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).queryByText('Feedback')).not.toBeInTheDocument();
    });

  });

  describe('no-org fallback', () => {
    it('shows Students Portal text when no organization', () => {
      renderLayout({ organization: null, organizationsList: [] });
      const drawer = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(within(drawer).getByText('Student/Member Portal')).toBeInTheDocument();
    });
  });

  describe('theme toggle', () => {
    // The desktop profile menu and the mobile drawer popover render the same
    // control, so both trees carry a radiogroup once the menu is open.
    const openProfileMenu = async (user) => {
      await user.click(screen.getByRole('button', { name: 'Test User' }));
    };

    it('offers system, light and dark once the profile menu is open', async () => {
      const user = userEvent.setup();
      renderLayout();
      await openProfileMenu(user);
      const group = screen.getAllByRole('radiogroup', { name: 'Color theme' })[0];
      expect(within(group).getAllByRole('radio').map((b) => b.textContent))
        .toEqual(['System', 'Light', 'Dark']);
    });

    it('marks the active mode and reports a change', async () => {
      const user = userEvent.setup();
      const onThemeChange = vi.fn();
      renderLayout({ themeMode: 'dark', onThemeChange });
      await openProfileMenu(user);
      const group = screen.getAllByRole('radiogroup', { name: 'Color theme' })[0];
      expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
      expect(within(group).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'false');

      await user.click(within(group).getByRole('radio', { name: 'Light' }));
      expect(onThemeChange).toHaveBeenCalledWith('light');
    });

    it('defaults to system when the prop is omitted', async () => {
      const user = userEvent.setup();
      renderLayout();
      await openProfileMenu(user);
      const group = screen.getAllByRole('radiogroup', { name: 'Color theme' })[0];
      expect(within(group).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    });

    it('does not blow up when no handler is wired', async () => {
      const user = userEvent.setup();
      renderLayout({ onThemeChange: undefined });
      await openProfileMenu(user);
      const group = screen.getAllByRole('radiogroup', { name: 'Color theme' })[0];
      await user.click(within(group).getByRole('radio', { name: 'Dark' }));
      expect(group).toBeInTheDocument();
    });
  });

});
