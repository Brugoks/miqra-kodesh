// The Tabernacle at Sinai, c. 1445 BC — the tent Israel carried for forty
// years, and the only building in Scripture given to us as a specification.
//
// Coordinates match components/scene/tabernacleDimensions.js: -Z west toward
// the Most Holy Place, +Z east toward the gate, +X north. The ground is flat at
// y = 0 throughout, so every eye height below is simply 1.7.

export const TABERNACLE = {
  slug: 'tabernacle',
  placeSlug: 'mount-sinai',
  title: 'The Tabernacle',
  subtitle: 'The camp at Sinai · Exodus 25–40',
  blurb:
    'Seven chapters of instructions, and seven more recording them carried out to the cubit. '
    + 'A hundred cubits by fifty of linen hangings with one gate in them; inside that a bronze '
    + 'altar and a laver; inside that a tent of gold-plated boards under four layers of covering; '
    + 'and inside that, behind a curtain, a room ten cubits every way that one man entered once '
    + 'a year. Walk in as far as you are allowed to go.',
  disclaimer:
    'Unusually, the measurements here are not a reconstruction — Exodus gives them in cubits and '
    + 'this scene follows them at 0.5m to the cubit. What is interpretation: the shape of the roof '
    + '(the text describes coverings, not a pitch, and reconstructions differ), the identity of the '
    + 'outermost skins (the Hebrew tachash is uncertain), the exact arrangement of the court posts, '
    + 'the size of the laver, which Scripture never gives, and every colour, texture and face in '
    + 'the camp.',
  // Traditional Mount Sinai. Where in the wilderness the tent actually stood is
  // not recorded; the coordinates locate the mountain, not the camp.
  geo: { lat: 28.5397, lon: 33.9733, bearing: 270, xAxis: 0 },
  defaultVantage: 'the-camp',

  vantages: [
    {
      id: 'the-camp',
      label: 'From the Camp',
      position: [0, 1.7, 40],
      lookAt: [0, 9, -6],
      blurb:
        'Israel camped by standards, three tribes to each quarter, with this at the centre of the '
        + 'arrangement — and above it the cloud. When it lifted they packed the whole thing onto '
        + 'carts and followed; when it settled they stopped, however long that took. Forty years '
        + 'of a nation’s movements decided by whether a cloud had moved.',
      refs: ['Numbers 2:1-2', 'Exodus 40:34-38', 'Numbers 9:15-23'],
    },
    {
      id: 'the-gate',
      label: 'The Gate',
      position: [0, 1.7, 28],
      lookAt: [0, 4, 2],
      blurb:
        'A hundred cubits by fifty of fine twined linen, five cubits high, and one opening in it: '
        + 'twenty cubits of blue, purple and scarlet needlework in the middle of the east end. Not '
        + 'a door to be found, not a gap to be squeezed through. One way in, facing the sunrise, '
        + 'and everyone who ever came here came this way.',
      refs: ['Exodus 27:9-16', 'Exodus 38:18'],
    },
    {
      id: 'the-altar',
      label: 'The Bronze Altar',
      position: [0, 1.7, 14],
      lookAt: [0, 2.2, 9],
      blurb:
        'The first thing inside the gate, and it is enormous — five cubits square, blocking the '
        + 'way. You do not walk past it to get to the tent; the layout will not let you pretend it '
        + 'is not there. Whatever else the worshipper had come to do, it began here, with a hand '
        + 'laid on an animal’s head.',
      refs: ['Exodus 27:1-8', 'Leviticus 1:3-9'],
    },
    {
      id: 'the-laver',
      label: 'The Laver',
      position: [0, 1.7, 6],
      lookAt: [0, 3.2, -2],
      blurb:
        'Between the altar and the tent, a bronze basin of water. Aaron and his sons washed hands '
        + 'and feet here going in and coming out, on pain of death. Exodus notes, almost in '
        + 'passing, what it was cast from: the bronze mirrors of the women who served at the door '
        + 'of the tent.',
      refs: ['Exodus 30:17-21', 'Exodus 38:8'],
    },
    {
      id: 'the-holy-place',
      label: 'The Holy Place',
      position: [0, 1.7, -5],
      lookAt: [0, 2.4, -9.6],
      blurb:
        'No windows. Forty-eight boards of acacia plated with gold, standing in sockets of silver, '
        + 'under a ceiling of linen worked with cherubim — and the only light in the room is the '
        + 'seven flames on your left. The gold has nothing to reflect but them.',
      refs: ['Exodus 26:15-30', 'Exodus 25:31-40', 'Hebrews 9:2'],
    },
    {
      id: 'before-the-veil',
      label: 'Before the Veil',
      position: [1.2, 1.7, -9],
      lookAt: [0, 2.6, -10.6],
      blurb:
        'The altar of incense stands a cubit square in front of the curtain, and the smoke off it '
        + 'goes up twice a day forever. This is the end of the road. Behind the veil is a room ten '
        + 'cubits every way with one object in it, and the arrangement of this entire building '
        + 'exists to say that you cannot go in.',
      refs: ['Exodus 30:1-10', 'Exodus 26:31-33', 'Hebrews 9:6-8'],
    },
  ],

  hotspots: [
    {
      id: 'the-cloud',
      label: 'The Pillar of Cloud',
      position: [0, 30, -7],
      maxDistance: 420,
      body:
        'When the tent was finished, the cloud covered it and the glory filled it — and Moses, who '
        + 'had spoken with God face to face, could not go in. A cloud by day and fire by night, '
        + 'over this tent, in front of the whole nation, for forty years. Whether Israel moved or '
        + 'stayed was not a decision anyone made.',
      refs: ['Exodus 40:34-38', 'Numbers 9:15-23'],
    },
    {
      id: 'the-gate-screen',
      label: 'One Way In',
      position: [0, 4.6, 25],
      maxDistance: 100,
      body:
        'The hanging round the court is plain white linen. The screen at the gate is not: blue, '
        + 'purple and scarlet, embroidered, twenty cubits wide, and visible from across the camp. '
        + 'The enclosure is designed so that the only opening in it is also the only thing in it '
        + 'you can see from a distance.',
      refs: ['Exodus 27:16', 'Exodus 38:18'],
    },
    {
      id: 'the-boards',
      label: 'Gold on Acacia, Set in Silver',
      position: [3.4, 6, -6],
      maxDistance: 80,
      body:
        'Forty-eight frames of acacia — desert wood, hard and light — each ten cubits high and a '
        + 'cubit and a half wide, plated in gold and standing in two sockets of solid silver. The '
        + 'silver was weighed out from the census tax, half a shekel a head, which means the whole '
        + 'building stood on a foundation counted one man at a time.',
      refs: ['Exodus 26:15-30', 'Exodus 38:25-27'],
    },
    {
      id: 'the-coverings',
      label: 'Four Coverings',
      position: [0, 6.6, -15.4],
      maxDistance: 90,
      body:
        'Look at the edge where they overlap. Innermost, fine twined linen in blue, purple and '
        + 'scarlet with cherubim woven in — the ceiling of the Holy Place. Over it goats’ hair. '
        + 'Over that rams’ skins dyed red. Outermost, tachash skins, a word nobody can now '
        + 'translate with confidence. From outside, this is a drab tent. Everything beautiful about '
        + 'it faces inward.',
      refs: ['Exodus 26:1-14', 'Exodus 36:8-19'],
    },
    {
      id: 'the-bronze-altar',
      label: 'The Altar of Burnt Offering',
      position: [0, 3.2, 10],
      maxDistance: 60,
      body:
        'Acacia overlaid with bronze, five cubits square and three high, hollow, with a bronze '
        + 'grating inside and horns at the four corners worked out of the same piece. Rings and '
        + 'poles, because it travelled. The fire on it was never to go out.',
      refs: ['Exodus 27:1-8', 'Leviticus 6:12-13'],
    },
    {
      id: 'the-laver-basin',
      label: 'The Mirrors of the Women',
      position: [0, 2.1, 4],
      maxDistance: 42,
      body:
        'Exodus gives this basin no dimensions, which is why its size here is invented. What it '
        + 'does record is the metal: the bronze mirrors of the women who served at the entrance of '
        + 'the tent of meeting. Something people looked at themselves in became the thing priests '
        + 'washed in before they could serve.',
      refs: ['Exodus 30:17-21', 'Exodus 38:8'],
    },
    {
      id: 'the-lampstand',
      label: 'The Lampstand',
      position: [-1.5, 2.7, -7],
      maxDistance: 30,
      body:
        'One talent of pure gold — about thirty-four kilograms — hammered into a single piece. A '
        + 'central shaft and six branches, and on every one of them cups shaped like almond '
        + 'blossoms with their buds and their flowers. Aaron tended the seven lamps morning and '
        + 'evening. In a room with no windows, this is the light.',
      refs: ['Exodus 25:31-40', 'Leviticus 24:1-4'],
    },
    {
      id: 'the-table',
      label: 'The Bread of the Presence',
      position: [1.5, 2.1, -7],
      maxDistance: 30,
      body:
        'Twelve loaves in two rows, one for each tribe, set out fresh every sabbath with '
        + 'frankincense beside them, and the old bread eaten by the priests in a holy place. The '
        + 'table is acacia overlaid with gold, with a border a handbreadth wide and a gold moulding '
        + 'round it. Bread, permanently, in the presence of God.',
      refs: ['Exodus 25:23-30', 'Leviticus 24:5-9'],
    },
    {
      id: 'the-incense-altar',
      label: 'The Altar of Incense',
      position: [0, 2.0, -9],
      maxDistance: 26,
      body:
        'A cubit square and two high, gold, standing right in front of the curtain. Incense burned '
        + 'on it every morning and every evening, and nothing else was permitted on it — no burnt '
        + 'offering, no grain offering, no drink offering. Centuries later Zechariah drew the lot '
        + 'to do this in the temple, and the people waited outside while he did.',
      refs: ['Exodus 30:1-10', 'Luke 1:8-11'],
    },
    {
      id: 'the-ark',
      label: 'What Is Behind It',
      position: [0, 2.8, -12.5],
      maxDistance: 30,
      body:
        'A chest of acacia two and a half cubits by one and a half, plated inside and out with '
        + 'gold, and on top a lid of solid gold with two cherubim hammered out of it, facing each '
        + 'other with their wings spread over it. It is a few metres in front of you and you will '
        + 'not see it. It is built into this scene and left in the dark, because that is where it '
        + 'was.',
      refs: ['Exodus 25:10-22', 'Leviticus 16:2', 'Hebrews 9:3-5'],
    },
    {
      id: 'the-camp-of-israel',
      label: 'The Camp',
      position: [0, 13, 62],
      maxDistance: 240,
      body:
        'Judah’s standard to the east, Reuben’s to the south, Ephraim’s to the west, Dan’s to the '
        + 'north, three tribes under each, and the Levites in between them and the tent. Numbers '
        + 'spends two chapters on the seating plan. The point of it is the shape: whichever '
        + 'direction you came from, you were facing this.',
      refs: ['Numbers 2:1-34', 'Numbers 1:50-53'],
    },
  ],
};
