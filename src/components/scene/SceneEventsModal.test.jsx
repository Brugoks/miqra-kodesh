import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SceneEventsModal from './SceneEventsModal';
import { getScene } from '../../lib/scenes';

describe('SceneEventsModal', () => {
  const scene = getScene('capernaum');

  it('lists the events in order, marks the one staged, and stages the one chosen', () => {
    const onSelect = vi.fn();
    render(<SceneEventsModal scene={scene} activeId="sundown" onSelect={onSelect} onClose={() => {}} />);
    const items = within(screen.getByRole('list')).getAllByRole('button');
    expect(items).toHaveLength(scene.events.length);
    items.forEach((item, index) => expect(item).toHaveTextContent(scene.events[index].label));
    const staged = items.find((item) => item.getAttribute('aria-current') === 'true');
    expect(staged).toHaveTextContent('The Whole City at the Door');
    expect(staged).toHaveTextContent('Showing now');
    fireEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledWith(scene.events[0]);
  });

  it('shows where and when each happened', () => {
    render(<SceneEventsModal scene={scene} activeId={null} onClose={() => {}} />);
    expect(screen.getByText(/Fishers of Men/).closest('button')).toHaveTextContent('The shore · Morning');
  });

  it('renders nothing for a scene without events', () => {
    const { container } = render(<SceneEventsModal scene={{ title: 'X', events: [] }} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('filters Sinai by narrative period while preserving episode numbers and selection', () => {
    const sinai = getScene('sinai'),
      onSelect = vi.fn();
    render(<SceneEventsModal scene={sinai} onSelect={onSelect} onClose={() => {}} />);
    expect(screen.getByText(sinai.eventsHeading)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Explore a chapter' }), {
      target: { value: 'Elijah at Horeb' },
    });
    const items = within(screen.getByRole('list')).getAllByRole('button');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('31');
    fireEvent.click(items[2]);
    expect(onSelect).toHaveBeenCalledWith(sinai.events.at(-1));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(33);
  });
});
