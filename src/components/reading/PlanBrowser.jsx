import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Clock, BookOpen, Users, Copy, Check } from 'lucide-react';
import { READING_PLANS, getPlanReadings } from '../../lib/readingPlans';
import { NT_BOOKS } from '../../lib/scripture';
import { createReadingGroup } from '../../lib/readingGroups';
import './PlanBrowser.css';

const CATEGORIES = [
  { key: 'gospels', label: 'The Gospels' },
  { key: 'wholeBible', label: 'Whole Bible' },
  { key: 'chronological', label: 'Chronological' },
  { key: 'wisdom', label: 'Wisdom Literature' },
  { key: 'topical', label: 'Topical' },
];

function coverage(plan) {
  let nt = 0;
  for (const id of plan.chapters) {
    if (NT_BOOKS.has(id.split('.')[0])) nt += 1;
  }
  const otPct = Math.round(((plan.chapters.length - nt) / plan.chapters.length) * 100);
  return { otPct, ntPct: 100 - otPct };
}

function StartGroupForm({ plan, activeOrgId, userId, onClose }) {
  const [name, setName] = useState(`${plan.name} Group`);
  const [creating, setCreating] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (creating || !name.trim()) return;
    setCreating(true);
    try {
      const group = await createReadingGroup({ organizationId: activeOrgId, planId: plan.id, name: name.trim(), creatorId: userId });
      setJoinUrl(`${window.location.origin}/dashboard?plan=${plan.id}&group=${group.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (joinUrl) {
    return (
      <div className="pb-group-form">
        <p className="pb-group-created">Group created! Share this link to invite others:</p>
        <div className="pb-group-link-row">
          <input type="text" readOnly value={joinUrl} className="pb-group-link-input" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div className="pb-group-form">
      <input
        type="text"
        className="pb-group-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
      />
      <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
        {creating ? 'Creating…' : 'Create group'}
      </button>
    </div>
  );
}

function PlanDetail({ plan, currentPlanName, priorRow, activeOrgId, userId, onChoose, onClose, onBack }) {
  const day1 = getPlanReadings(plan, 1);
  const minutesPerDay = Math.round((plan.chapters.length / plan.days) * 3.5 * 10) / 10;
  const { otPct, ntPct } = coverage(plan);
  const [showGroupForm, setShowGroupForm] = useState(false);

  return (
    <div className="pb-detail">
      <button type="button" className="pb-back" onClick={onBack}>
        <ChevronLeft size={15} /> All plans
      </button>
      <h3 className="pb-detail-name">{plan.name}</h3>
      <p className="pb-detail-desc">{plan.description}</p>

      <div className="pb-detail-stats">
        <span><BookOpen size={13} /> {plan.chapters.length} chapters</span>
        <span><Clock size={13} /> ~{minutesPerDay} min/day</span>
        <span>{plan.days} days</span>
      </div>

      {(otPct > 0 && ntPct > 0) && (
        <div className="pb-coverage" title={`${otPct}% Old Testament · ${ntPct}% New Testament`}>
          <div className="pb-coverage-ot" style={{ width: `${otPct}%` }} />
          <div className="pb-coverage-nt" style={{ width: `${ntPct}%` }} />
        </div>
      )}

      <div className="pb-detail-sample">
        <p className="pb-detail-sample-label">Day 1</p>
        <div className="pb-detail-sample-chips">
          {day1.map((r) => <span key={r.label} className="pb-sample-chip">{r.label}</span>)}
        </div>
      </div>

      {currentPlanName && currentPlanName !== plan.name && (
        <p className="pb-switch-note">Starting this will pause “{currentPlanName}” — your progress there is kept.</p>
      )}

      {priorRow && (priorRow.status === 'abandoned' || priorRow.status === 'completed') ? (
        <div className="pb-restart-choice">
          <button type="button" className="btn-primary" onClick={() => onChoose(plan.id, { resetProgress: false })}>
            Continue where I left off
          </button>
          <button type="button" className="btn-secondary" onClick={() => onChoose(plan.id, { resetProgress: true })}>
            Start over
          </button>
        </div>
      ) : (
        <button type="button" className="btn-primary pb-start-btn" onClick={() => onChoose(plan.id)}>
          Start this plan <ChevronRight size={14} />
        </button>
      )}

      {activeOrgId && userId && (
        showGroupForm ? (
          <StartGroupForm plan={plan} activeOrgId={activeOrgId} userId={userId} onClose={onClose} />
        ) : (
          <button type="button" className="btn-secondary pb-group-btn" onClick={() => setShowGroupForm(true)}>
            <Users size={14} /> Start as a group
          </button>
        )
      )}
    </div>
  );
}

// Category-grouped catalog of reading plans, opened from the card or a
// `?plan=<id>` deep link. Selection logic (pause-and-switch, continue vs.
// restart) is decided here but executed by the single onChoose callback —
// the parent (ReadingPlanCard) owns the actual hook actions.
export default function PlanBrowser({ plans = READING_PLANS, currentPlanName, existingRow, activeOrgId, userId, initialPlanId, onChoose, onClose }) {
  const [selectedId, setSelectedId] = useState(initialPlanId || null);
  const selected = plans.find((p) => p.id === selectedId) || null;

  return (
    <div className="pb-overlay" onClick={onClose}>
      <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pb-header">
          <h2>Reading Plans</h2>
          <button type="button" className="pb-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="pb-body">
          {selected ? (
            <PlanDetail
              plan={selected}
              currentPlanName={currentPlanName}
              priorRow={existingRow?.(selected.id)}
              activeOrgId={activeOrgId}
              userId={userId}
              onChoose={onChoose}
              onClose={onClose}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            CATEGORIES.map(({ key, label }) => {
              const inCategory = plans.filter((p) => p.category === key);
              if (!inCategory.length) return null;
              return (
                <div key={key} className="pb-category">
                  <h3 className="pb-category-label">{label}</h3>
                  <div className="pb-grid">
                    {inCategory.map((plan) => {
                      const { otPct, ntPct } = coverage(plan);
                      return (
                        <button key={plan.id} type="button" className="pb-card" onClick={() => setSelectedId(plan.id)}>
                          <span className="pb-card-name">{plan.name}</span>
                          <span className="pb-card-meta">{plan.days} days · {plan.paceLabel}</span>
                          {(otPct > 0 && ntPct > 0) && (
                            <div className="pb-coverage pb-coverage-mini">
                              <div className="pb-coverage-ot" style={{ width: `${otPct}%` }} />
                              <div className="pb-coverage-nt" style={{ width: `${ntPct}%` }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
