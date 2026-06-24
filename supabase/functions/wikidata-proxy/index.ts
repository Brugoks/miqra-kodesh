import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type WikidataRequest = {
  reference: string;
  passageText?: string;
  userId?: string | null;
  organizationId?: string | null;
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

const API_USER_AGENT = Deno.env.get('WIKIDATA_USER_AGENT') ||
  'MiqraKodeshScriptureLookup/0.1 (https://miqra-kodesh.app)';

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

function extractCandidateNames(reference: string, passageText = '') {
  const book = getBookName(reference);
  const cleaned = stripVerseMarkers(passageText);
  const matches = cleaned.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:of|the|and|[A-Z][a-z]+|[A-Z]{2,})){0,3}\b/g) || [];
  const names = new Set<string>();

  if (book) names.add(getBookSearchQuery(book));

  for (const raw of matches) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < 3 || name.length > 48) continue;
    if (STOP_NAMES.has(name)) continue;
    if (/^\d+$/.test(name)) continue;
    names.add(name);
    if (names.size >= 12) break;
  }

  return [...names];
}

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

function classifyEntity(result: SearchResult, query: string): EntityCard['type'] | null {
  const haystack = `${result.label || ''} ${result.description || ''}`.toLowerCase();
  const isBookQuery = query.toLowerCase().startsWith('book of ');

  if (isBookQuery && /book|religious text|gospel|epistle|letter|psalm/.test(haystack)) return 'book';
  if (/book of the bible|book of the new testament|book of the hebrew bible|religious text|canonical gospel|gospel|epistle|psalm/.test(haystack)) return 'book';
  if (/biblical figure|figure in the bible|prophet|apostle|disciple|king of|queen of|priest|patriarch|matriarch/.test(haystack)) return 'person';
  if (/city|town|village|settlement|region|river|sea|mountain|valley|province|archaeological|ancient/.test(haystack)) return 'place';

  return isBookQuery ? 'book' : null;
}

function entityToCard(entity: Record<string, unknown>, fallback: SearchResult, type: EntityCard['type']): EntityCard {
  const labels = entity.labels as Record<string, { value: string }> | undefined;
  const descriptions = entity.descriptions as Record<string, { value: string }> | undefined;
  const aliases = entity.aliases as Record<string, Array<{ value: string }>> | undefined;
  const sitelinks = entity.sitelinks as Record<string, { url: string }> | undefined;
  const coordinate = getClaimValue(entity, 'P625') as { latitude?: number; longitude?: number } | undefined;
  const image = getClaimValue(entity, 'P18');
  const pleiadesId = getClaimValue(entity, 'P1584');
  const id = String(entity.id || fallback.id);
  const label = labels?.en?.value || fallback.label || id;

  return {
    id,
    label,
    description: descriptions?.en?.value || fallback.description || 'Wikidata entity',
    type,
    wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
    wikipediaUrl: sitelinks?.enwiki?.url,
    coordinates: typeof coordinate?.latitude === 'number' && typeof coordinate?.longitude === 'number'
      ? { latitude: coordinate.latitude, longitude: coordinate.longitude }
      : undefined,
    imageUrl: typeof image === 'string'
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`
      : undefined,
    aliases: (aliases?.en || []).slice(0, 4).map((alias) => alias.value),
    archaeologyLinks: makeResearchLinks(label, type, typeof pleiadesId === 'string' ? pleiadesId : undefined),
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

async function resolveCandidate(query: string): Promise<EntityCard | null> {
  const results = await searchEntities(query);
  const best = results.find((result) => classifyEntity(result, query));
  if (!best) return null;

  const type = classifyEntity(best, query);
  if (!type) return null;

  const entity = await getEntity(best.id);
  if (!entity) return null;
  return entityToCard(entity, best, type);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { reference, passageText = '', userId, organizationId } = (await request.json()) as WikidataRequest;
    if (!reference) return jsonResponse({ error: 'reference is required' }, 400);

    const candidates = extractCandidateNames(reference, passageText);
    const settled = await Promise.allSettled(candidates.map((candidate) => resolveCandidate(candidate)));
    const seen = new Set<string>();
    const entities = settled
      .filter((result): result is PromiseFulfilledResult<EntityCard | null> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((card): card is EntityCard => Boolean(card))
      .filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      })
      .slice(0, 8);

    await recordUsageEvent({
      provider: 'wikidata',
      feature: 'scripture-context',
      status: 200,
      units: candidates.length || 1,
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      metadata: {
        reference,
        candidateCount: candidates.length,
        entityCount: entities.length,
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
