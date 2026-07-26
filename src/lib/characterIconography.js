// Character iconography for image / video generation.
//
// Goal: a generated picture should give the viewer a visual hint of WHO the
// figure is — Moses' staff and stone tablets, Elijah's hair mantle and fire,
// David's sling and harp — instead of a generic bearded man in a robe. Both the
// in-app "Generate" button (src/lib/bibleWiki.js → buildImagePrompt) and the
// Veo prompt script (scripts/anim-pilot/generate-veo-prompts.js) build person
// portraits from here so the two stay identical.
//
// This module is intentionally dependency-free (no imports): it is bundled into
// the browser app AND imported by a plain Node script.

// Shared art direction. Kept identical to the previous inline value so places,
// events, and teacher prompts render unchanged.
export const IMAGE_STYLE =
  'dignified realistic digital painting, warm natural light, historically accurate ancient Near East, '
  + 'Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, '
  + 'no text, no words, no watermark, no halo';

// Hand-curated visual signatures for prominent figures.
//   epithet — a short "who they are" tag woven in after the name
//   attrs   — concrete props / dress / a hint of their signature scene, phrased
//             for a single-subject reverent portrait (not a busy narrative)
// Anyone not listed here falls back to cues derived from their story arc.
export const CHARACTER_ICONOGRAPHY = {
  adam_78: {
    epithet: 'the first man',
    attrs: 'a strong bare-shouldered man in a lush garden naming the animals around him, a simple leaf covering, the tree of knowledge behind him',
  },
  eve_1231: {
    epithet: 'the first woman, mother of all living',
    attrs: 'a woman in the garden of Eden beside the forbidden tree, a serpent coiled in its branches and ripe fruit in her hand',
  },
  noah_2210: {
    epithet: 'who built the ark',
    attrs: 'an old bearded man before a vast wooden ark, a dove with an olive branch returning to his hand, pairs of animals and a rainbow arcing overhead',
  },
  abraham_58: {
    epithet: 'father of the faithful',
    attrs: 'an aged patriarch beneath a vast starry night sky, a shepherd\'s tent and flocks behind him, a ram caught in a thicket near a stone altar',
  },
  sarah_2473: {
    epithet: 'wife of Abraham, mother of Isaac',
    attrs: 'an elderly but radiant matriarch at the door of a nomad\'s tent, laughing softly, cradling an infant son',
  },
  isaac_616: {
    epithet: 'the child of promise',
    attrs: 'a contemplative patriarch beside a stone well, bundled wood and a stone altar on the hill behind him, flocks in the fields',
  },
  israel_682: {
    epithet: 'Jacob, father of the twelve tribes',
    attrs: 'a weathered patriarch leaning on a shepherd\'s staff, a stairway of angels rising into the night sky behind him',
  },
  joseph_1710: {
    epithet: 'sold into Egypt, risen to power',
    attrs: 'a young man in a richly colored ornate coat, robed as an Egyptian vizier with a gold collar, sheaves of grain and storehouses behind him',
  },
  esau_1216: {
    epithet: 'Jacob\'s elder twin',
    attrs: 'a rugged, ruddy, hairy hunter with a bow and quiver returning from the field with game, the open wilderness behind him',
  },
  moses_2108: {
    epithet: 'who led Israel out of Egypt',
    attrs: 'an elderly Hebrew man with a long grey beard holding a wooden shepherd\'s staff and two stone tablets of the law, a burning bush glowing on the mountain behind him, his face faintly radiant',
  },
  aaron_1: {
    epithet: 'the first high priest',
    attrs: 'a high priest in an embroidered ephod and a jeweled breastplate of twelve stones, a golden turban, holding a budding almond staff and a smoking censer',
  },
  miriam_2087: {
    epithet: 'the prophetess, sister of Moses',
    attrs: 'a joyful woman raising a timbrel, leading women in dance beside the parted sea',
  },
  joshua_1727: {
    epithet: 'who led Israel into the promised land',
    attrs: 'a resolute leader in leather armor with a sword, rams\'-horn trumpets sounding as the walls of Jericho crumble behind him',
  },
  deborah_997: {
    epithet: 'prophetess and judge of Israel',
    attrs: 'a commanding woman seated in judgment beneath a palm tree, a warrior host mustering on the hills behind her',
  },
  gideon_1314: {
    epithet: 'the reluctant judge',
    attrs: 'a farmer-warrior holding a clay jar with a burning torch and a trumpet, a woolen fleece wet with dew at his feet',
  },
  samson_2468: {
    epithet: 'the strongman judge',
    attrs: 'a powerfully built man with long braided hair gripping the pillars of a temple, a slain lion behind him',
  },
  ruth_2450: {
    epithet: 'the loyal Moabite',
    attrs: 'a young woman gleaning sheaves of barley in a harvest field at golden hour, gathered grain held in her arms',
  },
  hannah_1400: {
    epithet: 'mother of Samuel',
    attrs: 'a woman praying fervently at the temple doorway, later presenting a young son to the priest',
  },
  samuel_2469: {
    epithet: 'the prophet who anointed kings',
    attrs: 'a prophet in a linen robe holding a horn of anointing oil, a young boy in the lamplit temple in the background',
  },
  saul_2478: {
    epithet: 'Israel\'s first king',
    attrs: 'a tall, imposing king in royal robes and a bronze crown gripping a spear, a troubled shadow over his face',
  },
  david_994: {
    epithet: 'the shepherd-king of Israel',
    attrs: 'a young shepherd holding a sling and a lyre, a king\'s crown and the fallen giant Goliath in the valley behind him',
  },
  solomon_2762: {
    epithet: 'the wise king',
    attrs: 'a richly robed king enthroned in splendor holding a scroll, the golden temple of Jerusalem rising behind him',
  },
  elijah_1131: {
    epithet: 'the prophet of fire',
    attrs: 'a weathered prophet in a rough hair mantle and leather belt, fire falling from heaven on an altar behind him, a raven overhead and a distant whirlwind chariot of fire',
  },
  elisha_1153: {
    epithet: 'Elijah\'s successor',
    attrs: 'a bald-headed prophet wearing the fallen mantle, a jar of oil overflowing beside him, a yoke of oxen and plowed field behind him',
  },
  isaiah_617: {
    epithet: 'the messianic prophet',
    attrs: 'a robed prophet holding a scroll, a six-winged seraph touching a burning coal to his lips, the smoke-filled temple behind him',
  },
  jeremiah_853: {
    epithet: 'the weeping prophet',
    attrs: 'a sorrowful prophet with tears holding a broken clay pot, a wooden yoke on his shoulders, a burning city behind him',
  },
  ezekiel_1237: {
    epithet: 'the visionary prophet of the exile',
    attrs: 'a prophet before a valley of dry bones coming to life, luminous wheels-within-wheels turning in the sky behind him',
  },
  daniel_975: {
    epithet: 'faithful in Babylon',
    attrs: 'a dignified man in Babylonian robes praying at an open window, calm among lions in a stone den',
  },
  jonah_1689: {
    epithet: 'the reluctant prophet',
    attrs: 'a drenched prophet cast from a storm-tossed ship toward a great fish, later resting beneath a withered gourd vine above a great city',
  },
  ezra_1245: {
    epithet: 'the priest and scribe',
    attrs: 'a scribe in priestly robes unrolling a large Torah scroll on a raised wooden platform before a listening crowd',
  },
  zerubbabel_3054: {
    epithet: 'who rebuilt the temple',
    attrs: 'a governor holding a plumb line and a foundation stone amid the scaffolding of the rebuilt temple',
  },
  esther_1343: {
    epithet: 'the queen who saved her people',
    attrs: 'a poised young queen in richly embroidered Persian royal robes and a jeweled crown, the columns of the Susa palace behind her',
  },
  mordecai_2107: {
    epithet: 'Esther\'s guardian at the king\'s gate',
    attrs: 'a dignified Jewish elder at a Persian palace gate, later robed in royal blue and white upon the king\'s horse',
  },
  job_1639: {
    epithet: 'who suffered and trusted God',
    attrs: 'a suffering man seated on ashes scraping his sores with a potsherd, storm clouds parting to light behind him, restored flocks in the distance',
  },
  peter_2745: {
    epithet: 'the fisherman apostle',
    attrs: 'a rugged, strong-handed fisherman mending nets by the Sea of Galilee holding a set of keys, a boat and a distant rooster nearby',
  },
  paul_2479: {
    epithet: 'apostle to the nations',
    attrs: 'a balding, bearded man in a traveler\'s cloak writing letters by lamplight, iron chains at his wrist, open scrolls and a Roman road beside him',
  },
  mary_1938: {
    epithet: 'mother of Jesus',
    attrs: 'a humble young woman in a modest veil and deep blue mantle, hands folded in quiet trust, the hills of Nazareth soft behind her',
  },
  stephen_2802: {
    epithet: 'the first martyr',
    attrs: 'a young deacon with a serene upward gaze and a faintly glowing face, stones at his feet, the heavens opening in light above him',
  },
  lazarus_1812: {
    epithet: 'raised from the dead',
    attrs: 'a man emerging from a rock-hewn tomb still wrapped in linen grave clothes, the great stone rolled away, dawn light spilling in',
  },
};

