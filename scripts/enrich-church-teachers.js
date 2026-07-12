/* global process */
// One-off enrichment for src/assets/church-teachers.json: adds `kind`
// ('person' | 'council' | 'creed'), `infl` (influenced-by slugs within the
// set), `bib` (Bible Wiki slugs of figures the teacher especially taught
// from), `q` (short public-domain quotes [{q, src}]), and appends creed /
// confession entries. Idempotent — safe to re-run; it overwrites the enriched
// fields and skips creeds that already exist.

import fs from 'fs';
import path from 'path';

const FILE = path.resolve(process.cwd(), 'src/assets/church-teachers.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const INFLUENCE = {
  polycarp: ['ignatius-of-antioch'],
  irenaeus: ['polycarp', 'justin-martyr'],
  'gregory-of-nazianzus': ['origen', 'athanasius'],
  'basil-the-great': ['origen'],
  'gregory-of-nyssa': ['basil-the-great'],
  'augustine-of-hippo': ['ambrose'],
  'gregory-the-great': ['augustine-of-hippo'],
  anselm: ['augustine-of-hippo'],
  'bernard-of-clairvaux': ['augustine-of-hippo'],
  'thomas-aquinas': ['augustine-of-hippo', 'john-of-damascus'],
  'john-wycliffe': ['augustine-of-hippo'],
  'jan-hus': ['john-wycliffe'],
  'william-tyndale': ['john-wycliffe', 'martin-luther'],
  'martin-luther': ['augustine-of-hippo', 'jan-hus'],
  'john-calvin': ['augustine-of-hippo', 'martin-luther'],
  'thomas-cranmer': ['martin-luther'],
  'menno-simons': ['martin-luther'],
  'john-knox': ['john-calvin'],
  'john-bunyan': ['martin-luther'],
  'john-owen': ['john-calvin'],
  'jonathan-edwards': ['john-calvin', 'john-owen'],
  'john-wesley': ['thomas-a-kempis', 'martin-luther'],
  'george-whitefield': ['john-wesley'],
  'william-carey': ['jonathan-edwards'],
  'charles-spurgeon': ['john-bunyan', 'john-calvin'],
  'dietrich-bonhoeffer': ['martin-luther'],
};

const BIB = {
  polycarp: ['john_1676'],
  irenaeus: ['john_1676', 'paul_2479'],
  'john-chrysostom': ['paul_2479'],
  'augustine-of-hippo': ['paul_2479', 'david_994'],
  jerome: ['moses_2108', 'paul_2479'],
  'martin-luther': ['paul_2479', 'david_994'],
  'john-calvin': ['paul_2479'],
  'john-bunyan': ['paul_2479'],
  'jonathan-edwards': ['paul_2479'],
  'charles-spurgeon': ['david_994', 'paul_2479'],
  'william-carey': ['isaiah_617'],
  athanasius: ['john_1676'],
};

