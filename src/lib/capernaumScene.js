// Capernaum, c. AD 28 — "his own city" (Matthew 9:1). The village Jesus moved
// to when he left Nazareth, and the setting of more of Mark's first two
// chapters than anywhere else.
//
// Coordinates are the ones in components/scene/capernaumDimensions.js: +Z north
// and inland, -Z south to the lake, +X east. Every Y here is an absolute height,
// and a standing eye is its floor plus 1.7 — the beach is at -0.55, the village
// at 0, the synagogue podium at 0.9, the roofs at 3.3. A test asserts these
// agree with the collision model rather than trusting the arithmetic.

export const CAPERNAUM = {
  slug: 'capernaum',
  placeSlug: 'capernaum',
  title: 'Capernaum',
  subtitle: 'The lakeside village · c. AD 28',
  blurb:
    'Jesus left Nazareth and came and lived here — a fishing village of black basalt on the '
    + 'north shore of the lake, a few hundred people, a customs post, one synagogue. Almost '
    + 'everything in the first half of Mark happens within a few minutes’ walk of where you '
    + 'are standing. Go inside the house. Then go up the outside stair and look down through '
    + 'the roof.',
  disclaimer:
    'An artist’s reconstruction. The village plan, the basalt building and the insula layout '
    + 'follow the excavated site; the interiors, the crowd and the boats are informed guesswork. '
    + 'The room shown as the house is the one venerated from the first century as Peter’s — the '
    + 'identification is early and widely held, but it is tradition, not proof.',
  // The site on the north shore of the lake. -Z is south, out over the water;
  // +X is east along the shore. See src/lib/googleMaps.js.
  geo: { lat: 32.8806, lon: 35.5752, bearing: 180, xAxis: 90 },
  defaultVantage: 'the-shore',

  vantages: [
    {
      id: 'the-shore',
      label: 'The Shore',
      position: [2, 1.15, -16],
      lookAt: [40, 8, -78],
      blurb:
        'Dawn over the Golan, and the lake already working. Four of the twelve were pulled out '
        + 'of exactly this: boats drawn up on the shingle, nets spread to dry, a night’s catch to '
        + 'sort. Follow me, he said, and I will make you fishers of men — and they left the nets '
        + 'where they lay.',
      refs: ['Mark 1:16-20', 'Luke 5:1-11', 'Matthew 4:13'],
    },
    {
      id: 'the-tax-booth',
      label: 'The Tax Booth',
      position: [-46, 1.7, -6],
      lookAt: [-56, 3.4, -3],
      blurb:
        'Capernaum sat on the road from Damascus to the sea and on the border of Herod Antipas’s '
        + 'territory, which is why there was a customs post in a fishing village. Matthew was '
        + 'sitting at it — a man collecting his own people’s money for someone else — when Jesus '
        + 'walked past and said two words to him.',
      refs: ['Matthew 9:9', 'Mark 2:13-17'],
    },
    {
      id: 'the-doorway',
      label: 'At the Door',
      position: [15.6, 1.7, 20],
      lookAt: [15.6, 2.4, 13],
      blurb:
        'The courtyard of the insula, and the door of the room. That evening at sundown, when the '
        + 'sabbath was over and carrying a sick relative was allowed again, they brought everyone '
        + 'in the village who was ill — and Mark says the whole town was gathered at this door.',
      refs: ['Mark 1:29-34', 'Mark 9:33-37'],
    },
    {
      id: 'inside-the-house',
      label: 'Inside the House',
      position: [14.4, 1.7, 14.2],
      lookAt: [16.2, 3.4, 12.4],
      blurb:
        'A single basalt room about seven metres by six, and on the day it mattered there was no '
        + 'space left in it — not even at the door. Look up. That is where the light is coming '
        + 'from, and it should not be.',
      refs: ['Mark 2:1-5', 'Mark 1:29-31'],
    },
    {
      id: 'on-the-roof',
      label: 'On the Roof',
      position: [19.6, 5.0, 12.5],
      lookAt: [16, 0.4, 12.5],
      blurb:
        'Up the outside stair, the way everyone got onto a roof, and the way four men got up here '
        + 'carrying a fifth. Beams, brushwood, packed earth — a roof you could take apart with '
        + 'your hands, and they did, over a room full of people, to get their friend in front of '
        + 'Jesus. Look down through it.',
      refs: ['Mark 2:1-12', 'Luke 5:17-26'],
    },
    {
      id: 'the-synagogue',
      label: 'In the Synagogue',
      position: [-19, 2.6, 40],
      lookAt: [-19, 3.6, 32],
      blurb:
        'Black basalt, benches round the walls, two rows of columns. A Roman centurion paid for '
        + 'it — he loves our nation, the elders told Jesus, and he built us our synagogue. Jesus '
        + 'taught here on the sabbath and they were astonished, because he taught as one who had '
        + 'authority and not as the scribes.',
      refs: ['Mark 1:21-28', 'Luke 7:1-10', 'John 6:59'],
    },
  ],

  hotspots: [
    {
      id: 'the-lake',
      label: 'The Sea of Galilee',
      position: [6, 6, -46],
      maxDistance: 280,
      body:
        'Thirteen miles long, seven across, and two hundred metres below the level of the '
        + 'Mediterranean — which is why the wind falls onto it off the hills without warning. '
        + 'Fishermen who had worked it their whole lives were terrified of it one night, and more '
        + 'terrified of the man who told it to be quiet.',
      refs: ['Mark 4:35-41', 'Matthew 14:22-33'],
    },
    {
      id: 'the-boats',
      label: 'The Boats',
      position: [-8, 2.6, -16.4],
      maxDistance: 80,
      body:
        'In 1986 a drought dropped the lake far enough to expose a first-century hull in the mud '
        + 'near Ginosar, a few miles down this shore: 8.2 metres long, 2.3 in the beam, patched '
        + 'and repatched over decades of use. The boats here are built to it. A crew of five '
        + 'could work one, and a party of thirteen would fill it.',
      refs: ['Luke 5:1-7', 'Mark 4:35-38'],
    },
    {
      id: 'the-house',
      label: 'The House',
      position: [15.6, 4.6, 17.6],
      maxDistance: 80,
      body:
        'One room in an ordinary insula, distinguished from its neighbours only by what happened '
        + 'in it. Peter’s mother-in-law lay here with a fever and got up and served them. From '
        + 'the first century onward this room was plastered, marked and venerated while the houses '
        + 'around it stayed houses — the earliest identification of any site in the gospels.',
      refs: ['Mark 1:29-31', 'Matthew 8:14-16'],
    },
    {
      id: 'the-roof',
      label: 'The Roof',
      position: [16, 5.4, 12.5],
      maxDistance: 70,
      body:
        'Not tiles. Beams laid across the walls, brushwood and reeds packed between them, and a '
        + 'thick layer of mud rolled flat on top — resurfaced every autumn before the rains. It '
        + 'was a floor, a workroom and a place to sleep in summer, and on one occasion a door.',
      refs: ['Mark 2:4', 'Acts 10:9'],
    },
    {
      id: 'the-basalt-synagogue',
      label: 'Why It Is Black',
      position: [-19, 11, 37],
      maxDistance: 150,
      body:
        'The white limestone synagogue in every photograph of Capernaum is fourth or fifth '
        + 'century — three hundred years after this scene. It was built directly on top of a '
        + 'black basalt building, and that basalt floor and foundation is almost certainly the '
        + 'synagogue Jesus taught in. So the hall here is dark, plain local stone rather than '
        + 'imported white marble: less photogenic, and much closer to what he walked into.',
      refs: ['Mark 1:21', 'Luke 7:5'],
    },
    {
      id: 'the-tax-road',
      label: 'The Via Maris',
      position: [-56, 5, -2],
      maxDistance: 130,
      body:
        'The trunk road from Egypt to Damascus ran along this shore, and the frontier of Antipas’s '
        + 'territory crossed it here. That is why a village of fishermen had a customs post, a '
        + 'garrison and a centurion in it — and why the news travelled out of Capernaum as fast '
        + 'as it did.',
      refs: ['Matthew 4:13-16', 'Mark 1:28'],
    },
    {
      id: 'the-woe',
      label: 'And You, Capernaum',
      position: [4, 17, 26],
      maxDistance: 220,
      body:
        'More of Jesus’ recorded work happened here than anywhere else, and it is the town he '
        + 'spoke most sharply about: “And you, Capernaum, will you be exalted to heaven? You will '
        + 'be brought down to Hades. For if the mighty works done in you had been done in Sodom, '
        + 'it would have remained until this day.” The village was abandoned by the eleventh '
        + 'century. It is a ruin now, and has been for a thousand years.',
      refs: ['Matthew 11:23-24', 'Luke 10:15'],
    },
  ],
};
