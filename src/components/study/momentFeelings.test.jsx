import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { requestCanvas } from '../../lib/studyCanvas';
import { CANVAS_FEELINGS, FOCUS_PROMPTS, feelingByKey } from '../../lib/canvasFeelings';

vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (original) => ({ ...await original(), requestCanvas: vi.fn() }));

const mount = (role = 'student') => render(<MemoryRouter><StudyCanvas session={{ user: { id: 'member-one' } }} userRole={role} activeOrgId="org" /></MemoryRouter>);
const box = () => screen.getByLabelText("What's on your mind?");
const chip = (name, scope = screen) => scope.getByRole('button', { name });
const stem = (key) => feelingByKey(key).stem;
const add = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
  await screen.findByRole('heading', { name: 'Let this moment grow' });
};
const suggestion = (text) => ({ reference: 'Psalm 13:1', scripture: {
  translation: 'BSB', verses: [{ reference: 'Psalm 13:1', text: 'How long, O LORD, will You forget me forever?' }],
  contextReference: 'Psalm 13:1–3', contextVerses: [{ reference: 'Psalm 13:1', text: 'How long, O LORD, will You forget me forever?' }],
  context: 'David brings his abandonment to God in plain words.', connection: 'Honest anger can be prayed.', glimpse: text,
} });
const pull = () => fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));

beforeEach(() => { localStorage.clear(); localStorage.setItem('miqra_canvas_view_v1:member-one', 'outline'); vi.clearAllMocks(); });

describe('beginning with a feeling', () => {
  it('offers every feeling as a chip and starts a note without any AI call', () => {
    mount();
    const group = screen.getByRole('group', { name: 'How you feel' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(CANVAS_FEELINGS.map((f) => f.label));
    fireEvent.click(chip('Overwhelmed', within(group)));
    expect(box()).toHaveValue(stem('overwhelmed'));
    expect(chip('Overwhelmed', within(group))).toHaveAttribute('aria-pressed', 'true');
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it('keeps what the person already wrote, adds the next stem on a new paragraph, and puts the caret after it', async () => {
    mount();
    fireEvent.change(box(), { target: { value: 'My mom is in the hospital.' } });
    fireEvent.click(chip('Anxious'));
    expect(box()).toHaveValue(`My mom is in the hospital.\n\n${stem('anxious')}`);
    fireEvent.click(chip('Anxious')); // choosing it again clears the highlight but never edits the words
    expect(chip('Anxious')).toHaveAttribute('aria-pressed', 'false');
    expect(box()).toHaveValue(`My mom is in the hospital.\n\n${stem('anxious')}`);
    fireEvent.click(chip('Angry'));
    expect(box().value.endsWith(stem('angry'))).toBe(true);
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box().selectionStart).toBe(box().value.length);
  });

  it('shows the note to the person and nothing else about it leaves the device at capture', async () => {
    mount();
    fireEvent.click(chip('Grieving'));
    fireEvent.change(box(), { target: { value: `${stem('grieving')}my mom, and I am so tired.` } });
    await add();
    expect(requestCanvas).not.toHaveBeenCalled();
  });
});

describe('carrying the feeling into the Scripture panel', () => {
  const capture = async (feelingLabel, words = 'my dad, and I never got to say goodbye.') => {
    if (feelingLabel) fireEvent.click(chip(feelingLabel));
    fireEvent.change(box(), { target: { value: `${feelingLabel ? stem(CANVAS_FEELINGS.find((f) => f.label === feelingLabel).key) : ''}${words}` } });
    await add();
    return `${feelingLabel ? stem(CANVAS_FEELINGS.find((f) => f.label === feelingLabel).key) : ''}${words}`;
  };

  it('opens already knowing how they felt, sends it with the pull, and only when they pull', async () => {
    mount();
    const text = await capture('Grieving');
    const panel = screen.getByRole('group', { name: 'How you are feeling about this' });
    expect(chip('Grieving', within(panel))).toHaveAttribute('aria-pressed', 'true');
    expect(requestCanvas).not.toHaveBeenCalled();
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion(text)] });
    pull();
    await screen.findByRole('button', { name: 'Add Psalm 13:1 to canvas' });
    expect(requestCanvas.mock.lastCall[0]).toEqual({ action: 'related', glimpse: text, focus: '', exclude: [], feeling: 'grieving' });
  });

  it('lets the feeling change as understanding does, and omits it once cleared', async () => {
    mount();
    const text = await capture('Grieving');
    const panel = () => screen.getByRole('group', { name: 'How you are feeling about this' });
    fireEvent.click(chip('Angry', within(panel())));
    expect(chip('Grieving', within(panel()))).toHaveAttribute('aria-pressed', 'false');
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion(text)] });
    pull();
    await screen.findByRole('button', { name: 'Add Psalm 13:1 to canvas' });
    expect(requestCanvas.mock.lastCall[0].feeling).toBe('angry');
    fireEvent.click(chip('Angry', within(panel()))); // choose it again to clear
    requestCanvas.mockResolvedValueOnce({ suggestions: [] });
    pull();
    await screen.findByText('No new passages were returned. Try a different focus.');
    expect(requestCanvas.mock.lastCall[0]).not.toHaveProperty('feeling');
  });

  it('starts with nothing chosen for a moment that began without a feeling, and sends the plain request', async () => {
    mount();
    const text = await capture('', 'Today a friend brought dinner.');
    const panel = screen.getByRole('group', { name: 'How you are feeling about this' });
    for (const button of within(panel).getAllByRole('button')) expect(button).toHaveAttribute('aria-pressed', 'false');
    requestCanvas.mockResolvedValueOnce({ suggestions: [] });
    pull();
    await screen.findByText('No new passages were returned. Try a different focus.');
    expect(requestCanvas.mock.lastCall[0]).toEqual({ action: 'related', glimpse: text, focus: '', exclude: [] });
  });

  it('turns a way-in question into the focus, which the person can reword, and sends it with the pull', async () => {
    mount();
    const text = await capture('Doubting');
    fireEvent.click(screen.getByRole('button', { name: FOCUS_PROMPTS[0] }));
    const focus = screen.getByLabelText('What are you exploring now? (optional)');
    expect(focus).toHaveValue(FOCUS_PROMPTS[0]);
    fireEvent.change(focus, { target: { value: 'Where is God when I cannot pray?' } });
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion(text)] });
    pull();
    await screen.findByRole('button', { name: 'Add Psalm 13:1 to canvas' });
    expect(requestCanvas.mock.lastCall[0]).toMatchObject({ focus: 'Where is God when I cannot pray?', feeling: 'doubting' });
  });
});

