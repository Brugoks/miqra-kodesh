import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Loader2, RefreshCw, Download, AlertCircle, Sparkles, X, Copy, Check } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import './ScriptureImage.css';

const STYLES = [
  { value: 'painterly', label: 'Fine Art', suffix: 'biblical fine art, oil painting, dramatic chiaroscuro lighting, rich detail, reverent atmosphere' },
  { value: 'cinematic', label: 'Cinematic', suffix: 'cinematic photography, golden hour light, epic atmosphere, photorealistic, shallow depth of field' },
  { value: 'watercolor', label: 'Watercolor', suffix: 'soft watercolor illustration, gentle washes, light and airy, devotional, delicate' },
  { value: 'stained', label: 'Stained Glass', suffix: 'stained glass window art, luminous jewel tones, bold lead lines, sacred geometry' },
];

// Historical / cultural / geographic setting per group of books, used to anchor the
// image in the correct era so scenes look archaeologically plausible, not generic.
const HISTORICAL_CONTEXTS = [
  { books: ['genesis'],
    ctx: 'the Bronze Age ancient Near East (c. 2000–1500 BC), semi-nomadic Semitic herders with goat-hair tents, wool and linen robes, donkeys and flocks, Mesopotamian and Canaanite material culture' },
  { books: ['exodus', 'leviticus', 'numbers', 'deuteronomy'],
    ctx: 'the Late Bronze Age (c. 1300 BC), Israelites between New Kingdom Egypt and the Sinai wilderness, mudbrick and monumental Egyptian architecture, Hebrew tunics and Egyptian dress' },
  { books: ['joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings', '1 chronicles', '2 chronicles'],
    ctx: 'Iron Age Israel and Canaan (c. 1200–600 BC), walled hilltop towns of mudbrick and stone, terraced farmland and olive groves, ancient Israelite dress' },
  { books: ['ezra', 'nehemiah', 'esther'],
    ctx: 'the Persian Achaemenid period (5th century BC), Jerusalem under restoration or the imperial court at Susa, Persian and Judean dress, columned palace architecture' },
  { books: ['job'],
    ctx: 'the patriarchal ancient Near East, the pastoral land of Uz, semi-nomadic tents and herds, early Semitic culture' },
  { books: ['psalms', 'psalm', 'proverbs', 'ecclesiastes', 'song of solomon', 'song of songs'],
    ctx: 'ancient Israel of the Iron Age, Jerusalem and the Judean hill country, shepherds, vineyards and stone wells, period Israelite dress' },
  { books: ['isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'],
    ctx: 'Iron Age Israel and Judah amid the ancient Near Eastern empires (Assyrian, Babylonian, Persian), monumental Mesopotamian ziggurats and city walls, Semitic prophets in robes' },
  { books: ['matthew', 'mark', 'luke', 'john', 'acts'],
    ctx: '1st-century Roman-occupied Galilee and Judea, Second Temple Jewish culture, limestone synagogues and villages, wooden fishing boats on the Sea of Galilee, Roman roads and soldiers, woven tunics and tallit, Middle Eastern Semitic people' },
  { books: ['romans', '1 corinthians', '2 corinthians', 'galatians', 'ephesians', 'philippians', 'colossians', '1 thessalonians', '2 thessalonians', '1 timothy', '2 timothy', 'titus', 'philemon', 'hebrews', 'james', '1 peter', '2 peter', '1 john', '2 john', '3 john', 'jude'],
    ctx: 'the 1st-century Greco-Roman Mediterranean world, Roman cities with colonnaded streets and house-churches, a blend of Jewish and Greco-Roman dress and architecture' },
  { books: ['revelation', 'revelations'], visionary: true,
    ctx: "John's apocalyptic vision on the island of Patmos — a cosmic, symbolic heavenly realm rather than an everyday historical scene: a radiant throne of jasper and carnelian ringed by an emerald rainbow, a sea of glass like crystal, seven golden lampstands, the slain-yet-standing Lamb, four six-winged living creatures covered with eyes, twenty-four elders in white robes and golden crowns, lightning and trumpets, scrolls with seven seals, and the jewel-walled New Jerusalem of gold and light" },
];
const DEFAULT_CONTEXT = 'the ancient biblical Near East, a historically accurate period setting with Middle Eastern Semitic people';

const BOOK_CONTEXT = new Map();
for (const { books, ctx, visionary } of HISTORICAL_CONTEXTS) {
  for (const b of books) BOOK_CONTEXT.set(b, { ctx, visionary: Boolean(visionary) });
}

