import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { buildReelsRoster } from '../../lib/reels';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import wikiAnimations from '../../assets/wiki-animations.json';

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The "Explore" mode of Character Reels: a vertical snap-scroll feed — looping
// ambient animations where they exist, a slow Ken Burns drift on the generated
// still everywhere else. Only the visible card plays; ?c=<slug> deep-links a
// card (and is kept current, so back from a wiki entry returns to the same one).
export default function ReelsExplore({ wiki }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roster = useMemo(() => buildReelsRoster(wiki.entries, wikiAnimations), [wiki]);
  const [broken, setBroken] = useState(() => new Set());
  const [videoFailed, setVideoFailed] = useState(() => new Set());
  // Autoplay with sound is blocked until a user gesture, so the feed starts
  // muted; the toggle tap is the gesture, and the choice sticks for the session.
  const [soundOn, setSoundOn] = useState(() => {
    try { return sessionStorage.getItem('reels:sound') === '1'; } catch { return false; }
  });
  const soundOnRef = useRef(soundOn);
  const [activeSlug, setActiveSlug] = useState(() => searchParams.get('c'));
  const activeSlugRef = useRef(activeSlug);
  useEffect(() => { activeSlugRef.current = activeSlug; }, [activeSlug]);
  const feedRef = useRef(null);
  const cardRefs = useRef(new Map());
  const videoRefs = useRef(new Map());
  const didInitialScroll = useRef(false);

  const cards = useMemo(
    () => roster.filter((c) => !broken.has(c.slug)),
    [roster, broken],
  );
  const activeIndex = Math.max(0, cards.findIndex((c) => c.slug === activeSlug));

  // Jump straight to the deep-linked / returned-to card on first render.
  useEffect(() => {
    if (!cards.length || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const target = searchParams.get('c');
    if (!target) return;
    cardRefs.current.get(target)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [cards, searchParams]);

  // The card filling the viewport becomes active.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !cards.length) return undefined;
    const observer = new IntersectionObserver((observed) => {
      for (const entry of observed) {
        if (entry.isIntersecting) setActiveSlug(entry.target.dataset.slug);
      }
    }, { root: feed, threshold: 0.6 });
    for (const el of cardRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [cards]);

  // Start (or resume) a clip honoring the sound choice. If the browser
  // rejects unmuted playback (session-restored "on" without a gesture yet),
  // fall back to muted rather than freezing the card.
  const playVideo = useCallback((video) => {
    video.muted = !soundOnRef.current;
    video.play().catch(() => {
      if (!video.muted) {
        setSoundOn(false);
        video.muted = true;
        video.play().catch(() => {});
      }
    });
  }, []);

  // Active card plays, everything else pauses; keep ?c= shareable/restorable.
  useEffect(() => {
    if (!activeSlug) return;
    for (const [slug, video] of videoRefs.current) {
      if (slug === activeSlug) playVideo(video);
      else video.pause();
    }
    if (searchParams.get('c') !== activeSlug) {
      setSearchParams({ c: activeSlug }, { replace: true });
    }
  }, [activeSlug, searchParams, setSearchParams, playVideo]);

  // Apply the sound choice to every clip; unmuting asks the music dock to yield.
  useEffect(() => {
    soundOnRef.current = soundOn;
    for (const video of videoRefs.current.values()) video.muted = !soundOn;
    try { sessionStorage.setItem('reels:sound', soundOn ? '1' : '0'); } catch { /* blocked */ }
    if (soundOn) window.dispatchEvent(new CustomEvent('miniplayer:pause'));
  }, [soundOn, cards]);

  // Browsers pause offscreen-tab videos and don't always resume loops.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const video = videoRefs.current.get(activeSlugRef.current);
      if (video) playVideo(video);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [playVideo]);

  const setCardRef = (slug) => (el) => {
    if (el) cardRefs.current.set(slug, el);
    else cardRefs.current.delete(slug);
  };
  const setVideoRef = (slug) => (el) => {
    if (el) {
      videoRefs.current.set(slug, el);
      el.muted = !soundOnRef.current;
      if (slug === activeSlugRef.current) playVideo(el);
    } else {
      videoRefs.current.delete(slug);
    }
  };
  const dropCard = (slug) => setBroken((prev) => new Set(prev).add(slug));

  return (
    <>
      <button
        type="button"
        className="reels-sound"
        onClick={() => setSoundOn((v) => !v)}
        aria-label={soundOn ? 'Mute' : 'Unmute'}
        aria-pressed={soundOn}
      >
        {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
      </button>

      <div className="reels-feed" ref={feedRef}>
        {cards.map((c, i) => {
          const near = Math.abs(i - activeIndex) <= 1;
          const isActive = c.slug === activeSlug || (!activeSlug && i === 0);
          const useVideo = c.animHash && !prefersReducedMotion && !videoFailed.has(c.slug);
          return (
            <section
              key={c.slug}
              ref={setCardRef(c.slug)}
              data-slug={c.slug}
              className={`reel-card${isActive ? ' active' : ''}`}
            >
              <div className="reel-frame">
                <img
                  className="reel-bg"
                  src={wikiImageUrl(`_default/thumbs/${c.slug}.jpg`)}
                  alt=""
                  aria-hidden="true"
                  loading={near ? 'eager' : 'lazy'}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                {useVideo ? (
                  <video
                    ref={setVideoRef(c.slug)}
                    className="reel-media"
                    src={`${wikiImageUrl(`_default/anim/${c.slug}.mp4`)}?v=${c.animHash}`}
                    poster={`${wikiImageUrl(`_default/anim/${c.slug}.jpg`)}?v=${c.animHash}`}
                    preload={near ? 'auto' : 'metadata'}
                    muted
                    loop
                    playsInline
                    aria-label={c.name}
                    onError={() => setVideoFailed((prev) => new Set(prev).add(c.slug))}
                  />
                ) : (
                  <img
                    className={`reel-media reel-kb reel-kb-${i % 3}`}
                    src={wikiImageUrl(`_default/${c.slug}.jpg`)}
                    alt={c.name}
                    loading={near ? 'eager' : 'lazy'}
                    onError={() => dropCard(c.slug)}
                  />
                )}
                <div className="reel-overlay">
                  <h2>{c.name}</h2>
                  {c.era && <p className="reel-era">{c.era}</p>}
                  <p className="reel-desc">{c.desc}</p>
                  {c.keyVerse && (
                    <span className="reel-verse"><BookOpen size={13} /> {c.keyVerse}</span>
                  )}
                  <button
                    type="button"
                    className="reel-cta"
                    onClick={() => navigate(`/wiki/${c.slug}`)}
                  >
                    Read their story →
                  </button>
                </div>
              </div>
            </section>
          );
        })}
        {!cards.length && (
          <p className="reels-empty">Character pictures haven't been published yet.</p>
        )}
      </div>

      {activeIndex === 0 && cards.length > 1 && (
        <div className="reels-hint" aria-hidden="true">
          <ChevronDown size={16} /> Swipe
        </div>
      )}
    </>
  );
}
