import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type WikidataRequest = {
  reference: string;
  passageText?: string;
  userId?: string | null;
  organizationId?: string | null;
};

type ExtractedEntity = {
  name: string;
  type: 'book' | 'person' | 'place' | 'concept';
  searchQuery: string;
};

type SearchResult = {
  id: string;
  label?: string;
  description?: string;
};

type EntityCard = {
  id: string;
  label: string;
  description: string;
  type: 'book' | 'person' | 'place' | 'topic';
  wikidataUrl: string;
  wikipediaUrl?: string;
  coordinates?: { latitude: number; longitude: number };
  imageUrl?: string;
  aliases: string[];
  archaeologyLinks: ResearchLink[];
};

type ResearchLink = {
  label: string;
  url: string;
  source: 'BAS' | 'OpenBible' | 'Pleiades' | 'Wikidata';
  note: string;
};

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const API_USER_AGENT = Deno.env.get('WIKIDATA_USER_AGENT') ||
  'MiqraKodeshScriptureLookup/0.1 (https://miqra-kodesh.app)';

// Wikidata Q-IDs that confirm an entity is genuinely biblical.
// If any P31 (instance-of) claim on the entity matches, it passes the filter.
const BIBLICAL_P31_IDS = new Set([
  'Q20643955', // biblical figure
  'Q1458655',  // book of the Bible
  'Q41117',    // book of the Old Testament
  'Q1327195',  // book of the New Testament
  'Q19088',    // Hebrew Bible
  'Q5167370',  // place mentioned in the Bible
  'Q5083266',  // biblical place
  'Q18120925', // ancient city of the Near East (broad, still useful)
  'Q104680',   // ancient city
  'Q3914',     // settlement (accepted only if description also passes keyword check)
]);

const BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

const STOP_NAMES = new Set([
  'A', 'An', 'And', 'As', 'But', 'For', 'From', 'He', 'His', 'I', 'If', 'In', 'It', 'Let',
  'Lord', 'LORD', 'Me', 'My', 'No', 'Now', 'O', 'Of', 'Or', 'She', 'So', 'That', 'The',
  'Then', 'They', 'This', 'To', 'We', 'When', 'Who', 'You', 'Your',
]);

const BOOK_SEARCH_QUERIES: Record<string, string> = {
  Psalms: 'Psalms',
  Matthew: 'Gospel of Matthew',
  Mark: 'Gospel of Mark',
  Luke: 'Gospel of Luke',
  John: 'Gospel of John',
  Acts: 'Acts of the Apostles',
  Romans: 'Epistle to the Romans',
  '1 Corinthians': 'First Epistle to the Corinthians',
  '2 Corinthians': 'Second Epistle to the Corinthians',
  Galatians: 'Epistle to the Galatians',
  Ephesians: 'Epistle to the Ephesians',
  Philippians: 'Epistle to the Philippians',
  Colossians: 'Epistle to the Colossians',
  '1 Thessalonians': 'First Epistle to the Thessalonians',
  '2 Thessalonians': 'Second Epistle to the Thessalonians',
  '1 Timothy': 'First Epistle to Timothy',
  '2 Timothy': 'Second Epistle to Timothy',
  Titus: 'Epistle to Titus',
  Philemon: 'Epistle to Philemon',
  Hebrews: 'Epistle to the Hebrews',
  James: 'Epistle of James',
  '1 Peter': 'First Epistle of Peter',
  '2 Peter': 'Second Epistle of Peter',
  '1 John': 'First Epistle of John',
  '2 John': 'Second Epistle of John',
  '3 John': 'Third Epistle of John',
  Jude: 'Epistle of Jude',
  Revelation: 'Book of Revelation',
};

function getBookName(reference: string) {
  const match = reference.trim().match(/^(.+?)\s+\d/);
  if (!match) return null;
  const normalized = match[1].toLowerCase().replace(/\./g, '').trim();
  return BOOK_NAMES.find((book) => book.toLowerCase() === normalized) || match[1].trim();
}

