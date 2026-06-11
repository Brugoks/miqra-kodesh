import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/feedbackApi', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createTicket: vi.fn(),
    searchSimilar: vi.fn().mockResolvedValue([]),
  };
});

import { createTicket, searchSimilar } from '../lib/feedbackApi';
import FeedbackSubmitForm from './FeedbackSubmitForm';

const SESSION = { user: { id: 'u1', email: 'user@example.com' } };

function renderForm(props = {}) {
  return render(
    <FeedbackSubmitForm
      session={SESSION}
      onCancel={vi.fn()}
      onSubmitted={vi.fn()}
      userVotes={new Set()}
      onVote={vi.fn()}
      {...props}
    />
  );
}

// Radix Select renders options in a portal only while open, so tests
// click the trigger and pick options by role instead of selectOptions().
async function pickOption(user, trigger, optionName) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('FeedbackSubmitForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchSimilar.mockResolvedValue([]);
  });

  it('renders all categories and app areas', async () => {
    const user = userEvent.setup();
    renderForm();

    const category = screen.getByLabelText('Feedback Type');
    expect(category).toHaveTextContent('Bug Report');
    await user.click(category);
    for (const label of ['Bug Report', 'Feature Request', 'Other']) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}');

    const area = screen.getByLabelText('Location Within The App');
    expect(area).toHaveTextContent('Home');
    await user.click(area);
    for (const label of ['Home', 'Calendar', 'Bible Study', 'Fellowship', 'Sermons',
      'Discipleship', 'Integrations', 'Leader Portal', 'Admin Portal', 'Other']) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}');
  });

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /submit feedback/i }));
    expect(await screen.findByText('Please add a title.')).toBeInTheDocument();
    expect(createTicket).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Title'), 'Calendar crashes');
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));
    expect(await screen.findByText('Please describe your feedback.')).toBeInTheDocument();
    expect(createTicket).not.toHaveBeenCalled();
  });

  it('submits a valid ticket and calls onSubmitted', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    createTicket.mockResolvedValue({ id: 't1' });
    renderForm({ onSubmitted });

    await pickOption(user, screen.getByLabelText('Feedback Type'), 'Feature Request');
    await pickOption(user, screen.getByLabelText('Location Within The App'), 'Calendar');
    expect(screen.getByLabelText('Feedback Type')).toHaveTextContent('Feature Request');
    expect(screen.getByLabelText('Location Within The App')).toHaveTextContent('Calendar');

    await user.type(screen.getByLabelText('Title'), 'Add dark mode');
    await user.type(screen.getByLabelText('Description'), 'Easier on the eyes at night.');
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(createTicket).toHaveBeenCalledWith({
      user: SESSION.user,
      category: 'feature',
      categoryDetail: '',
      appArea: 'calendar',
      appAreaDetail: '',
      title: 'Add dark mode',
      description: 'Easier on the eyes at night.',
      files: [],
    });
  });

  it('reveals an "Other" detail field only when Other is selected', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText('Other type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Other location')).not.toBeInTheDocument();

    await pickOption(user, screen.getByLabelText('Feedback Type'), 'Other');
    expect(screen.getByLabelText('Other type')).toBeInTheDocument();

    await pickOption(user, screen.getByLabelText('Location Within The App'), 'Other');
    expect(screen.getByLabelText('Other location')).toBeInTheDocument();

    // Switching away hides the field again
    await pickOption(user, screen.getByLabelText('Feedback Type'), 'Bug Report');
    expect(screen.queryByLabelText('Other type')).not.toBeInTheDocument();
  });

  it('submits the filled-in Other details', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    createTicket.mockResolvedValue({ id: 't1' });
    renderForm({ onSubmitted });

    await pickOption(user, screen.getByLabelText('Feedback Type'), 'Other');
    await user.type(screen.getByLabelText('Other type'), 'Question');
    await pickOption(user, screen.getByLabelText('Location Within The App'), 'Other');
    await user.type(screen.getByLabelText('Other location'), 'Login screen');

    await user.type(screen.getByLabelText('Title'), 'How do I reset my password?');
    await user.type(screen.getByLabelText('Description'), 'Cannot find a reset link.');
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(createTicket).toHaveBeenCalledWith({
      user: SESSION.user,
      category: 'other',
      categoryDetail: 'Question',
      appArea: 'other',
      appAreaDetail: 'Login screen',
      title: 'How do I reset my password?',
      description: 'Cannot find a reset link.',
      files: [],
    });
  });

  it('shows similar existing requests while typing the title', async () => {
    const user = userEvent.setup();
    searchSimilar.mockResolvedValue([
      { id: 't1', title: 'Dark mode everywhere', votes: 4 },
    ]);
    renderForm();

    await user.type(screen.getByLabelText('Title'), 'dark mode');

    expect(
      await screen.findByText('Dark mode everywhere', {}, { timeout: 2000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/upvote an existing request instead/i)).toBeInTheDocument();
  });

  it('upvotes a suggested duplicate via onVote', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    const suggestion = { id: 't1', title: 'Dark mode everywhere', votes: 4 };
    searchSimilar.mockResolvedValue([suggestion]);
    renderForm({ onVote });

    await user.type(screen.getByLabelText('Title'), 'dark mode');
    await screen.findByText('Dark mode everywhere', {}, { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: '4' }));
    expect(onVote).toHaveBeenCalledWith(suggestion);
  });

  it('adds a pasted image as a screenshot', async () => {
    renderForm();

    const file = new File(['png-bytes'], 'paste.png', { type: 'image/png' });
    fireEvent.paste(screen.getByLabelText('Description'), {
      clipboardData: { files: [file] },
    });

    expect(await screen.findByAltText('Screenshot 1')).toBeInTheDocument();
  });

  it('ignores pasted non-image content', async () => {
    const user = userEvent.setup();
    renderForm();

    const description = screen.getByLabelText('Description');
    fireEvent.paste(description, { clipboardData: { files: [] } });
    await user.type(description, 'just text');

    expect(screen.queryByAltText('Screenshot 1')).not.toBeInTheDocument();
  });
});