describe('putting help in view', () => {
  const careNote = () => screen.queryByRole('complementary', { name: 'Support' });

  it('appears while someone is writing something heavy, never blocks saving, and links the lifeline', async () => {
    mount();
    expect(careNote()).not.toBeInTheDocument();
    fireEvent.change(box(), { target: { value: 'I do not want to live anymore' } });
    const note = careNote();
    expect(note).toBeInTheDocument();
    expect(within(note).getByRole('link', { name: '988' })).toHaveAttribute('href', 'tel:988');
    expect(note).toHaveTextContent('local emergency number');
    expect(screen.getByRole('button', { name: 'Add to canvas' })).toBeEnabled();
    await add();
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it('stays out of the way for hard feelings and idioms', () => {
    mount();
    for (const words of ['This deadline is killing me', 'I am furious at God and I am not sorry', 'I am grieving my mother, who died last year']) {
      fireEvent.change(box(), { target: { value: words } });
      expect(careNote()).not.toBeInTheDocument();
    }
  });

  it('shows on the Scripture panel too, from the glimpse or from what they type to explore, and leaves the pull available', async () => {
    mount();
    fireEvent.change(box(), { target: { value: 'Everything is falling apart and I want to die' } });
    await add();
    expect(careNote()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pull related Scripture' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pull related Scripture' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('appears when only the focus carries it', async () => {
    mount();
    fireEvent.change(box(), { target: { value: 'A hard week.' } });
    await add();
    expect(careNote()).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What are you exploring now? (optional)'), { target: { value: 'thoughts of suicide' } });
    expect(careNote()).toBeInTheDocument();
  });
});
