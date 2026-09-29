import { CAESAREA } from './caesareaScene';
import { CAPERNAUM } from './capernaumScene';
import { TABERNACLE } from './tabernacleScene';
import { ELAH } from './elahScene';
import { OLIVET } from './olivetScene';
import { formatYear } from './bibleWiki';

// Registry for the immersive "step inside" scenes at /scene/:slug — a small
// first-person 3D reconstruction of a biblical site, reached from the Atlas
// detail sheet and the wiki entry for the same place.
//
// This module is deliberately free of React and three.js: everything the app
// needs in order to decide *whether* a place has a scene, what to call it, and
// what to say about it lives here as plain data, so the atlas can link to a
// scene without pulling the 3D chunk into its bundle. The geometry that
// consumes these coordinates lives in components/scene/buildSecondTemple.js.
//
// World axes shared by the manifest and the builder (metres, 1 cubit = 0.5m):
//   -Z  west, toward the sanctuary and the Holy of Holies
//   +Z  east, toward the gates and the Mount of Olives
//   +X  north        -X  south        +Y  up
// The Temple faced east, so a worshipper always looks down -Z — which is also
// three.js's default camera direction, so a vantage with yaw 0 needs no
// special-casing.
//
// Every Y below is an absolute height, not a height above the floor, because
// the precinct climbs westward in three steps: the outer court paving at 0,
// the Court of the Women at 3.2 (up twelve steps), and the inner court at 6.95
// (up the fifteen). A standing eye is its floor plus about 1.7. Those three
// numbers are `LEVEL` in components/scene/buildSecondTemple.js — change them
// there and the vantages here have to move with them.

// Everything below is a reconstruction, not a photograph. The proportions come
// from Mishnah Middot and Josephus (Antiquities 15, War 5); the surface detail
// is informed guesswork. The UI says so on screen.
export const SCENE_DISCLAIMER =
  'An artist’s reconstruction, not a photograph. Proportions follow Mishnah Middot '
  + 'and Josephus; colours, crowds and surface detail are informed guesswork.';

