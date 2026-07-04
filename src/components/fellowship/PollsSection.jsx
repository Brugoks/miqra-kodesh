import { useEffect, useState } from 'react';
import { Plus, BarChart2, X, Check, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import useRealtimeRefresh from './useRealtimeRefresh';

const makeVoteId = () => `vote_${crypto.randomUUID()}`;
const makeOptionId = () => `opt_${crypto.randomUUID()}`;

export default function PollsSection({ session, userId, isConfigured, activeOrgId, groups, myGroupIds, canCreateGroups, onPollsChange, refreshTrigger }) {
  const [polls, setPolls] = useState([]);
  const [userVotes, setUserVotes] = useState({}); // { pollId: optionId }
  const [pollStatusFilter, setPollStatusFilter] = useState('active');
  const [pollScopeFilter, setPollScopeFilter] = useState('all'); // 'mine' | 'all'
  const [pollsError, setPollsError] = useState('');
  const [showCreatePollForm, setShowCreatePollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollGroupKey, setPollGroupKey] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollExpiresAt, setPollExpiresAt] = useState('');

  const [editingPollId, setEditingPollId] = useState(null);
  const [editPollQuestion, setEditPollQuestion] = useState('');
  const [editPollGroupKey, setEditPollGroupKey] = useState('');
  const [editPollOptions, setEditPollOptions] = useState([]);
  const [editPollExpiresAt, setEditPollExpiresAt] = useState('');
  const [editPollIsClosed, setEditPollIsClosed] = useState(false);
  const [writeInTexts, setWriteInTexts] = useState({}); // { [pollId]: '' }

  // Default members (non-leaders) to their own groups' polls once memberships load.
  const [scopeAutoSet, setScopeAutoSet] = useState(false);
  if (!scopeAutoSet && !canCreateGroups && myGroupIds.length > 0) {
    setScopeAutoSet(true);
    setPollScopeFilter('mine');
  }

  const loadPollsData = async () => {
    if (isConfigured) {
      let pollQuery = supabase.from('polls').select('*').order('created_at', { ascending: false });
      let voteQuery = supabase.from('poll_votes').select('*');

      if (activeOrgId) {
        pollQuery = pollQuery.eq('organization_id', activeOrgId);
        voteQuery = voteQuery.eq('organization_id', activeOrgId);
      }

      const [{ data: pollRows }, { data: voteRows }] = await Promise.all([
        pollQuery,
        voteQuery,
      ]);

      const voteCountMap = {};
      const userVoteMap = {};
      (voteRows || []).forEach(v => {
        const key = `${v.poll_id}_${v.option_id}`;
        voteCountMap[key] = (voteCountMap[key] || 0) + 1;
        if (v.user_id === userId) userVoteMap[v.poll_id] = v.option_id;
      });

      setUserVotes(userVoteMap);
      setPolls((pollRows || []).map(p => ({
        id: p.id,
        groupKey: p.group_key,
        groupName: p.group_name,
        question: p.question,
        options: (p.options || []).map(opt => ({
          ...opt,
          votes: voteCountMap[`${p.id}_${opt.id}`] || 0,
        })),
        createdByName: p.created_by_name,
        createdAt: p.created_at,
        expiresAt: p.expires_at,
        isClosed: p.is_closed,
      })));
    } else {
      const saved = localStorage.getItem('miqra_polls');
      const savedVotes = localStorage.getItem('miqra_poll_votes');
      const allVotes = saved ? (JSON.parse(savedVotes || '[]')) : [];
      const voteCountMap = {};
      const userVoteMap = {};
      allVotes.forEach(v => {
        const key = `${v.pollId}_${v.optionId}`;
        voteCountMap[key] = (voteCountMap[key] || 0) + 1;
        if (v.userId === userId) userVoteMap[v.pollId] = v.optionId;
      });
      setUserVotes(userVoteMap);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPolls(parsed.map(p => ({
          ...p,
          options: (p.options || []).map(opt => ({
            ...opt,
            votes: voteCountMap[`${p.id}_${opt.id}`] || 0,
          })),
        })));
      }
    }
  };

  useEffect(() => {
    // Hydrates poll state from local/Supabase storage when the session context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPollsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId, activeOrgId, refreshTrigger]);

  useRealtimeRefresh(
    `fellowship-polls-${activeOrgId || 'local'}`,
    ['polls', 'poll_votes'],
    loadPollsData,
    isConfigured,
  );

  const isActivePoll = (poll) =>
    !poll.isClosed && (!poll.expiresAt || new Date(poll.expiresAt) > new Date());

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2 || !pollGroupKey) return;
    const group = groups[pollGroupKey];
    const newPoll = {
      id: `poll_${crypto.randomUUID()}`,
      groupKey: pollGroupKey,
      groupName: group?.name || pollGroupKey,
      question: pollQuestion.trim(),
      options: validOptions.map((text) => ({ id: makeOptionId(), text: text.trim(), votes: 0 })),
      createdByName: session?.user?.user_metadata?.full_name || '',
      createdAt: new Date().toISOString(),
      expiresAt: pollExpiresAt ? new Date(pollExpiresAt).toISOString() : null,
      isClosed: false,
    };
    const prevPolls = polls;
    setPolls(prev => [newPoll, ...prev]);
    setPollsError('');
    if (isConfigured) {
      const { error } = await supabase.from('polls').insert({
        id: newPoll.id,
        group_key: newPoll.groupKey,
        group_name: newPoll.groupName,
        question: newPoll.question,
        options: newPoll.options.map(({ id, text }) => ({ id, text })),
        created_by_name: newPoll.createdByName,
        expires_at: newPoll.expiresAt,
        is_closed: false,
      });
      if (error) {
        console.error('Error creating poll:', error);
        setPolls(prevPolls);
        setPollsError('Could not create the poll. Please try again.');
        return;
      }
    } else {
      const existing = JSON.parse(localStorage.getItem('miqra_polls') || '[]');
      localStorage.setItem('miqra_polls', JSON.stringify([newPoll, ...existing]));
    }
    setPollQuestion('');
    setPollGroupKey('');
    setPollOptions(['', '']);
    setPollExpiresAt('');
    setShowCreatePollForm(false);
    if (onPollsChange) onPollsChange();
  };

  const handleVote = async (pollId, optionId) => {
    if (userVotes[pollId] || !userId) return;
    const prevPolls = polls;
    const prevVotes = userVotes;
    setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
    setPolls(prev => prev.map(p => p.id !== pollId ? p : {
      ...p,
      options: p.options.map(opt => ({ ...opt, votes: opt.id === optionId ? opt.votes + 1 : opt.votes }))
    }));
    setPollsError('');
    if (isConfigured) {
      const { error } = await supabase.from('poll_votes').insert({ id: makeVoteId(), poll_id: pollId, user_id: userId, option_id: optionId });
      if (error) {
        console.error('Error recording vote:', error);
        setPolls(prevPolls);
        setUserVotes(prevVotes);
        setPollsError('Could not record your vote. Please try again.');
        return;
      }
    } else {
      const existing = JSON.parse(localStorage.getItem('miqra_poll_votes') || '[]');
      localStorage.setItem('miqra_poll_votes', JSON.stringify([...existing, { pollId, userId, optionId }]));
    }
    if (onPollsChange) onPollsChange();
  };

  const handleChangeVote = async (pollId) => {
    const previousOption = userVotes[pollId];
    if (!previousOption || !userId) return;
    const prevPolls = polls;
    const prevVotes = userVotes;
    setUserVotes(prev => {
      const copy = { ...prev };
      delete copy[pollId];
      return copy;
    });
    setPolls(prev => prev.map(p => p.id !== pollId ? p : {
      ...p,
      options: p.options.map(opt => ({ ...opt, votes: opt.id === previousOption ? Math.max(opt.votes - 1, 0) : opt.votes }))
    }));
    setPollsError('');
    if (isConfigured) {
      const { error } = await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', userId);
      if (error) {
        console.error('Error removing vote:', error);
        setPolls(prevPolls);
        setUserVotes(prevVotes);
        setPollsError('Could not change your vote. Please try again.');
        return;
      }
    } else {
      const existing = JSON.parse(localStorage.getItem('miqra_poll_votes') || '[]');
      localStorage.setItem('miqra_poll_votes', JSON.stringify(
        existing.filter(v => !(v.pollId === pollId && v.userId === userId))
      ));
    }
    if (onPollsChange) onPollsChange();
  };

  const handleClosePoll = async (pollId) => {
    const prevPolls = polls;
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isClosed: true } : p));
    setPollsError('');
    if (isConfigured) {
      const { error } = await supabase.from('polls').update({ is_closed: true }).eq('id', pollId);
      if (error) {
        console.error('Error closing poll:', error);
        setPolls(prevPolls);
        setPollsError('Could not close the poll. Please try again.');
        return;
      }
    } else {
      const updated = polls.map(p => p.id === pollId ? { ...p, isClosed: true } : p);
      localStorage.setItem('miqra_polls', JSON.stringify(updated));
    }
    if (onPollsChange) onPollsChange();
  };

  const handleDeletePoll = async (pollId) => {
    const poll = polls.find(p => p.id === pollId);
    if (!poll || !window.confirm(`Delete the poll "${poll.question}"? This removes all its votes.`)) return;
    const prevPolls = polls;
    setPolls(prev => prev.filter(p => p.id !== pollId));
    setPollsError('');
    if (isConfigured) {
      const { error } = await supabase.from('polls').delete().eq('id', pollId);
      if (error) {
        console.error('Error deleting poll:', error);
        setPolls(prevPolls);
        setPollsError('Could not delete the poll. Please try again.');
        return;
      }
    } else {
      localStorage.setItem('miqra_polls', JSON.stringify(polls.filter(p => p.id !== pollId)));
    }
    if (onPollsChange) onPollsChange();
  };

  const startEditingPoll = (poll) => {
    setEditingPollId(poll.id);
    setEditPollQuestion(poll.question);
    setEditPollGroupKey(poll.groupKey);
    setEditPollOptions(poll.options.map(opt => ({ id: opt.id, text: opt.text })));
    setEditPollExpiresAt(poll.expiresAt ? new Date(poll.expiresAt).toISOString().split('T')[0] : '');
    setEditPollIsClosed(poll.isClosed || false);
  };

  const handleSavePollEdit = async (e) => {
    e.preventDefault();
    if (!editingPollId) return;
    const validOptions = editPollOptions.filter(o => o.text.trim());
    if (!editPollQuestion.trim() || validOptions.length < 2 || !editPollGroupKey) return;
    const group = groups[editPollGroupKey];
    const originalPoll = polls.find(p => p.id === editingPollId);
    const updatedOptions = validOptions.map((opt) => {
      if (opt.id) {
        const originalOpt = originalPoll?.options.find(o => o.id === opt.id);
        return {
          id: opt.id,
          text: opt.text.trim(),
          votes: originalOpt ? originalOpt.votes : 0
        };
      } else {
        return {
          id: makeOptionId(),
          text: opt.text.trim(),
          votes: 0
        };
      }
    });
    const updatedPolls = polls.map(p => {
      if (p.id === editingPollId) {
        return {
          ...p,
          groupKey: editPollGroupKey,
          groupName: group?.name || editPollGroupKey,
          question: editPollQuestion.trim(),
          options: updatedOptions,
          expiresAt: editPollExpiresAt ? new Date(editPollExpiresAt).toISOString() : null,
          isClosed: editPollIsClosed,
        };
      }
      return p;
    });
    const originalOptionIds = originalPoll?.options.map(o => o.id) || [];
    const remainingOptionIds = updatedOptions.map(o => o.id);
    const deletedOptionIds = originalOptionIds.filter(id => !remainingOptionIds.includes(id));
    setPolls(updatedPolls);
    setEditingPollId(null);
    if (isConfigured) {
      await supabase.from('polls').update({
        group_key: editPollGroupKey,
        group_name: group?.name || editPollGroupKey,
        question: editPollQuestion.trim(),
        options: updatedOptions.map(({ id, text }) => ({ id, text })),
        expires_at: editPollExpiresAt ? new Date(editPollExpiresAt).toISOString() : null,
        is_closed: editPollIsClosed,
      }).eq('id', editingPollId);
      if (deletedOptionIds.length > 0) {
        await supabase.from('poll_votes')
          .delete()
          .eq('poll_id', editingPollId)
          .in('option_id', deletedOptionIds);
      }
    } else {
      localStorage.setItem('miqra_polls', JSON.stringify(updatedPolls));
      if (deletedOptionIds.length > 0) {
        const savedVotes = localStorage.getItem('miqra_poll_votes');
        if (savedVotes) {
          const allVotes = JSON.parse(savedVotes);
          const remainingVotes = allVotes.filter(v =>
            !(v.pollId === editingPollId && deletedOptionIds.includes(v.optionId))
          );
          localStorage.setItem('miqra_poll_votes', JSON.stringify(remainingVotes));
        }
      }
    }
    const myCurrentVote = userVotes[editingPollId];
    if (myCurrentVote && deletedOptionIds.includes(myCurrentVote)) {
      setUserVotes(prev => {
        const copy = { ...prev };
        delete copy[editingPollId];
        return copy;
      });
    }
    if (onPollsChange) onPollsChange();
  };

  const handleAddWriteIn = async (pollId) => {
    const text = writeInTexts[pollId] || '';
    if (!text.trim() || !userId) return;

    const optionId = makeOptionId();
    const cleanText = text.trim();

    if (isConfigured) {
      const { error } = await supabase.rpc('add_write_in_option', {
        p_poll_id: pollId,
        p_option_id: optionId,
        p_option_text: cleanText,
        p_user_id: userId
      });

      if (error) {
        console.error('Error adding write-in option:', error);
        setPollsError(error.message || 'Failed to add your suggestion. Please try again.');
        return;
      }

      setPolls(prev => prev.map(p => {
        if (p.id !== pollId) return p;
        return {
          ...p,
          options: [...p.options, { id: optionId, text: cleanText, votes: 1 }]
        };
      }));
      setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
    } else {
      const savedPolls = localStorage.getItem('miqra_polls');
      const allPolls = savedPolls ? JSON.parse(savedPolls) : [];

      const updatedPolls = allPolls.map(p => {
        if (p.id !== pollId) return p;
        return {
          ...p,
          options: [...(p.options || []), { id: optionId, text: cleanText, votes: 1 }]
        };
      });

      localStorage.setItem('miqra_polls', JSON.stringify(updatedPolls));

      const savedVotes = localStorage.getItem('miqra_poll_votes');
      const allVotes = savedVotes ? JSON.parse(savedVotes) : [];
      localStorage.setItem('miqra_poll_votes', JSON.stringify([...allVotes, { pollId, userId, optionId }]));

      setPolls(prev => prev.map(p => {
        if (p.id !== pollId) return p;
        return {
          ...p,
          options: [...p.options, { id: optionId, text: cleanText, votes: 1 }]
        };
      }));
      setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
    }

    setWriteInTexts(prev => ({ ...prev, [pollId]: '' }));

    if (onPollsChange) onPollsChange();
  };

  const filteredPolls = polls.filter(p => {
    const statusMatch = pollStatusFilter === 'active' ? isActivePoll(p) : !isActivePoll(p);
    const scopeMatch = pollScopeFilter === 'all' || myGroupIds.includes(p.groupKey);
    return statusMatch && scopeMatch;
  });

  return (
    <section id="polls" className="polls-section card">
      <div className="polls-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <BarChart2 size={18} style={{ color: 'var(--accent-gold)' }} />
          <h2 style={{ margin: 0 }}>Polls</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="groups-filter-pills">
            <button
              className={`group-filter-pill ${pollScopeFilter === 'mine' ? 'active' : ''}`}
              onClick={() => setPollScopeFilter('mine')}
            >
              My Groups
            </button>
            <button
              className={`group-filter-pill ${pollScopeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPollScopeFilter('all')}
            >
              All
            </button>
          </div>
          <div className="groups-filter-pills">
            <button
              className={`group-filter-pill ${pollStatusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setPollStatusFilter('active')}
            >
              Active
            </button>
            <button
              className={`group-filter-pill ${pollStatusFilter === 'expired' ? 'active' : ''}`}
              onClick={() => setPollStatusFilter('expired')}
            >
              Expired
            </button>
          </div>
          {canCreateGroups && (
            <button
              className="btn-primary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => setShowCreatePollForm(v => !v)}
            >
              <Plus size={15} />
              <span>{showCreatePollForm ? 'Close' : 'New Poll'}</span>
            </button>
          )}
        </div>
      </div>

      {pollsError && (
        <p className="section-error">{pollsError}</p>
      )}

      {canCreateGroups && showCreatePollForm && (
        <form onSubmit={handleCreatePoll} className="new-group-form animate-fade-in">
          <div className="new-group-form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Question</label>
              <input
                type="text"
                placeholder="e.g. What snacks should we get?"
                value={pollQuestion}
                onChange={e => setPollQuestion(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Group</label>
              <select value={pollGroupKey} onChange={e => setPollGroupKey(e.target.value)} required>
                <option value="">Select group</option>
                {Object.entries(groups).map(([key, g]) => (
                  <option key={key} value={key}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Expires (optional)</label>
              <input type="date" value={pollExpiresAt} onChange={e => setPollExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="poll-options-builder">
            <label className="form-group" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Options
            </label>
            {pollOptions.map((opt, i) => (
              <div key={i} className="poll-option-input-row">
                <input
                  type="text"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                />
                {pollOptions.length > 2 && (
                  <button type="button" className="btn-icon text-red" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setPollOptions(prev => [...prev, ''])}>
                <Plus size={13} /> Add Option
              </button>
            )}
          </div>
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowCreatePollForm(false)}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <BarChart2 size={14} /> Create Poll
            </button>
          </div>
        </form>
      )}

      {filteredPolls.length === 0 ? (
        <div className="groups-empty">
          <p>
            {pollScopeFilter === 'mine' && polls.length > 0
              ? 'No polls for your groups right now.'
              : pollStatusFilter === 'active' ? 'No active polls right now.' : 'No expired polls yet.'}
          </p>
        </div>
      ) : (
        <div className="polls-card-grid">
          {filteredPolls.map(poll => {
            if (editingPollId === poll.id) {
              return (
                <form key={poll.id} onSubmit={handleSavePollEdit} className="poll-card poll-edit-form animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <span className="badge badge-gold" style={{ fontSize: '0.65rem', alignSelf: 'flex-start' }}>Editing Poll</span>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Question</label>
                      <input
                        type="text"
                        className="poll-edit-input"
                        value={editPollQuestion}
                        onChange={e => setEditPollQuestion(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Group</label>
                      <select
                        className="poll-edit-input"
                        value={editPollGroupKey}
                        onChange={e => setEditPollGroupKey(e.target.value)}
                        required
                      >
                        <option value="">Select group</option>
                        {Object.entries(groups).map(([key, g]) => (
                          <option key={key} value={key}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expires (optional)</label>
                      <input
                        type="date"
                        className="poll-edit-input"
                        value={editPollExpiresAt}
                        onChange={e => setEditPollExpiresAt(e.target.value)}
                      />
                    </div>

                    <div className="poll-options-builder" style={{ marginTop: '0.4rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                        Options
                      </label>
                      {editPollOptions.map((opt, i) => (
                        <div key={i} className="poll-option-input-row" style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="poll-edit-input"
                            style={{ flex: 1 }}
                            placeholder={`Option ${i + 1}`}
                            value={opt.text}
                            onChange={e => setEditPollOptions(prev => prev.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                            required
                          />
                          {editPollOptions.length > 2 && (
                            <button
                              type="button"
                              className="btn-icon text-red"
                              onClick={() => setEditPollOptions(prev => prev.filter((_, j) => j !== i))}
                              style={{ padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {editPollOptions.length < 6 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}
                          onClick={() => setEditPollOptions(prev => [...prev, { id: null, text: '' }])}
                        >
                          <Plus size={12} /> Add Option
                        </button>
                      )}
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <input
                        type="checkbox"
                        id="editPollIsClosed"
                        checked={editPollIsClosed}
                        onChange={e => setEditPollIsClosed(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor="editPollIsClosed" style={{ fontSize: '0.8rem', textTransform: 'none', letterSpacing: 'normal', cursor: 'pointer', margin: 0 }}>Close Poll / Keep Closed</label>
                    </div>
                  </div>

                  <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => setEditingPollId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Save
                    </button>
                  </div>
                </form>
              );
            }

            const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
            const myVote = userVotes[poll.id];
            const hasVoted = Boolean(myVote);
            const active = isActivePoll(poll);
            return (
              <div key={poll.id} className={`poll-card ${!active ? 'poll-expired' : ''}`}>
                <div className="poll-card-header">
                  <div>
                    <span className="badge badge-gold" style={{ fontSize: '0.65rem', marginBottom: '0.4rem', display: 'inline-block' }}>{poll.groupName}</span>
                    <h3 className="poll-question">{poll.question}</h3>
                  </div>
                  {canCreateGroups && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button className="btn-icon" title="Edit poll" onClick={() => startEditingPoll(poll)}>
                        <Pencil size={14} />
                      </button>
                      {active && (
                        <button className="btn-icon" title="Close poll" onClick={() => handleClosePoll(poll.id)}>
                          <Check size={14} />
                        </button>
                      )}
                      <button className="btn-icon text-red" title="Delete poll" onClick={() => handleDeletePoll(poll.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="poll-options-list">
                  {poll.options.map(opt => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                    const isMyVote = myVote === opt.id;
                    return (
                      <div key={opt.id} className="poll-option-row">
                        {!hasVoted && active ? (
                          <button className="poll-vote-btn" onClick={() => handleVote(poll.id, opt.id)}>
                            {opt.text}
                          </button>
                        ) : (
                          <div className={`poll-result-row ${isMyVote ? 'my-vote' : ''}`}>
                            <div className="poll-result-label">
                              {isMyVote && <Check size={12} style={{ flexShrink: 0 }} />}
                              <span>{opt.text}</span>
                            </div>
                            <div className="poll-bar-track">
                              <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="poll-pct">{pct}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({opt.votes})</span></span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!hasVoted && active && (
                    <div className="poll-write-in-row" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <input
                        type="text"
                        className="poll-write-in-input"
                        placeholder="+ Suggest an option..."
                        value={writeInTexts[poll.id] || ''}
                        onChange={e => setWriteInTexts(prev => ({ ...prev, [poll.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleAddWriteIn(poll.id)}
                        style={{
                          padding: '0.45rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                        title="Submit suggestion and vote"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}

                  {hasVoted && active && (
                    <button
                      type="button"
                      className="poll-change-vote-btn"
                      onClick={() => handleChangeVote(poll.id)}
                    >
                      <RotateCcw size={12} />
                      Change my vote
                    </button>
                  )}
                </div>

                <div className="poll-card-footer">
                  <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
                  <span>
                    {!active ? (
                      <span className="poll-status-badge expired">Closed</span>
                    ) : poll.expiresAt ? (
                      <span className="poll-status-badge active">Closes {new Date(poll.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    ) : (
                      <span className="poll-status-badge active">Open</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
