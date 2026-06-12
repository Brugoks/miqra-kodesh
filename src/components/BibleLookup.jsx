import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, X, Search, Loader2, Copy, Check, Languages, ChevronDown, ChevronUp } from 'lucide-react';
import './BibleLookup.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const TRANSLATIONS = [
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB', style: 'formal',  styleLabel: 'Word-for-Word' },
  { id: 'a556c5305ee15c3f-01', label: 'CSB',  style: 'optimal', styleLabel: 'Balanced' },
  { id: 'd6e14a625393b4da-01', label: 'NLT',  style: 'dynamic', styleLabel: 'Thought-for-Thought' },
];

const BOOK_ABBR = {
  'genesis': 'GEN', 'gen': 'GEN', 'exodus': 'EXO', 'ex': 'EXO', 'exo': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV', 'numbers': 'NUM', 'num': 'NUM',
  'deuteronomy': 'DEU', 'deut': 'DEU', 'deu': 'DEU',
  'joshua': 'JOS', 'jos': 'JOS', 'judges': 'JDG', 'jdg': 'JDG',
  'ruth': 'RUT', 'rut': 'RUT',
  '1 samuel': '1SA', '1sa': '1SA', '2 samuel': '2SA', '2sa': '2SA',
  '1 kings': '1KI', '1ki': '1KI', '2 kings': '2KI', '2ki': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH',
  'ezra': 'EZR', 'nehemiah': 'NEH', 'esther': 'EST', 'job': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'ecclesiastes': 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA', 'jeremiah': 'JER', 'jer': 'JER',
  'lamentations': 'LAM', 'ezekiel': 'EZK', 'ezek': 'EZK', 'daniel': 'DAN', 'dan': 'DAN',
  'hosea': 'HOS', 'joel': 'JOL', 'amos': 'AMO', 'obadiah': 'OBA',
  'jonah': 'JON', 'micah': 'MIC', 'nahum': 'NAM', 'habakkuk': 'HAB',
  'zephaniah': 'ZEP', 'haggai': 'HAG', 'zechariah': 'ZEC', 'malachi': 'MAL',
  'matthew': 'MAT', 'mat': 'MAT', 'mark': 'MRK', 'mrk': 'MRK', 'mk': 'MRK',
  'luke': 'LUK', 'luk': 'LUK', 'lk': 'LUK', 'john': 'JHN', 'jhn': 'JHN', 'jn': 'JHN',
  'acts': 'ACT', 'act': 'ACT', 'romans': 'ROM', 'rom': 'ROM',
  '1 corinthians': '1CO', '1co': '1CO', '2 corinthians': '2CO', '2co': '2CO',
  'galatians': 'GAL', 'gal': 'GAL', 'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'colossians': 'COL', 'col': 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', 'titus': 'TIT', 'philemon': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB', 'james': 'JAS', 'jas': 'JAS',
  '1 peter': '1PE', '2 peter': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN',
  'jude': 'JUD', 'revelation': 'REV', 'revelations': 'REV', 'rev': 'REV',
};

const NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
]);