const SECOND_TEMPLE = {
  slug: 'second-temple',
  // The atlas/wiki place this scene belongs to. One place has at most one scene
  // today; `sceneForPlace` returns that one, so if a place ever gains a second
  // era the caller will need a picker rather than a single button.
  placeSlug: 'jerusalem',
  title: 'Herod’s Temple',
  subtitle: 'Jerusalem · c. AD 30',
  period: { label: 'c. AD 30', referenceYear: 30 },
  blurb:
    'The temple Herod rebuilt stood on a platform larger than any sanctuary in the Roman '
    + 'world — thirty-five acres of paving, colonnades and courts, climbing westward through '
    + 'gate after gate to a facade of white stone and gold. This is where Jesus taught, where '
    + 'a widow gave her two coins, and where the disciples stopped to admire the stonework days '
    + 'before he told them none of it would be left standing.',
  // Where the scene's origin sits on earth, and how its axes lie against the
  // compass: `bearing` is what the camera faces at yaw 0 (down -Z, at the
  // sanctuary, due west), `xAxis` is the heading of +X (north). Both are
  // needed — see src/lib/googleMaps.js — because the scenes disagree about
  // which way round their axes go.
  geo: { lat: 31.778, lon: 35.2354, bearing: 270, xAxis: 0 },
  // Where the camera starts. Must match one of the vantage ids below.
  defaultVantage: 'solomons-portico',

  // What happened in these courts, in the order the text tells it. Only one
  // is staged at a time (components/scene/templeEvents.js); the scene opens
  // on an ordinary day, and choosing one stages it at its hour and stands the
  // visitor where it can be seen. Each body says what is written and what the
  // staging supplies.
  events: [
    {
      id: 'zechariah',
      label: 'Zechariah’s Silence',
      place: 'The inner court',
      hour: 'noon',
      position: [-2.5, 8.65, 22.3],
      lookAt: [-10, 8.1, 16.6],
      body:
        'Zechariah, a priest of the division of Abijah, was chosen by lot to go into the sanctuary and '
        + 'burn incense, while the whole multitude of the people prayed outside at the hour of incense. '
        + 'There an angel told him that his wife Elizabeth would bear a son, John — and because he did '
        + 'not believe it, he was left unable to speak. The people were waiting and wondering at his '
        + 'delay; when he came out he could not speak to them, and they realised he had seen a vision. '
        + 'He kept making signs to them. The scene stands him in the priests’ court, making those signs '
        + 'across the rail.',
      refs: ['Luke 1:8-23'],
    },
    {
      id: 'simeon-anna',
      label: 'My Eyes Have Seen',
      place: 'Before the Nicanor Gate',
      hour: 'morning',
      position: [4.4, 4.9, 37.8],
      lookAt: [0.3, 4.45, 39.9],
      body:
        'When the time came for their purification, Mary and Joseph brought the child to present him to '
        + 'the Lord, with a pair of turtledoves — the offering the law allowed those who could not afford '
        + 'a lamb. Simeon, righteous and devout, waiting for the consolation of Israel, took him up in his '
        + 'arms: “Lord, now you are letting your servant depart in peace; for my eyes have seen your '
        + 'salvation.” Anna, a prophetess of great age who never left the temple, came up at that very '
        + 'hour and gave thanks to God. The Mishnah puts the purification of mothers at the Nicanor '
        + 'Gate, which is why the scene is here.',
      refs: ['Luke 2:22-38', 'Leviticus 12:6-8'],
    },
    {
      id: 'boy-jesus',
      label: 'In My Father’s House',
      place: 'Solomon’s Portico',
      hour: 'morning',
      position: [44.5, 1.7, 221.4],
      lookAt: [38.6, 0.9, 224.4],
      body:
        'Every year his parents went up to Jerusalem for the Passover. When he was twelve they set off '
        + 'home without him, and after three days found him in the temple, sitting among the teachers, '
        + 'listening to them and asking them questions — and all who heard him were amazed at his '
        + 'understanding. “Son, why have you treated us so?” said his mother. “Did you not know that I '
        + 'must be in my Father’s house?” Luke does not say where in the temple; the porticoes, where '
        + 'teachers sat with their students, are the likeliest place.',
      refs: ['Luke 2:41-52'],
    },
    {
      id: 'cleansing',
      label: 'A House of Trade',
      place: 'The outer court',
      hour: 'morning',
      position: [-102.5, 1.7, 171.6],
      lookAt: [-108.5, 1.3, 176.3],
      body:
        'In the temple he found those who were selling oxen and sheep and pigeons, and the '
        + 'money-changers sitting there. Making a whip of cords, he drove them all out, with the sheep '
        + 'and oxen, poured out the coins of the money-changers and overturned their tables: “Take these '
        + 'things away; do not make my Father’s house a house of trade.” John tells it at the start of '
        + 'the ministry and the other three in the last week, and whether it happened once or twice is '
        + 'still argued. The trade was lawful and needed: pilgrims had to buy unblemished animals and pay '
        + 'the temple tax in Tyrian silver.',
      refs: ['John 2:13-22', 'Mark 11:15-18', 'Matthew 21:12-13', 'Luke 19:45-46'],
    },
    {
      id: 'widow',
      label: 'Two Small Coins',
      place: 'The treasury',
      hour: 'noon',
      position: [-22.0, 4.9, 60.6],
      lookAt: [-29.8, 4.3, 64.6],
      body:
        'He sat down opposite the treasury and watched the people putting money into the offering box. '
        + 'Many rich people put in large sums. A poor widow came and put in two small copper coins, which '
        + 'make a penny. He called his disciples to him: “Truly, I say to you, this poor widow has put in '
        + 'more than all those who are contributing to the offering box. For they all contributed out of '
        + 'their abundance, but she out of her poverty has put in everything she had, all she had to '
        + 'live on.” Which of the thirteen chests she used is not known.',
      refs: ['Mark 12:41-44', 'Luke 21:1-4'],
    },
    {
      id: 'adulteress',
      label: 'Neither Do I Condemn You',
      place: 'The Court of the Women',
      hour: 'dawn',
      position: [11.5, 4.9, 66.2],
      lookAt: [5.8, 3.95, 71.0],
      body:
        'Early in the morning he came again to the temple, sat down and taught the people. The scribes '
        + 'and the Pharisees brought a woman caught in adultery and asked what he said to the law’s '
        + 'command to stone her. Jesus bent down and wrote with his finger on the ground. “Let him who is '
        + 'without sin among you be the first to throw a stone at her.” They went away one by one, '
        + 'beginning with the older ones. “Neither do I condemn you; go, and from now on sin no more.” '
        + 'The passage is missing from the earliest manuscripts of John, and many Bibles print it in '
        + 'brackets.',
      refs: ['John 8:2-11'],
    },
    {
      id: 'dedication',
      label: 'I and the Father Are One',
      place: 'Solomon’s Portico',
      hour: 'morning',
      position: [-33.5, 1.7, 222.6],
      lookAt: [-40, 1.3, 224.3],
      body:
        'At that time the Feast of Dedication took place at Jerusalem. It was winter, and Jesus was '
        + 'walking in the temple, in the colonnade of Solomon. They gathered round him: “How long will '
        + 'you keep us in suspense? If you are the Christ, tell us plainly.” He answered that his works '
        + 'bore witness about him, and said, “I and the Father are one.” The Jews picked up stones '
        + 'again to stone him — and he escaped from their hands. The feast is Hanukkah, which remembered '
        + 'the rededication of this altar after Antiochus had desecrated it.',
      refs: ['John 10:22-39'],
    },
    {
      id: 'beautiful-gate',
      label: 'Rise Up and Walk',
      place: 'The Beautiful Gate',
      hour: 'noon',
      position: [-1.0, 4.9, 97.6],
      lookAt: [-5.8, 3.95, 103.1],
      body:
        'Peter and John were going up to the temple at the hour of prayer, the ninth hour. A man lame '
        + 'from birth was carried every day to the gate of the temple called Beautiful to ask alms of '
        + 'those entering. Peter said, “I have no silver and gold, but what I do have I give to you. In '
        + 'the name of Jesus Christ of Nazareth, rise up and walk!” He took him by the right hand and '
        + 'raised him up, and immediately his feet and ankles were made strong. Which gate was the '
        + 'Beautiful Gate is not certain; the scene takes the traditional one, into the Court of the '
        + 'Women.',
      refs: ['Acts 3:1-11'],
    },
    {
      id: 'paul-seized',
      label: 'Away With Him',
      place: 'At the soreg',
      hour: 'noon',
      position: [-4.8, 1.7, 126.3],
      lookAt: [1.5, 1.3, 122.6],
      body:
        'Near the end of Paul’s vow, Jews from Asia saw him in the temple and stirred up the crowd: '
        + '“Men of Israel, help! This is the man who is teaching everyone everywhere against the people '
        + 'and the law and this place. Moreover, he even brought Greeks into the temple.” They had seen '
        + 'Trophimus the Ephesian with him in the city. They seized Paul and dragged him out of the '
        + 'temple, and the gates were shut. As they were seeking to kill him, the tribune of the cohort '
        + 'came running down with soldiers, and the crowd followed, crying out, “Away with him!”',
      refs: ['Acts 21:27-36'],
    },
  ],

  vantages: [
    {
      id: 'solomons-portico',
      label: 'Solomon’s Portico',
      // [x, y, z] eye position, and the point the camera looks at.
      position: [0, 1.75, 222],
      lookAt: [0, 30, -6],
      blurb:
        'The eastern colonnade of the outer court, open to anyone — Jew or Gentile, pilgrim or '
        + 'trader. Jesus walked here in winter; the apostles gathered here after Pentecost. From '
        + 'the shade of its columns the whole ascent to the sanctuary is in view.',
      refs: ['John 10:23', 'Acts 3:11', 'Acts 5:12'],
    },
    {
      id: 'the-soreg',
      label: 'The Dividing Wall',
      event: 'paul-seized',
      position: [0, 1.75, 126],
      lookAt: [0, 20, -6],
      blurb:
        'A waist-high stone screen ran around the inner courts carrying notices in Greek and '
        + 'Latin: no foreigner beyond this point, on pain of death. Two of those stones have been '
        + 'dug up. Paul, nearly lynched over a rumour that he had led a Greek past it, later '
        + 'called it the wall of hostility Christ tore down.',
      refs: ['Ephesians 2:14', 'Acts 21:28'],
    },
    {
      id: 'court-of-women',
      label: 'The Court of the Women',
      event: 'widow',
      position: [0, 4.9, 88],
      lookAt: [0, 26, -6],
      blurb:
        'The great public court, 135 cubits square, and as far in as most worshippers ever came. '
        + 'Thirteen trumpet-mouthed chests along its walls took the offerings. Simeon and Anna '
        + 'waited here for the consolation of Israel; a widow put in two small coins and was '
        + 'noticed by the only person counting.',
      refs: ['Mark 12:41-44', 'Luke 2:36-38', 'John 8:20'],
    },
    {
      id: 'fifteen-steps',
      label: 'The Fifteen Steps',
      position: [0, 6.9, 32],
      lookAt: [0, 20, -6],
      blurb:
        'Fifteen semicircular steps climbed from the women’s court to the Nicanor Gate — one, '
        + 'the rabbis said, for each of the Songs of Ascents. At the Feast of Tabernacles the '
        + 'Levites stood on them with harps and cymbals and sang through the night.',
      refs: ['Psalm 120:1', 'Psalm 134:1'],
    },
    {
      id: 'before-the-altar',
      label: 'Before the Altar',
      event: 'zechariah',
      position: [6, 8.65, 23],
      lookAt: [-1, 14, -4],
      blurb:
        'Past the gate, in the narrow Court of Israel, laymen stood at the rail while the priests '
        + 'worked. The altar burned without pause; the smoke of the morning and evening lamb was '
        + 'the clock the whole city lived by. Zechariah drew the lot to burn incense inside, and '
        + 'the crowd waited out here for a blessing he came back unable to speak.',
      refs: ['Luke 1:8-11', 'Leviticus 6:12-13'],
    },
  ],

  // Anchored labels floating in the world. `position` is the point projected to
  // screen each frame; `maxDistance` hides a label once the camera is far enough
  // away that it would only be clutter over the skyline.
  hotspots: [
    {
      id: 'sanctuary',
      label: 'The Sanctuary',
      position: [0, 38, -8],
      maxDistance: 300,
      body:
        'The porch stood a hundred cubits high and a hundred wide — about fifty metres each way '
        + '— faced in white stone and plated with gold that, Josephus says, forced you to look '
        + 'away in the morning sun. Behind its doorway lay the Holy Place, and behind that the '
        + 'empty, curtained room no one entered but the high priest, once a year.',
      refs: ['Mark 13:1-2', 'Hebrews 9:6-7'],
    },
    {
      id: 'altar',
      label: 'The Altar of Burnt Offering',
      position: [0, 16, 9],
      maxDistance: 150,
      body:
        'Unhewn stone, thirty-two cubits square at the base, with a ramp on the south because the '
        + 'law forbade steps up to an altar. A lamb went up at dawn and another at dusk, every day, '
        + 'for centuries. The fire was never allowed to go out.',
      refs: ['Exodus 20:25-26', 'Numbers 28:3-4'],
    },
    {
      id: 'nicanor-gate',
      label: 'The Nicanor Gate',
      position: [0, 20, 26.5],
      maxDistance: 170,
      body:
        'Corinthian bronze, and by every account the most beautiful of the gates — heavy enough '
        + 'that closing it was said to be heard across the city. Tradition identifies it with the '
        + 'Beautiful Gate where Peter and John met the man lame from birth.',
      refs: ['Acts 3:1-8'],
    },
    {
      id: 'treasury',
      label: 'The Treasury',
      position: [-31, 7, 62],
      maxDistance: 130,
      body:
        'Thirteen chests with trumpet-shaped mouths stood against the wall of the women’s court, '
        + 'each labelled for a different offering. Metal on metal in a stone room is loud: a rich '
        + 'gift announced itself. Two copper coins did not.',
      refs: ['Mark 12:41-44', 'John 8:20'],
    },
    {
      id: 'soreg',
      label: 'The Soreg',
      position: [20, 3.2, 118],
      maxDistance: 160,
      body:
        'The low screen marking the boundary Gentiles could not cross — waist high, and utterly '
        + 'binding. Warning stones in Greek and Latin stood along it at intervals, and two of them '
        + 'have been dug up. Walk down to it and it will turn you back, which is rather the point.',
      refs: ['Ephesians 2:13-14'],
    },
    {
      id: 'portico',
      label: 'The Porticoes',
      position: [-60, 14, 224],
      maxDistance: 260,
      body:
        'Double and triple rows of columns ran round the whole platform, deep enough to hold a '
        + 'crowd out of the sun. Teachers taught here, money was changed here, and doves were sold '
        + 'here for the offerings of the poor — until the morning Jesus turned the tables over.',
      refs: ['Mark 11:15-17', 'Luke 2:46'],
    },
    {
      id: 'the-poor-offering',
      label: 'Two Turtledoves',
      event: 'simeon-anna',
      position: [1.9, 5.6, 39.6],
      maxDistance: 14,
      body:
        'The law asked a mother for a lamb and a pigeon when her days of purification were over — and '
        + '“if she cannot afford a lamb, then she shall take two turtledoves or two pigeons.” Luke’s '
        + 'mention of the birds is the Gospels’ plainest word on the family’s means: they came with the '
        + 'offering of the poor.',
      refs: ['Leviticus 12:6-8', 'Luke 2:24'],
    },
    {
      id: 'the-money-changers',
      label: 'The Money-Changers',
      event: 'cleansing',
      position: [-110.4, 2.4, 177.3],
      maxDistance: 18,
      body:
        'Every Jewish man owed half a shekel a year to the temple, and it had to be paid in the good '
        + 'silver of Tyre; coins with an emperor’s head would not do. So the changers sat in the court, '
        + 'taking a fee on every exchange, beside the dealers in animals for the offerings. Mark has '
        + 'Jesus quote the prophets against them: “My house shall be called a house of prayer for all '
        + 'the nations, but you have made it a den of robbers.” And this was the court of the nations.',
      refs: ['Mark 11:17', 'Isaiah 56:7', 'Jeremiah 7:11', 'Exodus 30:13'],
    },
    {
      id: 'two-lepta',
      label: 'Two Lepta',
      event: 'widow',
      position: [-32.2, 5.3, 64.5],
      maxDistance: 12,
      body:
        'Mark’s Greek says two lepta, which make a quadrans — the smallest bronze coins in use, and he '
        + 'translates them into Roman money for his readers. The chests were trumpet-shaped at the '
        + 'mouth, the Mishnah says, thirteen of them, each marked for what its money was for. Two lepta '
        + 'would have made almost no sound going in.',
      refs: ['Mark 12:42', 'Luke 21:2'],
    },
    {
      id: 'written-in-the-earth',
      label: 'Written on the Ground',
      event: 'adulteress',
      position: [6.2, 4.3, 70.4],
      maxDistance: 12,
      body:
        'What he wrote, John does not say, and every answer is a guess. The one most often offered is '
        + 'Jeremiah’s: “those who turn away from you shall be written in the earth, for they have '
        + 'forsaken the LORD, the fountain of living water” — said, in John’s telling, the day after '
        + 'Jesus stood up in this temple and offered living water to anyone who was thirsty.',
      refs: ['John 8:6-8', 'Jeremiah 17:13', 'John 7:37-38'],
    },
    {
      id: 'the-feast-of-dedication',
      label: 'The Feast of Dedication',
      event: 'dedication',
      position: [-40.2, 2.9, 223.8],
      maxDistance: 16,
      body:
        'In 167 BC Antiochus IV set up a pagan altar in this temple; three years later Judas Maccabeus '
        + 'took the city back, cleansed the courts, built a new altar and dedicated it with eight days of '
        + 'celebration, to be kept every year. It is Hanukkah, and this is the only place the Bible names '
        + 'it — on a winter day, with Jesus in the colonnade, being asked whether he was the Christ.',
      refs: ['John 10:22-23', '1 Maccabees 4:52-59'],
    },
    {
      id: 'the-antonia',
      label: 'The Antonia',
      event: 'paul-seized',
      position: [8.5, 3.2, 128.5],
      maxDistance: 30,
      body:
        'The Roman garrison watched the temple from the Antonia, the fortress Herod built at the '
        + 'north-west corner of these courts, with stairs down into them — which is how the tribune got '
        + 'here so quickly. On those steps Paul, bound in two chains, asked leave to speak, and addressed '
        + 'the crowd that had just tried to kill him in their own language.',
      refs: ['Acts 21:31-40', 'Acts 22:1-2'],
    },
    {
      id: 'olivet',
      label: 'The Mount of Olives',
      position: [0, 40, 640],
      maxDistance: 900,
      body:
        'Across the Kidron valley, close enough that the whole temple platform lies open in front '
        + 'of you. Sitting on this slope looking back at the gold and the stonework, Jesus told '
        + 'four of his disciples that not one stone would be left on another.',
      refs: ['Mark 13:3-4', 'Luke 19:41-44'],
    },
  ],
};

