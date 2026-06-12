import { useEffect, useState } from 'react';
import './Studies.css';
import { BookOpen, ExternalLink, MessageSquare, FileText } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const fallbackPortions = [
  {
    id: 'study_love',
    name: 'The Call to Love',
    translation: 'Love God, Love People',
    ref: 'Mark 12:28-34',
    readings: [
      { category: 'Old Testament', ref: 'Deuteronomy 6:4-9', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'Mark 12:28-34', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Romans 13:8-10', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      'Loving God and Neighbor: In this study, a scribe asks Jesus which commandment is the most important of all. Jesus answers by quoting the Shema (Deut 6:4-5), calling us to love God with all our heart, soul, mind, and strength, and immediately connects it to the second commandment: to love our neighbors as ourselves. Loving God and others is the ultimate fulfillment of the Law.',
      'Deuteronomy and Romans Connections: Paul in Romans 13 reinforces this lesson by stating that love is the fulfilling of the law. If we love our neighbors, we will naturally refrain from doing them harm, thereby satisfying all commandments regarding human relationships.',
    ],
    questions: [
      "What does it look like practically to love God with all of your 'mind' in today's digital, distraction-filled world?",
      'Why do you think Jesus connected loving God and loving others? Can you truly have a healthy relationship with God while neglecting your neighbor?',
      "In Romans 13:10, Paul says 'love does no wrong to a neighbor.' How does this check our speech, gossip, and social media habits?",
    ],
  },
  {
    id: 'study_unity',
    name: 'Walking in Unity',
    translation: 'One Body, One Spirit',
    ref: 'Ephesians 4:1-16',
    readings: [
      { category: 'Old Testament', ref: 'Psalms 133:1-3', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'John 17:20-23', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Ephesians 4:1-6', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      'Humility & Patience: Paul encourages the Ephesian church to walk in a manner worthy of their calling. He highlights humility, gentleness, patience, and bearing with one another in love as key traits. The ultimate goal is to maintain the unity of the Spirit in the bond of peace.',
      'One Body & One Faith: We are reminded that there is one body and one Spirit, one hope, one Lord, one faith, one baptism, and one God and Father of all. Christ provides various spiritual gifts to build up the body in love, helping us grow into spiritual maturity together.',
    ],
    questions: [
      'Paul lists humility, gentleness, and patience as requirements for unity. Which of these is most challenging for you in your daily relationships, and why?',
      "How does Jesus' prayer for unity in John 17:21 show the importance of how we treat each other?",
      'What are practical ways our student small groups can support members who feel lonely or are going through difficult struggles?',
    ],
  },
  {
    id: 'study_faith',
    name: 'Stepping Out in Faith',
    translation: "Trusting God's Promises",
    ref: 'Hebrews 11',
    readings: [
      { category: 'Old Testament', ref: 'Numbers 13:25-33', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'Matthew 14:22-33', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Hebrews 11:1-6', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      "Faith Over Fear: Caleb and Joshua stood out from the other ten spies by focusing on God's promise rather than the giants in Canaan. Hebrews 11 defines faith as the assurance of things hoped for and the conviction of things not seen, pointing to ancient witnesses who walked in trust.",
      'Focusing on Jesus: Matthew 14 shows Peter stepping out of the boat to walk on water toward Jesus. He was successful as long as his eyes were on Christ, but began to sink the moment he focused on the wind and waves. Jesus catches him and calls him to have faith without doubting.',
    ],
    questions: [
      "Caleb and Joshua saw the same giants as the other ten spies but chose to trust God. What are the 'giants' in your life right now, and how can you shift your focus?",
      "Peter sank when he looked at the waves. What are typical 'waves' or distractions that cause you to lose your focus on Jesus?",
      "How does sharing our doubts and struggles in small groups help build up each other's confidence to step out in faith?",
    ],
  },
];

const splitSummary = (summaryText) => {
  const [label, ...rest] = summaryText.split(':');
  return rest.length ? { label, body: rest.join(':').trim() } : { label: '', body: summaryText };
};

export default function Studies({ activeOrgId }) {
  const [portions, setPortions] = useState(fallbackPortions);
  const [activePortionId, setActivePortionId] = useState(fallbackPortions[0].id);
  const [activeTab, setActiveTab] = useState('readings');

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    let isMounted = true;

    let query = supabase
      .from('study_series')
      .select('*')
      .order('sort_order', { ascending: true });

    if (activeOrgId) {
      query = query.eq('organization_id', activeOrgId);
    }

    query.then(({ data, error }) => {
      if (!isMounted || error) return;

      const studyData = data?.length ? data : [];
      if (!studyData.length) {
        setPortions(fallbackPortions);
        setActivePortionId(fallbackPortions[0].id);
        return;
      }

      const mapped = studyData.map((item) => ({
        id: item.id,
        name: item.name,
        translation: item.translation,
        ref: item.ref,
        readings: item.readings || [],
        summary: item.summary || [],
        questions: item.questions || [],
      }));

      setPortions(mapped);
      setActivePortionId((current) => mapped.some((portion) => portion.id === current) ? current : mapped[0].id);
    });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId]);

  const currentPortion = portions.find(p => p.id === activePortionId) || portions[0];

  return (
    <div className="studies-container">
      <section className="portion-selector-card card">
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Student Study Series</h3>
        <div className="portion-list">
          {portions.map((portion) => (
            <button
              key={portion.id}
              onClick={() => {
                setActivePortionId(portion.id);
                setActiveTab('readings');
              }}
              className={`portion-btn ${portion.id === activePortionId ? 'active' : ''}`}
            >
              <span className="portion-btn-name">{portion.name}</span>
              <span className="portion-btn-translation">"{portion.translation}"</span>
              <span className="portion-btn-ref">{portion.ref}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="study-content-card card">
        <div className="portion-header-block">
          <span className="badge badge-gold">Weekly Small Group Series</span>
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>{currentPortion.name}</h1>
          <div className="portion-translation-subtitle">Theme: "{currentPortion.translation}" - Focus: {currentPortion.ref}</div>
        </div>

        <div className="study-tabs">
          <button
            onClick={() => setActiveTab('readings')}
            className={`study-tab-btn ${activeTab === 'readings' ? 'active' : ''}`}
          >
            <BookOpen size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Scripture Readings
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`study-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          >
            <FileText size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Lesson Summary
          </button>
          <button
            onClick={() => setActiveTab('discussion')}
            className={`study-tab-btn ${activeTab === 'discussion' ? 'active' : ''}`}
          >
            <MessageSquare size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Discussion Guide
          </button>
        </div>

        <div className="tab-pane">
          {activeTab === 'readings' && (
            <div className="animate-fade-in">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
                Select a passage below to search and read on Bible Gateway (opens in a new tab).
              </p>
              {currentPortion.readings.map((reading, idx) => (
                <div key={`${reading.ref}-${idx}`} className="reading-row">
                  <div className="reading-label">
                    <span className={`reading-category-badge ${reading.badgeClass || 'badge-torah'}`}>
                      {reading.category}
                    </span>
                    <span className="reading-title">{reading.ref}</span>
                  </div>
                  <a
                    href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(reading.ref)}&version=ESV`}
                    target="_blank"
                    rel="noreferrer"
                    className="bible-gateway-btn"
                  >
                    <span>Read on Bible Gateway</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="summary-section animate-fade-in">
              {currentPortion.summary.map((section, idx) => {
                const { label, body } = splitSummary(section);
                return (
                  <p key={`${label}-${idx}`}>
                    {label && <strong>{label}:</strong>} {body}
                  </p>
                );
              })}
            </div>
          )}

          {activeTab === 'discussion' && (
            <div className="discussion-section animate-fade-in">
              <ol>
                {currentPortion.questions.map((question, idx) => (
                  <li key={`${question}-${idx}`}>{question}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
