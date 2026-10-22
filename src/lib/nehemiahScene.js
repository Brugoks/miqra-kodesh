// Nehemiah's Wall, Jerusalem, 444 BC — the circuit of Nehemiah 3, gate by gate,
// in the three states the book gives it: broken down, half built, finished.
//
// Coordinates are the ones in components/scene/nehemiahDimensions.js: +X east,
// -Z north, metres from the Gihon spring. The ground is real elevation data,
// so no two standpoints are at the same height: every Y here is absolute, a
// standing eye at its floor plus 1.7 (on the walkway, the walkway's top plus
// 1.7), and a test asserts they agree with the collision model rather than
// trusting the arithmetic. This file stays free of the 3D code and its
// terrain data, so the atlas can offer "Step inside" without them.

export const NEHEMIAH = {
  slug: 'nehemiahs-wall',
  placeSlug: 'zion',
  title: 'Nehemiah’s Wall',
  subtitle: 'Jerusalem rebuilt · 444 BC',
  period: { label: '444 BC · Persian period', referenceYear: -444 },
  blurb:
    'For a hundred and forty years the walls of Jerusalem lay where Babylon had left them. Nehemiah, '
    + 'cupbearer to the king of Persia, came by night, rode round them with a lamp and a few men, and '
    + 'in fifty-two days the whole circuit — ten gates, dozens of work gangs, one man and his '
    + 'daughters among them — was up. Walk it as it was broken, as it stood at half its height, and '
    + 'as it was when they went up on top of it to give thanks.',
  disclaimer:
    'An artist’s reconstruction on real ground. The plan is the circuit of Nehemiah 3 laid on the '
    + 'city of David’s ridge and the Temple Mount, the reading that leaves the Western Hill, burned '
    + 'in 586, outside the wall; where exactly the wall ran is argued by the people who dig it. The '
    + 'terrain and the far skyline are elevation data of the modern surface, reshaped for the Temple '
    + 'platform. Nehemiah gives order and builders, not heights: the wall’s thickness and height, its '
    + 'towers, the stairs, every house, the Temple’s proportions beyond what Ezra and 1 Kings give, the '
    + 'crowds and every face are informed guesswork. The date is the one on the map this scene was '
    + 'built from; some reckon the twentieth year of Artaxerxes as 445.',
  // The Gihon spring, at the foot of the city of David's east slope. -Z is north
  // and +X east — the right-handed way round, like the Mount of Olives. See
  // src/lib/googleMaps.js.
  geo: { lat: 31.7739, lon: 35.2367, bearing: 0, xAxis: 90 },
  defaultVantage: 'water-gate-view',
  eventsHeading: 'In the order the book of Nehemiah tells them',

  // What happened at the wall, in the order the book tells it. Only one is
  // staged at a time (components/scene/nehemiahEvents.js), and each sets the wall
  // in the state its text gives: broken down, joined to half its height, or
  // finished. Choosing one stages it, sets the hour its text gives or implies,
  // and stands the visitor where it can be seen. Each body says what the book
  // says, and what the staging supplies.
  events: [
    {
      id: 'night-ride',
      era: 'Before the building',
      label: 'By Night',
      place: 'The Fountain Gate',
      hour: 'night',
      position: [-67.5, -35.81, 407],
      lookAt: [-58, -36.5, 400],
      body:
        'Nehemiah had been three days in Jerusalem and had told no one why. He rose in the night, with '
        + 'a few men and no animal but the one he rode, and went out by the Valley Gate toward the Dragon '
        + 'Spring and the Dung Gate, looking at the walls that were broken down and the gates that fire '
        + 'had eaten. At the Fountain Gate and the King’s Pool the rubble was so deep that the animal '
        + 'could not pass, and he went on up the valley in the dark, still looking. Then he turned back '
        + 'and went in by the Valley Gate. The officials did not know where he had gone. The scene stands '
        + 'him among the fallen stones with a lamp and two men; the animal is left out.',
      refs: ['Nehemiah 2:11-16', 'Nehemiah 1:3'],
    },
    {
      id: 'rise-and-build',
      era: 'Before the building',
      label: 'Let Us Rise Up and Build',
      place: 'Inside the Valley Gate',
      hour: 'morning',
      position: [-102, 30.4, 50],
      lookAt: [-115, 31.5, 41],
      body:
        'Then he told them: You see the trouble we are in, how Jerusalem lies in ruins and its gates '
        + 'are burned. Come, let us build the wall, that we may no longer suffer disgrace. He told them '
        + 'how the hand of his God had been on him for good, and what the king had said. And they said, '
        + 'Let us rise up and build; so they strengthened their hands for the good work. Sanballat, '
        + 'Tobiah and Geshem laughed at them and asked if they were rebelling against the king. The '
        + 'answer is the last line of the scene: you have no portion or right or claim in Jerusalem.',
      refs: ['Nehemiah 2:16-20'],
    },
    {
      id: 'sheep-gate',
      era: 'Building the wall',
      label: 'The Sheep Gate',
      place: 'Inside the north wall',
      hour: 'morning',
      position: [-142, 75.7, -553],
      lookAt: [-151, 75.3, -561],
      body:
        'Then Eliashib the high priest rose up with his brothers the priests, and they built the Sheep '
        + 'Gate. They consecrated it and set its doors, as far as the Tower of the Hundred and the Tower '
        + 'of Hananel. The list that follows goes right round the wall and ends back here: the work '
        + 'begins with priests and ends with goldsmiths and merchants between the upper chamber of the '
        + 'corner and the Sheep Gate. Chapter 6 says the doors were the last thing hung, so this is the '
        + 'finished gate, with the priests at it.',
      refs: ['Nehemiah 3:1', 'Nehemiah 3:32', 'Nehemiah 6:1'],
    },
    {
      id: 'daughters-of-shallum',
      era: 'Building the wall',
      label: 'He and His Daughters',
      place: 'Between the Tower of the Furnaces and the Valley Gate',
      hour: 'morning',
      position: [-114, 39.17, -52],
      lookAt: [-125, 39.1, -52],
      body:
        'Next to him Shallum the son of Hallohesh, ruler of half the district of Jerusalem, repaired — he '
        + 'and his daughters. That is the whole entry, and it is the only one in the chapter that puts a '
        + 'family’s women on the wall. The text sets it between the Tower of the Furnaces and the Valley '
        + 'Gate, so the scene stands them at the foot of the wall, half-way up its courses: the wall is at '
        + 'half its height, as chapter 4 says it was.',
      refs: ['Nehemiah 3:12', 'Nehemiah 4:6'],
    },
    {
      id: 'nobles-of-tekoa',
      era: 'Building the wall',
      label: 'Would Not Stoop',
      place: 'Opposite the Great Projecting Tower',
      hour: 'noon',
      position: [10, 36.5, -148],
      lookAt: [22, 40.5, -139],
      body:
        'Next to them the Tekoites repaired another section, but their nobles would not stoop to serve '
        + 'their Lord. Twenty-two verses later: after them the Tekoites repaired another section, opposite '
        + 'the great projecting tower as far as the wall of the Ophel. The ordinary people of Tekoa did two '
        + 'stretches of the wall to their nobles’ none. The scene puts the nobles a few paces behind the '
        + 'two at work, in good wool, with their arms folded.',
      refs: ['Nehemiah 3:5', 'Nehemiah 3:27'],
    },
    {
      id: 'mockery',
      era: 'Building the wall',
      label: 'A Fox on the Wall',
      place: 'Outside the Old Gate',
      hour: 'noon',
      position: [-324, 80.23, -380],
      lookAt: [-338, 82.3, -363],
      body:
        'Sanballat the Horonite, in front of his brothers and the army of Samaria, asked: What are these '
        + 'feeble Jews doing? Will they restore it for themselves? Will they finish in a day? Will they '
        + 'revive the stones out of the heaps of rubbish, and burned ones at that? Tobiah the Ammonite, '
        + 'beside him, said: If a fox goes up on it, he will break down their stone wall. Nehemiah’s '
        + 'answer was a prayer; and they built, and all the wall was joined together to half its height, '
        + 'for the people had a mind to work. The scene stands the two on the burned ground outside the '
        + 'Old Gate, in the half wall’s shadow.',
      refs: ['Nehemiah 4:1-6', 'Nehemiah 2:19'],
    },
    {
      id: 'sword-and-trowel',
      era: 'Building the wall',
      label: 'A Sword at His Side',
      place: 'Behind the lowest part of the wall',
      hour: 'dusk',
      position: [70, 45.87, -240],
      lookAt: [82, 44.9, -244],
      body:
        'When Sanballat and Tobiah, the Arabs, the Ammonites and the Ashdodites heard that the breaches '
        + 'were being closed, they plotted to come and fight against Jerusalem. So Nehemiah stationed '
        + 'people by families, with their swords, spears and bows, in the lowest places behind the wall, '
        + 'in the open. From that day half the young men worked and half held the spears; those who '
        + 'carried burdens carried them with one hand and held a weapon with the other; each builder '
        + 'wore his sword at his side as he built. And the man who sounded the trumpet was beside him.',
      refs: ['Nehemiah 4:7-23'],
    },
    {
      id: 'outcry',
      era: 'Building the wall',
      label: 'The Outcry',
      place: 'The ridge street',
      hour: 'noon',
      position: [-86, 23.95, 86],
      lookAt: [-100, 25.9, 72],
      body:
        'Then there arose a great outcry of the people and their wives against their Jewish brothers: we '
        + 'are mortgaging our fields, our vineyards and our houses to get grain because of the famine; we '
        + 'have borrowed money for the king’s tax; we are forcing our sons and daughters into slavery. '
        + 'Nehemiah was very angry. He brought charges against the nobles and officials — you are exacting '
        + 'interest, each from his brother — called a great assembly, and they were silent, and gave back '
        + 'what they had taken. The wall cost more than the stones.',
      refs: ['Nehemiah 5:1-13'],
    },
    {
      id: 'finished',
      era: 'The wall finished',
      label: 'Fifty-Two Days',
      place: 'Inside the Water Gate',
      hour: 'dawn',
      position: [-45, 36.89, -72],
      lookAt: [-34, 36.9, -84],
      body:
        'So the wall was finished on the twenty-fifth day of the month Elul, in fifty-two days. And when '
        + 'all our enemies heard of it, all the nations around us were afraid and fell greatly in their own '
        + 'esteem, for they perceived that this work had been accomplished with the help of our God. About '
        + 'a mile and a half of wall, by the chapter-three count a few dozen families at their own doors. '
        + 'The scene stands Nehemiah, Eliashib and some of the builders at the Water Gate, with the doors, '
        + 'the last thing, hung.',
      refs: ['Nehemiah 6:15-16', 'Nehemiah 6:1'],
    },
    {
      id: 'water-gate',
      era: 'The wall finished',
      label: 'The Book at the Water Gate',
      place: 'The square before the Water Gate',
      hour: 'morning',
      position: [-50, 37.36, -93],
      lookAt: [-17, 38.2, -92],
      body:
        'All the people gathered as one man into the square before the Water Gate and asked Ezra the '
        + 'scribe to bring the Book of the Law of Moses. On the first day of the seventh month he read it '
        + 'facing the square, from early morning until midday, to men and women and all who could '
        + 'understand. He stood on a wooden platform made for the purpose; when he opened the book all '
        + 'the people stood, and when he blessed the Lord they answered Amen, Amen, lifting up their '
        + 'hands, and bowed with their faces to the ground. The Levites gave the sense, and the people '
        + 'wept. Go, said Nehemiah: eat the fat and drink sweet wine, for the joy of the Lord is your '
        + 'strength.',
      refs: ['Nehemiah 8:1-12'],
    },
    {
      id: 'booths',
      era: 'The wall finished',
      label: 'Booths on the Roofs',
      place: 'The square at the Gate of Ephraim',
      hour: 'noon',
      position: [-236, 67.2, -272],
      lookAt: [-246, 66.9, -258],
      body:
        'On the second day they found it written in the Law that the people of Israel should live in '
        + 'booths during the feast of the seventh month, and they proclaimed it: go out to the hills and '
        + 'bring branches of olive, wild olive, myrtle, palm and other leafy trees. So the people made '
        + 'themselves booths, each on his roof, in their courts, in the courts of the house of God, in '
        + 'the square at the Water Gate and in the square at the Gate of Ephraim. Not since the days of '
        + 'Joshua son of Nun had Israel done so, and there was very great rejoicing.',
      refs: ['Nehemiah 8:13-18', 'Leviticus 23:39-43'],
    },
    {
      id: 'dedication',
      era: 'The wall finished',
      label: 'Two Great Choirs',
      place: 'On the wall above the Tower of the Furnaces',
      hour: 'noon',
      position: [-132.03, 47.8, -51.23],
      lookAt: [-134, 49.2, -66],
      body:
        'At the dedication of the wall they sought out the Levites in all their places to bring them to '
        + 'Jerusalem, to celebrate with gladness, with thanksgivings and singing, with cymbals, harps and '
        + 'lyres. Nehemiah brought the leaders of Judah up on the wall and appointed two great choirs. One '
        + 'went to the right along the top toward the Dung Gate, with Ezra before them; the other went to '
        + 'the left, above the Tower of the Ovens to the Broad Wall, and Nehemiah followed with half the '
        + 'people. Both stood in the house of God, and they offered great sacrifices that day, for God had '
        + 'made them rejoice with great joy; and the joy of Jerusalem was heard far away.',
      refs: ['Nehemiah 12:27-43'],
    },
  ],

  // A vantage here is the wall as it stands, finished: `event: null` clears any
  // moment staged, so a view of the walkway is never reached with a half-built
  // wall standing (Scene.jsx goToVantage).
  vantages: [
    {
      id: 'water-gate-view',
      event: null,
      label: 'The Water Gate',
      position: [-33, 37.3, -92],
      lookAt: [-3, 34, -93],
      blurb:
        'Inside the Water Gate, in the square where Ezra stood to read. The gate looks east, out over '
        + 'the Kidron to the Mount of Olives, and the wall runs off either side of it, finished: cut '
        + 'limestone, a walkway on top and a merlon every two metres. Fifty-two days. This is where the '
        + 'whole people stood on the first day of the seventh month, and it is where the walk begins.',
      refs: ['Nehemiah 8:1-3', 'Nehemiah 6:15', 'Nehemiah 3:26'],
    },
    {
      id: 'valley-gate-view',
      event: null,
      label: 'The Valley Gate',
      position: [-108, 33.7, 24],
      lookAt: [-124, 35, 19],
      blurb:
        'The gate Nehemiah rode out of by night, looking over the valley to the Dragon Spring and the '
        + 'Dung Gate. Hanun and the people of Zanoah rebuilt it, hung its doors, bolts and bars, and then '
        + 'repaired a thousand cubits of the wall as far as the Dung Gate. Walk out through it and along '
        + 'the outside, and count: five hundred metres.',
      refs: ['Nehemiah 3:13', 'Nehemiah 2:13', 'Nehemiah 2:15'],
    },
    {
      id: 'on-the-wall',
      event: null,
      label: 'On the Wall',
      position: [-132.49, 48.25, -55.21],
      lookAt: [-125.8, 41.5, 23.99],
      blurb:
        'Up the stairs and on top: a walkway wide enough for two, a parapet on the outer side, and the '
        + 'whole of the city of David laid out on one hand and the Western Hill on the other. This is '
        + 'where the two great choirs stood on the day the wall was dedicated, and where the guard '
        + 'walked on the nights when half the men worked and half held spears.',
      refs: ['Nehemiah 12:31', 'Nehemiah 12:38', 'Nehemiah 4:21-23'],
    },
    {
      id: 'temple-court',
      event: null,
      label: 'The Court of the Temple',
      position: [-54, 75.7, -463],
      lookAt: [-125, 80, -465],
      blurb:
        'The second Temple, finished seventy years before and not much to look at: the old men who had '
        + 'seen the first wept, and the prophet said it seemed as nothing. The altar had been rebuilt '
        + 'first, before the foundation, because the exiles were afraid. Everything Nehemiah did on the '
        + 'wall was to keep this safe, and the smoke going up from that altar is the one thing in the '
        + 'city that never stopped.',
      refs: ['Ezra 3:2-3', 'Ezra 6:15', 'Haggai 2:3', 'Nehemiah 2:8'],
    },
    {
      id: 'ophel',
      event: null,
      label: 'The Ophel',
      position: [-50, 55.4, -180],
      lookAt: [-95, 12, 200],
      blurb:
        'The spur between the Temple and the city of David, where the temple servants lived and built '
        + 'their own stretch of the wall. From here the whole ridge runs away south, narrowing, to the '
        + 'pools. All of Nehemiah’s Jerusalem is on it, and so thinly peopled that one in ten of the '
        + 'country had to be drawn by lot to come and live here.',
      refs: ['Nehemiah 3:26-27', 'Nehemiah 7:4', 'Nehemiah 11:1'],
    },
    {
      id: 'fountain-gate-view',
      event: null,
      label: 'The Fountain Gate',
      position: [-58, -38.5, 438],
      lookAt: [-70, -36, 432],
      blurb:
        'The south tip of the city: the Fountain Gate, the Pool of Shelah by the king’s garden, and the '
        + 'stairs that go down from the city of David. Shallun rebuilt the gate, roofed it, and hung its '
        + 'doors. It is also where Nehemiah, riding in the dark, found no place for the animal that was '
        + 'under him to pass.',
      refs: ['Nehemiah 3:15', 'Nehemiah 2:14', 'Nehemiah 12:37'],
    },
    {
      id: 'gihon-view',
      event: null,
      label: 'The Gihon',
      position: [8, 0.9, -6],
      lookAt: [-62, 14, -34],
      blurb:
        'The spring that Jerusalem is here for, in the bottom of the Kidron below the east wall. Solomon '
        + 'was anointed king at it. Hezekiah cut a tunnel from it through the rock to a pool inside the '
        + 'city, and stopped the upper outlet. Nehemiah’s wall stands higher up the slope, above the '
        + 'fallen terraces, with the spring outside it.',
      refs: ['1 Kings 1:38-39', '2 Chronicles 32:30', 'Nehemiah 2:14'],
    },
    {
      id: 'olivet-view',
      event: null,
      label: 'From the Mount of Olives',
      position: [236, 16.5, -120],
      lookAt: [-60, 62, -320],
      blurb:
        'Across the Kidron, from the hill where a very different city would one day be seen: the east '
        + 'face of Nehemiah’s, the Temple platform at its head, the wall stepping down the spur to the '
        + 'south, the smoke from the altar. It is a fraction of the Jerusalem that Herod would build and '
        + 'Jesus would weep over, and it is the city the books of Ezra and Nehemiah are about.',
      refs: ['Nehemiah 7:4', 'Ezra 6:15'],
    },
    {
      id: 'western-hill',
      event: null,
      label: 'The Western Hill',
      position: [-436, 99.85, -150],
      lookAt: [-240, 66, -215],
      blurb:
        'Outside the wall: the hill Hezekiah had walled and Babylon had burned, rubble and the outlines of '
        + 'burned houses, and the Broad Wall left standing. Nehemiah’s builders repaired Jerusalem as far '
        + 'as it; what they did not repair they left behind them. Looking east, the wall climbs from the '
        + 'valley to the Temple platform.',
      refs: ['Nehemiah 3:8', 'Nehemiah 12:38', 'Nehemiah 7:4'],
    },
    {
      id: 'sheep-gate-view',
      event: null,
      label: 'The Sheep Gate',
      position: [-155, 75.7, -555],
      lookAt: [-161, 77, -571],
      blurb:
        'First in the list. Eliashib the high priest and his brothers built it and consecrated it, as far '
        + 'as the Tower of the Hundred and the Tower of Hananel. It is the priests’ gate, beside the '
        + 'Temple, where the sacrificial animals came in, and the circuit closes on it: the last stretch of '
        + 'chapter 3 comes back to this gate.',
      refs: ['Nehemiah 3:1', 'Nehemiah 3:32', 'John 5:2'],
    },
    {
      id: 'dung-gate-view',
      event: null,
      label: 'The Dung Gate',
      position: [-118, -41.3, 516],
      lookAt: [-115, -37, 491],
      blurb:
        'A thousand cubits from the Valley Gate, measured here along the wall: five hundred metres. '
        + 'Where the city’s refuse went out into the Hinnom — that is all the name means. Malchijah, ruler '
        + 'of the district of Beth-haccherem, rebuilt it. The night ride came to it too: out by the '
        + 'Valley Gate, toward the Dragon Spring and the Dung Gate.',
      refs: ['Nehemiah 3:13-14', 'Nehemiah 2:13'],
    },
  ],

  // The look-closer pins. A pin with `event` shows only while that moment is
  // staged; the rest are always there.
  hotspots: [
    {
      id: 'sheep-gate',
      label: 'The Sheep Gate',
      position: [-161, 86.28, -571],
      maxDistance: 45,
      body:
        'At the north-east, by the Temple. Eliashib the high priest and his brothers the priests rebuilt '
        + 'it and consecrated it. In a later century there is a pool by this gate in Jerusalem, with five '
        + 'porticoes, where a man had lain ill for thirty-eight years.',
      refs: ['Nehemiah 3:1', 'Nehemiah 12:39', 'John 5:2'],
    },
    {
      id: 'fish-gate',
      label: 'The Fish Gate',
      position: [-300, 88.55, -490],
      maxDistance: 45,
      body:
        'On the north-west, where the fish came up from the coast. The sons of Hassenaah built it: they '
        + 'laid its beams and set its doors, bolts and bars. Within Nehemiah’s own lifetime the traders '
        + 'of Tyre living in the city brought fish here and sold it on the Sabbath, and he shut the gates '
        + 'against them.',
      refs: ['Nehemiah 3:3', 'Nehemiah 13:16-19', 'Zephaniah 1:10'],
    },
    {
      id: 'old-gate',
      label: 'The Old Gate',
      position: [-284, 89.28, -371],
      maxDistance: 45,
      body:
        'Joiada son of Paseah and Meshullam son of Besodeiah repaired it, laid its beams and hung its '
        + 'doors, bolts and bars. The Hebrew, Jeshanah, can mean the Old Gate or the Gate of the Old City: '
        + 'a gate on the oldest road, west of the Temple, which the procession of chapter 12 passes on its '
        + 'way round the wall.',
      refs: ['Nehemiah 3:6', 'Nehemiah 12:39'],
    },
    {
      id: 'ephraim-gate',
      label: 'The Gate of Ephraim',
      position: [-263, 79.96, -271],
      maxDistance: 45,
      body:
        'Not in the list of chapter 3, but named twice: the square at the Gate of Ephraim, where booths of '
        + 'branches were built for the feast, and the first station of the second choir on the wall. The '
        + 'northern kingdom’s name on a gate of the southern capital is old: a king of Israel once broke '
        + 'the wall down for four hundred cubits from this gate to the Corner Gate.',
      refs: ['Nehemiah 8:16', 'Nehemiah 12:39', '2 Kings 14:13'],
    },
    {
      id: 'valley-gate',
      label: 'The Valley Gate',
      position: [-124, 44.57, 19],
      maxDistance: 45,
      body:
        'Hanun and the inhabitants of Zanoah rebuilt it, and set its doors, bolts and bars — and repaired a '
        + 'thousand cubits of the wall as far as the Dung Gate. Nehemiah’s night ride left by it and came '
        + 'back by it. The first choir of the dedication went out along the wall above it.',
      refs: ['Nehemiah 3:13', 'Nehemiah 2:13', 'Nehemiah 2:15', 'Nehemiah 12:31'],
    },
    {
      id: 'dung-gate',
      label: 'The Dung Gate',
      position: [-115, -27.42, 491],
      maxDistance: 45,
      body:
        'A thousand cubits from the Valley Gate: the text gives the distance, and the wall here is built to '
        + 'it. Malchijah son of Rechab, ruler of the district of Beth-haccherem, rebuilt it. The first '
        + 'choir of the dedication went as far as this gate on the top of the wall.',
      refs: ['Nehemiah 3:13-14', 'Nehemiah 12:31'],
    },
    {
      id: 'fountain-gate',
      label: 'The Fountain Gate',
      position: [-70, -27.92, 432],
      maxDistance: 45,
      body:
        'Shallun son of Col-hozeh, ruler of the district of Mizpah, rebuilt it, roofed it and set its doors, '
        + 'bolts and bars, and repaired the wall of the Pool of Shelah by the king’s garden, as far as the '
        + 'stairs that go down from the city of David. The choir that went with Nehemiah went up by those '
        + 'stairs, above the house of David, to the Water Gate on the east.',
      refs: ['Nehemiah 3:15', 'Nehemiah 12:37'],
    },
    {
      id: 'water-gate',
      label: 'The Water Gate',
      position: [-3, 43.81, -93],
      maxDistance: 45,
      body:
        'On the east, toward the Gihon. The temple servants who lived on the Ophel repaired as far as the '
        + 'point opposite it, and the projecting tower. In front of it, inside the wall, was the open square '
        + 'where all the people gathered to hear the Law read, and where the booths of the feast were set '
        + 'up.',
      refs: ['Nehemiah 3:26', 'Nehemiah 8:1', 'Nehemiah 8:16'],
    },
    {
      id: 'horse-gate',
      label: 'The Horse Gate',
      position: [104, 55.22, -262],
      maxDistance: 45,
      body:
        'Above the Horse Gate the priests repaired, each opposite his own house. It is the gate by which '
        + 'horses were led into the king’s house, and where Athaliah was taken out and put to death; '
        + 'Jeremiah had promised that the city would be rebuilt as far as the corner of this gate, '
        + 'holy to the Lord.',
      refs: ['Nehemiah 3:28', '2 Kings 11:16', 'Jeremiah 31:38-40'],
    },
    {
      id: 'east-gate',
      label: 'The East Gate',
      position: [50, 82.47, -530],
      maxDistance: 45,
      body:
        'The gate of the Temple Mount itself, on its east side. Shemaiah son of Shecaniah, its keeper, '
        + 'repaired after Zadok. It is the gate Ezekiel saw the glory of the Lord return through, from the '
        + 'east, and was told would then be kept shut.',
      refs: ['Nehemiah 3:29', 'Ezekiel 43:1-4', 'Ezekiel 44:1-2'],
    },
    {
      id: 'muster-gate',
      label: 'The Muster Gate',
      position: [64, 73.84, -566],
      maxDistance: 45,
      body:
        'Hammiphkad, in the Hebrew: the Gate of the Appointment, or of the Inspection, a place where '
        + 'things were counted. Malchijah, one of the goldsmiths, repaired as far as the house of the temple '
        + 'servants and the merchants, opposite it, and to the upper chamber of the corner.',
      refs: ['Nehemiah 3:31-32'],
    },
    {
      id: 'prison-gate',
      label: 'The Gate of the Guard',
      position: [-125, 86.16, -581],
      maxDistance: 45,
      body:
        'The end of the northern circuit: the second choir of the dedication stopped here, by the Temple. '
        + 'Jeremiah was kept in the court of the guard in the last siege, and the word is the same, so '
        + 'this gate is usually taken to be the prison gate.',
      refs: ['Nehemiah 12:39', 'Jeremiah 32:2'],
    },
    {
      id: 'tower-of-hananel',
      label: 'The Tower of Hananel',
      position: [-242, 93.24, -556],
      maxDistance: 50,
      body:
        'At the north-west corner of the Temple’s fortress. Jeremiah promised that the city would be '
        + 'rebuilt for the Lord from this tower to the Corner Gate. Nehemiah put his brother Hanani in '
        + 'charge of Jerusalem and Hananiah over the fortress, a man who was faithful and feared God more '
        + 'than many.',
      refs: ['Nehemiah 3:1', 'Jeremiah 31:38', 'Nehemiah 7:2'],
    },
    {
      id: 'tower-of-meah',
      label: 'The Tower of the Hundred',
      position: [-193, 92.94, -566],
      maxDistance: 50,
      body:
        'Hammeah, in the Hebrew: of the Hundred. Whether it stood a hundred cubits high or was a post of a '
        + 'hundred men, nobody knows, and the text does not say. The first thing Nehemiah’s list names after '
        + 'the Sheep Gate, and the only tower besides Hananel’s the procession of chapter 12 passes.',
      refs: ['Nehemiah 3:1', 'Nehemiah 12:39'],
    },
    {
      id: 'tower-of-furnaces',
      label: 'The Tower of the Furnaces',
      position: [-136, 58.97, -85],
      maxDistance: 50,
      body:
        'Malchijah and Hasshub repaired it, with a second section. The ovens it is named for were bakers’ '
        + 'ovens: Jeremiah, in the last siege, was given a loaf a day from the bakers’ street. The second '
        + 'choir of the dedication went along the top, above it, to the Broad Wall.',
      refs: ['Nehemiah 3:11', 'Nehemiah 12:38', 'Jeremiah 37:21'],
    },
    {
      id: 'great-projecting-tower',
      label: 'The Great Projecting Tower',
      position: [35, 51.37, -148],
      maxDistance: 50,
      body:
        'Opposite it the Tekoites repaired a second section as far as the wall of the Ophel — the second '
        + 'stretch their nobles did not touch. The Water Gate and its own projecting tower stand just to '
        + 'the south.',
      refs: ['Nehemiah 3:27', 'Nehemiah 3:26'],
    },
    {
      id: 'gihon',
      label: 'The Gihon',
      position: [0, 2.6, 0],
      maxDistance: 50,
      body:
        'The one spring in the city’s valley, and the reason a city was put on this ridge. Solomon was '
        + 'anointed king beside it, with the trumpet blown and the people shouting, so loud the earth '
        + 'was split. Hezekiah stopped its upper outlet and brought its water down inside the walls.',
      refs: ['1 Kings 1:38-45', '2 Chronicles 32:30'],
    },
    {
      id: 'tunnel-mouth',
      label: 'Hezekiah’s Tunnel',
      position: [-22, 10.25, 4],
      maxDistance: 40,
      body:
        'Twelve hundred cubits through solid rock, five hundred and thirty-three metres, cut from both ends '
        + 'until the crews met. An inscription found in the tunnel in 1880 says the water flowed from the '
        + 'spring to the pool for twelve hundred cubits. It comes out under the south of the city, at the '
        + 'Pool of Shelah.',
      refs: ['2 Chronicles 32:30', '2 Kings 20:20'],
    },
    {
      id: 'pool-of-siloam',
      label: 'The Pool of Shelah',
      position: [-153, -17.52, 351],
      maxDistance: 55,
      body:
        'The wall of the Pool of Shelah by the king’s garden was Shallun’s. It is the pool Hezekiah’s tunnel '
        + 'fills; the Hebrew name is Shiloah, Siloam. Five centuries later a blind man is told to go and '
        + 'wash in it.',
      refs: ['Nehemiah 3:15', 'Isaiah 8:6', 'John 9:7'],
    },
    {
      id: 'kings-pool',
      label: 'The King’s Pool',
      position: [-6, -25.1, 320],
      maxDistance: 55,
      body:
        'The artificial pool, in Nehemiah’s words, the one that was made; whether it is the same as the '
        + 'lower pool Isaiah says the people gathered the water of is a guess. His night ride came to it '
        + 'and could go no further on the animal, for the rubble.',
      refs: ['Nehemiah 2:14', 'Nehemiah 3:16', 'Isaiah 22:9'],
    },
    {
      id: 'dragon-spring',
      label: 'The Dragon Spring',
      position: [-206, -5.88, 300],
      maxDistance: 50,
      body:
        'The Dragon Spring, or Dragon Well, or the Jackal’s: a name nobody can place with certainty. The '
        + 'night ride went out by the Valley Gate toward it, then on to the Dung Gate, looking at the wall '
        + 'from outside in the dark.',
      refs: ['Nehemiah 2:13'],
    },
    {
      id: 'stepped-stone-structure',
      label: 'The Stepped Stone Structure',
      position: [-30, 17.45, 8],
      maxDistance: 55,
      body:
        'A massive stepped stone terrace on the slope above the Gihon, older than David and in use for '
        + 'centuries; some excavators take it for the Millo. By Nehemiah’s day it had fallen in a heap down '
        + 'the slope, and Kathleen Kenyon argued that this is why the wall of his time stands higher up '
        + 'the hill than the old one. The rubble Nehemiah could not ride through is this.',
      refs: ['2 Samuel 5:9', 'Nehemiah 2:14', 'Nehemiah 3:15'],
    },
    {
      id: 'davids-palace',
      label: 'David’s Palace',
      position: [-77, 35.07, 1],
      maxDistance: 55,
      body:
        'What was left of the house David built: Hiram of Tyre sent cedar and masons and carpenters for it. '
        + 'Nehemiah’s builders use it as a landmark, and the choir that went up by the stairs of the city of '
        + 'David went above the house of David. A large building dug in 2005 has been called it; others '
        + 'date it later.',
      refs: ['2 Samuel 5:11', 'Nehemiah 12:37'],
    },
    {
      id: 'governor-seat',
      label: 'The Governor’s Seat',
      position: [-241, 77.9, -332],
      maxDistance: 55,
      body:
        'The men of Gibeon and Mizpah, who were under the jurisdiction of the governor of the province '
        + 'Beyond the River, repaired next to it. Jerusalem was a small town in a Persian province, and the '
        + 'governor of Judah was Nehemiah himself, for twelve years, who in all that time did not take the '
        + 'governor’s food allowance.',
      refs: ['Nehemiah 3:7', 'Nehemiah 5:14-15'],
    },
    {
      id: 'temple',
      label: 'The Temple',
      position: [-115, 93, -465],
      maxDistance: 120,
      body:
        'Zerubbabel’s Temple, finished in the sixth year of Darius. Cyrus’s decree had named sixty cubits for '
        + 'its height and breadth; Haggai says it seemed as nothing beside the first. Its walls were three '
        + 'courses of great stones to one of timber. Nothing in Nehemiah describes it, and this one is '
        + 'built to the first Temple’s plan at its modest end.',
      refs: ['Ezra 6:3-4', 'Ezra 6:15', 'Haggai 2:3', '1 Kings 6:2'],
    },
    {
      id: 'altar',
      label: 'The Altar',
      position: [-74, 79.8, -463],
      maxDistance: 60,
      body:
        'Jeshua the son of Jozadak and his fellow priests, and Zerubbabel, built the altar of the God of '
        + 'Israel to offer burnt offerings on it, as it is written in the Law of Moses. They set it on its '
        + 'foundation, for fear was on them because of the peoples of the lands, and offered on it morning '
        + 'and evening.',
      refs: ['Ezra 3:2-3'],
    },
    {
      id: 'broad-wall',
      label: 'The Broad Wall',
      position: [-485, 102.22, -190],
      maxDistance: 80,
      body:
        'Seven metres thick, traced for some sixty-five metres, found in the Jewish Quarter in 1970: '
        + 'Hezekiah’s wall, built when the Assyrians were coming, with the houses that stood in its way '
        + 'pulled down for the stone. The second choir of the dedication went along the top of the wall as '
        + 'far as it.',
      refs: ['Nehemiah 3:8', 'Nehemiah 12:38', 'Isaiah 22:10', '2 Chronicles 32:5'],
    },
    {
      id: 'tombs-of-david',
      label: 'The Tombs of David',
      position: [84, 12.51, 329],
      maxDistance: 60,
      body:
        'Nehemiah son of Azbuk, ruler of half the district of Beth-zur — not the governor — repaired to a '
        + 'point opposite the tombs of David, as far as the artificial pool and the house of the mighty '
        + 'men. David was buried in the city of David, and by now nobody can say where.',
      refs: ['Nehemiah 3:16', '1 Kings 2:10'],
    },
    {
      id: 'eliashib-house',
      label: 'The House of Eliashib',
      position: [-93, 21.65, 149],
      maxDistance: 55,
      body:
        'Baruch son of Zabbai repaired zealously from the Angle to the door of the house of Eliashib the '
        + 'high priest; Meremoth, from the door of it to the end. This is the Eliashib who, while Nehemiah '
        + 'was back in Susa, gave Tobiah the Ammonite a great chamber in the Temple, and whose grandson '
        + 'married Sanballat’s daughter.',
      refs: ['Nehemiah 3:20-21', 'Nehemiah 13:4-7', 'Nehemiah 13:28'],
    },
    {
      id: 'armory',
      label: 'The Armory',
      position: [-112, 6.98, 250],
      maxDistance: 55,
      body:
        'Ezer son of Jeshua, ruler of Mizpah, repaired another section opposite the ascent to the armory at '
        + 'the Angle. The wall turns here, on the slope above the Kidron, and the text keeps coming back to '
        + 'the Angle and the Corner as the places where one builder’s stretch gives way to the next.',
      refs: ['Nehemiah 3:19', 'Nehemiah 3:24-25'],
    },
    {
      id: 'ophel-servants',
      label: 'The Ophel',
      position: [-40, 66.39, -215],
      maxDistance: 60,
      body:
        'The temple servants, who lived on the Ophel, repaired to a point opposite the Water Gate toward '
        + 'the east and the projecting tower. A small, poor, dependent community with its own houses on the '
        + 'spur south of the Temple platform, and a hereditary place in the Temple’s service.',
      refs: ['Nehemiah 3:26', 'Nehemiah 11:21', 'Ezra 2:43-54'],
    },
    {
      id: 'wooden-platform',
      label: 'A Wooden Platform',
      event: 'water-gate',
      position: [-17, 40.4, -92],
      maxDistance: 40,
      body:
        'Ezra the scribe stood on a wooden platform that they had made for the purpose, and beside him on '
        + 'his right hand stood six men, and on his left, seven: thirteen names the text gives, which the '
        + 'scene reduces to two Levites. He was above all the people, so that when he opened the book they '
        + 'all stood.',
      refs: ['Nehemiah 8:4-5'],
    },
    {
      id: 'booth-branches',
      label: 'Olive, Myrtle, Palm',
      event: 'booths',
      position: [-246, 70.4, -258],
      maxDistance: 40,
      body:
        'Go out to the hills and bring branches of olive, wild olive, myrtle, palm, and other leafy trees to '
        + 'make booths, as it is written. The scene’s booths are of unnamed leafy boughs over a frame of '
        + 'poles; the text names the trees, and gives no pattern.',
      refs: ['Nehemiah 8:15', 'Leviticus 23:40'],
    },
    {
      id: 'the-trumpet',
      label: 'The Man With the Trumpet',
      event: 'sword-and-trowel',
      position: [83, 47.5, -241],
      maxDistance: 40,
      body:
        'The man who sounded the trumpet was beside him. The work is great and widely spread, and we are '
        + 'separated on the wall, far from one another. In the place where you hear the sound of the '
        + 'trumpet, rally to us there. Our God will fight for us.',
      refs: ['Nehemiah 4:18-20'],
    },
  ],
};
