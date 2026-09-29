// The Mount of Olives, c. AD 30 — the ridge across the Kidron from the Temple,
// the road Jesus rode down into the city, the garden where he was arrested,
// and the hill Luke says he left from.
//
// Coordinates are the ones in components/scene/olivetDimensions.js: +X east,
// -Z north, metres from the rock of the Church of All Nations. The ground is
// real elevation data, so no two standpoints are at the same height: every Y
// here is absolute, a standing eye at its floor plus 1.7, and a test asserts
// they agree with the collision model rather than trusting the arithmetic.

export const OLIVET = {
  slug: 'mount-of-olives',
  placeSlug: 'mount-of-olives',
  title: 'The Mount of Olives',
  subtitle: 'Gethsemane and the road down · c. AD 30',
  period: { label: 'c. AD 30', referenceYear: 30 },
  blurb:
    'The ridge east of Jerusalem, across the Kidron from the Temple. Jesus came down this road on '
    + 'a colt with the crowd shouting Hosanna, and wept at the first sight of the city; he sat on '
    + 'this slope and told four of his disciples the Temple would be thrown down; he lodged here at '
    + 'night, and prayed in the garden at its foot on the last one; and Luke says he left from here. '
    + 'Walk down from the summit, and look across.',
  disclaimer:
    'An artist’s reconstruction on real ground: the terrain and the far skyline are elevation data, '
    + 'and the Temple, the Antonia and Herod’s towers stand where the evidence puts them, simplified '
    + 'for distance but built to the same measurements as the Temple scene. The line of the '
    + 'first-century road is uncertain — this one follows the traditional descent. Gethsemane is '
    + 'placed by the ancient tradition of the Church of All Nations; its wall, gates and press yard, '
    + 'the camps and every tree are informed guesswork. Where the ascension happened is not given '
    + 'exactly: Luke says toward Bethany, Acts says Olivet.',
  // Gethsemane, at the foot of the western slope. -Z is north and +X east —
  // the right-handed way round, unlike Capernaum. See src/lib/googleMaps.js.
  geo: { lat: 31.7797, lon: 35.2398, bearing: 0, xAxis: 90 },
  defaultVantage: 'the-view',

  // What happened here, in the order the gospels tell it. Only one is staged
  // at a time (components/scene/olivetEvents.js); choosing one stages it, sets
  // the hour the text gives or implies, and stands the visitor where it can be
  // seen. Each body says what the text says, and what the staging supplies.
  events: [
    {
      id: 'the-colt',
      label: 'The Colt',
      place: 'The road from Bethphage',
      hour: 'noon',
      position: [612, 101.44, -38],
      lookAt: [601.3, 101.06, -58],
      body:
        'Near Bethphage and Bethany, at the Mount of Olives, Jesus sent two of his disciples: go into '
        + 'the village opposite you, and you will find a colt tied, on which no one has ever sat. '
        + 'Untie it and bring it, and if anyone asks why, say, The Lord has need of it. Its owners '
        + 'asked, and were told, and let it go. The disciples threw their cloaks on the colt and set '
        + 'Jesus on it. Matthew, reading Zechariah, has its mother brought along too.',
      refs: ['Luke 19:29-35', 'Mark 11:1-7', 'Matthew 21:1-7', 'Zechariah 9:9'],
    },
    {
      id: 'triumphal-entry',
      label: 'Hosanna',
      place: 'The road over the brow',
      hour: 'noon',
      position: [333.1, 84.27, 156.9],
      lookAt: [345, 87.58, 146.75],
      body:
        'Many spread their cloaks on the road, and others spread leafy branches cut from the fields — '
        + 'John says palm branches — and those who went ahead and those who followed were shouting: '
        + 'Hosanna! Blessed is he who comes in the name of the Lord! Some of the Pharisees in the '
        + 'crowd said to him, Teacher, rebuke your disciples. He answered, I tell you, if these were '
        + 'silent, the very stones would cry out.',
      refs: ['Luke 19:36-40', 'Mark 11:8-10', 'John 12:12-15', 'Psalm 118:25-26'],
    },
    {
      id: 'weeping',
      label: 'He Wept over It',
      place: 'The road down',
      hour: 'noon',
      position: [178, 48.79, 160],
      lookAt: [120, 38, 160],
      body:
        'When he drew near and saw the city, he wept over it, saying, Would that you, even you, had '
        + 'known on this day the things that make for peace! But now they are hidden from your eyes. '
        + 'The days will come when your enemies will set up a barricade around you and hem you in on '
        + 'every side, and they will not leave one stone upon another in you. Forty years later, '
        + 'Titus camped a legion on this ridge.',
      refs: ['Luke 19:41-44'],
    },
    {
      id: 'fig-tree',
      label: 'A Fig Tree in Leaf',
      place: 'The road from Bethany',
      hour: 'morning',
      position: [484, 104.22, 88],
      lookAt: [471.8, 103.45, 94.2],
      body:
        'The next day, as they came from Bethany, he was hungry. Seeing in the distance a fig tree in '
        + 'leaf, he went to see if he could find anything on it, and found nothing but leaves, for it '
        + 'was not the season for figs. He said to it, May no one ever eat fruit from you again — and '
        + 'his disciples heard it. The next morning, passing by, they saw it withered away to its '
        + 'roots, and Peter said, Rabbi, look!',
      refs: ['Mark 11:12-14', 'Mark 11:20-21', 'Matthew 21:18-20'],
    },
    {
      id: 'olivet-discourse',
      label: 'Not One Stone',
      place: 'Opposite the Temple',
      hour: 'dusk',
      position: [352, 85.26, 186],
      lookAt: [336.5, 82.3, 181.5],
      body:
        'As he sat on the Mount of Olives opposite the temple, Peter and James and John and Andrew '
        + 'asked him privately, Tell us, when will these things be? He had just said that not one of '
        + 'the Temple’s stones would be left upon another. What follows is the longest speech in '
        + 'Mark: wars and earthquakes and famines, the abomination of desolation, the Son of Man '
        + 'coming in clouds — and, from the tree beside them, learn the lesson of the fig tree.',
      refs: ['Mark 13:1-4', 'Mark 13:28-37', 'Matthew 24:1-3', 'Luke 21:5-7'],
    },
    {
      id: 'lodged',
      label: 'He Lodged on the Mount',
      place: 'Among the olives',
      hour: 'dusk',
      position: [23, -4.1, -121],
      lookAt: [12, -5.74, -112],
      body:
        'Every day he was teaching in the temple, but at night he went out and lodged on the mount '
        + 'called Olivet, and early in the morning all the people came to him in the temple to hear '
        + 'him. At Passover the city could not hold its pilgrims, and the hills round it were full of '
        + 'camps. Luke calls the garden their custom, and John says Judas knew the place, because '
        + 'Jesus often met there with his disciples.',
      refs: ['Luke 21:37-38', 'Luke 22:39', 'John 18:2', 'John 8:1'],
    },
    {
      id: 'across-the-kidron',
      label: 'Across the Brook',
      place: 'The Kidron',
      hour: 'night',
      position: [-70, -9.03, 57],
      lookAt: [-83.5, -10.33, 49.7],
      body:
        'When they had sung a hymn, they went out to the Mount of Olives. On the way Jesus said, You '
        + 'will all fall away, for it is written, I will strike the shepherd, and the sheep will be '
        + 'scattered. Peter said, Even though they all fall away, I will not. Jesus said, Truly, this '
        + 'very night, before the rooster crows twice, you will deny me three times. John says they '
        + 'crossed the brook Kidron, where there was a garden.',
      refs: ['Mark 14:26-31', 'John 18:1', 'Zechariah 13:7'],
    },
    {
      id: 'gethsemane',
      label: 'Gethsemane',
      place: 'The garden',
      hour: 'night',
      position: [-13.5, -0.34, 10.5],
      lookAt: [3.3, 0.81, -6.3],
      body:
        'He said to his disciples, Sit here while I pray, and took Peter and James and John with him, '
        + 'and began to be greatly distressed. Remain here, and watch. Going a little farther — Luke '
        + 'says about a stone’s throw — he fell on the ground and prayed: Abba, Father, all things are '
        + 'possible for you. Remove this cup from me. Yet not what I will, but what you will. Three '
        + 'times he came back, and found them sleeping.',
      refs: ['Mark 14:32-42', 'Luke 22:39-46', 'Matthew 26:36-46', 'Hebrews 5:7'],
    },
    {
      id: 'the-arrest',
      label: 'The Arrest',
      place: 'The garden gate',
      hour: 'night',
      position: [-27, -4.85, -7],
      lookAt: [-24.2, -3.38, 4.6],
      body:
        'Judas came, and with him a band of soldiers and officers from the chief priests, with '
        + 'lanterns and torches and weapons. He had given them a sign: the one I kiss is the man. He '
        + 'went up to Jesus, said Rabbi, and kissed him. Simon Peter drew a sword and struck the high '
        + 'priest’s servant, Malchus, and cut off his right ear. Put your sword away, Jesus said — '
        + 'and Luke says he touched the ear and healed him. Then they all left him, and fled.',
      refs: ['John 18:3-12', 'Mark 14:43-50', 'Luke 22:47-53', 'Matthew 26:47-56'],
    },
    {
      id: 'ascension',
      label: 'The Ascension',
      place: 'The top of the Mount',
      hour: 'morning',
      position: [536, 104.57, 64],
      lookAt: [522, 106.5, 48],
      body:
        'He led them out as far as Bethany, and lifting up his hands he blessed them. As they were '
        + 'looking on, he was lifted up, and a cloud took him out of their sight. While they gazed '
        + 'into heaven, two men stood by them in white robes: Men of Galilee, why do you stand '
        + 'looking into heaven? This Jesus will come in the same way as you saw him go. Then they '
        + 'returned to Jerusalem from the mount called Olivet, a Sabbath day’s journey away.',
      refs: ['Acts 1:9-12', 'Luke 24:50-53', 'Zechariah 14:4'],
    },
  ],

  vantages: [
    {
      id: 'the-view',
      label: 'Opposite the Temple',
      position: [262, 68.78, 186],
      lookAt: [-440, 8, 185],
      event: 'olivet-discourse',
      blurb:
        'Mark sets it exactly: as he sat on the Mount of Olives opposite the temple. This is the view '
        + '— the whole platform laid out across the valley, the sanctuary white and gold in the middle '
        + 'of it, the smoke going up from the altar, the Antonia at the far corner. A disciple had '
        + 'said, Look, Teacher, what wonderful stones. Jesus said not one would be left on another. '
        + 'Within forty years, not one was.',
      refs: ['Mark 13:1-3', 'Matthew 24:1-3', 'Luke 21:5-6'],
    },
    {
      id: 'the-descent',
      label: 'The Descent',
      position: [380, 93.43, 140],
      lookAt: [-400, 20, 190],
      event: 'triumphal-entry',
      blurb:
        'Luke is exact about where the shouting started: as he was drawing near, already on the way '
        + 'down the Mount of Olives, the whole multitude of his disciples began to rejoice and praise '
        + 'God with a loud voice. The road drops off the ridge here, and the city comes into view '
        + 'all at once.',
      refs: ['Luke 19:37-38', 'Mark 11:8-10'],
    },
    {
      id: 'the-garden',
      label: 'Gethsemane',
      position: [-22, -1.3, 20],
      lookAt: [6, -0.4, -8],
      event: 'gethsemane',
      blurb:
        'An olive grove with a press beside it, across the brook from the city — gat shemanim, the '
        + 'oil press. John says Jesus often met here with his disciples, and it was here, on the night '
        + 'he was betrayed, that he told them to sit while he went a little farther, and fell on the '
        + 'ground, and prayed that if it were possible the hour might pass from him.',
      refs: ['Mark 14:32-35', 'John 18:1-2', 'Luke 22:39-41'],
    },
    {
      id: 'the-press',
      label: 'The Olive Press',
      position: [-18, -6.12, -51],
      lookAt: [-14, -7.2, -62],
      blurb:
        'The olives were crushed under a stone wheel turning in a round basin, and the pulp packed in '
        + 'baskets and squeezed under a long beam weighted with stones. The first oil, beaten rather '
        + 'than pressed, was the pure oil the law required for the lampstand in the Temple across the '
        + 'valley. Gethsemane is named for a place like this.',
      refs: ['Exodus 27:20', 'Mark 14:32', 'Micah 6:15'],
    },
    {
      id: 'the-kidron',
      label: 'Under the Pinnacle',
      position: [-112, -16.85, 240],
      lookAt: [-228, 40, 372],
      blurb:
        'The bed of the Kidron, below the south-east corner of the Temple platform. Josephus says '
        + 'that anyone looking down from the top of the royal portico there grew dizzy, the drop was '
        + 'so great. This corner is most likely the pinnacle of the temple where the devil set Jesus, '
        + 'and said: throw yourself down.',
      refs: ['Matthew 4:5-7', 'Luke 4:9-12'],
    },
    {
      id: 'the-tombs',
      label: 'The Kidron Tombs',
      position: [-112, -18.57, 318],
      lookAt: [-82, -12, 302],
      blurb:
        'Three monuments cut from the living rock and facing the Temple: the pillar later called '
        + 'Absalom’s, the porch of the priestly family of Hezir, and the pyramid-topped cube called '
        + 'Zechariah’s. They were standing when Jesus walked past them, and he knew the kind: you '
        + 'build the tombs of the prophets, he said, and decorate the monuments of the righteous.',
      refs: ['Matthew 23:29-31', '2 Samuel 18:18', '1 Chronicles 24:15'],
    },
    {
      id: 'the-summit',
      label: 'The Top of the Mount',
      position: [548, 103.9, 30],
      lookAt: [1514, 44, 289],
      blurb:
        'Turn round. Behind you, the city; ahead, the ground falls more than twelve hundred metres in '
        + 'twenty-five kilometres, through the wilderness of Judea to the Dead Sea, with the wall of '
        + 'Moab beyond it. Zechariah saw living waters going out from Jerusalem, half of them to the '
        + 'eastern sea. Ezekiel saw a river run down this way, and the salt sea made fresh.',
      refs: ['Zechariah 14:8', 'Ezekiel 47:1-9'],
    },
  ],

  hotspots: [
    {
      id: 'the-temple',
      label: 'The Temple',
      position: [-440, 92, 185],
      maxDistance: 2500,
      body:
        'Forty-six years in the building already, and more than thirty still to go. Josephus says that '
        + 'from a distance it looked like a mountain covered with snow, for where it was not plated '
        + 'with gold it was dazzling white, and at sunrise it threw back the light so fiercely that '
        + 'you had to look away. It faced east — toward this hill.',
      refs: ['Mark 13:1-2', 'John 2:20', 'Luke 21:5'],
    },
    {
      id: 'the-eastern-gate',
      label: 'The Eastern Gate',
      position: [-228, 44, 185],
      maxDistance: 1600,
      body:
        'The one gate in the Temple Mount’s east wall, on the line of the sanctuary’s door; the '
        + 'Mishnah says the palace of Shushan was carved over it. Ezekiel saw the glory of the Lord '
        + 'leave by the east gate and, in the vision of the new Temple, come back the same way.',
      refs: ['Ezekiel 43:1-4', 'Ezekiel 44:1-3', 'Ezekiel 10:18-19'],
    },
    {
      id: 'the-red-heifer',
      label: 'On the Line of the Door',
      position: [330, 84, 205],
      maxDistance: 400,
      body:
        'The walls of the Temple were all high, the Mishnah says, except the eastern wall — so that '
        + 'the priest burning the red heifer here on the Mount of Olives could look straight through '
        + 'the gates into the door of the sanctuary as he sprinkled its blood toward it. Hebrews '
        + 'remembers that the sin offering was burned outside the camp.',
      refs: ['Numbers 19:1-10', 'Hebrews 13:11-13', 'Hebrews 9:13-14'],
    },
    {
      id: 'the-altar-smoke',
      label: 'The Altar',
      position: [-374, 62, 185],
      maxDistance: 1600,
      body:
        'The fire on the altar was never allowed to go out, and a lamb was offered every morning and '
        + 'every evening. At Passover the smoke went up all afternoon: every household’s lamb was '
        + 'killed in the Temple courts on the fourteenth of Nisan, in shifts, with the Levites '
        + 'singing the Hallel.',
      refs: ['Leviticus 6:12-13', 'Exodus 29:38-42', 'Exodus 12:6'],
    },
    {
      id: 'the-pinnacle',
      label: 'The Pinnacle',
      position: [-228, 50, 372],
      maxDistance: 1400,
      body:
        'The platform’s south-east corner, where its wall stands highest above the Kidron. The Royal '
        + 'Portico ran along the top of the south wall, and Josephus says a man looking down from it '
        + 'into the valley grew giddy.',
      refs: ['Matthew 4:5-7', 'Luke 4:9-12'],
    },
    {
      id: 'the-antonia',
      label: 'The Antonia',
      position: [-484, 82, -142],
      maxDistance: 2000,
      body:
        'Herod’s fortress at the Temple’s north-west corner, named for Mark Antony, with a tower at '
        + 'each corner and the tallest looking down into the courts. A Roman cohort was quartered '
        + 'there and stood to arms at the feasts. Its soldiers pulled Paul out of the mob, and let '
        + 'him speak from its steps.',
      refs: ['Acts 21:30-40', 'Acts 22:24'],
    },
    {
      id: 'herods-towers',
      label: 'Herod’s Palace',
      position: [-1100, 122, 342],
      maxDistance: 2600,
      body:
        'On the city’s western skyline, the three towers Herod named for his brother, his friend and '
        + 'the wife he had killed — Phasael, Hippicus, Mariamne — and his palace behind them. When '
        + 'the governor came up from Caesarea for the feast he stayed there, and it is probably the '
        + 'praetorium where Jesus was tried and mocked.',
      refs: ['Mark 15:16', 'John 18:28', 'Matthew 27:27'],
    },
    {
      id: 'absaloms-pillar',
      label: 'Absalom’s Pillar',
      position: [-82, -4, 298],
      maxDistance: 220,
      body:
        'Named for the pillar Absalom set up for himself in the King’s Valley, because he had no son '
        + 'to keep his name — though this one is a thousand years later, cut probably in Jesus’ own '
        + 'century. Jerusalem fathers brought their sons here for centuries to throw stones at it.',
      refs: ['2 Samuel 18:18'],
    },
    {
      id: 'bene-hezir',
      label: 'The Tomb of the Bene Hezir',
      position: [-70, -11, 342],
      maxDistance: 200,
      body:
        'Two Doric columns in a porch cut into the cliff, and over them in Hebrew the names of a '
        + 'family of priests, the sons of Hezir. Hezir was the head of the seventeenth of the '
        + 'twenty-four priestly courses David set in order — the same system that put Zechariah in '
        + 'the Temple on the day he saw the angel.',
      refs: ['1 Chronicles 24:7-19', 'Luke 1:5-9'],
    },
    {
      id: 'zechariahs-tomb',
      label: 'Zechariah’s Tomb',
      position: [-74, -12, 366],
      maxDistance: 200,
      body:
        'A cube of the Mount’s own rock under a pyramid, never hollowed out — a monument, not a '
        + 'grave. Tradition gave it to the priest Zechariah, stoned in the Temple court for rebuking '
        + 'the king, the last martyr in the order of the Hebrew Bible: from the blood of Abel, Jesus '
        + 'said, to the blood of Zechariah.',
      refs: ['2 Chronicles 24:20-22', 'Matthew 23:35', 'Luke 11:51'],
    },
    {
      id: 'the-olive-press',
      label: 'Gat Shemanim',
      position: [-14, -5.2, -62],
      maxDistance: 60,
      body:
        'Gethsemane is this word: gat, a press, and shemanim, oils. The upright stone wheel crushed '
        + 'the olives in the basin; the pulp went into woven baskets stacked under the beam, and the '
        + 'weights hung from its end pressed the oil out. The first oil ran almost clear, and was '
        + 'what the lamps in the Temple burned.',
      refs: ['Mark 14:32', 'Matthew 26:36', 'Exodus 27:20', 'Leviticus 24:2'],
    },
    {
      id: 'the-rock',
      label: 'A Stone’s Throw',
      position: [6, 1.6, -8],
      maxDistance: 60,
      body:
        'Luke measures it: he withdrew from them about a stone’s throw, knelt down and prayed. '
        + 'Hebrews remembers the same night: in the days of his flesh he offered up prayers and '
        + 'supplications, with loud cries and tears, to him who was able to save him from death, '
        + 'and he was heard.',
      refs: ['Luke 22:41', 'Hebrews 5:7-8', 'Mark 14:35'],
    },
    {
      id: 'the-old-olives',
      label: 'The Old Olives',
      position: [-26, -3.4, -24],
      maxDistance: 60,
      body:
        'An olive can live for a thousand years and more, and grows again from its roots when it is '
        + 'cut down. The oldest trees in the garden today have been dated to the twelfth century; '
        + 'Josephus says the Romans cleared every tree for miles round Jerusalem in the siege. Paul '
        + 'made the olive his picture of Israel: a cultivated tree, and wild branches grafted in.',
      refs: ['Romans 11:17-24', 'Psalm 52:8', 'Jeremiah 11:16'],
    },
    {
      id: 'the-fig-tree',
      label: 'The Fig Tree',
      position: [470, 106, 92],
      maxDistance: 120,
      body:
        'At Passover the fig trees are just putting out their leaves — no ripe figs until June — '
        + 'which is Mark’s point about the tree Jesus cursed, and Jesus’ own point, sitting on this '
        + 'hill: as soon as its branch becomes tender and puts out its leaves, you know that summer '
        + 'is near.',
      refs: ['Mark 13:28-29', 'Mark 11:13', 'Luke 21:29-31'],
    },
    {
      id: 'the-tombs-of-the-slope',
      label: 'The Ossuaries',
      position: [118, 29.5, 178],
      maxDistance: 120,
      body:
        'The Mount was a cemetery already, its slope cut with family tombs. Where the church of '
        + 'Dominus Flevit stands, excavators found stone bone-boxes of exactly this generation, '
        + 'scratched with the names of the dead: Mary, Martha, Salome, Jesus, Simeon. Common names, '
        + 'and the people who carried them.',
      refs: ['John 11:17-19', 'Matthew 27:59-60'],
    },
    {
      id: 'the-camps',
      label: 'The Pilgrims’ Camps',
      position: [150, 28, -190],
      maxDistance: 300,
      body:
        'Josephus puts the Passover crowd in the hundreds of thousands, far more than the city could '
        + 'house, so they camped round it in tents and booths. Many had come up early to purify '
        + 'themselves, and stood about in the Temple asking one another whether Jesus would come to '
        + 'the feast at all.',
      refs: ['John 11:55-57', 'Luke 2:41-44', 'Luke 21:37'],
    },
    {
      id: 'the-first-sheaf',
      label: 'The First Sheaf',
      position: [588, 104, 70],
      maxDistance: 200,
      body:
        'Passover is the beginning of the barley harvest. The day after the Sabbath of the feast, the '
        + 'first sheaf was cut and waved before the Lord in the Temple, and no one ate the new grain '
        + 'until it had been. Paul calls the risen Christ the firstfruits of those who have fallen '
        + 'asleep.',
      refs: ['Leviticus 23:10-14', '1 Corinthians 15:20-23'],
    },
    {
      id: 'the-beacons',
      label: 'The Beacons',
      position: [560, 104, -20],
      maxDistance: 250,
      body:
        'When the new moon had been seen and sworn to before the court, they lit torches on the top '
        + 'of the Mount of Olives and waved them, and the next hill took up the signal, and the next, '
        + 'to Sartaba and on to Babylon, so that the whole dispersion kept the feasts on the same '
        + 'days.',
      refs: ['Psalm 81:3', 'Numbers 10:10'],
    },
    {
      id: 'davids-ascent',
      label: 'David’s Ascent',
      position: [452, 102.5, 112],
      maxDistance: 250,
      body:
        'A thousand years earlier, David went up the ascent of the Mount of Olives weeping as he '
        + 'went, barefoot and with his head covered, with his son Absalom holding the city behind '
        + 'him — and all the people with him covered their heads and wept. At the summit, where God '
        + 'was worshiped, Hushai met him with his coat torn.',
      refs: ['2 Samuel 15:30-32'],
    },
    {
      id: 'his-feet',
      label: 'On that Day',
      position: [500, 106, 60],
      maxDistance: 300,
      body:
        'Zechariah’s vision of the last day: his feet shall stand on the Mount of Olives that lies '
        + 'before Jerusalem on the east, and the Mount of Olives shall be split in two from east to '
        + 'west by a very wide valley. The two men in white told the disciples he would come back the '
        + 'way he went.',
      refs: ['Zechariah 14:4', 'Acts 1:11'],
    },
    {
      id: 'the-glory',
      label: 'The Glory Departs',
      position: [610, 106, 40],
      maxDistance: 300,
      body:
        'In Ezekiel’s vision the glory of the Lord left the Temple by the east gate, went up from the '
        + 'midst of the city, and stood upon the mountain that is on the east side of the city — '
        + 'this one — before it went. He saw it come back from the east, into the house.',
      refs: ['Ezekiel 11:22-23', 'Ezekiel 43:1-5'],
    },
    {
      id: 'the-mount-of-corruption',
      label: 'The Mount of Corruption',
      position: [200, 57, 455],
      maxDistance: 400,
      body:
        'The southern end of the ridge. Here Solomon built high places for Chemosh of Moab and Molech '
        + 'of Ammon, for his foreign wives, on the mountain east of Jerusalem, and here they stood for '
        + 'three centuries until Josiah broke them down and filled the places with bones.',
      refs: ['1 Kings 11:7-8', '2 Kings 23:13-14'],
    },
    {
      id: 'the-dead-sea',
      label: 'The Eastern Sea',
      position: [1804, 47, 367],
      maxDistance: 1500,
      body:
        'The Salt Sea, at the bottom of the rift, four hundred metres below sea level and twenty-five '
        + 'kilometres off, with the mountains of Moab behind it — Nebo among them, where Moses was '
        + 'shown the land and died. Ezekiel saw water from under the Temple’s threshold run down '
        + 'here and make it fresh, with fishermen standing beside it.',
      refs: ['Ezekiel 47:8-10', 'Zechariah 14:8', 'Deuteronomy 34:1-5'],
    },
    // Pins that belong to a staged moment show only while it is staged.
    {
      id: 'the-cloaks',
      label: 'Cloaks on the Road',
      position: [248, 69, 166],
      maxDistance: 80,
      event: 'triumphal-entry',
      body:
        'When Jehu was anointed king, his fellow officers took their cloaks and spread them under him '
        + 'on the bare steps, and blew the trumpet: Jehu is king. The crowd on this road did the same '
        + 'for a man on a borrowed colt, and sang the psalm the pilgrims sang coming up to the '
        + 'Temple: blessed is he who comes in the name of the Lord.',
      refs: ['2 Kings 9:13', 'Psalm 118:26', 'Zechariah 9:9'],
    },
    {
      id: 'the-cup',
      label: 'The Cup',
      position: [6, 2.4, -8],
      maxDistance: 60,
      event: 'gethsemane',
      body:
        'In the prophets, the cup is the cup of the Lord’s wrath, which the nations are made to drink '
        + 'and stagger. Luke adds that he was in agony and prayed more earnestly, and his sweat became '
        + 'like great drops of blood falling down to the ground.',
      refs: ['Mark 14:36', 'Luke 22:44', 'Isaiah 51:17', 'Jeremiah 25:15'],
    },
    {
      id: 'malchus',
      label: 'Malchus',
      position: [-20, -1.4, 8],
      maxDistance: 60,
      event: 'the-arrest',
      body:
        'All four gospels have the sword and the ear. Only John names the two men, Peter and Malchus, '
        + 'and only Luke the physician says Jesus touched the ear and healed it — the last healing '
        + 'before the cross, done for one of the men who had come to arrest him.',
      refs: ['John 18:10-11', 'Luke 22:50-51', 'Matthew 26:51-53'],
    },
    {
      id: 'the-shepherd',
      label: 'The Shepherd Struck',
      position: [-86, -9.2, 50],
      maxDistance: 80,
      event: 'across-the-kidron',
      body:
        'Awake, O sword, against my shepherd, says Zechariah: strike the shepherd, and the sheep will '
        + 'be scattered. It was Passover, the moon was full, and Jesus quoted it on the way out to the '
        + 'Mount of Olives, with the brook still to cross.',
      refs: ['Zechariah 13:7', 'Mark 14:27', 'John 16:32'],
    },
    {
      id: 'men-in-white',
      label: 'Two Men in White',
      position: [528, 106, 44],
      maxDistance: 80,
      event: 'ascension',
      body:
        'Luke has two men in dazzling clothes at the empty tomb, asking why they seek the living '
        + 'among the dead, and two men in white robes here, asking why they stand looking into '
        + 'heaven. Both times the question sends the disciples back to Jerusalem.',
      refs: ['Acts 1:10-11', 'Luke 24:4-6'],
    },
  ],
};
