// Every explanation in the app, in one place. Feedback ticket 032815b7.
//
// One registry feeds two surfaces: the `?` badges that appear beside real
// controls while help mode is on, and the /help page that lists the lot. Copy
// written once, so the badge and the page can never drift apart, and adding
// guidance to a screen is a HelpTip with an id rather than new prose.
//
// House style for `body`: say what the thing IS and what the reader gets from
// it. No "click here" — they can see the button; they don't know why it matters.

export const HELP_AREAS = [
  'Getting around',
  'Dashboard',
  'Calendar',
  'Fellowship',
  'Scripture',
];

export const HELP_TOPICS = [
  {
    id: 'nav.tabs',
    area: 'Getting around',
    title: 'The main tabs',
    body: 'Dashboard, Calendar, Fellowship and Chat are the four places you will use most. On a phone they sit along the bottom of the screen; on a computer they run across the top.',
  },
  {
    id: 'nav.menu',
    area: 'Getting around',
    title: 'The menu',
    body: 'Everything else lives behind the menu button: Bible study, reading plans, your highlights, the Bible wiki, church history, sermons, discipleship and Q&R. It is worth opening once just to see what is there.',
  },
  {
    id: 'nav.scripture',
    area: 'Getting around',
    title: 'Scripture lookup',
    body: 'The book icon opens the Bible reader from any page without losing your place. Type a reference like John 3, compare translations side by side, or use A− and A+ to make the text bigger.',
  },
  {
    id: 'nav.notifications',
    area: 'Getting around',
    title: 'Notifications',
    body: 'The bell takes you to Chat. A number on it means someone mentioned you by name or messaged a channel you follow.',
  },
  {
    id: 'nav.profile',
    area: 'Getting around',
    title: 'Your profile',
    body: 'Your picture opens your profile: change your photo or the name others see. If you belong to more than one church, this is also where you switch between them.',
  },
  {
    id: 'dash.scripture',
    area: 'Dashboard',
    title: 'Daily Scripture Focus',
    body: 'One passage for the whole church each day, with artwork to go with it. Tapping the reference opens it in the reader where you can highlight it or read around it.',
  },
  {
    id: 'dash.announcements',
    area: 'Dashboard',
    title: 'Announcements',
    body: 'News your leaders want everyone to see — service changes, events, things worth knowing before Sunday. Newest first.',
  },
  {
    id: 'dash.reflections',
    area: 'Dashboard',
    title: 'Reflections',
    body: 'Short notes people have written about what they are reading, shared with their group or with the whole church. You can comment and react to encourage them.',
  },
  {
    id: 'calendar.rsvp',
    area: 'Calendar',
    title: 'RSVP',
    body: 'Telling your leaders whether to expect you. It helps them plan seating, food and rides — and "Can\'t go" is genuinely useful information, not a mark against you.',
  },
  {
    id: 'fellowship.groups',
    area: 'Fellowship',
    title: 'Small groups',
    body: 'A handful of people who meet to study and pray together. Browse what exists and join the one that fits your season — most people find the app makes far more sense once they are in one.',
  },
  {
    id: 'fellowship.prayer',
    area: 'Fellowship',
    title: 'Prayer wall',
    body: 'Requests the church is carrying together. Post your own, pray through others, and mark one answered when God moves so everyone sees it.',
  },
  {
    id: 'scripture.plans',
    area: 'Scripture',
    title: 'Reading plans',
    body: 'A day-by-day route through a book or a theme. The app keeps your place, so you can pick it up where you left off instead of counting chapters.',
  },
  {
    id: 'scripture.highlights',
    area: 'Scripture',
    title: 'Highlights',
    body: 'Verses you have marked while reading, all in one list. Colour them by what they are — a promise, a command, something that stung — and add a note about why it stood out.',
  },
];

export const HELP_BY_ID = new Map(HELP_TOPICS.map((topic) => [topic.id, topic]));

/** Topics for one area, in registry order. */
export function helpTopicsByArea(area) {
  return HELP_TOPICS.filter((topic) => topic.area === area);
}

/** Case-insensitive search across title and body; empty query returns everything. */
export function searchHelpTopics(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return HELP_TOPICS;
  return HELP_TOPICS.filter(
    (topic) => topic.title.toLowerCase().includes(needle) || topic.body.toLowerCase().includes(needle),
  );
}