const SCENES = [SECOND_TEMPLE, CAESAREA, CAPERNAUM, TABERNACLE, ELAH, OLIVET];

const BY_SLUG = new Map(SCENES.map((scene) => [scene.slug, scene]));
const BY_PLACE = new Map(SCENES.map((scene) => [scene.placeSlug, scene]));

// The scene whose own slug this is (`second-temple`), or null.
export function getScene(slug) {
  return BY_SLUG.get(slug) || null;
}

// The scene standing on this atlas/wiki place (`jerusalem`), or null.
export function sceneForPlace(placeSlug) {
  return BY_PLACE.get(placeSlug) || null;
}

// Used by the atlas sheet and the wiki entry to decide whether to offer the
// "Step inside" button at all.
export function hasScene(placeSlug) {
  return BY_PLACE.has(placeSlug);
}

// /scene/:slug accepts either identifier, so a link can be built from whichever
// slug the caller happens to be holding — the place slug in the atlas, the
// scene slug in a direct link — without the caller needing to know which.
export function resolveScene(slug) {
  if (!slug) return null;
  return getScene(slug) || sceneForPlace(slug);
}

export function vantageById(scene, id) {
  if (!scene) return null;
  return scene.vantages.find((v) => v.id === id) || null;
}

// The vantage a scene opens on. Falls back to the first one so a manifest with
// a stale `defaultVantage` still opens somewhere sensible rather than nowhere.
export function defaultVantage(scene) {
  if (!scene) return null;
  return vantageById(scene, scene.defaultVantage) || scene.vantages[0] || null;
}

