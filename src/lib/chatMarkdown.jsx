import { URL_RE } from './linkUtils';
import { dispatchWikiEntityOpen } from './wikiEntityLinker';

const MENTION_RE = /@\[([^\]]*)\]\(([^)]+)\)/g;
const WIKI_MENTION_RE = /#\[([^\]]*)\]\(wiki:([^)]+)\)/g;
const INLINE_RE = new RegExp(`(${MENTION_RE.source}|${WIKI_MENTION_RE.source}|${URL_RE.source}|\\*\\*[^*]+\\*\\*|~~[^~]+~~|\\*[^*]+\\*|\`[^\`]+\`)`, 'g');

function renderInline(text, keyPrefix) {
  const nodes = [];
  let last = 0;
  let index = 0;
  let match;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('@[')) {
      const mention = new RegExp(MENTION_RE).exec(token);
      nodes.push(<span key={key} className="chat-mention">@{mention?.[1] || 'member'}</span>);
    } else if (token.startsWith('#[')) {
      // Bible Wiki / Church History entity mention ('#' in the composer) —
      // tapping opens the app-wide entity peek popover.
      const wiki = new RegExp(WIKI_MENTION_RE).exec(token);
      nodes.push(
        <button
          key={key}
          type="button"
          className="chat-wiki-mention"
          onClick={(e) => dispatchWikiEntityOpen(e.currentTarget, wiki?.[2], undefined, wiki?.[1])}
        >
          {wiki?.[1] || 'wiki page'}
        </button>
      );
    } else if (new RegExp(URL_RE.source).test(token)) {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noopener noreferrer" className="chat-msg-link">
          {token}
        </a>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}-b`)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(<s key={key}>{renderInline(token.slice(2, -2), `${key}-s`)}</s>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}-i`)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key} className="chat-inline-code">{token.slice(1, -1)}</code>);
    } else {
      nodes.push(token);
    }

    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderChatMarkdown(text) {
  if (!text) return null;

  const blocks = [];
  const lines = text.split('\n');
  let paragraph = [];
  let codeLines = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = paragraph.join('\n');
    if (content.startsWith('> ')) {
      blocks.push(
        <blockquote key={`bq-${blocks.length}`} className="chat-blockquote">
          {renderInline(content.replace(/^> ?/gm, ''), `bq-${blocks.length}`)}
        </blockquote>
      );
    } else {
      blocks.push(
        <div key={`p-${blocks.length}`} className="chat-markdown-paragraph">
          {renderInline(content, `p-${blocks.length}`)}
        </div>
      );
    }
    paragraph = [];
  };

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        blocks.push(<pre key={`code-${blocks.length}`} className="chat-code-block"><code>{codeLines.join('\n')}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      return;
    }

    paragraph.push(line);
  });

  if (inCode) {
    blocks.push(<pre key={`code-${blocks.length}`} className="chat-code-block"><code>{codeLines.join('\n')}</code></pre>);
  }
  flushParagraph();

  return blocks;
}