const QUOTES = {
  'clement-of-rome': [{ q: 'Let us fix our gaze on the blood of Christ, and know that it is precious to His Father, because it was poured out for our salvation.', src: '1 Clement 7' }],
  'ignatius-of-antioch': [{ q: 'I am the wheat of God, and let me be ground by the teeth of the wild beasts, that I may be found the pure bread of Christ.', src: 'Letter to the Romans 4' }],
  polycarp: [{ q: 'Eighty and six years have I served Him, and He never did me any injury: how then can I blaspheme my King and my Saviour?', src: 'Martyrdom of Polycarp 9' }],
  'justin-martyr': [{ q: 'We who formerly hated and destroyed one another now live together and pray for our enemies.', src: 'First Apology 14 (paraphrased)' }],
  irenaeus: [{ q: 'The glory of God is a living man; and the life of man consists in beholding God.', src: 'Against Heresies IV.20.7' }],
  tertullian: [{ q: 'The blood of the martyrs is the seed of the Church.', src: 'Apology 50 (traditional wording)' }],
  origen: [{ q: 'The Scriptures were written by the Spirit of God, and have a meaning not only such as is apparent at first sight, but also another which escapes the notice of most.', src: 'On First Principles, preface' }],
  athanasius: [{ q: 'He was made man that we might be made partakers of the divine nature.', src: 'On the Incarnation 54' }],
  'augustine-of-hippo': [
    { q: 'You have made us for Yourself, O Lord, and our heart is restless until it rests in You.', src: 'Confessions I.1' },
    { q: 'To fall in love with God is the greatest romance; to seek Him the greatest adventure; to find Him, the greatest human achievement.', src: 'attributed' },
  ],
  'john-chrysostom': [{ q: 'The ignorance of Scripture is the cause of all evils.', src: 'Homilies on Colossians (paraphrased)' }],
  jerome: [{ q: 'Ignorance of the Scriptures is ignorance of Christ.', src: 'Commentary on Isaiah, prologue' }],
  'patrick-of-ireland': [{ q: 'Christ with me, Christ before me, Christ behind me, Christ in me, Christ beneath me, Christ above me.', src: "Saint Patrick's Breastplate (traditional)" }],
  anselm: [{ q: 'I do not seek to understand that I may believe, but I believe in order to understand.', src: 'Proslogion 1' }],
  'bernard-of-clairvaux': [{ q: 'Jesus, the very thought of Thee with sweetness fills the breast.', src: 'attributed hymn' }],
  'thomas-aquinas': [{ q: 'To one who has faith, no explanation is necessary. To one without faith, no explanation is possible.', src: 'attributed' }],
  'thomas-a-kempis': [{ q: 'Without the Way, there is no going; without the Truth, there is no knowing; without the Life, there is no living.', src: 'The Imitation of Christ III.56' }],
  'william-tyndale': [{ q: 'If God spare my life, ere many years I will cause a boy that driveth the plough shall know more of the Scripture than thou dost.', src: 'to a clergyman, as reported by Foxe' }],
  'martin-luther': [
    { q: 'My conscience is captive to the Word of God... Here I stand, I can do no other. God help me. Amen.', src: 'Diet of Worms, 1521 (traditional wording)' },
    { q: 'We are saved by faith alone, but the faith that saves is never alone.', src: 'attributed' },
  ],
  'john-calvin': [{ q: 'My heart I offer to you, Lord, promptly and sincerely.', src: 'personal motto' }],
  'john-knox': [{ q: 'A man with God is always in the majority.', src: 'attributed' }],
  'john-bunyan': [{ q: 'As I walked through the wilderness of this world, I lighted on a certain place where was a den, and laid me down in that place to sleep; and as I slept, I dreamed a dream.', src: "The Pilgrim's Progress, opening" }],
  'john-owen': [{ q: 'Be killing sin or it will be killing you.', src: 'Of the Mortification of Sin' }],
  'richard-baxter': [{ q: 'I preached as never sure to preach again, and as a dying man to dying men.', src: 'Poetical Fragments' }],
  'jonathan-edwards': [{ q: 'Resolved: that all men should live for the glory of God. Resolved second: that whether others do or not, I will.', src: 'Resolutions (paraphrased)' }],
  'john-wesley': [{ q: 'I look upon all the world as my parish.', src: 'Journal, 11 June 1739' }],
  'george-whitefield': [{ q: 'I am content to wait till the day of judgment for the clearing up of my reputation; and after I am dead I desire no other epitaph than this, "Here lies G.W. What sort of man he was the great day will discover."', src: 'letter, 1753' }],
  'william-carey': [{ q: 'Expect great things from God; attempt great things for God.', src: 'sermon at Nottingham, 1792' }],
  'charles-spurgeon': [
    { q: 'I have learned to kiss the wave that throws me against the Rock of Ages.', src: 'attributed' },
    { q: 'Visit many good books, but live in the Bible.', src: 'attributed' },
  ],
  'hudson-taylor': [{ q: "God's work done in God's way will never lack God's supply.", src: 'attributed' }],
  'dietrich-bonhoeffer': [{ q: 'When Christ calls a man, he bids him come and die.', src: 'The Cost of Discipleship' }],
  'cs-lewis': [{ q: 'I believe in Christianity as I believe that the sun has risen: not only because I see it, but because by it I see everything else.', src: 'Is Theology Poetry?' }],
  'aw-tozer': [{ q: 'What comes into our minds when we think about God is the most important thing about us.', src: 'The Knowledge of the Holy' }],
  'billy-graham': [{ q: 'My home is in Heaven. I\'m just traveling through this world.', src: 'attributed' }],
};

