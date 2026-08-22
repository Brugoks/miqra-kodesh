import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import ScriptureNavigator from './ScriptureNavigator';

// The sheet portals into a container element (the lookup panel in the real app),
// so tests supply their own mounted container.
function renderNavigator(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const containerRef = createRef();
  containerRef.current = host;
  const onSelect = props.onSelect ?? vi.fn();
  const result = render(
    <ScriptureNavigator value={null} onSelect={onSelect} containerRef={containerRef} {...props} />,
  );
  return { ...result, onSelect, host };
}

const sheet = () => screen.getByRole('dialog');

// Open the picker and drill into a book by name. Goes via the filter so the
// helper works regardless of which testament segment the sheet opened on.
async function openBook(user, name, chapters) {
  await user.click(screen.getByRole('button', { name: 'Book' }));
  await user.type(within(sheet()).getByLabelText('Filter books'), name);
  await user.click(within(sheet()).getByRole('button', { name: new RegExp(`^${name}, ${chapters} chapters$`, 'i') }));
}

describe('ScriptureNavigator', () => {
  it('renders an empty breadcrumb with chapter and verse disabled', () => {
    renderNavigator();
    expect(screen.getByRole('button', { name: 'Book' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /choose a chapter/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /choose a verse/i })).toBeDisabled();
  });

  it('shows the current position in the breadcrumb', () => {
    renderNavigator({ value: { code: 'JHN', chapter: 3, verse: 16 } });
    expect(screen.getByRole('button', { name: 'John' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chapter 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verse 16' })).toBeInTheDocument();
  });

  it('lists the 39 Old Testament books, then 27 in the New', async () => {
    const user = userEvent.setup();
    renderNavigator();
    await user.click(screen.getByRole('button', { name: 'Book' }));

    const body = sheet();
    expect(within(body).getAllByRole('button', { name: /, \d+ chapters$/ })).toHaveLength(39);
    expect(within(body).getByRole('button', { name: /genesis, 50 chapters/i })).toBeInTheDocument();

    await user.click(within(body).getByRole('button', { name: 'New Testament' }));
    expect(within(sheet()).getAllByRole('button', { name: /, \d+ chapters$/ })).toHaveLength(27);
  });

  it('filters books by abbreviation across both testaments', async () => {
    const user = userEvent.setup();
    renderNavigator();
    await user.click(screen.getByRole('button', { name: 'Book' }));
    await user.type(within(sheet()).getByLabelText('Filter books'), '1co');

    const matches = within(sheet()).getAllByRole('button', { name: /, \d+ chapters$/ });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveTextContent('1 Corinthians');
  });

  it('walks book → chapter → verse and reports the selection once', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNavigator();

    await openBook(user, 'John', 21);

    // Chapter grid sized from BOOK_CHAPTERS.
    expect(within(sheet()).getAllByRole('button', { name: /^John chapter \d+$/ })).toHaveLength(21);
    await user.click(within(sheet()).getByRole('button', { name: 'John chapter 3' }));

    // Verse grid sized from BOOK_VERSES.
    expect(within(sheet()).getAllByRole('button', { name: /^John 3 verse \d+$/ })).toHaveLength(36);
    await user.click(within(sheet()).getByRole('button', { name: 'John 3 verse 16' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('JHN', 3, 16);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not fire onSelect when only a book or chapter is picked', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNavigator();
    await openBook(user, 'John', 21);
    await user.click(within(sheet()).getByRole('button', { name: 'John chapter 3' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers a direct jump when the filter parses as a reference', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNavigator();
    await user.click(screen.getByRole('button', { name: 'Book' }));
    await user.type(within(sheet()).getByLabelText('Filter books'), 'John 3:16');

    await user.click(within(sheet()).getByRole('button', { name: /go to john 3:16/i }));
    expect(onSelect).toHaveBeenCalledWith('JHN', 3, 16);
  });

  it('Escape steps back a level instead of closing outright', async () => {
    const user = userEvent.setup();
    renderNavigator();
    await openBook(user, 'John', 21);
    expect(sheet()).toHaveAccessibleName('Choose a chapter');

    await user.keyboard('{Escape}');
    expect(sheet()).toHaveAccessibleName('Choose a book');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens directly at the chapter level from the chapter crumb', async () => {
    const user = userEvent.setup();
    renderNavigator({ value: { code: 'PSA', chapter: 119, verse: null } });
    await user.click(screen.getByRole('button', { name: 'Chapter 119' }));
    expect(sheet()).toHaveAccessibleName('Choose a chapter');
    expect(within(sheet()).getAllByRole('button', { name: /^Psalms chapter \d+$/ })).toHaveLength(150);
  });

  it('sizes the verse grid for the longest chapter in the Bible', async () => {
    const user = userEvent.setup();
    renderNavigator({ value: { code: 'PSA', chapter: 119, verse: 1 } });
    await user.click(screen.getByRole('button', { name: 'Verse 1' }));
    expect(within(sheet()).getAllByRole('button', { name: /^Psalms 119 verse \d+$/ })).toHaveLength(176);
  });

  it('reads the whole chapter in one tap, staying centred on the current verse', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNavigator({ value: { code: 'JHN', chapter: 3, verse: 16 } });

    await user.click(screen.getByRole('button', { name: 'Read all of John 3' }));

    // A chapter plus the verse to centre — never a verse-scoped lookup.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('JHN', 3, 16);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers the whole chapter from the verse grid, opening it at the top', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNavigator();

    await openBook(user, 'John', 21);
    await user.click(within(sheet()).getByRole('button', { name: 'John chapter 3' }));
    await user.click(within(sheet()).getByRole('button', { name: /read all of john 3/i }));

    // No verse picked, so nothing to centre on.
    expect(onSelect).toHaveBeenCalledWith('JHN', 3, null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the chapter shortcut until a chapter is known', () => {
    const { rerender, ...first } = renderNavigator();
    expect(screen.getByRole('button', { name: 'Read the whole chapter' })).toBeDisabled();
    void first;

    rerender(<ScriptureNavigator value={{ code: 'JHN', chapter: 3, verse: null }} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Read all of John 3' })).toBeEnabled();
  });

  it('is inert when disabled', async () => {
    const user = userEvent.setup();
    renderNavigator({ disabled: true, value: { code: 'JHN', chapter: 3, verse: 16 } });
    const bookCrumb = screen.getByRole('button', { name: 'John' });
    expect(bookCrumb).toBeDisabled();
    await user.click(bookCrumb);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read all of John 3' })).toBeDisabled();
  });
});