function getBookSearchQuery(book: string) {
  return BOOK_SEARCH_QUERIES[book] || `Book of ${book}`;
}

function bibleAtlasLetter(label: string) {
  const first = label.trim().match(/[A-Za-z]/)?.[0]?.toLowerCase();
  return first || 'a';
}

function makeResearchLinks(label: string, type: EntityCard['type'], pleiadesId?: string): ResearchLink[] {
  const encoded = encodeURIComponent(label);
  const links: ResearchLink[] = [
    {
      label: 'Search BAS articles',
      url: `https://www.biblicalarchaeology.org/?s=${encoded}`,
      source: 'BAS',
      note: 'Public search results from Biblical Archaeology Society; open the article on BAS for full terms and access.',
    },
  ];

  if (type === 'place') {
    links.push({
      label: 'OpenBible Atlas',
      url: `https://www.openbible.info/geo/atlas/${bibleAtlasLetter(label)}`,
      source: 'OpenBible',
      note: 'Browse Bible-place identifications and confidence notes in the OpenBible.info geocoding atlas.',
    });
    links.push({
      label: pleiadesId ? 'Pleiades place record' : 'Search Pleiades',
      url: pleiadesId
        ? `https://pleiades.stoa.org/places/${encodeURIComponent(pleiadesId)}`
        : `https://pleiades.stoa.org/search?SearchableText=${encoded}`,
      source: 'Pleiades',
      note: 'Ancient-place gazetteer record or search result.',
    });
  }

  return links;
}

function stripVerseMarkers(text: string) {
  return text.replace(/\[[\d:]+]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Gemini-powered entity extraction ──────────────────────────────────────────

async function extractEntitiesWithGemini(
  reference: string,
  passageText: string,
  apiKey: string,
): Promise<ExtractedEntity[]> {
  const clean = stripVerseMarkers(passageText);
  const book = getBookName(reference);
  const bookQuery = book ? getBookSearchQuery(book) : reference;

  const prompt = `You are a biblical scholar identifying named entities in a scripture passage for Wikidata lookup.

Reference: ${reference}
Passage: "${clean}"

Return a JSON array of entities to look up. Always include the Bible book itself as the first item.

Also include proper named entities from the passage that are:
- People: named individuals (disciples, kings, priests, prophets, etc.)
- Places: cities, regions, rivers, mountains, bodies of water
- Significant named objects or groups if central to the passage

Do NOT include: "Lord", "God", "Holy Spirit", pronouns, generic nouns, common adjectives, or anything not a specific proper name.

For each entity return exactly:
{
  "name": "name as it appears",
  "type": "book" | "person" | "place" | "concept",
  "searchQuery": "optimized Wikidata search query with biblical disambiguation, e.g. 'Nicodemus biblical figure', 'Bethlehem ancient city Judea', '${bookQuery}'"
}

Return valid JSON array only. No markdown, no explanation. Maximum 8 entities.`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: unknown) => e && typeof e === 'object' && 'searchQuery' in (e as object))
      .slice(0, 8) as ExtractedEntity[];
  } catch {
    return [];
  }
}

// ── Regex fallback (used when Gemini is unavailable) ──────────────────────────

function extractCandidatesFallback(reference: string, passageText = ''): ExtractedEntity[] {
  const book = getBookName(reference);
  const cleaned = stripVerseMarkers(passageText);
  const matches = cleaned.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:of|the|and|[A-Z][a-z]+|[A-Z]{2,})){0,3}\b/g) || [];
  const seen = new Set<string>();
  const results: ExtractedEntity[] = [];

  if (book) {
    const sq = getBookSearchQuery(book);
    seen.add(sq);
    results.push({ name: book, type: 'book', searchQuery: sq });
  }

  for (const raw of matches) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < 3 || name.length > 48) continue;
    if (STOP_NAMES.has(name)) continue;
    if (/^\d+$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    results.push({ name, type: 'concept', searchQuery: name });
    if (results.length >= 8) break;
  }

  return results;
}

