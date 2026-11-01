import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { requestCanvas } from '../../lib/studyCanvas';
import { loadRecentInsightTalks } from '../../lib/sermonInsights';

vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (original) => ({ ...await original(), requestCanvas: vi.fn() }));
vi.mock('../../lib/sermonInsights', async (original) => ({ ...await original(), loadRecentInsightTalks: vi.fn() }));

const insight = (over = {}) => ({
  id: 'i1', anchor: 'Luke 4:18-19', refs: ['Luke 4:14-30'], claim: 'Jesus\' assignment was settled before his hometown reacted.',
  quote: { text: 'Your assignment is greater than the applause', at: '10:05' }, question: 'What has God already given you to do?', ...over,
});
const talk = (over = {}) => ({
  id: 'talk-1', title: 'The Assignment Is Greater Than the Applause', speaker_name: 'Michael Peavey', talk_date: '2026-10-18',
  video_url: 'https://www.youtube.com/live/mQLJcgwa7hY', canvas_insights: { version: 1, insights: [insight(), insight({ id: 'i2', anchor: 'Luke 4:30', claim: 'He went his way.', quote: null, question: 'Where is your next step?' })] }, ...over,
});

const mount = () => render(<MemoryRouter><StudyCanvas session={{ user: { id: 'member-one' } }} userRole="student" activeOrgId="org" /></MemoryRouter>);
const capture = async (words) => {
  fireEvent.change(screen.getByLabelText("What's on your mind?"), { target: { value: words } });
  fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
  await screen.findByRole('heading', { name: 'Let this moment grow' });
};
const panel = async () => within(await screen.findByRole('region', { name: /Hear it in a sermon/ }));

beforeEach(() => { localStorage.clear(); localStorage.setItem('miqra_canvas_view_v1:member-one', 'outline'); vi.clearAllMocks(); loadRecentInsightTalks.mockResolvedValue([talk()]); });