// Pull the book name off a reference like "Psalm 23:1-6" or "1 John 4:7" → its setting.
// Returns { ctx, visionary } — visionary books (Revelation) use symbolic, not realist, rules.
function getHistoricalContext(reference) {
  const book = reference
    .replace(/\s+\d+(?::\d+)?(?:[-–]\d+)?\s*$/, '')
    .trim()
    .toLowerCase();
  return BOOK_CONTEXT.get(book) || { ctx: DEFAULT_CONTEXT, visionary: false };
}

// Strip verse markers like [1] / [1:2] and collapse whitespace into a clean prose string
function cleanPassage(content) {
  if (!content) return '';
  return content
    .replace(/\[\d+(?::\d+)?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fallback art prompt when the LLM step is unavailable — uses the raw verse text
function fallbackPrompt(text) {
  return text.slice(0, 220);
}

function buildArtDirectorPrompt(reference, text, context) {
  const { ctx, visionary } = context;

  const accuracyRules = visionary
    ? `Imagery rules: this is a symbolic APOCALYPTIC VISION, not an everyday historical scene — render it as John saw it. Embrace the literal symbols of the text (lampstands, the Lamb, living creatures, seals, trumpets, thrones, jeweled walls) as awe-filled, luminous, otherworldly imagery. Make it cosmic and radiant, full of light, fire, and color, in the tradition of sacred apocalyptic art. Do not flatten it into a mundane realistic setting.`
    : `Accuracy rules: render archaeologically and historically accurate clothing, architecture, tools, and landscape for that era and region; depict ethnically accurate Middle Eastern / Semitic people. Avoid ALL anachronisms — no modern objects, no medieval or European cathedrals, no Renaissance European costumes, no fair-skinned blond figures.`;

  return `You are an art director creating a single text-to-image prompt that depicts THIS specific Bible passage — not a generic devotional scene.

Passage (${reference}): "${text}"

${visionary ? 'Visionary setting to capture' : 'Historical setting to anchor accuracy'}: ${ctx}.

First, silently identify the concrete specifics IN THIS PASSAGE:
- WHO or WHAT is present (e.g. a shepherd, a king, fishermen, an angel, a throne, a beast) and what is happening
- WHERE it happens (e.g. a wheat field, a stormy sea, a temple, a heavenly throne room)
- The KEY OBJECTS and distinctive imagery actually named or implied (e.g. a staff, oil, a cup, chains, a scroll, lampstands, a crown)
- Any vivid METAPHOR or symbol the passage uses, rendered literally as a scene

Then write ONE concrete, cinematic scene built from THOSE specifics, placed faithfully within the setting above. Anchor it in the literal events, objects, and symbols of this exact passage so anyone could recognize which passage it is. Make it particular, not a vague mood.

${accuracyRules}

Hard rules: no readable text or words in the image; do not render the face of God or Jesus — suggest the divine through light or from behind/afar. Keep it reverent.

Respond with ONLY the image description: comma-separated concrete visual phrases naming the specific subjects, objects, and ${visionary ? 'symbolic apocalyptic' : 'period'} detail, under 65 words, no preamble.`;
}

export default function ScriptureImage({ reference, content, translation }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState('painterly');
  const [status, setStatus] = useState('idle'); // idle | prompting | loading | ready | error
  const [imgUrl, setImgUrl] = useState('');
  const [artPrompt, setArtPrompt] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const seedRef = useRef(1);

  const canCopyImage = typeof navigator !== 'undefined' && !!navigator.clipboard
    && typeof window !== 'undefined' && 'ClipboardItem' in window;

  const generate = async (reusePrompt) => {
    setError('');
    let prompt = reusePrompt || '';
    const context = getHistoricalContext(reference);

    // 1. Turn the verse into a vivid art prompt (Groq via hf-proxy). Falls back to raw verse text.
    if (!prompt) {
      setStatus('prompting');
      const text = cleanPassage(content);
      if (hasSupabaseConfig) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke('hf-proxy', {
            body: { prompt: buildArtDirectorPrompt(reference, text, context), max_new_tokens: 180 },
          });
          if (fnErr || !data?.text) throw new Error(fnErr?.message || 'No prompt');
          prompt = data.text.replace(/^["']|["']$/g, '').trim();
        } catch {
          prompt = `${fallbackPrompt(text)}, set in ${context.ctx}`;
        }
      } else {
        prompt = `${fallbackPrompt(text)}, set in ${context.ctx}`;
      }
      setArtPrompt(prompt);
    }

    // 2. Compose the final prompt with the chosen style + a reinforced anchor (historical for
    //    realist books, apocalyptic for Revelation), then generate via the image-proxy edge fn.
    const styleObj = STYLES.find((s) => s.value === style) || STYLES[0];
    const anchor = context.visionary
      ? 'visionary apocalyptic sacred imagery, luminous and otherworldly, radiant cosmic symbolism, awe-inspiring'
      : `historically accurate ${context.ctx}, Middle Eastern Semitic people, no anachronisms`;
    const finalPrompt = `${prompt}, ${styleObj.suffix}, ${anchor}, no text, no words, no watermark`;
    const seed = seedRef.current++;

    setStatus('loading');
    setImgUrl('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 },
      });
      if (fnErr || !data?.image) {
        throw new Error(data?.detail || fnErr?.message || 'No image returned');
      }
      setImgUrl(data.image); // data URL — <img> onLoad flips status to 'ready'
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not generate an image. Please try again.');
    }
  };

  const handleVisualize = () => {
    setOpen(true);
    generate('');
  };

  const handleClose = () => setOpen(false);

  const handleRegenerate = () => generate(artPrompt); // new seed, same art prompt

  // Close on Escape + lock body scroll while the full-screen modal is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleCopy = async () => {
    if (!imgUrl || !canCopyImage) return;
    try {
      // Convert to PNG — clipboards reliably accept image/png across browsers.
      // Pass the blob as a promise so Safari/WebKit keeps the user gesture valid.
      const pngBlob = (async () => {
        const blob = await (await fetch(imgUrl)).blob();
        if (blob.type === 'image/png') return blob;
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      })();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the image. Try Download instead.');
    }
  };

  const handleDownload = async () => {
    if (!imgUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${reference.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(imgUrl, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  };

  const busy = status === 'prompting' || status === 'loading';
  const passageText = cleanPassage(content);

  const modal = (
    <div className="si-modal-overlay" onClick={handleClose}>
      <div className="si-modal" onClick={(e) => e.stopPropagation()}>
        <div className="si-modal-header">
          <div className="si-title">
            <Sparkles size={16} />
            <span>Scripture Art · {reference}</span>
          </div>
          <button type="button" className="si-modal-close" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="si-body">
          <div className="si-stage">
            {busy && (
              <div className="si-loading">
                <Loader2 size={28} className="si-spin" />
                <span>{status === 'prompting' ? 'Composing the scene…' : 'Painting the image…'}</span>
              </div>
            )}

            {status === 'error' && (
              <div className="si-error">
                <AlertCircle size={20} />
                <span>{error || 'Could not generate an image. Please try again.'}</span>
              </div>
            )}

            {imgUrl && (
              <img
                src={imgUrl}
                alt={`Artistic visualization of ${reference}`}
                className={`si-image ${status === 'ready' ? 'visible' : ''}`}
                onLoad={() => setStatus('ready')}
                onError={() => { setStatus('error'); setError('The image service did not respond. Try again.'); }}
              />
            )}
          </div>

          {passageText && (
            <blockquote className="si-passage">
              <p className="si-passage-text">{passageText}</p>
              <cite className="si-passage-ref">— {reference}{translation ? ` · ${translation}` : ''}</cite>
            </blockquote>
          )}
        </div>

        <div className="si-modal-footer">
          <div className="si-style-picker">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`si-style-chip ${style === s.value ? 'active' : ''}`}
                onClick={() => {
                  setStyle(s.value);
                  if (artPrompt) generate(artPrompt);
                }}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>

          {artPrompt && status === 'ready' && <p className="si-caption">{artPrompt}</p>}

          <div className="si-actions">
            <button type="button" className="si-action-btn" onClick={handleRegenerate} disabled={busy}>
              <RefreshCw size={14} /> Regenerate
            </button>
            {canCopyImage && (
              <button type="button" className="si-action-btn" onClick={handleCopy} disabled={busy || !imgUrl}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button type="button" className="si-action-btn" onClick={handleDownload} disabled={busy || !imgUrl || downloading}>
              {downloading ? <Loader2 size={14} className="si-spin" /> : <Download size={14} />} Download
            </button>
          </div>

          <p className="si-credit">AI-generated art (FLUX via Cloudflare) · an artistic impression, not a literal depiction</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className="si-visualize-btn" onClick={handleVisualize}>
        <ImageIcon size={14} />
        Visualize this passage
      </button>
      {open && createPortal(modal, document.body)}
    </>
  );
}