// ── Wikidata helpers ──────────────────────────────────────────────────────────

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Api-User-Agent': API_USER_AGENT,
      'User-Agent': API_USER_AGENT,
    },
  });

  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    const suffix = retryAfter ? ` Retry after ${retryAfter} seconds.` : '';
    throw new Error(`Wikidata responded with ${response.status}.${suffix}`);
  }

  return response.json();
}

async function searchEntities(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    language: 'en',
    uselang: 'en',
    limit: '5',
    search: query,
    origin: '*',
  });
  const data = await fetchJson(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  return (data?.search || []).map((item: Record<string, string>) => ({
    id: item.id,
    label: item.label,
    description: item.description,
  }));
}

async function getEntity(id: string) {
  const data = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  return data?.entities?.[id] || null;
}

function getClaimValue(entity: Record<string, unknown>, property: string) {
  const claims = entity.claims as Record<string, Array<Record<string, unknown>>> | undefined;
  const statement = claims?.[property]?.[0];
  const mainsnak = statement?.mainsnak as Record<string, unknown> | undefined;
  const datavalue = mainsnak?.datavalue as Record<string, unknown> | undefined;
  return datavalue?.value as Record<string, unknown> | string | undefined;
}

// Check P31 (instance-of) claims against the known-biblical Q-ID set.
function hasBiblicalP31(entity: Record<string, unknown>): boolean {
  const claims = entity.claims as Record<string, Array<Record<string, unknown>>> | undefined;
  const p31Statements = claims?.['P31'] || [];
  for (const stmt of p31Statements) {
    const mainsnak = stmt?.mainsnak as Record<string, unknown> | undefined;
    const datavalue = mainsnak?.datavalue as Record<string, unknown> | undefined;
    const value = datavalue?.value as Record<string, unknown> | undefined;
    const qid = value?.id as string | undefined;
    if (qid && BIBLICAL_P31_IDS.has(qid)) return true;
  }
  return false;
}

// Keyword check used as secondary gate for entity types not in the P31 whitelist.
function descriptionMatchesType(result: SearchResult, type: ExtractedEntity['type']): boolean {
  const haystack = `${result.label || ''} ${result.description || ''}`.toLowerCase();
  switch (type) {
    case 'book':
      return /book|religious text|gospel|epistle|letter|psalm/.test(haystack);
    case 'person':
      return /biblical figure|figure in the bible|prophet|apostle|disciple|king of|queen of|priest|patriarch|matriarch/.test(haystack);
    case 'place':
      return /city|town|village|settlement|region|river|sea|mountain|valley|province|archaeological|ancient/.test(haystack);
    default:
      return true;
  }
}

function entityTypeToCardType(type: ExtractedEntity['type']): EntityCard['type'] {
  if (type === 'concept') return 'topic';
  return type;
}