// Curated Hebrew/Greek concordance for key theological words.
// H = Old Testament Hebrew entries, G = New Testament Greek entries.
// { id, s (script), x (transliteration), d (definition) }
const WORD_STRONGS = {
  love:         { H:[{id:'H157',s:'אָהַב',x:'ʾāhab',d:'To love, have deep affection for — used of God\'s love for Israel, human love for God and neighbor.'},{id:'H2617',s:'חֶסֶד',x:'ḥesed',d:'Steadfast love, covenant loyalty, lovingkindness — the faithful, unfailing commitment of God to his people.'}], G:[{id:'G26',s:'ἀγάπη',x:'agápē',d:'Unconditional, self-giving love — God\'s own love poured out, the kind celebrated in 1 Corinthians 13.'},{id:'G5368',s:'φιλέω',x:'philéō',d:'Warm affection, friendship love — tender fondness between close companions.'}] },
  grace:        { H:[{id:'H2580',s:'חֵן',x:'ḥēn',d:'Favor, grace — unearned kindness shown by someone greater toward someone lesser.'}], G:[{id:'G5485',s:'χάρις',x:'cháris',d:'Grace, favor — God\'s free, undeserved gift and goodwill toward sinners; the foundation of salvation.'}] },
  mercy:        { H:[{id:'H7356',s:'רַחֲמִים',x:'raḥamîm',d:'Tender mercies, compassion — deep, womb-like affection; God\'s parental heart for his people.'},{id:'H2617',s:'חֶסֶד',x:'ḥesed',d:'Steadfast lovingkindness — faithful covenant mercy that never fails.'}], G:[{id:'G1656',s:'ἔλεος',x:'éleos',d:'Mercy, compassion — God\'s active pity and lovingkindness shown to the undeserving.'}] },
  faith:        { H:[{id:'H530',s:'אֱמוּנָה',x:'ʾĕmûnāh',d:'Faithfulness, steadfastness, reliability — the Habakkuk 2:4 word: "the righteous shall live by his faithfulness."'}], G:[{id:'G4102',s:'πίστις',x:'pístis',d:'Faith, trust, belief — complete reliance on God and his promises; saving faith in Christ.'}] },
  hope:         { H:[{id:'H6960',s:'קָוָה',x:'qāwāh',d:'To wait for, hope in, expect — an active, confident expectation; Isaiah 40:31 "those who wait on the LORD."'},{id:'H8615',s:'תִּקְוָה',x:'tiqwāh',d:'Hope, expectation — the cord of hope; what Rahab hung in her window (Joshua 2:18).'}], G:[{id:'G1680',s:'ἐλπίς',x:'elpís',d:'Hope, confident expectation — not wishful thinking but certain assurance in what God has promised.'}] },
  peace:        { H:[{id:'H7965',s:'שָׁלוֹם',x:'šālôm',d:'Peace, wholeness, completeness, well-being — not merely absence of conflict but total flourishing in right relationship.'}], G:[{id:'G1515',s:'εἰρήνη',x:'eirḗnē',d:'Peace, harmony — the tranquility that comes from being reconciled to God (Romans 5:1).'}] },
  holy:         { H:[{id:'H6918',s:'קָדוֹשׁ',x:'qādôš',d:'Holy, set apart, sacred — the defining characteristic of God; utterly distinct and morally pure.'},{id:'H6942',s:'קָדַשׁ',x:'qāḏaš',d:'To be holy, consecrate, sanctify — the verb form; to set apart for God\'s purposes.'}], G:[{id:'G40',s:'ἅγιος',x:'hágios',d:'Holy, set apart, consecrated — belonging to God; the Spirit is the Holy Spirit (hagios pneuma).'}] },
  righteousness:{ H:[{id:'H6664',s:'צֶדֶק',x:'ṣeḏeq',d:'Righteousness, justice — conformity to God\'s standard; doing what is right in his eyes.'},{id:'H6666',s:'צְדָקָה',x:'ṣĕḏāqāh',d:'Righteous acts, saving justice — God\'s righteousness expressed in acts of deliverance and vindication.'}], G:[{id:'G1343',s:'δικαιοσύνη',x:'dikaiosýnē',d:'Righteousness, justification — right standing before God; in Paul, the righteousness God gives through faith.'}] },
  righteous:    { H:[{id:'H6662',s:'צַדִּיק',x:'ṣaddîq',d:'Righteous, just, innocent — the person who is in right standing with God and lives accordingly.'}], G:[{id:'G1342',s:'δίκαιος',x:'díkaios',d:'Righteous, just, upright — the one who does what is right; Jesus is called the Righteous One.'}] },
  glory:        { H:[{id:'H3519',s:'כָּבוֹד',x:'kāḇôḏ',d:'Glory, honor, weight, splendor — the palpable, visible presence and majesty of God; the shekinah.'}], G:[{id:'G1391',s:'δόξα',x:'dóxa',d:'Glory, splendor, honor — the radiant divine majesty; to "glorify" is to display or acknowledge God\'s true worth.'}] },
  salvation:    { H:[{id:'H3444',s:'יְשׁוּעָה',x:'yĕšûʿāh',d:'Salvation, deliverance, victory — the name Yeshua/Jesus literally means "YHWH saves."'},{id:'H3467',s:'יָשַׁע',x:'yāšaʿ',d:'To save, deliver, rescue — the verb root shared with the names Joshua and Jesus.'}], G:[{id:'G4991',s:'σωτηρία',x:'sōtēría',d:'Salvation, rescue, deliverance — the comprehensive work of God rescuing humanity from sin, death, and judgment.'}] },
  sin:          { H:[{id:'H2403',s:'חַטָּאת',x:'ḥaṭṭāʾṯ',d:'Sin, sin offering — the most common OT word for sin; to miss the mark or deviate from the path.'},{id:'H5771',s:'עָוֹן',x:'ʿāwôn',d:'Iniquity, guilt, punishment — the twisting or bending away from God\'s way; deeper guilt and its consequences.'}], G:[{id:'G266',s:'ἁμαρτία',x:'hamartía',d:'Sin — literally "missing the mark"; falling short of God\'s standard; the condition and act of rebellion against God.'}] },
  repent:       { H:[{id:'H7725',s:'שׁוּב',x:'šûḇ',d:'To return, turn back, repent — the OT\'s dominant word for repentance: turning away from sin and back to God.'}], G:[{id:'G3340',s:'μετανοέω',x:'metanoéō',d:'To repent, change one\'s mind — a genuine transformation of thinking and direction; not just regret but reorientation.'}] },
  forgiveness:  { H:[{id:'H5547',s:'סְלִיחָה',x:'sĕlîḥāh',d:'Forgiveness, pardon — used only of divine forgiveness; God alone grants this kind of full pardon.'},{id:'H5375',s:'נָשָׂא',x:'nāśāʾ',d:'To lift up, carry away, forgive — God "lifting" sin away from the sinner and bearing it himself.'}], G:[{id:'G859',s:'ἄφεσις',x:'áphesis',d:'Forgiveness, release, pardon — the release from guilt and its penalty; freedom from the debt of sin.'}] },
  covenant:     { H:[{id:'H1285',s:'בְּרִית',x:'bĕrîṯ',d:'Covenant, treaty, binding agreement — the foundational structure of God\'s relationship with humanity; the Mosaic, Abrahamic, Davidic, and New Covenants.'}], G:[{id:'G1242',s:'διαθήκη',x:'diathḗkē',d:'Covenant, testament, will — the New Covenant sealed in Christ\'s blood at the Last Supper (Luke 22:20).'}] },
  spirit:       { H:[{id:'H7307',s:'רוּחַ',x:'rûaḥ',d:'Spirit, wind, breath — God\'s own Spirit; also the breath of life and the human spirit; the same word in Genesis 1:2.'}], G:[{id:'G4151',s:'πνεῦμα',x:'pneûma',d:'Spirit, breath, wind — the Holy Spirit (pneuma hagion); also the human spirit; the animating principle of life.'}] },
  truth:        { H:[{id:'H571',s:'אֱמֶת',x:'ʾĕmeṯ',d:'Truth, faithfulness, reliability — not merely factual accuracy but trustworthy, dependable reality; God himself is emet.'}], G:[{id:'G225',s:'ἀλήθεια',x:'alḗtheia',d:'Truth, reality — what is real and genuine; Jesus says "I am the way, the truth, and the life" (John 14:6).'}] },
  wisdom:       { H:[{id:'H2451',s:'חָכְמָה',x:'ḥoḵmāh',d:'Wisdom, skill — practical insight for living; personified as Lady Wisdom in Proverbs; the skill of living well before God.'}], G:[{id:'G4678',s:'σοφία',x:'sophía',d:'Wisdom, insight — divinely given understanding; Christ is called the wisdom of God (1 Corinthians 1:24).'}] },
  word:         { H:[{id:'H1697',s:'דָּבָר',x:'dāḇār',d:'Word, matter, thing — the spoken word of God; the "dabar" of the LORD that came to the prophets.'}], G:[{id:'G3056',s:'λόγος',x:'lógos',d:'Word, Reason, Message — the eternal Logos of John 1:1; not just speech but the mind of God expressed and incarnate.'},{id:'G4487',s:'ῥῆμα',x:'rhḗma',d:'Word, saying, utterance — a specific spoken word; "Man shall not live by bread alone, but by every rhema from God."'}] },
  prayer:       { H:[{id:'H8605',s:'תְּפִלָּה',x:'tĕp̄illāh',d:'Prayer, intercession — the standard OT noun for prayer; the Psalms are filled with tephillah.'},{id:'H6419',s:'פָּלַל',x:'pālal',d:'To pray, intercede, judge — the verb for prayer; to put oneself in right relationship through appeal to God.'}], G:[{id:'G4335',s:'προσευχή',x:'proseuchḗ',d:'Prayer, intercession — the most common NT word for prayer; always directed to God; devotion and communication with the Father.'}] },
  heart:        { H:[{id:'H3820',s:'לֵב',x:'lēḇ',d:'Heart, mind, inner being — the center of thinking, willing, and feeling; the "heart" God searches (Jer 17:10).'}], G:[{id:'G2588',s:'καρδία',x:'kardía',d:'Heart — the whole inner person: mind, will, emotions; "Love the Lord your God with all your heart."'}] },
  soul:         { H:[{id:'H5315',s:'נֶפֶשׁ',x:'nepeš',d:'Soul, being, life, person — the whole living person; "love the LORD your God with all your soul (nephesh)."'}], G:[{id:'G5590',s:'ψυχή',x:'psychḗ',d:'Soul, life, self — the inner life of a person; Jesus gave his psyche as a ransom for many (Matthew 20:28).'}] },
  life:         { H:[{id:'H2416',s:'חַי',x:'ḥay',d:'Living, life, alive — vitality and existence; the "tree of life" (etz chayyim) in Genesis.'}], G:[{id:'G2222',s:'ζωή',x:'zōḗ',d:'Life — specifically divine, eternal life; John uses this word constantly to describe the life Jesus gives (John 10:10).'}] },
  light:        { H:[{id:'H216',s:'אוֹר',x:'ʾôr',d:'Light — God\'s first creative act; also used of wisdom, salvation, and the presence of God (Psalm 27:1).'}], G:[{id:'G5457',s:'φῶς',x:'phôs',d:'Light — Christ is the phos of the world (John 8:12); believers are called to be lights in the world.'}] },
  darkness:     { H:[{id:'H2822',s:'חֹשֶׁךְ',x:'ḥōšeḵ',d:'Darkness — the chaos before creation; also spiritual blindness, evil, and the absence of God\'s presence.'}], G:[{id:'G4655',s:'σκότος',x:'skótos',d:'Darkness — spiritual blindness and moral evil; the realm opposed to the light of Christ.'}] },
  lord:         { H:[{id:'H3068',s:'יְהוָה',x:'YHWH',d:'The LORD — the personal covenant name of God; so holy it was not pronounced; rendered LORD in most English Bibles.'},{id:'H136',s:'אֲדֹנָי',x:'ʾăḏōnāy',d:'Lord, Master, Sovereign — used in place of YHWH when reading; also a divine title in its own right.'}], G:[{id:'G2962',s:'κύριος',x:'kýrios',d:'Lord, Master — the Greek equivalent of YHWH; applied to Jesus as a declaration of his divine lordship.'}] },
  god:          { H:[{id:'H430',s:'אֱלֹהִים',x:'ʾĕlōhîm',d:'God — the plural-form word for the one God; used for the Trinitarian God from Genesis 1:1 onward.'},{id:'H410',s:'אֵל',x:'ʾēl',d:'God, mighty one, powerful — the fundamental Semitic word for deity; El Shaddai, El Elyon, etc.'}], G:[{id:'G2316',s:'θεός',x:'theós',d:'God — the divine being; used for the Father and applied to Jesus (John 1:1, 20:28).'}] },
  glory:        { H:[{id:'H3519',s:'כָּבוֹד',x:'kāḇôḏ',d:'Glory, honor, weight, splendor — the palpable, visible presence and majesty of God; the shekinah.'}], G:[{id:'G1391',s:'δόξα',x:'dóxa',d:'Glory, splendor, honor — the radiant divine majesty; to "glorify" is to display God\'s true worth.'}] },
  holy:         { H:[{id:'H6918',s:'קָדוֹשׁ',x:'qādôš',d:'Holy, set apart, sacred — the defining character of God; utterly distinct and morally pure.'}], G:[{id:'G40',s:'ἅγιος',x:'hágios',d:'Holy, set apart, consecrated — belonging to God entirely.'}] },
  praise:       { H:[{id:'H1984',s:'הָלַל',x:'hālal',d:'To praise, boast, shine — root of "Hallelujah" (Praise the LORD); exuberant, joyful celebration of God.'},{id:'H8416',s:'תְּהִלָּה',x:'tĕhillāh',d:'Praise, song of praise — the title of the Psalms in Hebrew is Tehillim; our praises enthroned upon.'}], G:[{id:'G134',s:'αἰνέω',x:'ainéō',d:'To praise — lifting up worship to God; the angels praise (ainéō) God in Luke 2:13.'},{id:'G1867',s:'ἐπαινέω',x:'epainéō',d:'To praise, commend — to declare someone\'s worth and honor publicly.'}] },
  worship:      { H:[{id:'H7812',s:'שָׁחָה',x:'šāḥāh',d:'To bow down, worship, prostrate — the physical act expressing total submission and reverence before God.'}], G:[{id:'G4352',s:'προσκυνέω',x:'proskynéō',d:'To worship, bow before — to fall face-down in reverence; used of worship given to Jesus in the Gospels.'}] },
  fear:         { H:[{id:'H3374',s:'יִרְאָה',x:'yirʾāh',d:'Fear, reverence, awe — "the fear of the LORD is the beginning of wisdom" (Proverbs 9:10); holy reverence, not terror.'}], G:[{id:'G5401',s:'φόβος',x:'phóbos',d:'Fear, reverence, awe — can be terror, but also the reverential awe owed to God (Acts 9:31).'}] },
  trust:        { H:[{id:'H982',s:'בָּטַח',x:'bāṭaḥ',d:'To trust, rely on, feel secure — "Trust in the LORD with all your heart" (Proverbs 3:5); confident reliance.'}], G:[{id:'G4100',s:'πιστεύω',x:'pisteúō',d:'To believe, trust, entrust — the verb form of pistis; to place complete confidence in Jesus.'}] },
  believe:      { H:[{id:'H539',s:'אָמַן',x:'ʾāman',d:'To believe, trust, be faithful — root of "amen"; Abraham "believed (aman) God and it was counted to him as righteousness."'}], G:[{id:'G4100',s:'πιστεύω',x:'pisteúō',d:'To believe, trust — John\'s key word for saving faith; used nearly 100 times in John\'s Gospel.'}] },
  eternal:      { H:[{id:'H5769',s:'עוֹלָם',x:'ʿôlām',d:'Eternal, forever, age — everlasting duration; used of God\'s covenant love lasting "forever."'}], G:[{id:'G166',s:'αἰώνιος',x:'aiṓnios',d:'Eternal, everlasting — the life of the coming age; "eternal life" (zōē aiōnios) is the great promise of the NT.'}] },
  kingdom:      { H:[{id:'H4467',s:'מַמְלָכָה',x:'mamlāḵāh',d:'Kingdom, realm, reign — the domain of a king; the hope for God\'s kingdom fills the prophets.'}], G:[{id:'G932',s:'βασιλεία',x:'basileía',d:'Kingdom, reign — "the kingdom of God" is the central message of Jesus; God\'s sovereign rule breaking into history.'}] },
  gospel:       { G:[{id:'G2098',s:'εὐαγγέλιον',x:'euangelíon',d:'Gospel, good news — the announcement of victory; originally a herald\'s cry after a battle; here: the news that Christ has conquered sin and death.'}] },
  church:       { G:[{id:'G1577',s:'ἐκκλησία',x:'ekklēsía',d:'Church, assembly, congregation — literally "the called-out ones"; the community of those gathered by God.'}] },
  baptism:      { G:[{id:'G908',s:'βάπτισμα',x:'báptisma',d:'Baptism — immersion in water; the outward sign of inward transformation and identification with Christ\'s death and resurrection.'}] },
  resurrection: { G:[{id:'G386',s:'ἀνάστασις',x:'anástasis',d:'Resurrection — the rising up from death; the bodily resurrection of Jesus is the cornerstone of Christian faith (1 Cor 15:14).'}] },
  redemption:   { H:[{id:'H1350',s:'גָּאַל',x:'gāʾal',d:'To redeem as kinsman-redeemer — the "goel" who buys back what was lost; Ruth and Boaz; God as Israel\'s Redeemer.'},{id:'H6299',s:'פָּדָה',x:'pāḏāh',d:'To redeem, ransom — to buy out of slavery or danger; God ransomed Israel from Egypt.'}], G:[{id:'G629',s:'ἀπολύτρωσις',x:'apolytrōsis',d:'Redemption, ransom, release — the payment that frees from bondage; Christ\'s blood as the ransom price.'}] },
  atonement:    { H:[{id:'H3722',s:'כָּפַר',x:'kāp̄ar',d:'To atone, cover, make propitiation — the Day of Atonement (Yom Kippur) verb; God covers sin through sacrifice.'}], G:[{id:'G2435',s:'ἱλαστήριον',x:'hilastḗrion',d:'Propitiation, mercy seat — the cover of the Ark where blood was sprinkled; Paul applies this word to Jesus in Romans 3:25.'}] },
  sacrifice:    { H:[{id:'H2077',s:'זֶבַח',x:'zeḇaḥ',d:'Sacrifice, offering — the slaughter offering; the whole system of sacrifices pointing forward to Christ.'}], G:[{id:'G2378',s:'θυσία',x:'thysía',d:'Sacrifice, offering — used of Christ\'s self-offering; "a fragrant offering and sacrifice to God" (Ephesians 5:2).'}] },
  joy:          { H:[{id:'H8057',s:'שִׂמְחָה',x:'śimḥāh',d:'Joy, gladness, rejoicing — the deep contentment and celebration that comes from being in right relationship with God.'}], G:[{id:'G5479',s:'χαρά',x:'chará',d:'Joy, gladness — a delight that goes deeper than circumstances; "the joy of the LORD is your strength" (Nehemiah 8:10, LXX).'}] },
  suffering:    { H:[{id:'H6040',s:'עֳנִי',x:'ʿŏnî',d:'Suffering, affliction, poverty — the oppressed condition; God sees the affliction (onî) of his people.'}], G:[{id:'G3804',s:'πάθημα',x:'páthēma',d:'Suffering, passion — the sufferings of Christ; Paul links believers\' sufferings to sharing in Christ\'s.'}] },
  power:        { H:[{id:'H1369',s:'גְּבוּרָה',x:'gĕḇûrāh',d:'Power, might, heroic strength — the warrior power of God; the mighty acts (gevurot) of the LORD.'},{id:'H3581',s:'כֹּחַ',x:'kōaḥ',d:'Strength, power, ability — the energy and capacity to act; God\'s power that renews the weary.'}], G:[{id:'G1411',s:'δύναμις',x:'dýnamis',d:'Power, might, miracle — the supernatural ability of God; root of "dynamite"; "the power of God for salvation" (Romans 1:16).'}] },
  strength:     { H:[{id:'H5797',s:'עֹז',x:'ʿōz',d:'Strength, might, power — "The LORD is my strength and my song" (Exodus 15:2); defensive and sustaining power.'}], G:[{id:'G2479',s:'ἰσχύς',x:'ischýs',d:'Strength, might, force — bodily strength and inner fortitude; "Love the Lord your God with all your strength."'}] },
  prophet:      { H:[{id:'H5030',s:'נָבִיא',x:'nāḇîʾ',d:'Prophet, spokesperson — literally "one who speaks for God"; the mouthpiece through whom God reveals his word.'}], G:[{id:'G4396',s:'προφήτης',x:'prophḗtēs',d:'Prophet — one who speaks forth the word of God; Jesus is the ultimate prophet (Deuteronomy 18:15 fulfilled).'}] },
  priest:       { H:[{id:'H3548',s:'כֹּהֵן',x:'kōhēn',d:'Priest — the mediator between God and Israel; the one who offered sacrifices and maintained the sanctuary.'}], G:[{id:'G2409',s:'ἱερεύς',x:'hiereús',d:'Priest — the mediating role; Jesus is our great high priest who offered himself once for all (Hebrews 7:27).'}] },
  shepherd:     { H:[{id:'H7462',s:'רָעָה',x:'rāʿāh',d:'To shepherd, tend, lead — God as Israel\'s shepherd (Psalm 23:1); the leaders of Israel called to shepherd.'}], G:[{id:'G4166',s:'ποιμήν',x:'poimḗn',d:'Shepherd, pastor — Jesus is the Good Shepherd (John 10:11); also the role of church leaders.'}] },
  servant:      { H:[{id:'H5650',s:'עֶבֶד',x:'ʿeḇeḏ',d:'Servant, slave — used of Moses, David, and the Suffering Servant of Isaiah 53; honored title of those closest to God.'}], G:[{id:'G1401',s:'δοῦλος',x:'doûlos',d:'Slave, servant, bondservant — Paul\'s self-designation; one who belongs entirely to another; the Servant of Isaiah applied to Jesus.'}] },
  anointed:     { H:[{id:'H4899',s:'מָשִׁיחַ',x:'māšîaḥ',d:'Anointed One, Messiah — the king or priest set apart by anointing with oil; the great Messiah Israel awaited.'}], G:[{id:'G5547',s:'Χριστός',x:'Christós',d:'Christ, Anointed One — the Greek translation of Messiah; Jesus is the Christ, the one anointed to save.'}] },
  covenant:     { H:[{id:'H1285',s:'בְּרִית',x:'bĕrîṯ',d:'Covenant, binding agreement — the backbone of biblical theology: God\'s binding commitment to his people.'}], G:[{id:'G1242',s:'διαθήκη',x:'diathḗkē',d:'Covenant, testament — the new covenant in Jesus\' blood, sealed at the cross (Hebrews 9:15).'}] },
  name:         { H:[{id:'H8034',s:'שֵׁם',x:'šēm',d:'Name — in Hebrew thought, the name reveals the character and authority of a person; the Name of YHWH is his full being.'}], G:[{id:'G3686',s:'ὄνομα',x:'ónoma',d:'Name — the name of Jesus carries his authority and identity; praying and acting "in the name of Jesus."'}] },
  heaven:       { H:[{id:'H8064',s:'שָׁמַיִם',x:'šāmayim',d:'Heaven, sky — the dwelling place of God; also the sky/atmosphere; the place from which God\'s rule comes.'}], G:[{id:'G3772',s:'οὐρανός',x:'ouranós',d:'Heaven, sky — the realm of God; "Our Father in heaven" (Matthew 6:9); the destination of the resurrected.'}] },
  blessed:      { H:[{id:'H835',s:'אַשְׁרֵי',x:'ʾašrê',d:'Blessed, happy — "How happy/blessed is the one who…" opening the Psalms; a joyful affirmation of right living.'},{id:'H1288',s:'בָּרַךְ',x:'bāraḵ',d:'To bless, kneel before — God\'s blessing is his active provision of life and goodness; the priestly blessing of Numbers 6.'}], G:[{id:'G3107',s:'μακάριος',x:'makários',d:'Blessed, happy — the Beatitudes word (Matthew 5); the deep contentment of those rightly related to God.'},{id:'G2128',s:'εὐλογητός',x:'eulogētós',d:'Blessed, praised — used only of God; "blessed be the God and Father of our Lord Jesus Christ."'}] },
  created:      { H:[{id:'H1254',s:'בָּרָא',x:'bārāʾ',d:'To create (used only of God) — the unique divine act of creation; God alone is the subject of this verb in the Bible.'}], G:[{id:'G2936',s:'κτίζω',x:'ktízō',d:'To create, found — God\'s creative work; all things were created through Christ (Colossians 1:16).'}] },
  chosen:       { H:[{id:'H972',s:'בָּחִיר',x:'bāḥîr',d:'Chosen, elect — the one selected and set apart by God; Israel as God\'s chosen people, the Servant of Isaiah.'}], G:[{id:'G1588',s:'ἐκλεκτός',x:'eklektós',d:'Chosen, elect — those God has called and selected; "the elect" who will not be misled (Matthew 24:24).'}] },
};