export function scenePath(scene) {
  return scene ? `/scene/${scene.slug}` : null;
}

// A link into a scene at one particular thing in it: an event to stage
// (`?event=`), a vantage to stand at (`?at=`) or a pin to open (`?pin=`).
// Used by the scripture reader to go from a passage straight to where it
// happened (sceneScripture.js); Scene.jsx reads it back with resolveSceneLink.
const LINK_PARAM = { event: 'event', vantage: 'at', hotspot: 'pin' };
export function sceneLinkPath(scene, kind, id) {
  const base = scenePath(scene);
  if (!base || !LINK_PARAM[kind] || !id) return base;
  return `${base}?${LINK_PARAM[kind]}=${encodeURIComponent(id)}`;
}

// The vantage nearest a point on the ground — where to stand for a pin that
// has no event of its own to stand at.
function nearestVantage(scene, [x, , z]) {
  let best = null;
  let bestDistance = Infinity;
  for (const vantage of scene.vantages) {
    const distance = Math.hypot(vantage.position[0] - x, vantage.position[2] - z);
    if (distance < bestDistance) {
      best = vantage;
      bestDistance = distance;
    }
  }
  return best;
}

// What a scene link asks for, resolved against the scene: the thing itself,
// the panel kind that shows it, where to stand, which event to stage and at
// what hour. Null for a plain scene URL, or one naming nothing that exists.
export function resolveSceneLink(scene, search = '') {
  if (!scene) return null;
  const params = new URLSearchParams(search);
  const events = scene.events || [];
  const event = events.find((item) => item.id === params.get(LINK_PARAM.event));
  if (event) {
    return { kind: 'event', target: event, standpoint: event, eventId: event.id, hour: event.hour || null };
  }
  const vantage = vantageById(scene, params.get(LINK_PARAM.vantage));
  if (vantage) {
    return {
      kind: 'vantage', target: vantage, standpoint: vantage, eventId: vantage.event || scene.defaultEvent || null, hour: null,
    };
  }
  const hotspot = scene.hotspots.find((item) => item.id === params.get(LINK_PARAM.hotspot));
  if (hotspot) {
    // A pin that belongs to an event is seen from that event's standpoint,
    // with the event staged; any other from the vantage nearest it.
    const staged = events.find((item) => [].concat(hotspot.event || []).includes(item.id));
    const standpoint = staged || nearestVantage(scene, hotspot.position);
    return {
      kind: 'hotspot',
      target: hotspot,
      standpoint,
      eventId: staged?.id || standpoint?.event || scene.defaultEvent || null,
      hour: staged?.hour || null,
    };
  }
  return null;
}

export function formatScenePeriod(scene) {
  return scene?.period?.label || scene?.subtitle || '';
}

export function formatSceneEntryCta(scene) {
  const periodLabel = formatScenePeriod(scene);
  return periodLabel
    ? `Step inside ${scene?.title || 'Scene'} · ${periodLabel}`
    : `Step inside ${scene?.title || 'Scene'}`;
}

export function describePeriodMismatch(atlasYear, scene) {
  if (!scene?.period || scene.period.referenceYear === null || scene.period.referenceYear === undefined) {
    return null;
  }
  if (!Number.isFinite(atlasYear) || atlasYear === scene.period.referenceYear) {
    return null;
  }
  const yearText = formatYear(atlasYear);
  return `Atlas: ${yearText}. This reconstruction depicts ${scene.period.label}.`;
}

export { SCENES };

// The "look closer" pins that belong to one of a scene's events show only
// while it is the event staged: a label over an empty doorway is worse than
// no label. Pins that belong to no event always show.
export function hotspotsFor(scene, eventId) {
  return (scene?.hotspots || []).filter((hotspot) => (
    !hotspot.event || [].concat(hotspot.event).includes(eventId)
  ));
}