function entityToCard(
  entity: Record<string, unknown>,
  fallback: SearchResult,
  type: ExtractedEntity['type'],
): EntityCard {
  const labels = entity.labels as Record<string, { value: string }> | undefined;
  const descriptions = entity.descriptions as Record<string, { value: string }> | undefined;
  const aliases = entity.aliases as Record<string, Array<{ value: string }>> | undefined;
  const sitelinks = entity.sitelinks as Record<string, { url: string }> | undefined;
  const coordinate = getClaimValue(entity, 'P625') as { latitude?: number; longitude?: number } | undefined;
  const image = getClaimValue(entity, 'P18');
  const pleiadesId = getClaimValue(entity, 'P1584');
  const id = String(entity.id || fallback.id);
  const label = labels?.en?.value || fallback.label || id;
  const cardType = entityTypeToCardType(type);

  return {
    id,
    label,
    description: descriptions?.en?.value || fallback.description || 'Wikidata entity',
    type: cardType,
    wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
    wikipediaUrl: sitelinks?.enwiki?.url,
    coordinates: typeof coordinate?.latitude === 'number' && typeof coordinate?.longitude === 'number'
      ? { latitude: coordinate.latitude, longitude: coordinate.longitude }
      : undefined,
    imageUrl: typeof image === 'string'
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`
      : undefined,
    aliases: (aliases?.en || []).slice(0, 4).map((alias) => alias.value),
    archaeologyLinks: makeResearchLinks(label, cardType, typeof pleiadesId === 'string' ? pleiadesId : undefined),
  };
}

function makeGeneralResources(reference: string): ResearchLink[] {
  const book = getBookName(reference);
  const query = encodeURIComponent(book || reference);
  return [
    {
      label: 'Biblical Archaeology Society',
      url: `https://www.biblicalarchaeology.org/?s=${query}`,
      source: 'BAS',
      note: 'Public BAS search for archaeology articles related to this passage or book.',
    },
    {
      label: 'OpenBible.info Bible Geocoding',
      url: 'https://www.openbible.info/geo/',
      source: 'OpenBible',
      note: 'Open Bible-place dataset with locations, confidence, and source notes.',
    },
    {
      label: 'Pleiades Ancient Places',
      url: 'https://pleiades.stoa.org/places',
      source: 'Pleiades',
      note: 'Open ancient-place gazetteer for broader Greco-Roman and Near Eastern context.',
    },
  ];
}

// Resolve one extracted entity to an EntityCard, with P31 gate.
async function resolveCandidate(extracted: ExtractedEntity): Promise<EntityCard | null> {
  const results = await searchEntities(extracted.searchQuery);
  if (!results.length) return null;

  for (const result of results) {
    // Quick pre-screen: description should loosely match the expected type
    if (!descriptionMatchesType(result, extracted.type)) continue;

    const entity = await getEntity(result.id);
    if (!entity) continue;

    // P31 gate: must be confirmed biblical OR pass description check
    if (!hasBiblicalP31(entity) && !descriptionMatchesType(result, extracted.type)) continue;

    return entityToCard(entity, result, extracted.type);
  }

  return null;
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { reference, passageText = '', userId, organizationId } = (await request.json()) as WikidataRequest;
    if (!reference) return jsonResponse({ error: 'reference is required' }, 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    let candidates: ExtractedEntity[];
    let usedGemini = false;

    if (apiKey && passageText.length > 10) {
      candidates = await extractEntitiesWithGemini(reference, passageText, apiKey);
      usedGemini = candidates.length > 0;
    }

    // Fall back to regex if Gemini returned nothing (no key, quota error, empty passage)
    if (!usedGemini) {
      candidates = extractCandidatesFallback(reference, passageText);
    }

    const settled = await Promise.allSettled(candidates.map((c) => resolveCandidate(c)));
    const seen = new Set<string>();
    const entities = settled
      .filter((r): r is PromiseFulfilledResult<EntityCard | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((card): card is EntityCard => Boolean(card))
      .filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      })
      .slice(0, 8);

    await recordUsageEvent({
      provider: usedGemini ? 'gemini+wikidata' : 'wikidata',
      feature: 'scripture-context',
      status: 200,
      units: candidates.length || 1,
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      metadata: {
        reference,
        candidateCount: candidates.length,
        entityCount: entities.length,
        usedGemini,
        resourceSources: ['BAS', 'OpenBible', 'Pleiades'],
      },
    });

    return jsonResponse({
      reference,
      entities,
      resources: makeGeneralResources(reference),
      attribution: 'Data from Wikidata (CC0).',
      sourceUrl: 'https://www.wikidata.org/',
    });
  } catch (err) {
    await recordUsageEvent({
      provider: 'wikidata',
      feature: 'scripture-context',
      status: 500,
      metadata: { error: (err as Error).message },
    });
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