describe('Hear it in a sermon', () => {
  it('shows nothing at all when the church has no sermon insights yet', async () => {
    loadRecentInsightTalks.mockResolvedValue([]);
    mount();
    await capture('Luke 4:18 has been on my mind all week.');
    await waitFor(() => expect(loadRecentInsightTalks).toHaveBeenCalledWith('org', expect.any(AbortSignal)));
    expect(screen.queryByRole('heading', { name: /Hear it in a sermon/ })).not.toBeInTheDocument();
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it('matches a passage the person mentioned, on the device, with no AI call', async () => {
    mount();
    await capture('Luke 4:18 has been on my mind all week.');
    const view = await panel();
    const card = view.getByRole('article', { name: /The Assignment Is Greater Than the Applause, Luke 4:18-19/ });
    expect(within(card).getByText(/It shares Luke 4:18 with this canvas/)).toBeInTheDocument();
    expect(within(card).getByText(/What has God already given you to do\?/)).toBeInTheDocument();
    expect(within(card).getByText(/Michael Peavey/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Watch from 10:05/ })).toHaveAttribute('href', 'https://www.youtube.com/live/mQLJcgwa7hY?t=605s');
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it('offers connections, not messages: the copy invites weighing the passage', async () => {
    mount();
    await capture('Luke 4:18 has been on my mind all week.');
    const view = await panel();
    expect(view.getByText(/not answers about what He is saying to you/)).toBeInTheDocument();
    expect(view.queryByText(/God is (telling|saying)/i)).not.toBeInTheDocument();
  });

  it('brings a connection in as the person\'s own Scripture entry, with the sermon kept beside their words', async () => {
    mount();
    await capture('Luke 4:18 has been on my mind all week.');
    const view = await panel();
    const card = view.getByRole('article', { name: /Luke 4:18-19/ });
    fireEvent.click(within(card).getByRole('button', { name: /Bring this into my canvas/ }));
    const add = within(card).getByRole('button', { name: 'Add to canvas' });
    expect(add).toBeDisabled(); // their own words are required
    fireEvent.change(within(card).getByLabelText('In your own words'), { target: { value: 'I keep waiting for someone to say well done.' } });
    fireEvent.click(add);
    await waitFor(() => expect(view.getByText(/Added: The Assignment Is Greater Than the Applause · Luke 4:18-19/)).toBeInTheDocument());
    // The saved card shows their words, labelled as theirs, and the sermon as the source.
    const entry = (await screen.findAllByRole('article')).find((el) => el.textContent.includes('I keep waiting for someone to say well done.'));
    expect(entry).toBeTruthy();
    expect(within(entry).getByLabelText('From a sermon')).toHaveTextContent('From the sermon “The Assignment Is Greater Than the Applause” · Michael Peavey');
    expect(within(entry).getByText('My reflection')).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: /Read Luke 4:18-19/ })).toBeInTheDocument();
    // It is not offered a second time.
    expect(view.queryByRole('article', { name: /Luke 4:18-19/ })).not.toBeInTheDocument();
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it('asks the AI only when pressed, sending the glimpse and focus and nothing else the person wrote', async () => {
    requestCanvas.mockResolvedValue({ suggestions: [{ talkId: 'talk-1', insightId: 'i2', why: 'Leaving the approval question behind may be one way to read "he went his way".' }] });
    mount();
    await capture('I am exhausted waiting to be noticed at work.');
    const view = await panel();
    expect(requestCanvas).not.toHaveBeenCalled();
    fireEvent.change(view.getByLabelText(/What are you exploring now/), { target: { value: 'Feeling unseen' } });
    fireEvent.click(view.getByRole('button', { name: 'Ask what may speak into this' }));
    const result = await view.findByRole('article', { name: /Luke 4:30/ });
    expect(within(result).getByText(/may be one way to read/)).toBeInTheDocument();
    expect(within(result).getByText('How this may connect')).toBeInTheDocument();
    expect(requestCanvas).toHaveBeenCalledTimes(1);
    const [body] = requestCanvas.mock.calls[0];
    expect(body).toEqual({ action: 'sermons', glimpse: 'I am exhausted waiting to be noticed at work.', focus: 'Feeling unseen', exclude: [] });
  });

  it('tells the server what is already on the canvas, so the same connection is not offered again', async () => {
    requestCanvas.mockResolvedValue({ suggestions: [{ talkId: 'talk-1', insightId: 'i1', why: 'This may meet the waiting you describe.' }] });
    mount();
    await capture('Luke 4:18 has been on my mind all week.');
    const view = await panel();
    const card = view.getByRole('article', { name: /Luke 4:18-19/ });
    fireEvent.click(within(card).getByRole('button', { name: /Bring this into my canvas/ }));
    fireEvent.change(within(card).getByLabelText('In your own words'), { target: { value: 'Waiting to be noticed.' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Add to canvas' }));
    await waitFor(() => expect(view.getByText(/Added: /)).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: 'Ask what may speak into this' }));
    // Even if the model returned the one already on the canvas, it is not shown a second time.
    expect(await view.findByText(/Nothing in your church.s recent sermons clearly connects/)).toBeInTheDocument();
    expect(requestCanvas.mock.calls[0][0].exclude).toEqual(['talk-1:i1']);
  });

  it('tells the person plainly when nothing connects, which is a fine answer', async () => {
    requestCanvas.mockResolvedValue({ suggestions: [] });
    mount();
    await capture('A quiet week, nothing in particular.');
    const view = await panel();
    fireEvent.click(view.getByRole('button', { name: 'Ask what may speak into this' }));
    expect(await view.findByText(/Nothing in your church.s recent sermons clearly connects/)).toBeInTheDocument();
  });

  it('shows a failed request as an error and lets them try again', async () => {
    requestCanvas.mockRejectedValueOnce(new Error('Sermon connections could not be verified. Please try again.'));
    mount();
    await capture('A quiet week, nothing in particular.');
    const view = await panel();
    fireEvent.click(view.getByRole('button', { name: 'Ask what may speak into this' }));
    expect(await view.findByRole('alert')).toHaveTextContent('could not be verified');
    expect(view.getByRole('button', { name: 'Ask what may speak into this' })).toBeEnabled();
  });

  it('shows a care note beside the focus when it signals distress, and still never blocks anything', async () => {
    mount();
    await capture('A hard week at work.'); // the glimpse itself is ordinary, so only the focus can trigger the note
    const view = await panel();
    expect(view.queryByLabelText('Support')).not.toBeInTheDocument();
    fireEvent.change(view.getByLabelText(/What are you exploring now/), { target: { value: 'I want to end my life' } });
    expect(view.getByLabelText('Support')).toHaveTextContent('988');
    expect(view.getByRole('button', { name: 'Ask what may speak into this' })).toBeEnabled();
  });

  it('discloses what asking sends before anything is sent', async () => {
    mount();
    await capture('A quiet week.');
    const view = await panel();
    expect(view.getByText(/sends your original glimpse and this focus to AI/i)).toBeInTheDocument();
    expect(view.getByText(/Your other entries are not sent/)).toBeInTheDocument();
  });
});
