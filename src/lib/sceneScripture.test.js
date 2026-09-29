import { describe, it, expect } from 'vitest';
import { sceneMomentsForPassage } from './sceneScripture';
import { refToPassageIds } from './scripture';
import { SCENES, getScene, resolveSceneLink } from './scenes';

const moments = (ref, options) => sceneMomentsForPassage(refToPassageIds(ref), options);
const ids = (ref) => moments(ref).map((moment) => `${moment.slug}/${moment.kind}/${moment.id}`);

// Reading a passage should offer the place it happened, and only that: the
// point is to go from the words to the ground, so a link that stages the
// wrong moment is worse than no link.
describe('sceneMomentsForPassage', () => {
  it('takes a passage to the event it narrates', () => {
    const [first] = moments('Mark 1:29-31');
    expect(first).toMatchObject({
      slug: 'capernaum', kind: 'event', id: 'mother-in-law', ref: 'Mark 1:29-31', path: '/scene/capernaum?event=mother-in-law',
    });
    expect(moments('Matthew 17:27')[0].id).toBe('temple-tax');
    expect(moments('Mark 5:25-34')[0].id).toBe('the-woman');
    expect(moments('Luke 7:1-10')[0].id).toBe('centurion');
    // One verse inside a long passage still finds it.
    expect(moments('John 6:59')[0].id).toBe('bread-of-life');
  });

  it('offers a whole chapter’s events in the order they happen', () => {
    const events = moments('Mark 1').filter((moment) => moment.kind === 'event').map((moment) => moment.id);
    expect(events).toEqual(['fishermen', 'synagogue-rebuke', 'mother-in-law', 'sundown']);
    // Events come first.
    expect(moments('Mark 1').slice(0, 4).every((moment) => moment.kind === 'event')).toBe(true);
  });

  it('never offers a vantage or pin that would stage a different moment', () => {
    // The synagogue's rebuke pin cites John 6:59 as the same room; following
    // it from John 6 would stage the rebuke, not the bread of life.
    expect(ids('John 6:59')).not.toContain('capernaum/hotspot/the-unclean-spirit');
    expect(ids('John 6:59')).not.toContain('capernaum/vantage/the-synagogue');
    expect(ids('Luke 7:1-10')).not.toContain('capernaum/vantage/the-synagogue');
  });

  it('takes the Temple passages to the Temple’s events', () => {
    expect(moments('Luke 2:25-35')[0]).toMatchObject({ slug: 'second-temple', kind: 'event', id: 'simeon-anna' });
    expect(moments('Mark 12:41-44')[0]).toMatchObject({ slug: 'second-temple', id: 'widow' });
    expect(moments('John 8:6')[0]).toMatchObject({ slug: 'second-temple', id: 'adulteress' });
    expect(moments('Acts 3:6')[0]).toMatchObject({ slug: 'second-temple', id: 'beautiful-gate' });
  });

  it('takes the Passion week’s passages to the Mount of Olives', () => {
    expect(moments('Mark 14:32-42')[0]).toMatchObject({ slug: 'mount-of-olives', kind: 'event', id: 'gethsemane', path: '/scene/mount-of-olives?event=gethsemane' });
    expect(moments('Luke 19:41')[0]).toMatchObject({ slug: 'mount-of-olives', id: 'weeping' });
    expect(moments('John 18:10')[0]).toMatchObject({ slug: 'mount-of-olives', id: 'the-arrest' });
    expect(moments('Acts 1:9')[0]).toMatchObject({ slug: 'mount-of-olives', id: 'ascension' });
    expect(moments('Mark 13:3')[0]).toMatchObject({ slug: 'mount-of-olives', id: 'olivet-discourse' });
    // The colt, then the shouting, in Mark's order.
    expect(moments('Mark 11:1-10').filter((m) => m.kind === 'event').map((m) => m.id)).toEqual(['the-colt', 'triumphal-entry']);
    // And the Old Testament the Mount stands in.
    expect(ids('2 Samuel 15:30')).toContain('mount-of-olives/hotspot/davids-ascent');
    expect(ids('Zechariah 14:4')).toContain('mount-of-olives/hotspot/his-feet');
    expect(ids('Ezekiel 11:23')).toContain('mount-of-olives/hotspot/the-glory');
  });

  it('reaches every scene, not only Capernaum', () => {
    expect(moments('Exodus 26')[0].slug).toBe('tabernacle');
    // The Feast of Dedication in Solomon's Portico, now it is an event.
    expect(moments('John 10:23')[0]).toMatchObject({ slug: 'second-temple', kind: 'event', id: 'dedication' });
    expect(moments('Acts 5:12')[0]).toMatchObject({ slug: 'second-temple', kind: 'vantage', id: 'solomons-portico' });
    expect(moments('Acts 10')[0].slug).toBe('caesarea');
    expect(moments('1 Samuel 17:40-50')[0].slug).toBe('valley-of-elah');
  });

  it('offers nothing for a passage no scene is about, or no passage at all', () => {
    expect(moments('Genesis 1')).toEqual([]);
    expect(sceneMomentsForPassage([])).toEqual([]);
    expect(sceneMomentsForPassage(null)).toEqual([]);
  });

  it('caps the list, and lists nothing twice', () => {
    expect(moments('Mark 1', { limit: 2 })).toHaveLength(2);
    const all = moments('Mark 1');
    expect(new Set(all.map((moment) => moment.path)).size).toBe(all.length);
  });

  it('links to things that resolve to themselves in the scene', () => {
    for (const ref of ['Mark 1', 'Mark 2', 'John 6', 'Exodus 26', 'Acts 10', '1 Samuel 17', 'John 10', 'Mark 14', 'Luke 19', 'Acts 1']) {
      for (const moment of moments(ref)) {
        const scene = getScene(moment.slug);
        const link = resolveSceneLink(scene, moment.path.split('?')[1]);
        expect(link?.target.id, moment.path).toBe(moment.id);
        expect(link.kind).toBe(moment.kind);
      }
    }
    expect(SCENES.length).toBeGreaterThan(0);
  });
});
