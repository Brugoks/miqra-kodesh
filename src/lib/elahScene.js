// Valley of Elah, c. 1020 BC — The confrontation between David and Goliath (1 Samuel 17).
//
// World axes (meters, Y up):
//   -Z  Northwest, down the valley toward the coastal plain
//   +Z  Southeast, up the valley toward the Judean hill country
//   -X  Southwest, toward Socoh, Azekah and the Philistine camp at Ephes-dammim
//   +X  Northeast, toward the Israelite camp on the opposing ridge
//
// Principal placement and physical stature live in elahDimensions.js.
// Viewpoints keep the two champions at comparable camera depth so perspective
// does not erase their anatomical size contrast.

export const ELAH = {
  slug: 'valley-of-elah',
  placeSlug: 'map-valleyofelah',
  title: 'Valley of Elah',
  subtitle: 'The Standoff · 1 Samuel 17 · c. 1020 BC',
  period: { label: 'c. 1020 BC · United Monarchy', referenceYear: -1020 },
  blurb:
    'For forty days the Philistine champion walked out into the valley to defy the ranks of '
    + 'Israel. Between Socoh and Azekah the two armies watched from opposing ridges, with '
    + 'the dry bed of the brook between them. Here a shepherd boy with five smooth stones '
    + 'answered sword, spear and javelin in the name of the Lord of hosts.',
  disclaimer:
    'An artist’s reconstruction and dramatic standoff tableau. The valley geography follows the '
    + 'Shephelah corridor between Socoh and Azekah (1 Samuel 17:1). Goliath’s height is rendered '
    + 'at approximately 2.9 meters following the Masoretic tradition (six cubits and a span); the '
    + 'Septuagint and 4QSamª witness an alternate reading of four cubits and a span (~2.0 m). '
    + 'David is modeled at 1.65 meters as an artistic choice; Scripture does not give his height. '
    + 'Faces, costume construction, troop placement and foliage are interpretive, not verified likenesses.',
  geo: { lat: 31.6906, lon: 34.9631, bearing: 300, xAxis: 30 },
  defaultVantage: 'reference-view',

  vantages: [
    {
      id: 'reference-view',
      label: 'The Standoff',
      position: [-2, 1.45, 8],
      lookAt: [0, 1.35, 0],
      blurb:
        'The low viewpoint across the rocky streambed. Goliath towers on the left under the Philistine '
        + 'ridge; David stands alert on the right in simple shepherd’s dress, five stones chosen from '
        + 'the brook and a sling in hand. Behind them, two nations watch in silence.',
      refs: ['1 Samuel 17:1-11', '1 Samuel 17:40-49'],
    },
    {
      id: 'beside-david',
      label: 'Beside David',
      position: [3.6, 1.4, 3.2],
      lookAt: [-3, 2.2, -1],
      blurb:
        'Just behind David beside the gravel banks of the brook. Saul’s heavy bronze armor has been '
        + 'set aside; all he carries is his staff, his shepherd’s bag, and a woven sling.',
      refs: ['1 Samuel 17:38-40'],
    },
    {
      id: 'facing-goliath',
      label: 'Facing Goliath',
      position: [-3, 1.4, 2.6],
      lookAt: [-3, 2.3, -1],
      blurb:
        'Standing in the shadow of the champion of Gath. Bronze helmet, overlapping coat of mail '
        + 'weighing five thousand shekels, bronze greaves, and a spear whose shaft is like a weaver’s '
        + 'beam. His shield-bearer moves before him with a large wood-and-leather shield.',
      refs: ['1 Samuel 17:4-7', '1 Samuel 17:41'],
    },
    {
      id: 'valley-overview',
      label: 'Valley Overview',
      position: [28, 14, 28],
      lookAt: [-8, 2, -8],
      blurb:
        'From the lower slopes of the northern ridge. The Philistine camp spreads along the southern '
        + 'heights above Ephes-dammim; the army of Israel occupies the northern spur. Below in the '
        + 'corridor of the valley, the duel decides the battle.',
      refs: ['1 Samuel 17:1-3', '1 Samuel 17:52-53'],
    },
  ],

  hotspots: [
    {
      id: 'david',
      label: 'David of Bethlehem',
      position: [3, 1.85, 1],
      maxDistance: 30,
      body:
        'The youngest son of Jesse, sent to bring roasted grain and bread to his brothers in Saul’s '
        + 'camp. Refusing Saul’s bronze helmet and coat of mail because he had not tested them, he '
        + 'approaches the Philistine with his shepherd’s staff, bag, sling, and five smooth stones.',
      refs: ['1 Samuel 17:17-20', '1 Samuel 17:38-40'],
    },
    {
      id: 'goliath',
      label: 'Goliath of Gath',
      position: [-3, 3.05, -1],
      maxDistance: 45,
      body:
        'The champion of the Philistines. Stood six cubits and a span in the Masoretic reading. Clothed '
        + 'in scale armor with bronze greaves and a bronze javelin slung between his shoulders; the '
        + 'iron head of his spear weighed six hundred shekels.',
      refs: ['1 Samuel 17:4-7', '1 Samuel 17:43-44'],
    },
    {
      id: 'shield-bearer',
      label: 'The Shield-Bearer',
      position: [-1.3, 1.9, -.4],
      maxDistance: 35,
      body:
        'A shield-bearer went ahead of Goliath (1 Samuel 17:7, 41). The separate bearer follows the text; '
        + 'the shield’s oval shape, leather covering and bronze fittings are artistic reconstruction choices.',
      refs: ['1 Samuel 17:7', '1 Samuel 17:41'],
    },
    {
      id: 'philistine-ranks',
      label: 'Philistine Ranks',
      position: [-55, 9, -20],
      maxDistance: 180,
      body:
        'Encamped between Socoh and Azekah at Ephes-dammim. Arrayed on the southern hill slope with '
        + 'spears, bronze helmets, and standards, holding the southern approach to Judah’s heartland.',
      refs: ['1 Samuel 17:1'],
    },
    {
      id: 'israelite-ranks',
      label: 'Army of Israel',
      position: [55, 11, 10],
      maxDistance: 180,
      body:
        'King Saul and the men of Israel were gathered and encamped in the Valley of Elah, drawing '
        + 'up in battle array on the northern mountain facing the Philistines.',
      refs: ['1 Samuel 17:2-3'],
    },
    {
      id: 'the-brook',
      label: 'The Brook (Wadi es-Sant)',
      position: [1.2, 0.2, 8],
      maxDistance: 40,
      body:
        'Wadi es-Sant cuts through the valley floor. In the dry season it forms a gravelly wash strewn '
        + 'with water-worn limestone pebbles — from which David chose five smooth stones for his shepherd’s bag.',
      refs: ['1 Samuel 17:40'],
    },
    {
      id: 'valley-corridor',
      label: 'Valley of Elah',
      position: [0, 0.4, -25],
      maxDistance: 120,
      body:
        'An east-west corridor in the Judean Shephelah connecting the Mediterranean coastal plain to the '
        + 'highlands near Bethlehem and Hebron. Controlling this pass meant controlling access to Judah.',
      refs: ['1 Samuel 17:1-2'],
    },
  ],
};