const CREEDS = [
  {
    s: 'apostles-creed', n: "The Apostles' Creed", y: [150, 700], era: 'Early Church', region: 'Western church',
    kind: 'creed', trad: 'Baptismal confession of the Western church',
    sum: "The oldest and simplest summary of the Christian faith, grown from the baptismal confessions of the early Roman church. In a few lines it walks through Father, Son, and Holy Spirit — creation, the story of Jesus from conception to return, and the church's shared hope. Not written by the apostles themselves, but so called because it summarizes their teaching.",
    ideas: ['God the Father, maker of heaven and earth', 'The true story of Jesus: born, crucified, risen, returning', 'The Holy Spirit, the church, forgiveness, resurrection'],
    refs: ['1 Corinthians 15:3-4', 'Matthew 28:19', 'Romans 10:9'],
  },
  {
    s: 'nicene-creed', n: 'The Nicene Creed', y: [325, 381], era: 'Nicene Era', region: 'Nicaea & Constantinople',
    kind: 'creed', trad: 'The ecumenical confession of the deity of Christ',
    sum: "Forged at the councils of Nicaea (325) and Constantinople (381) against teachers who made the Son a creature, this creed confesses Jesus Christ as 'true God from true God, begotten not made, of one being with the Father.' It remains the one confession shared by nearly every Christian tradition on earth.",
    ideas: ['The Son is of one being (homoousios) with the Father', 'The Holy Spirit is Lord and giver of life, worshiped with Father and Son', 'One baptism for the forgiveness of sins'],
    refs: ['John 1:1-3', 'Colossians 1:15-20', 'Hebrews 1:3'],
  },
  {
    s: 'definition-of-chalcedon', n: 'The Definition of Chalcedon', y: [451, 451], era: 'Nicene Era', region: 'Chalcedon',
    kind: 'creed', trad: 'The classic statement of Christ as one person in two natures',
    sum: "The council of Chalcedon's answer to a century of confusion about how Jesus can be both God and man: one person in two natures, 'without confusion, without change, without division, without separation.' Fully God, fully man, one Christ — the guardrails inside which all faithful talk about Jesus still runs.",
    ideas: ['One person, two natures — truly God and truly man', 'The natures are neither blended nor separated', 'Mary is rightly called God-bearer (Theotokos) because her son is God the Son'],
    refs: ['John 1:14', 'Philippians 2:5-11', 'Hebrews 4:15'],
  },
  {
    s: 'heidelberg-catechism', n: 'The Heidelberg Catechism', y: [1563, 1563], era: 'Reformation', region: 'Heidelberg, Germany',
    kind: 'creed', trad: 'Reformed catechism of comfort',
    sum: "A warm, pastoral question-and-answer summary of the faith, written for churches and schools of the Palatinate. Its famous first question sets the tone: 'What is your only comfort in life and in death? That I am not my own, but belong — body and soul, in life and in death — to my faithful Savior, Jesus Christ.'",
    ideas: ['Guilt, grace, gratitude — the shape of the Christian life', 'Comfort rooted in belonging to Christ', 'The catechism as a tool for teaching households the faith'],
    refs: ['1 Corinthians 6:19-20', 'Romans 8:1', 'Romans 14:7-9'],
  },
  {
    s: 'westminster-confession', n: 'The Westminster Confession of Faith', y: [1646, 1646], era: 'Post-Reformation', region: 'Westminster, England',
    kind: 'creed', trad: 'The definitive Reformed confession in English',
    sum: "Drawn up by the Westminster Assembly during the English civil war, this confession became the doctrinal standard of Presbyterian churches worldwide. It opens not with God but with Scripture — the rule by which everything else is measured — and its Shorter Catechism taught generations that 'man's chief end is to glorify God, and to enjoy him forever.'",
    ideas: ["Scripture as the supreme rule of faith and life", "God's sovereign covenant of grace", "Man's chief end: to glorify God and enjoy Him forever"],
    refs: ['2 Timothy 3:16-17', 'Romans 11:36', 'Psalm 73:25-26'],
  },
  {
    s: 'london-baptist-confession-1689', n: 'The 1689 London Baptist Confession', y: [1689, 1689], era: 'Post-Reformation', region: 'London, England',
    kind: 'creed', trad: 'The historic confession of Particular Baptist churches',
    sum: "When toleration finally came to England, the Particular Baptists published the confession their churches had quietly shared for years — deliberately tracking the Westminster Confession to show their unity with Reformed Christians, while confessing believer's baptism and the local church gathered by covenant. It remains the doctrinal root of many Baptist churches today.",
    ideas: ["Believer's baptism by immersion", 'The gathered local church under Christ its head', 'Reformed doctrine held in Baptist form'],
    refs: ['Romans 6:3-4', 'Acts 2:41-42', 'Ephesians 4:4-6'],
  },
];

const bySlug = new Map(data.teachers.map((t) => [t.s, t]));
for (const t of data.teachers) {
  if (t.s.includes('council-of')) t.kind = 'council';
  else if (!t.kind) t.kind = 'person';
  const infl = INFLUENCE[t.s];
  if (infl) t.infl = infl.filter((s) => bySlug.has(s));
  const bib = BIB[t.s];
  if (bib) t.bib = bib;
  const q = QUOTES[t.s];
  if (q) t.q = q;
}

let added = 0;
for (const creed of CREEDS) {
  if (bySlug.has(creed.s)) {
    Object.assign(bySlug.get(creed.s), creed);
  } else {
    data.teachers.push(creed);
    added += 1;
  }
}

const badInfl = data.teachers.flatMap((t) => (t.infl || []).filter((s) => !data.teachers.some((x) => x.s === s)));
if (badInfl.length) throw new Error(`Unknown influence slugs: ${badInfl.join(', ')}`);

fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Enriched ${data.teachers.length} entries (${added} creeds added).`);