function refToPassageId(ref) {
  const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[–\-](\d+))?$/);
  if (!match) return null;
  const [, rawBook, chapter, startV, endV] = match;
  const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
  if (!code) return null;
  const start = `${code}.${chapter}.${startV}`;
  return endV ? `${start}-${code}.${chapter}.${endV}` : start;
}

function getTestament(ref) {
  const pid = refToPassageId(ref);
  if (!pid) return 'both';
  return NT_BOOKS.has(pid.split('.')[0]) ? 'NT' : 'OT';
}

function normalizeWord(w) {
  const lower = w.toLowerCase().replace(/['']/g, "'").replace(/[^a-z']/g, '');
  const stems = [
    lower,
    lower.endsWith('s')    ? lower.slice(0, -1)    : null,
    lower.endsWith('es')   ? lower.slice(0, -2)    : null,
    lower.endsWith('ed')   ? lower.slice(0, -2)    : null,
    lower.endsWith('ing')  ? lower.slice(0, -3)    : null,
    lower.endsWith('ness') ? lower.slice(0, -4)    : null,
    lower.endsWith('ful')  ? lower.slice(0, -3)    : null,
    lower.endsWith('ly')   ? lower.slice(0, -2)    : null,
    lower.endsWith('tion') ? lower.slice(0, -4)    : null,
    lower.endsWith('ment') ? lower.slice(0, -4)    : null,
  ];
  for (const stem of stems) {
    if (stem && WORD_STRONGS[stem]) return stem;
  }
  return null;
}

function tokenizePassage(text) {
  if (!text) return [];
  const re = /(\[\d+(?::\d+)?\])|([\n\r]+)|([a-zA-Z][a-zA-Z'']*)|([^a-zA-Z\[\]\n\r]+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) tokens.push({ type: 'verse', text: m[1] });
    else if (m[2]) tokens.push({ type: 'break' });
    else if (m[3]) tokens.push({ type: 'word', text: m[3] });
    else tokens.push({ type: 'punct', text: m[4] });
  }
  return tokens;
}

function PassageText({ content, testament, selectedWord, onWordClick }) {
  const tokens = tokenizePassage(content);
  return (
    <div className="bl-col-text">
      {tokens.map((tok, i) => {
        if (tok.type === 'verse') return <span key={i} className="bl-verse-num">{tok.text}</span>;
        if (tok.type === 'break') return <br key={i} />;
        if (tok.type === 'word') {
          const key = normalizeWord(tok.text);
          const entry = key ? WORD_STRONGS[key] : null;
          const hasEntry = entry && (entry.H?.length || entry.G?.length);
          const isActive = selectedWord?.toLowerCase() === tok.text.toLowerCase()
            || (selectedWord && normalizeWord(selectedWord) === normalizeWord(tok.text));
          if (hasEntry) {
            return (
              <button
                key={i}
                className={`bl-word-btn ${isActive ? 'active' : ''}`}
                onClick={() => onWordClick(tok.text, key, entry, testament)}
              >
                {tok.text}
              </button>
            );
          }
          return <span key={i}>{tok.text}</span>;
        }
        return <span key={i}>{tok.text}</span>;
      })}
    </div>
  );
}

export default function BibleLookup({ session }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Word Study
  const [wordStudy, setWordStudy] = useState(null); // { word, entries: [{id,s,x,d}] }
  const [showStrongsInput, setShowStrongsInput] = useState(false);
  const [strongsQuery, setStrongsQuery] = useState('');
  const [strongsResult, setStrongsResult] = useState(null);
  const [strongsLoading, setStrongsLoading] = useState(false);
  const [strongsError, setStrongsError] = useState('');

  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const wordStudyRef = useRef(null);

  const isConfigured = hasSupabaseConfig && Boolean(session?.user?.id);
  const testament = results ? getTestament(results.ref) : 'both';

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setParseError('');
    const passageId = refToPassageId(query.trim());
    if (!passageId) {
      setParseError('Could not parse reference. Try "John 3:16" or "Romans 8:28-30".');
      return;
    }
    setLoading(true);
    setResults(null);
    setWordStudy(null);
    const fetched = await Promise.all(
      TRANSLATIONS.map(async (t) => {
        try {
          const { data, error } = await supabase.functions.invoke('bible-proxy', {
            body: { bibleId: t.id, passageId },
          });
          if (error || !data?.data?.content) throw new Error(error?.message || 'No content');
          return { ...t, content: data.data.content };
        } catch {
          return { ...t, content: null, error: true };
        }
      })
    );
    setResults({ ref: query.trim(), translations: fetched });
    setLoading(false);
  };

  const handleCopy = (t) => {
    const text = `${results.ref} (${t.label})\n\n${t.content}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleWordClick = (word, key, entry, passageTestament) => {
    const lang = passageTestament === 'NT' ? 'G' : passageTestament === 'OT' ? 'H' : 'both';
    let entries = [];
    if (lang === 'both') {
      entries = [...(entry.H || []), ...(entry.G || [])];
    } else {
      entries = entry[lang] || [];
      // Fall back to other language if none in expected
      if (!entries.length) entries = [...(entry.H || []), ...(entry.G || [])];
    }
    setWordStudy({ word, entries });
    setStrongsResult(null);
    // Scroll word study panel into view
    setTimeout(() => wordStudyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const handleStrongsLookup = async (e) => {
    e.preventDefault();
    const id = strongsQuery.trim().toUpperCase();
    if (!id) return;
    if (!/^[HG]\d{1,5}$/.test(id)) {
      setStrongsError('Use format H1234 (Hebrew) or G1234 (Greek).');
      return;
    }
    setStrongsError('');
    setStrongsResult(null);
    setWordStudy(null);
    setStrongsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('strongs-proxy', {
        body: { strongsId: id },
      });
      if (error || !data?.data) throw new Error(error?.message || 'No result');
      setStrongsResult({ id, ...data.data });
    } catch {
      setStrongsError('Could not find that Strongs number. Check the format and try again.');
    } finally {
      setStrongsLoading(false);
    }
  };

  return (
    <>
      <button
        className={`bible-lookup-fab ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Bible Lookup"
        title="Open Scripture Lookup"
      >
        <BookOpen size={22} />
      </button>

      {isOpen && <div className="bible-lookup-backdrop" onClick={() => setIsOpen(false)} />}

      <div className={`bible-lookup-panel ${isOpen ? 'open' : ''}`} ref={panelRef}>
        <div className="bible-lookup-header">
          <div className="bible-lookup-title">
            <BookOpen size={18} />
            <span>Scripture Lookup</span>
          </div>
          <button className="bible-lookup-close" onClick={() => setIsOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="bible-lookup-search" onSubmit={handleLookup}>
          <input
            ref={inputRef}
            className="bible-lookup-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setParseError(''); }}
            placeholder="e.g. John 3:16  ·  Romans 8:28-30  ·  Psalm 23:1-6"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="bible-lookup-search-btn" disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={16} className="bl-spin" /> : <Search size={16} />}
          </button>
        </form>

        {parseError && <p className="bible-lookup-parse-error">{parseError}</p>}
        {!isConfigured && <p className="bible-lookup-notice">Sign in to enable inline scripture reading.</p>}
        {loading && (
          <div className="bible-lookup-loading">
            <Loader2 size={20} className="bl-spin" />
            <span>Fetching passage in 3 translations…</span>
          </div>
        )}

        {results && !loading && (
          <div className="bible-lookup-results animate-fade-in">
            <div className="bl-results-meta">
              <p className="bible-lookup-ref-label">{results.ref}</p>
              <p className="bl-word-hint">Tap an underlined word to explore its Hebrew or Greek meaning.</p>
            </div>
            <div className="bible-lookup-columns">
              {results.translations.map((t) => (
                <div key={t.id} className={`bible-lookup-col bl-style-${t.style}`}>
                  <div className="bl-col-header">
                    <span className="bl-col-label">{t.label}</span>
                    <span className="bl-col-style">{t.styleLabel}</span>
                    {!t.error && (
                      <button
                        className={`bl-copy-btn ${copiedId === t.id ? 'copied' : ''}`}
                        onClick={() => handleCopy(t)}
                        title={copiedId === t.id ? 'Copied!' : `Copy ${t.label}`}
                      >
                        {copiedId === t.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    )}
                  </div>
                  {t.error ? (
                    <p className="bl-col-unavailable">Passage unavailable in this translation.</p>
                  ) : (
                    <PassageText
                      content={t.content}
                      testament={testament}
                      selectedWord={wordStudy?.word}
                      onWordClick={handleWordClick}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!results && !loading && !parseError && (
          <div className="bible-lookup-hint-block">
            <p className="bible-lookup-hint">
              Compare any passage across three translation styles — formal (NASB), balanced (CSB), and thought-for-thought (NLT). Tap any underlined word to see its Hebrew or Greek meaning.
            </p>
            <Link to="/translation-guide" className="bible-lookup-guide-btn" onClick={() => setIsOpen(false)}>
              <BookOpen size={13} />
              Why does translation style matter?
            </Link>
          </div>
        )}

        {results && !loading && (
          <p className="bible-lookup-guide-footer">
            <Link to="/translation-guide" className="bible-lookup-guide-link" onClick={() => setIsOpen(false)}>
              About these translation styles →
            </Link>
          </p>
        )}

        {/* ── Word Study ── */}
        <div className="bl-word-study" ref={wordStudyRef}>
          <div className="bl-word-study-header">
            <Languages size={14} />
            <span>Hebrew &amp; Greek Word Study</span>
          </div>

          {/* Word-click result */}
          {wordStudy && (
            <div className="bl-word-click-result animate-fade-in">
              <p className="bl-clicked-word">"{wordStudy.word}"</p>
              {wordStudy.entries.map((entry) => (
                <div key={entry.id} className={`bl-strongs-result ${entry.id.startsWith('H') ? 'bl-result-hebrew' : 'bl-result-greek'}`}>
                  <div className="bl-strongs-top">
                    <span className={entry.id.startsWith('H') ? 'bl-strongs-script bl-hebrew' : 'bl-strongs-script bl-greek'}>
                      {entry.s}
                    </span>
                    <div className="bl-strongs-meta">
                      <span className="bl-strongs-id">{entry.id}</span>
                      <span className="bl-strongs-lang">{entry.id.startsWith('H') ? 'Hebrew' : 'Greek'} · {entry.x}</span>
                    </div>
                  </div>
                  <p className="bl-strongs-def">{entry.d}</p>
                </div>
              ))}
            </div>
          )}

          {!wordStudy && !strongsResult && (
            <p className="bible-lookup-hint bl-strongs-hint">
              {results
                ? 'Tap any underlined word in the passage above to explore its original Hebrew or Greek meaning.'
                : 'Look up a passage above, then tap any underlined word to see its original language meaning.'}
            </p>
          )}

          {/* Strongs direct lookup (advanced / collapsible) */}
          {isConfigured && (
            <div className="bl-strongs-advanced">
              <button
                className="bl-strongs-advanced-toggle"
                onClick={() => setShowStrongsInput((v) => !v)}
              >
                <span>Enter Strongs number directly</span>
                {showStrongsInput ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showStrongsInput && (
                <div className="bl-strongs-advanced-body animate-fade-in">
                  <form className="bl-strongs-form" onSubmit={handleStrongsLookup}>
                    <input
                      className="bible-lookup-input bl-strongs-input"
                      value={strongsQuery}
                      onChange={(e) => { setStrongsQuery(e.target.value); setStrongsError(''); }}
                      placeholder="H1697  or  G3056"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="submit" className="bible-lookup-search-btn" disabled={strongsLoading || !strongsQuery.trim()}>
                      {strongsLoading ? <Loader2 size={16} className="bl-spin" /> : <Search size={16} />}
                    </button>
                  </form>
                  {strongsError && <p className="bible-lookup-parse-error">{strongsError}</p>}
                  {strongsResult && !strongsLoading && (
                    <div className="bl-strongs-result animate-fade-in">
                      <div className="bl-strongs-top">
                        <span className={`bl-strongs-script ${strongsResult.id?.startsWith('H') ? 'bl-hebrew' : 'bl-greek'}`}>
                          {strongsResult.hebrew || strongsResult.greek || strongsResult.lemma || '—'}
                        </span>
                        <div className="bl-strongs-meta">
                          <span className="bl-strongs-id">{strongsResult.id}</span>
                          <span className="bl-strongs-lang">{strongsResult.id?.startsWith('H') ? 'Hebrew' : 'Greek'}</span>
                        </div>
                      </div>
                      {(strongsResult.xlit || strongsResult.translit) && (
                        <p className="bl-strongs-translit">
                          {strongsResult.xlit || strongsResult.translit}
                          {strongsResult.pron && <span className="bl-strongs-pron"> · {strongsResult.pron}</span>}
                        </p>
                      )}
                      {(strongsResult.strongs_def || strongsResult.definition) && (
                        <p className="bl-strongs-def">{strongsResult.strongs_def || strongsResult.definition}</p>
                      )}
                      {(strongsResult.kjv_def || strongsResult.kjv_translations) && (
                        <p className="bl-strongs-kjv">
                          <span className="bl-strongs-kjv-label">KJV renders as: </span>
                          {strongsResult.kjv_def || strongsResult.kjv_translations}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
