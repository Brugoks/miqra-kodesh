// Who wears what on the head. A person is dressed by the group they belong to
// — a fisherman, a pilgrim, a harbour hand, a priest — not by a coin toss
// over everyone alike, and by the body they are drawn on: a woman's veil
// belongs to women and to nobody else.
//
// These are interpretive, and say how sure they are. The evidence for what
// ordinary men wore on their heads in first-century Judea and Galilee is thin
// and mostly negative: the Gospels name no hat; the published desert finds
// (the Cave of Letters, Masada, Mo'a) give tunics, mantles and sandals and,
// for the head, mostly women's kerchiefs and hairnets; the skullcap as a
// Jewish habit is later. The honest majority for a village man is therefore bareheaded,
// with a cloth against the sun and the road. Where the wider world shows
// something more — workmen's and sailors' caps in Roman art, the priests'
// linen cap (Exodus 28:40; Josephus, Antiquities 3.157), the Roman soldier's
// helmet — it is used where that world is on stage.
//
// Each profile is a weighting out of 100 over: none (bareheaded), cloth (a
// head cloth against the sun, falling to the nape), band (a twisted headband
// with its ends hanging), cap (a felt skullcap), turban (wound linen) and
// helmet. `basis` says why, and how far to trust it. An `office` is not drawn
// from a weighting: whoever holds it dresses as it says (its colours too), and
// wears no mantle over it.

export const HEADWEAR_ORDER = ['none', 'cloth', 'band', 'cap', 'turban', 'helmet'];

export const DRESS = {
  // Galilee.
  fisherman: {
    none: 35, cloth: 35, band: 10, cap: 20,
    basis: 'Men at the nets and boats: sun cloths are certain in kind if not in record; the felt cap is borrowed from Roman-period depictions of fishermen and sailors (medium-low confidence in Galilee).',
  },
  villager: {
    none: 55, cloth: 30, band: 5, cap: 10,
    basis: 'A village man at home: mostly bareheaded (the Gospels name no hat), a cloth for the sun, the odd cap from the Hellenised world around (low confidence).',
  },
  traveller: {
    none: 35, cloth: 45, band: 10, cap: 10,
    basis: 'On the road and the shore path: the head cloth is the road-and-sun covering (Hebrew and Greek texts name the soudarion/sudarium as a cloth carried on the person; medium confidence).',
  },
  labourer: {
    none: 20, cloth: 55, band: 15, cap: 10,
    basis: 'Field and grove work in full sun: the sun cloth in the majority, a headband to keep sweat and hair back.',
  },
  shepherd: {
    none: 30, cloth: 50, band: 20,
    basis: 'A shepherd out all day: cloth or headband. Headbands are the best-attested ancient Near Eastern men\'s headwear in art (low-medium confidence for the first century).',
  },
  // Cities and crowds.
  pilgrim: {
    none: 55, cloth: 30, band: 5, cap: 10,
    basis: 'Pilgrims to the Temple and on the road up at Passover: as villagers, with a few more caps from the Diaspora and the cities. The prayer shawl over the head is a later practice and is not used.',
  },
  townsman: {
    none: 45, cloth: 25, band: 10, cap: 20,
    basis: 'A Hellenistic-Roman port: bareheaded most often, caps and cloths against the glare off the water.',
  },
  harbour: {
    none: 30, cloth: 25, band: 5, cap: 40,
    basis: 'Quay labourers: the felt cap (pilos or pileus) is the workman\'s and sailor\'s cap of Roman art and the best-supported hat in this list (medium confidence).',
  },
  merchant: {
    none: 50, cloth: 15, cap: 20, turban: 15,
    basis: 'Traders: bareheaded or capped, with a few wound turbans for merchants from the east and south (low confidence; kept to a few).',
  },
  // The wilderness: the Late Bronze and Iron Age, not the Roman world.
  camp: {
    none: 20, cloth: 50, band: 30,
    basis: 'Semi-nomadic Israel: no caps, no turbans, no Roman anything. Headbands appear on the Asiatics of the Beni Hasan tomb painting (c. 1900 BC), and desert headcloths are the sun\'s answer in any age (medium-low confidence).',
  },
  // The returned exiles, in the Persian province of Yehud: the fifth century BC,
  // not the first AD.
  returnee: {
    none: 35, cloth: 40, band: 25,
    basis: 'Judeans of Nehemiah\'s day: the skullcap and the turban belong to later centuries, so neither is used. What Near Eastern art of the period shows for men is a head cloth or a twisted headband, or nothing; Achaemenid reliefs dress subject peoples in felt caps, which a small, impoverished returned community is unlikely to have worn (low confidence).',
  },
  // Offices.
  priest: {
    office: true,
    turban: 100,
    basis: 'A priest serving wears the linen cap (Exodus 28:40; 39:28), described by Josephus as wound linen that did not rise to a point (Antiquities 3.157). Always (high confidence).',
    sash: 0xe9e2cf,
    wrap: 0xf1ece0,
  },
  soldier: {
    office: true,
    helmet: 100,
    basis: 'A Roman auxiliary on post at Caesarea, where Acts 23-24 keep the garrison. Helmeted, belted in leather (high confidence in kind; the helmet pattern here is a plain bronze dome with a neck guard, not a particular type).',
    sash: 0x4a3424,
    wrap: 0xa8813f,
  },
};

// Every profile is a weighting out of a hundred.
export const profileTotal = (profile) => HEADWEAR_ORDER.reduce((n, key) => n + (profile[key] || 0), 0);

// Where a person's profile comes from, most specific first: they carry it
// (`dress`), their group has one (Capernaum's haunts), or their scene does.
const GROUP_DRESS = {
  'shore-nets': 'fisherman',
  'north-lane': 'traveller',
  'tax-booth-queue': 'traveller',
  courtyard: 'villager',
  'synagogue-steps': 'villager',
  'promenade-west': 'villager',
  'lane-crossing': 'villager',
};
const SCENE_DRESS = {
  capernaum: 'villager',
  bethlehem: 'villager',
  caesarea: 'townsman',
  'second-temple': 'pilgrim',
  olivet: 'pilgrim',
  sinai: 'camp',
  tabernacle: 'camp',
  'nehemiahs-wall': 'returnee',
};

export function dressFor(figure = {}, sceneSlug = '') {
  if (DRESS[figure.dress]) return figure.dress;
  if (GROUP_DRESS[figure.groupId]) return GROUP_DRESS[figure.groupId];
  return SCENE_DRESS[sceneSlug] || 'villager';
}

// The headwear a man in this profile wears, for a roll from 0 to 99.
export function menHeadwear(profileId, roll) {
  const profile = DRESS[profileId] || DRESS.villager;
  let at = 0;
  for (const key of HEADWEAR_ORDER) {
    at += profile[key] || 0;
    if (roll < at) return key === 'none' ? null : key;
  }
  return null;
}

// Models drawn on a woman's body. A person on one is a woman whatever their
// `kind` says; a person on any other is not.
const WOMEN = new Set(['human-villager', 'human-tabernacle-camp-woman', 'human-woman-young', 'human-woman-adult', 'human-woman-elder']);
export const isWomanModel = (modelId) => WOMEN.has(modelId);