// Turn a story-arc beat title into a short scene cue for the fallback path.
function cleanBeat(title) {
  let s = String(title || '').trim();
  // Beats like "Sinai — the law and the golden calf" put the concrete image
  // after the dash; keep that half when present.
  const dash = s.split(/\s+[—–-]\s+/);
  if (dash.length > 1 && dash[dash.length - 1].length >= 8) s = dash[dash.length - 1];
  s = s.replace(/["'.]+$/, '').trim();
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// A concrete visual clause for the portrait: curated attrs when we have them,
// otherwise cues derived from the character's first story-arc beats. Returns
// null when we have nothing to add (caller falls back to a plain portrait).
export function characterVisualSignature(entry) {
  if (!entry || !entry.s) return null;
  const curated = CHARACTER_ICONOGRAPHY[entry.s];
  if (curated && curated.attrs) return curated.attrs;
  const beats = Array.isArray(entry.arc)
    ? entry.arc.map((a) => a && a.t).filter(Boolean)
    : [];
  if (!beats.length) return null;
  const cues = beats.slice(0, 2).map(cleanBeat).filter(Boolean);
  if (!cues.length) return null;
  return `with subtle background imagery evoking ${cues.join(' and ')}`;
}

// The short "who they are" epithet, or null.
export function characterEpithet(slug) {
  const curated = CHARACTER_ICONOGRAPHY[slug];
  return (curated && curated.epithet) || null;
}

// Build the full enriched portrait prompt for a Bible person. `entry` carries
// slug (s), a display name, gender (g), a pre-formatted era string, and
// optionally the story arc used by the fallback signature.
export function buildPersonPortraitPrompt({ slug, name, gender, era, arc } = {}) {
  const person =
    gender === 'F' ? 'a woman of the Bible'
      : gender === 'M' ? 'a man of the Bible'
        : 'a figure of the Bible';
  const epithet = characterEpithet(slug);
  const who = epithet ? `${name} — ${epithet}` : name;
  const eraPhrase = era ? ` who lived around ${era}` : '';
  const signature = characterVisualSignature({ s: slug, arc });
  const attrs = signature ? ` — ${signature}` : '';
  return (
    `Reverent single-subject portrait of ${who}, ${person}${eraPhrase}${attrs}, `
    + `in historically authentic dress and setting of their time and place, ${IMAGE_STYLE}`
  );
}
