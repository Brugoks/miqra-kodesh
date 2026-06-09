import React, { useState } from 'react';
import './Studies.css';
import { BookOpen, ExternalLink, MessageSquare, FileText } from 'lucide-react';

export default function Studies() {
  const [activePortionId, setActivePortionId] = useState(1);
  const [activeTab, setActiveTab] = useState('readings');

  const portions = [
    {
      id: 1,
      name: "The Call to Love",
      translation: "Love God, Love People",
      ref: "Mark 12:28-34",
      readings: [
        { category: "Old Testament", ref: "Deuteronomy 6:4-9", badgeClass: "badge-torah" },
        { category: "Gospel Reading", ref: "Mark 12:28-34", badgeClass: "badge-gospel" },
        { category: "New Testament Epistle", ref: "Romans 13:8-10", badgeClass: "badge-haftarah" }
      ],
      summaryHtml: (
        <div className="summary-section">
          <p><strong>Loving God and Neighbor:</strong> In this study, a scribe asks Jesus which commandment is the most important of all. Jesus answers by quoting the Shema (Deut 6:4-5), calling us to love God with all our heart, soul, mind, and strength, and immediately connects it to the second commandment: to love our neighbors as ourselves. Loving God and others is the ultimate fulfillment of the Law.</p>
          <p><strong>Deuteronomy and Romans Connections:</strong> Paul in Romans 13 reinforces this lesson by stating that love is the fulfilling of the law. If we love our neighbors, we will naturally refrain from doing them harm, thereby satisfying all commandments regarding human relationships.</p>
        </div>
      ),
      questions: [
        "What does it look like practically to love God with all of your 'mind' in today's digital, distraction-filled world?",
        "Why do you think Jesus connected loving God and loving others? Can you truly have a healthy relationship with God while neglecting your neighbor?",
        "In Romans 13:10, Paul says 'love does no wrong to a neighbor.' How does this check our speech, gossip, and social media habits?"
      ]
    },
    {
      id: 2,
      name: "Walking in Unity",
      translation: "One Body, One Spirit",
      ref: "Ephesians 4:1-16",
      readings: [
        { category: "Old Testament", ref: "Psalms 133:1-3", badgeClass: "badge-torah" },
        { category: "Gospel Reading", ref: "John 17:20-23", badgeClass: "badge-gospel" },
        { category: "New Testament Epistle", ref: "Ephesians 4:1-6", badgeClass: "badge-haftarah" }
      ],
      summaryHtml: (
        <div className="summary-section">
          <p><strong>Humility & Patience:</strong> Paul encourages the Ephesian church to walk in a manner worthy of their calling. He highlights humility, gentleness, patience, and bearing with one another in love as key traits. The ultimate goal is to maintain the unity of the Spirit in the bond of peace.</p>
          <p><strong>One Body & One Faith:</strong> We are reminded that there is one body and one Spirit, one hope, one Lord, one faith, one baptism, and one God and Father of all. Christ provides various spiritual gifts to build up the body in love, helping us grow into spiritual maturity together.</p>
        </div>
      ),
      questions: [
        "Paul lists humility, gentleness, and patience as requirements for unity. Which of these is most challenging for you in your daily relationships, and why?",
        "How does Jesus' prayer for unity in John 17:21 ('that they may all be one... so that the world may believe') show the importance of how we treat each other?",
        "What are practical ways our youth group small groups can support members who feel lonely or are going through difficult struggles?"
      ]
    },
    {
      id: 3,
      name: "Stepping Out in Faith",
      translation: "Trusting God's Promises",
      ref: "Hebrews 11",
      readings: [
        { category: "Old Testament", ref: "Numbers 13:25-33", badgeClass: "badge-torah" },
        { category: "Gospel Reading", ref: "Matthew 14:22-33", badgeClass: "badge-gospel" },
        { category: "New Testament Epistle", ref: "Hebrews 11:1-6", badgeClass: "badge-haftarah" }
      ],
      summaryHtml: (
        <div className="summary-section">
          <p><strong>Faith Over Fear:</strong> Caleb and Joshua stood out from the other ten spies by focusing on God's promise rather than the giants in Canaan. Hebrews 11 defines faith as the assurance of things hoped for and the conviction of things not seen, pointing to ancient witnesses who walked in trust.</p>
          <p><strong>Focusing on Jesus:</strong> Matthew 14 shows Peter stepping out of the boat to walk on water toward Jesus. He was successful as long as his eyes were on Christ, but began to sink the moment he focused on the wind and waves. Jesus catches him and calls him to have faith without doubting.</p>
        </div>
      ),
      questions: [
        "Caleb and Joshua saw the same giants as the other ten spies but chose to trust God. What are the 'giants' (fears, pressures) in your life right now, and how can you shift your focus?",
        "Peter sank when he looked at the waves. What are typical 'waves' or distractions that cause you to lose your focus on Jesus?",
        "How does sharing our doubts and struggles in small groups help build up each other's confidence to step out in faith?"
      ]
    }
  ];

  const currentPortion = portions.find(p => p.id === activePortionId) || portions[0];

  return (
    <div className="studies-container">
      {/* Sidebar Portion Selector */}
      <section className="portion-selector-card card">
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Youth Study Series</h3>
        <div className="portion-list">
          {portions.map((portion) => (
            <button
              key={portion.id}
              onClick={() => {
                setActivePortionId(portion.id);
                setActiveTab('readings'); // Reset to readings tab on portion change
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

      {/* Main Studies Screen Content */}
      <section className="study-content-card card">
        <div className="portion-header-block">
          <span className="badge badge-gold">Weekly Small Group Series</span>
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>{currentPortion.name}</h1>
          <div className="portion-translation-subtitle">Theme: "{currentPortion.translation}" — Focus: {currentPortion.ref}</div>
        </div>

        {/* Tab Controls */}
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

        {/* Tab panes */}
        <div className="tab-pane">
          {activeTab === 'readings' && (
            <div className="animate-fade-in">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
                Select a passage below to search and read on Bible Gateway (opens in a new tab).
              </p>
              {currentPortion.readings.map((reading, idx) => (
                <div key={idx} className="reading-row">
                  <div className="reading-label">
                    <span className={`reading-category-badge ${reading.badgeClass}`}>
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
            <div className="animate-fade-in">
              {currentPortion.summaryHtml}
            </div>
          )}

          {activeTab === 'discussion' && (
            <div className="animate-fade-in">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                Use these discussion questions within your small group circles to study the scriptures together.
              </p>
              {currentPortion.questions.map((question, idx) => (
                <div key={idx} className="discussion-question-box">
                  <div className="question-num">Question {idx + 1}</div>
                  <div className="question-text">"{question}"</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
