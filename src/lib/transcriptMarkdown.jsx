// Renders a sermon/message transcript's lightweight markdown (headings, bold/
// italic, blockquotes for read-aloud scripture, horizontal rules, bullet
// lists, paragraphs) instead of dumping the raw string into a pre-wrap block.
// Headings are bumped down two levels (h1 -> h3, h2 -> h4, h3 -> h5) since the
// talk detail page already has an <h1> title and <h2> section labels above
// the transcript.

const INLINE_RE = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*)/g;

function renderInline(text, keyPrefix) {
  const nodes = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}-b`)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(<s key={key}>{renderInline(token.slice(2, -2), `${key}-s`)}</s>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}-i`)}</em>);
    } else {
      nodes.push(token);
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Lines within a paragraph/blockquote join with a space, unless the line ends
// with a markdown hard-break (two-or-more trailing spaces) -> <br>.
function renderLines(lines, keyPrefix) {
  const nodes = [];
  lines.forEach((line, i) => {
    const hardBreak = /  +$/.test(line);
    nodes.push(...renderInline(line.trim(), `${keyPrefix}-l${i}`));
    if (hardBreak && i < lines.length - 1) nodes.push(<br key={`${keyPrefix}-br${i}`} />);
    else if (i < lines.length - 1) nodes.push(' ');
  });
  return nodes;
}

const HEADING_TAG = { 1: 'h3', 2: 'h4', 3: 'h5' };

export function renderTranscriptMarkdown(text) {
  if (!text) return null;

  const blocks = [];
  const lines = text.split('\n');
  let i = 0;

  const isHr = (line) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
  const isHeading = (line) => /^(#{1,3})\s+(.*)$/.exec(line.trim());
  const isQuote = (line) => /^>\s?/.test(line);
  const isBullet = (line) => /^[-*]\s+(.*)$/.exec(line.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    if (isHr(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="talk-transcript-hr" />);
      i += 1;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = HEADING_TAG[level] || 'h5';
      blocks.push(<Tag key={`h-${blocks.length}`} className="talk-transcript-heading">{renderInline(heading[2].trim(), `h-${blocks.length}`)}</Tag>);
      i += 1;
      continue;
    }

    if (isQuote(line)) {
      const quoteLines = [];
      while (i < lines.length && (isQuote(lines[i]) || !lines[i].trim())) {
        if (!lines[i].trim()) { i += 1; continue; }
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`bq-${blocks.length}`} className="talk-transcript-quote">
          {renderLines(quoteLines, `bq-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }

    const bullet = isBullet(line);
    if (bullet) {
      const items = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(isBullet(lines[i])[1].trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="talk-transcript-list">
          {items.map((item, idx) => <li key={idx}>{renderInline(item, `ul-${blocks.length}-${idx}`)}</li>)}
        </ul>,
      );
      continue;
    }

    const paragraphLines = [];
    while (i < lines.length && lines[i].trim() && !isHr(lines[i]) && !isHeading(lines[i]) && !isQuote(lines[i]) && !isBullet(lines[i])) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="talk-transcript-paragraph">
        {renderLines(paragraphLines, `p-${blocks.length}`)}
      </p>,
    );
  }

  return blocks;
}
