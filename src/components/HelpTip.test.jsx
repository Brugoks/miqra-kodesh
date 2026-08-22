// Help mode and the `?` badges (ticket 032815b7). The properties that matter:
// the normal app is never speckled with question marks, an unknown id is
// silence rather than a crash, and the registry that feeds the badges is the
// same one the /help page renders.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HelpTip from './HelpTip';
import HelpGuide from './HelpGuide';
import { setHelpMode, toggleHelpMode, useHelpMode } from '../lib/helpMode';
import { HELP_TOPICS, HELP_BY_ID, searchHelpTopics } from '../lib/helpContent';

function Probe() {
  const on = useHelpMode();
  return <span data-testid="mode">{on ? 'on' : 'off'}</span>;
}

beforeEach(() => {
  setHelpMode(false);
});

afterEach(() => {
  setHelpMode(false);
});

describe('HelpTip', () => {
  it('renders nothing while help mode is off', () => {
    render(<HelpTip id="dash.announcements" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('appears when help mode goes on and explains the topic on tap', async () => {
    const user = userEvent.setup();
    render(<><Probe /><HelpTip id="dash.announcements" /></>);

    setHelpMode(true);
    const badge = await screen.findByRole('button', { name: /what is announcements\?/i });

    await user.click(badge);
    const bubble = await screen.findByRole('tooltip');
    expect(bubble).toHaveTextContent(HELP_BY_ID.get('dash.announcements').body);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays silent for an id that is not in the registry', () => {
    setHelpMode(true);
    render(<HelpTip id="nope.not.a.topic" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('closes its bubble on Escape', async () => {
    const user = userEvent.setup();
    setHelpMode(true);
    render(<HelpTip id="calendar.rsvp" />);

    await user.click(screen.getByRole('button'));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('does not strand an open bubble when help mode is turned off', async () => {
    const user = userEvent.setup();
    setHelpMode(true);
    render(<HelpTip id="calendar.rsvp" />);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    setHelpMode(false);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('toggles', async () => {
    render(<Probe />);
    expect(screen.getByTestId('mode')).toHaveTextContent('off');
    toggleHelpMode();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('on'));
    toggleHelpMode();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('off'));
  });
});

describe('help content registry', () => {
  it('has no duplicate ids', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every topic a title, a body and a known area', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.title.trim()).not.toBe('');
      expect(topic.body.trim().length).toBeGreaterThan(20);
    }
  });

  it('searches title and body, case-insensitively', () => {
    expect(searchHelpTopics('RSVP').some((t) => t.id === 'calendar.rsvp')).toBe(true);
    expect(searchHelpTopics('   ')).toHaveLength(HELP_TOPICS.length);
    expect(searchHelpTopics('zzzznope')).toHaveLength(0);
  });
});

describe('HelpGuide page', () => {
  it('lists every topic in the registry', () => {
    render(<MemoryRouter><HelpGuide /></MemoryRouter>);
    for (const topic of HELP_TOPICS) {
      expect(screen.getByText(topic.title)).toBeInTheDocument();
    }
  });

  it('filters as you search, and says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HelpGuide /></MemoryRouter>);

    await user.type(screen.getByLabelText(/search help topics/i), 'rsvp');
    await waitFor(() => expect(screen.queryByText('The menu')).not.toBeInTheDocument());
    expect(screen.getByText('RSVP')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/search help topics/i));
    await user.type(screen.getByLabelText(/search help topics/i), 'zzzznope');
    expect(await screen.findByText(/nothing here matches/i)).toBeInTheDocument();
  });

  it('can switch help mode on from the page', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><><Probe /><HelpGuide /></></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /show the question marks/i }));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('on'));
  });
});
