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
  period: { label: 'c. AD 28', referenceYear: 28 },
  blurb:
    'Jesus left Nazareth and came and lived here — a fishing village of black basalt on the '
    + 'north shore of the lake, perhaps a thousand people, a toll post, one synagogue. Much of '
    + 'Mark’s first two chapters happens within a few minutes’ walk of where you are standing. '
    + 'Try the door of the house — you will not get through it. Then go up the outside stair '
    + 'and look down through the roof.',
  disclaimer:
    'An artist’s reconstruction. The village plan and the insula layout follow the excavated '
    + 'site; the synagogue’s plan is modelled on excavated first-century synagogues such as '
    + 'Magdala and Gamla; the interiors, the crowd and the boats are informed guesswork. The room '
    + 'shown as the house is the one pilgrims were shown as Peter’s by the fourth century, and '
    + 'which the excavators believe was set apart much earlier — the identification is early and '
    + 'widely held, but it is tradition, not proof.',
  // The site on the north shore of the lake. -Z is south, out over the water;
  // +X is east along the shore. See src/lib/googleMaps.js.
  geo: { lat: 32.8806, lon: 35.5752, bearing: 180, xAxis: 90 },
  defaultVantage: 'the-shore',
  // Which of the events below is staged when the scene opens: the first of
  // them, on the shore the default vantage stands on.
  defaultEvent: 'fishermen',

  // What happened here, in the order the gospels tell it. Only one is staged
  // at a time (components/scene/capernaumEvents.js); choosing one stages it,
  // sets the hour the text gives or implies, and stands the visitor where it
  // can be seen. `position` is an eye point like a vantage's. Each body says
  // what the text says, and what the staging supplies.
  events: [
    {
      id: 'fishermen',
      label: 'Fishers of Men',
      place: 'The shore',
      hour: 'morning',
      position: [-11.0, 1.15, -13.5],
      lookAt: [-12.5, 0.4, -17.4],
      body:
        'Passing along the shore, Jesus saw Simon and his brother Andrew casting a net into the sea, '
        + 'for they were fishermen, and said to them, “Follow me, and I will make you become fishers '
        + 'of men.” Immediately they left their nets. A little farther on, James and John, the sons of '
        + 'Zebedee, were in their boat mending the nets; he called them, and they left their father '
        + 'Zebedee in the boat with the hired servants and followed him. Mark does not say which '
        + 'stretch of shore. Luke tells a fuller call, after a night’s fishing had caught nothing.',
      refs: ['Mark 1:16-20', 'Matthew 4:18-22', 'Luke 5:1-11'],
    },
    {
      id: 'synagogue-rebuke',
      label: 'The Unclean Spirit',
      place: 'The synagogue',
      hour: 'morning',
      position: [-14.6, 2.6, 37.2],
      lookAt: [-18.8, 2.1, 38.3],
      body:
        'On the sabbath Jesus went into the synagogue and taught, and they were astonished at his '
        + 'teaching, for he taught them as one who had authority, and not as the scribes. A man with '
        + 'an unclean spirit cried out, and Jesus rebuked it: “Be silent, and come out of him!” The '
        + 'spirit convulsed him and came out, and they asked one another, “What is this? A new '
        + 'teaching with authority!” At once his fame spread through all the surrounding region of '
        + 'Galilee.',
      refs: ['Mark 1:21-28', 'Luke 4:31-37'],
    },
    {
      id: 'mother-in-law',
      label: 'The Fever Left Her',
      place: 'The house',
      hour: 'noon',
      position: [15.6, 1.7, 15.2],
      lookAt: [13.75, 0.75, 11.7],
      body:
        'Straight from the synagogue they went into the house of Simon and Andrew, with James and '
        + 'John. Simon’s mother-in-law lay sick with a fever, and at once they told him about her. He '
        + 'came and took her by the hand and lifted her up, and the fever left her, and she began to '
        + 'serve them. Simon’s wife is not named in the story; Paul says Peter had one, and she is '
        + 'shown at her mother’s side as reconstruction.',
      refs: ['Mark 1:29-31', 'Matthew 8:14-15', 'Luke 4:38-39', '1 Corinthians 9:5'],
    },
    {
      id: 'sundown',
      label: 'The Whole City at the Door',
      place: 'The courtyard',
      hour: 'dusk',
      position: [15.95, 1.7, 22.9],
      lookAt: [15.55, 1.2, 16.6],
      body:
        'That evening at sundown they brought to him all who were sick or oppressed by demons, and '
        + 'the whole city was gathered together at the door. He healed many who were sick with '
        + 'various diseases and cast out many demons, and would not permit the demons to speak, '
        + 'because they knew him. Luke adds that he laid his hands on every one of them. It was the '
        + 'same sabbath until the sun went down, which is why they waited for evening to carry '
        + 'their sick to him.',
      refs: ['Mark 1:32-34', 'Matthew 8:16-17', 'Luke 4:40-41'],
    },
    {
      id: 'paralytic',
      label: 'Through the Roof',
      place: 'The house',
      hour: 'noon',
      position: [16.8, 1.7, 14.7],
      lookAt: [15.1, 1.65, 12.1],
      body:
        'When he returned to Capernaum after some days, it was reported that he was at home, and '
        + 'so many gathered that there was no more room, not even at the door. Four men carrying a '
        + 'paralysed man could not get near him for the crowd, so they removed the roof above him '
        + 'and, when they had dug through it, let down the bed. Seeing their faith, Jesus said, '
        + '“Son, your sins are forgiven” — and to the scribes questioning it in their hearts, and to '
        + 'the man, “Rise, pick up your bed, and go home.” He did, in front of them all.',
      refs: ['Mark 2:1-12', 'Luke 5:17-26', 'Matthew 9:1-8'],
    },
    {
      id: 'call-of-matthew',
      label: 'Follow Me',
      place: 'The tax booth',
      hour: 'morning',
      position: [-49.3, 1.7, -4.25],
      lookAt: [-47.8, 0.8, -1.85],
      body:
        'Beside the sea, Jesus saw a man called Levi — Matthew — sitting at the tax booth, and said '
        + 'to him, “Follow me.” He rose and followed him. Levi made him a great feast in his house, '
        + 'with many tax collectors and sinners at the table, and to those who objected Jesus said, '
        + '“Those who are well have no need of a physician, but those who are sick. I came not to '
        + 'call the righteous, but sinners.”',
      refs: ['Mark 2:13-17', 'Matthew 9:9-13', 'Luke 5:27-32'],
    },
    {
      id: 'centurion',
      label: 'Only Say the Word',
      place: 'Below the synagogue',
      hour: 'noon',
      position: [-5.8, 1.7, 28.4],
      lookAt: [-5.85, 1.3, 24.4],
      body:
        'When Jesus entered Capernaum, a centurion’s servant lay at home paralysed and suffering. '
        + 'Luke says the centurion sent the elders of the Jews to plead for him — “he loves our '
        + 'nation, and he is the one who built us our synagogue” — and then friends, to say, “Lord, '
        + 'do not trouble yourself, for I am not worthy to have you come under my roof. But say the '
        + 'word, and let my servant be healed.” Jesus marvelled: “Not even in Israel have I found '
        + 'such faith.” Matthew tells it more briefly, with the centurion speaking for himself; the '
        + 'scene follows Matthew, with Luke’s elders at his side.',
      refs: ['Matthew 8:5-13', 'Luke 7:1-10'],
    },
    {
      id: 'the-woman',
      label: 'Who Touched My Garments?',
      place: 'The shore street',
      hour: 'morning',
      position: [17.7, 1.7, -3.3],
      lookAt: [16.9, 0.9, 0.3],
      body:
        'Back across the lake, beside the sea, Jairus, one of the rulers of the synagogue, fell at '
        + 'Jesus’ feet: his little daughter was at the point of death. As Jesus went with him the '
        + 'crowd pressed round, and a woman who had suffered from a discharge of blood for twelve '
        + 'years came up behind him and touched his garment, for she said, “If I touch even his '
        + 'garments, I will be made well.” Immediately she was healed, and Jesus, perceiving that '
        + 'power had gone out from him, turned about in the crowd: “Who touched my garments?” Mark '
        + 'does not name the town; Matthew’s order puts it in Jesus’ own city.',
      refs: ['Mark 5:21-34', 'Luke 8:40-48', 'Matthew 9:18-22'],
    },
    {
      id: 'bread-of-life',
      label: 'The Bread of Life',
      place: 'The synagogue',
      hour: 'morning',
      position: [-17.9, 2.6, 34.0],
      lookAt: [-18.9, 1.9, 40.2],
      body:
        'The day after the five thousand were fed, the crowd crossed the lake to Capernaum looking '
        + 'for him, and in the synagogue he taught them: “I am the bread of life; whoever comes to me '
        + 'shall not hunger.” They grumbled and disputed among themselves — “How can this man give '
        + 'us his flesh to eat?” — and many of his disciples said, “This is a hard saying,” turned '
        + 'back, and no longer walked with him. He asked the twelve, “Do you want to go away as '
        + 'well?” Simon Peter answered, “Lord, to whom shall we go? You have the words of eternal '
        + 'life.” John sets the teaching in this synagogue; where the parting happened he does not '
        + 'say.',
      refs: ['John 6:24-69'],
    },
    {
      id: 'temple-tax',
      label: 'A Coin in the Fish’s Mouth',
      place: 'The west pier',
      hour: 'morning',
      position: [-34.5, 1.7, -35.3],
      lookAt: [-34.6, 1.2, -38.8],
      body:
        'When they came to Capernaum, the collectors of the two-drachma tax — the half-shekel every '
        + 'Jewish man gave each year for the temple — asked Peter, “Does your teacher not pay the '
        + 'tax?” Jesus sent him to the lake: “Go to the sea and cast a hook and take the first fish '
        + 'that comes up, and when you open its mouth you will find a shekel. Take that and give it '
        + 'to them for me and for yourself.” Matthew records the instruction, not the catch; the '
        + 'scene shows what Jesus told him he would find.',
      refs: ['Matthew 17:24-27', 'Exodus 30:11-16'],
    },
    {
      id: 'the-child',
      label: 'The Child in the Midst',
      place: 'The house',
      hour: 'dusk',
      position: [15.6, 1.7, 15.2],
      lookAt: [15.35, 0.9, 10.6],
      body:
        'They came to Capernaum, and when he was in the house he asked them, “What were you '
        + 'discussing on the way?” They kept silent, for on the way they had argued with one '
        + 'another about who was the greatest. He sat down and called the twelve: “If anyone would '
        + 'be first, he must be last of all and servant of all.” And he took a child and put him in '
        + 'the midst of them, and taking him in his arms, said, “Whoever receives one such child in '
        + 'my name receives me.”',
      refs: ['Mark 9:33-37', 'Matthew 18:1-5', 'Luke 9:46-48'],
    },
  ],

  vantages: [
    {
      id: 'the-shore',
      label: 'The Shore',
      event: 'fishermen',
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
      event: 'call-of-matthew',
      // Inside the awning's south-west corner, at the collector's own end of
      // the table, looking north-east across it: Jesus on the left with his
      // hand out, Matthew on the right, the balance between them.
      position: [-49.3, 1.7, -4.25],
      lookAt: [-47.8, 0.8, -1.85],
      blurb:
        'Capernaum sat on the road from Damascus to the sea and on the border of Herod Antipas’s '
        + 'territory, which is why there was a customs post in a fishing village. Matthew is at the '
        + 'table with the stylus still in his hand and the day’s coin stacked in front of him. The '
        + 'clerk beside him has not looked up. Jesus has just said two words to him, and this scene '
        + 'holds the moment before he answered — the passage goes on with Matthew leaving all of '
        + 'it and throwing a feast in his own house for every tax collector he knew.',
      refs: ['Matthew 9:9-13', 'Mark 2:13-17', 'Luke 5:27-32'],
    },
    {
      id: 'the-doorway',
      label: 'At the Door',
      event: 'paralytic',
      // Just behind the gathering, looking through the entrance toward Jesus.
      position: [15.6, 1.7, 21.4],
      lookAt: [15.25, 1.55, 10.8],
      blurb:
        'The courtyard of the insula, and the door of the room. It is mobbed twice in Mark: once '
        + 'at sundown when the sabbath ended and they carried the whole town’s sick to it, and '
        + 'once on the day you are standing in, when so many packed in to hear him that there was '
        + 'no more room left — not even at the door. Four men carrying a fifth on a mat got this '
        + 'far, could get no nearer, and went round the outside and up the stair instead. You '
        + 'will have to do the same.',
      refs: ['Mark 2:1-4', 'Mark 1:32-34', 'Luke 5:17-19'],
    },
    {
      id: 'inside-the-house',
      label: 'Inside the House',
      event: 'paralytic',
      position: [16.8, 1.7, 14.7],
      lookAt: [15.1, 1.65, 12.1],
      blurb:
        'A single basalt room about seven metres by six, and on the day it mattered there was no '
        + 'space left in it — not even at the door. The man is suspended before Jesus, while '
        + 'his four friends hold the ropes above. This scene pauses during the lowering; '
        + 'the passage continues with forgiveness, healing, and the man carrying his bed home.',
      refs: ['Mark 2:1-12'],
    },
    {
      id: 'on-the-roof',
      label: 'On the Roof',
      event: 'paralytic',
      position: [18.15, 5.0, 12.5],
      lookAt: [15.8, 2.1, 12.5],
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
      event: 'synagogue-rebuke',
      // Just inside the east colonnade, looking across the nave: the teacher
      // and the man he is rebuking in profile, the west benches behind them.
      position: [-14.6, 2.6, 37.2],
      lookAt: [-18.8, 2.1, 38.3],
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
        + 'in it. Peter’s mother-in-law lay here with a fever and got up and served them. The '
        + 'excavators found this one room replastered — perhaps as early as the late first century '
        + '— and later scratched with Christian graffiti, while the houses around it stayed houses. '
        + 'By the fourth century pilgrims were shown it as Peter’s house. How early the veneration '
        + 'began is debated, but it is one of the earliest identifications of a gospel site.',
      refs: ['Mark 1:29-31', 'Matthew 8:14-16'],
    },
    {
      id: 'the-lowered-man',
      label: 'Jesus and the lowered man',
      event: 'paralytic',
      position: [15.1, 2.25, 12.5],
      maxDistance: 16,
      body: 'Four men could not bring their friend through the crowded doorway, so they opened the roof and lowered him before Jesus. This tableau holds that moment. Read on: Jesus first declares forgiveness, then commands the man to rise, carry his bed, and go home. The poses, ropes, and clothing are an artistic reconstruction.',
      refs: ['Mark 2:1-12'],
    },
    {
      id: 'the-roof',
      label: 'The Roof',
      position: [16, 5.4, 12.5],
      maxDistance: 70,
      body:
        'Not tiles, whatever Luke’s wording — “through the tiles”, written for readers who knew '
        + 'tiled roofs. Mark says they dug through, and a Capernaum roof was beams laid across the '
        + 'walls, brushwood and reeds packed between them, and a thick layer of mud rolled flat on '
        + 'top, resurfaced every autumn before the rains. It was a floor, a workroom and a place to '
        + 'sleep in summer, and on one occasion a door.',
      refs: ['Mark 2:4', 'Luke 5:19', 'Acts 10:9'],
    },
    {
      id: 'the-basalt-synagogue',
      label: 'Why It Is Black',
      position: [-19, 11, 37],
      maxDistance: 150,
      body:
        'The white limestone synagogue in every photograph of Capernaum was built three to five '
        + 'centuries after this scene — its dates run from the late fourth to the sixth century. '
        + 'Beneath it lie basalt walls and a basalt pavement that the excavators took to be the '
        + 'synagogue Jesus knew; others read them as a later phase or an open paved area. So the '
        + 'hall here is built as that basalt building would have been: dark, plain local stone, '
        + 'not the white limestone of the later one.',
      refs: ['Mark 1:21', 'Luke 7:5'],
    },
    {
      id: 'the-unclean-spirit',
      label: 'Be silent',
      event: 'synagogue-rebuke',
      position: [-18.3, 2.9, 36.5],
      maxDistance: 14,
      body:
        'On a sabbath near the start of it all, Jesus taught in this synagogue, and the room was '
        + 'astonished: he taught as one who had authority, and not as the scribes. Then a man with an '
        + 'unclean spirit cried out — “What have you to do with us, Jesus of Nazareth? Have you come '
        + 'to destroy us? I know who you are, the Holy One of God.” Jesus rebuked him: “Be silent, '
        + 'and come out of him.” The spirit convulsed him, threw him down in the middle of them and '
        + 'left him unharmed, and they asked one another what this was — a new teaching, with '
        + 'authority. He taught here again later; John sets the bread of life discourse in this '
        + 'synagogue. The tableau holds the moment of the rebuke. That he sat to teach follows '
        + 'Luke’s account at Nazareth; the poses, the clothing and where anyone sat are an '
        + 'artistic reconstruction.',
      refs: ['Mark 1:21-28', 'Luke 4:31-37', 'John 6:59'],
    },
    {
      id: 'the-reading',
      label: 'The Scroll',
      event: ['synagogue-rebuke', 'bread-of-life'],
      position: [-19, 1.9, 39],
      maxDistance: 8,
      body:
        'A synagogue was built “for the reading of the law and the teaching of the '
        + 'commandments”, in the words of the Theodotos inscription, carved in Jerusalem before the '
        + 'city fell. The scroll was handed out by the attendant and read standing; the one who '
        + 'taught gave it back and sat down, and every eye was on him. At Magdala a carved stone at '
        + 'the centre of the hall probably took the scroll; this plain table stands where that would '
        + 'be. The man by the table with his arms folded is one of the rulers who ran the '
        + 'synagogue — Jairus, whose daughter Jesus raised, was very probably one of this one’s.',
      refs: ['Luke 4:16-20', 'Acts 13:15', 'Mark 5:22'],
    },
    {
      id: 'the-cast-net',
      label: 'Casting a Net',
      event: 'fishermen',
      position: [-13.85, 1.1, -21.0],
      maxDistance: 22,
      body:
        'Mark’s word for what Simon and Andrew were doing belongs to the cast net: a round net '
        + 'weighted with lead round its rim, thrown by one man from the shore or the shallows so '
        + 'that it opens as it flies and falls in a circle over the fish. Mendel Nun, who fished '
        + 'this lake for decades, recorded it still in use in the last century. James and John, in '
        + 'the boat, were mending a different net, the kind worked from boats; and Zebedee had '
        + 'hired men, so this was a family business with employees, not a man with a rod.',
      refs: ['Mark 1:16-20', 'Matthew 4:18'],
    },
    {
      id: 'she-served-them',
      label: 'She Began to Serve Them',
      event: 'mother-in-law',
      position: [13.6, 1.4, 11.45],
      maxDistance: 10,
      body:
        '“The fever left her, and she began to serve them.” The verb is the one Jesus later uses of '
        + 'himself: the Son of Man came not to be served but to serve. Nothing is said about '
        + 'recovering; within the sentence she is on her feet in her own house, looking after her '
        + 'guests on the same sabbath afternoon.',
      refs: ['Mark 1:31', 'Mark 10:45'],
    },
    {
      id: 'after-sunset',
      label: 'Why They Waited for Sunset',
      event: 'sundown',
      position: [15.6, 2.5, 19.5],
      maxDistance: 18,
      body:
        'A sabbath ran from sunset to sunset, and carrying a load out of one house and through the '
        + 'lanes to another was work the sabbath forbade (Jeremiah 17:21-22; the Mishnah lists '
        + 'carrying from one domain to another among the thirty-nine kinds of labour). So the town '
        + 'waited until the sun had set on the sabbath of the synagogue before it brought its sick '
        + 'to this door on mats and on its shoulders — and brought lamps, because it was already '
        + 'getting dark.',
      refs: ['Mark 1:32', 'Jeremiah 17:21-22'],
    },
    {
      id: 'under-my-roof',
      label: 'Under My Roof',
      event: 'centurion',
      position: [-7.0, 2.4, 24.45],
      maxDistance: 16,
      body:
        '“I am not worthy to have you come under my roof.” A Jew did not enter a Gentile’s house — '
        + 'Peter says as much at Caesarea — and the centurion spares Jesus the question. Whose '
        + 'soldier he was is not said: Galilee was Herod Antipas’s, and his troops were probably '
        + 'organised on the Roman model, so he carries a centurion’s vine staff here, the badge of '
        + 'the rank. “For I too am a man under authority”: he understood an order given at a '
        + 'distance.',
      refs: ['Luke 7:6-8', 'Matthew 8:8-9', 'Acts 10:28'],
    },
    {
      id: 'the-fringe',
      label: 'The Fringe of His Garment',
      event: 'the-woman',
      position: [16.7, 1.1, 0.1],
      maxDistance: 12,
      body:
        'Matthew and Luke say she touched the fringe of his cloak: the tassels the law told Israel '
        + 'to wear on the four corners of their garments, with a cord of blue in each, “to look at '
        + 'and remember all the commandments of the LORD.” Her bleeding made her unclean, and '
        + 'anything she touched with it — one reason to come from behind, in a crowd, and say '
        + 'nothing. He did not let it stay hidden: “Daughter, your faith has made you well; go in '
        + 'peace.”',
      refs: ['Numbers 15:38-39', 'Leviticus 15:25-27', 'Mark 5:34', 'Matthew 9:20'],
    },
    {
      id: 'a-hard-saying',
      label: 'Many Turned Back',
      event: 'bread-of-life',
      position: [-18.3, 2.9, 35.2],
      maxDistance: 14,
      body:
        '“Your fathers ate the manna in the wilderness, and they died.” The teaching turns on the '
        + 'bread from heaven that fed Israel for forty years, and on a claim to be more than it. It '
        + 'cost him followers, and John says so plainly: after this many of his disciples turned '
        + 'back and no longer walked with him. The twelve stayed, and Peter’s answer is the other '
        + 'half of the scene: to whom shall we go?',
      refs: ['John 6:48-51', 'John 6:66-69', 'Exodus 16:4-35'],
    },
    {
      id: 'a-shekel',
      label: 'A Barbel and a Shekel',
      event: 'temple-tax',
      position: [-34.4, 1.95, -38.8],
      maxDistance: 12,
      body:
        'The fish served to pilgrims as “St Peter’s fish” is a tilapia, which feeds on plankton and '
        + 'will not take a baited hook; the lake’s barbels are predators that will, and Mendel Nun '
        + 'argued the fish Jesus sent Peter for was one of them. The coin is a stater — at Tyre’s '
        + 'mint a silver shekel of four drachmas, exactly the half-shekel of the temple tax for two '
        + 'men. For me and for yourself.',
      refs: ['Matthew 17:27', 'Exodus 30:13'],
    },
    {
      id: 'last-of-all',
      label: 'Last of All',
      event: 'the-child',
      position: [15.2, 1.6, 10.8],
      maxDistance: 10,
      body:
        'The argument on the road was about rank, and the answer is a child — someone with no '
        + 'standing at all. “Whoever receives one such child in my name receives me, and whoever '
        + 'receives me, receives not me but him who sent me.” Matthew has him say more: unless you '
        + 'turn and become like children, you will never enter the kingdom of heaven.',
      refs: ['Mark 9:37', 'Matthew 18:3-4'],
    },
    {
      id: 'the-call-of-matthew',
      label: 'Follow me',
      event: 'call-of-matthew',
      position: [-48.9, 2.2, -2.3],
      maxDistance: 16,
      body:
        'A toll collector on this road collected his own people’s money for Herod Antipas and '
        + 'lived on whatever he could add to the assessment, which is why the gospels put “tax '
        + 'collectors” and “sinners” in the same breath and why nobody in this queue liked him. '
        + 'The tableau holds the moment before he moved: the stylus is still over the tablet, the '
        + 'balance is still on the table, the clerk beside him is still counting. Then Jesus ate '
        + 'in his house, and answered the complaint about it — those who are well have no need of '
        + 'a physician. The poses, clothing and furniture of the booth are an artistic '
        + 'reconstruction.',
      refs: ['Matthew 9:9-13', 'Mark 2:14-17', 'Luke 5:27-32'],
    },
    {
      id: 'the-tax-road',
      label: 'The Via Maris',
      position: [-56, 5, -2],
      maxDistance: 130,
      body:
        'The road from the coast to Damascus passed along this shore, and a few kilometres east, '
        + 'at the Jordan, Antipas’s Galilee ended and his brother Philip’s territory began. That is '
        + 'why a village of fishermen had a toll post, and perhaps why a centurion — an officer in '
        + 'Antipas’s service, not a Roman garrison, which Galilee did not have — lived here; and why '
        + 'the news travelled out of Capernaum as fast as it did.',
      refs: ['Matthew 4:13-16', 'Mark 1:28'],
    },
    {
      id: 'the-harbour',
      label: 'The Piers',
      position: [39.5, 2.2, -44],
      maxDistance: 120,
      body:
        'Along this shore the lake’s fishing towns built out into the water: a stone-faced '
        + 'promenade, piers of black basalt fieldstone, and mooring stones with a hole bored through '
        + 'for the rope. Mendel Nun, who walked the whole shoreline in the drought years, recorded '
        + 'such works at Capernaum. How much of them stood by the time of Jesus is argued over — some '
        + 'may be later — so the scene gives them two piers, not a port. Somewhere like this Jesus '
        + 'got into Simon’s boat and asked him to put out a little from the land, and taught from it.',
      refs: ['Luke 5:1-3', 'Mark 4:1', 'Mark 1:16-20'],
    },
    {
      id: 'the-fold',
      label: 'The Fold',
      position: [-44, 2.4, 42],
      maxDistance: 60,
      body:
        'Black goats and fat-tailed sheep, brought in at night behind a ring of dry-stone walling '
        + 'and let out onto the slope by day. Galilee’s flocks were mixed like this, and the '
        + 'shepherd knew them apart — which is the picture behind the sheep and the goats at the '
        + 'judgement, and behind the shepherd who is also the door of the fold.',
      refs: ['John 10:1-16', 'Matthew 25:31-33', 'Luke 15:3-7'],
    },
    {
      id: 'the-harvest',
      label: 'The Harvest',
      position: [-46, 10, 168],
      maxDistance: 260,
      body:
        'Late spring: the barley already cut, the wheat on the slope going from green to gold, and '
        + 'a threshing floor with the sheaves piled round it waiting for an evening wind to winnow '
        + 'the grain. It was through fields like these, on a sabbath, that the disciples plucked '
        + 'heads of grain as they walked. The harvest is plentiful, he said, but the labourers few.',
      refs: ['Mark 2:23-28', 'Matthew 9:37-38', 'Mark 4:26-29'],
    },
    {
      id: 'arbel',
      label: 'Mount Arbel',
      // On the skyline, not in the village: at Arbel's true bearing (228.5°)
      // in the horizon band capernaumLandscape.js draws it in.
      landmark: true,
      position: [-706, 34, -626],
      maxDistance: 1400,
      body:
        'The wedge on the south-western skyline, nine kilometres off, with its sheer cliff seen '
        + 'almost edge on. Josephus tells how Herod the Great, in 38 BC, had soldiers lowered down '
        + 'that face in chests to burn out the brigands hiding in its caves. Below it the Valley of '
        + 'the Doves climbs west toward the hills of Lower Galilee — one likely way down from '
        + 'Nazareth to this shore, whichever road Jesus took when he left Nazareth and made his '
        + 'home here.',
      refs: ['Matthew 4:12-16', 'Luke 4:31'],
    },
    {
      id: 'the-far-shore',
      label: 'The Other Side',
      // The Golan wall above Kursi, at Kursi's true bearing from here (130.8°,
      // 9.3 km), in the horizon band.
      landmark: true,
      position: [833, 30, -719],
      maxDistance: 1400,
      body:
        'Across the water, the long wall of the Golan: gentile ground, the country Mark calls the '
        + 'Gerasenes’ and Matthew the Gadarenes’, where a man who lived among the tombs met Jesus '
        + 'and the herd ran down the steep bank into the lake. Since Origen, tradition has put it '
        + 'below the cliffs at Kursi, across the water to the south-east. On the mesa further south '
        + 'stood Hippos, one of the Greek cities of the Decapolis, where the healed man went '
        + 'telling what had been done for him.',
      refs: ['Mark 5:1-20', 'Mark 4:35', 'Matthew 8:28-34'],
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
