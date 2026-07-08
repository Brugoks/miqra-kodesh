import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Users, ChevronDown, ChevronUp, Clock, Check, X, UserPlus, Lock, Unlock, GripVertical, Pencil, Trash2, Calendar } from 'lucide-react';
import { extractTitleFromUrl } from '../../lib/extractTitleFromUrl';
import { nextMeetingDate, toDateKey } from '../../lib/meetings';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function GroupsSection({ canCreateGroups, userId, groupsApi, onEditGroup, linkedGroupId = '' }) {
  const {
    groups, joinRequests, joinActionMessage, joinActionLoading, groupsError,
    canManageJoinRequestsForGroup, saveGroups, deleteGroup,
    joinOrRequestGroup, approveJoinRequest, declineJoinRequest, myGroupIds,
  } = groupsApi;

  const [groupFilter, setGroupFilter] = useState(canCreateGroups ? 'all' : 'mine');
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDay, setNewGroupDay] = useState('');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [newGroupEndTime, setNewGroupEndTime] = useState('');
  const [newGroupFrequency, setNewGroupFrequency] = useState('Weekly');
  const [newGroupTopic, setNewGroupTopic] = useState('');
  const [newGroupLeader, setNewGroupLeader] = useState('');
  const [newGroupCoLeader, setNewGroupCoLeader] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newGroupBookLink, setNewGroupBookLink] = useState('');
  const [newGroupBookTitle, setNewGroupBookTitle] = useState('');
  const [newGroupJoinStatus, setNewGroupJoinStatus] = useState('closed');
  const [newGroupNextMeetingDate, setNewGroupNextMeetingDate] = useState('');

  const [draggedGroupKey, setDraggedGroupKey] = useState(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState(null);

  const [prevCanCreate, setPrevCanCreate] = useState(canCreateGroups);
  if (canCreateGroups !== prevCanCreate) {
    setPrevCanCreate(canCreateGroups);
    if (canCreateGroups) setGroupFilter('all');
  }

  // A deep link (/fellowship?group=x) expands and scrolls to that group once
  // it loads, then hands control back to the user — deriving the filter and
  // expansion from the URL instead would pin them for the whole visit.
  const linkedGroupExists = Boolean(linkedGroupId && groups[linkedGroupId]);
  const appliedLinkedGroupRef = useRef('');
  useEffect(() => {
    if (!linkedGroupExists || appliedLinkedGroupRef.current === linkedGroupId) return undefined;
    appliedLinkedGroupRef.current = linkedGroupId;
    setGroupFilter('all');
    setExpandedGroupId(linkedGroupId);
    const timer = setTimeout(() => {
      document.getElementById(`group-${linkedGroupId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [linkedGroupExists, linkedGroupId]);

  const [prevDayFreq, setPrevDayFreq] = useState(`${newGroupDay}|${newGroupFrequency}`);
  const dayFreqKey = `${newGroupDay}|${newGroupFrequency}`;
  if (dayFreqKey !== prevDayFreq) {
    setPrevDayFreq(dayFreqKey);
    if (newGroupDay) {
      const calc = nextMeetingDate({ meetingDay: newGroupDay, frequency: newGroupFrequency });
      setNewGroupNextMeetingDate(calc ? toDateKey(calc) : '');
    } else {
      setNewGroupNextMeetingDate('');
    }
  }

  const buildGroupId = (name) => {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `group-${crypto.randomUUID()}`;
    let id = base;
    let suffix = 2;
    while (groups[id]) { id = `${base}-${suffix}`; suffix += 1; }
    return id;
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const id = buildGroupId(newGroupName);
    const newGroups = {
      ...groups,
      [id]: {
        name: newGroupName.trim(),
        meetingDay: newGroupDay,
        meetingTime: newGroupTime.trim(),
        meetingEndTime: newGroupEndTime.trim(),
        frequency: newGroupFrequency,
        topic: newGroupTopic.trim(),
        leader: newGroupLeader.trim() || 'Unassigned',
        coLeader: newGroupCoLeader.trim(),
        meetingLocation: newGroupLocation.trim(),
        bookLink: newGroupBookLink.trim(),
        bookTitle: newGroupBookTitle.trim(),
        joinStatus: newGroupJoinStatus,
        nextMeetingDate: newGroupNextMeetingDate || '',
        sortOrder: Object.keys(groups).length,
        students: []
      }
    };
    await saveGroups(newGroups);
    setNewGroupName('');
    setNewGroupDay('');
    setNewGroupTime('');
    setNewGroupEndTime('');
    setNewGroupFrequency('Weekly');
    setNewGroupTopic('');
    setNewGroupLeader('');
    setNewGroupCoLeader('');
    setNewGroupLocation('');
    setNewGroupBookLink('');
    setNewGroupBookTitle('');
    setNewGroupJoinStatus('closed');
    setNewGroupNextMeetingDate('');
    setShowNewGroupForm(false);
  };

  const displayedGroups = groupFilter === 'mine'
    ? Object.fromEntries(myGroupIds.map(k => [k, groups[k]]))
    : groups;

  const canSortGroups = canCreateGroups && groupFilter === 'all';

  const displayedGroupEntries = useMemo(() => {
    return Object.entries(displayedGroups).sort(
      (a, b) => (a[1].sortOrder ?? 0) - (b[1].sortOrder ?? 0)
    );
  }, [displayedGroups]);

  const handleDragStart = (e, key) => {
    setDraggedGroupKey(key);
    setDragOverGroupKey(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e, targetKey) => {
    e.preventDefault();
    if (!draggedGroupKey || draggedGroupKey === targetKey) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupKey(targetKey);
  };

  const handleDropGroup = async (e, targetKey) => {
    e.preventDefault();
    const sourceKey = draggedGroupKey || e.dataTransfer.getData('text/plain');
    setDraggedGroupKey(null);
    setDragOverGroupKey(null);
    if (!sourceKey || sourceKey === targetKey) return;

    const entries = [...displayedGroupEntries];
    const draggedIdx = entries.findIndex(([k]) => k === sourceKey);
    const targetIdx = entries.findIndex(([k]) => k === targetKey);
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [removed] = entries.splice(draggedIdx, 1);
      entries.splice(targetIdx, 0, removed);

      const updatedGroups = { ...groups };
      entries.forEach(([k], index) => {
        updatedGroups[k] = { ...updatedGroups[k], sortOrder: index };
      });
      await saveGroups(updatedGroups);
    }
  };

  const handleDragEnd = () => {
    setDraggedGroupKey(null);
    setDragOverGroupKey(null);
  };

  const pendingRequestsByGroup = useMemo(() => {
    const grouped = {};
    joinRequests.forEach((request) => {
      if (!grouped[request.group_id]) grouped[request.group_id] = [];
      grouped[request.group_id].push(request);
    });
    return grouped;
  }, [joinRequests]);

  const formatUpcoming = (group) => {
    const upcoming = nextMeetingDate(group);
    if (!upcoming) return null;
    return upcoming.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <section className="groups-section card">
      <div className="groups-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Users size={18} style={{ color: 'var(--accent-gold)' }} />
          <h2 style={{ margin: 0 }}>Small Groups</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="groups-filter-pills">
            <button
              className={`group-filter-pill ${groupFilter === 'mine' ? 'active' : ''}`}
              onClick={() => setGroupFilter('mine')}
            >
              My Groups
            </button>
            <button
              className={`group-filter-pill ${groupFilter === 'all' ? 'active' : ''}`}
              onClick={() => setGroupFilter('all')}
            >
              All
            </button>
          </div>
          {canCreateGroups && (
            <button
              className="btn-primary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => setShowNewGroupForm(v => !v)}
            >
              <Plus size={15} />
              <span>{showNewGroupForm ? 'Close' : 'New Group'}</span>
            </button>
          )}
        </div>
      </div>

      {canCreateGroups && showNewGroupForm && (
        <form onSubmit={handleAddGroup} className="new-group-form animate-fade-in">
          <div className="new-group-form-grid">
            <div className="form-group">
              <label>Group Name</label>
              <input type="text" placeholder="e.g. High School Boys" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Meeting Day</label>
              <select value={newGroupDay} onChange={e => setNewGroupDay(e.target.value)} required>
                <option value="">Select day</option>
                {WEEKDAYS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Meeting Time</label>
              <input type="text" placeholder="e.g. 6:30 PM" value={newGroupTime} onChange={e => setNewGroupTime(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Meeting End Time</label>
              <input type="text" placeholder="e.g. 8:00 PM" value={newGroupEndTime} onChange={e => setNewGroupEndTime(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <select value={newGroupFrequency} onChange={e => setNewGroupFrequency(e.target.value)}>
                <option value="Weekly">Weekly</option>
                <option value="Every Other Week">Every Other Week</option>
                <option value="Once a Month">Once a Month</option>
              </select>
            </div>
            <div className="form-group">
              <label>Next Meeting Date <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
              <input type="date" value={newGroupNextMeetingDate} onChange={e => setNewGroupNextMeetingDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Topic / Book</label>
              <input type="text" placeholder="e.g. Ephesians 4" value={newGroupTopic} onChange={e => setNewGroupTopic(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Leader</label>
              <input type="text" placeholder="e.g. Dan K." value={newGroupLeader} onChange={e => setNewGroupLeader(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Co-Leader</label>
              <input type="text" placeholder="Optional" value={newGroupCoLeader} onChange={e => setNewGroupCoLeader(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Join Setting</label>
              <select value={newGroupJoinStatus} onChange={e => setNewGroupJoinStatus(e.target.value)}>
                <option value="open">Open - students can join immediately</option>
                <option value="closed">Closed - approval required</option>
              </select>
            </div>
            <div className="form-group">
              <label>Meeting Location</label>
              <input type="text" placeholder="Optional (e.g. Youth Room)" value={newGroupLocation} onChange={e => setNewGroupLocation(e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>📖 Study Book / Resource Link</label>
              <input
                type="url"
                placeholder="https://amazon.com/book or any URL"
                value={newGroupBookLink}
                onChange={e => {
                  const val = e.target.value;
                  setNewGroupBookLink(val);
                  if (!newGroupBookTitle.trim() && val) {
                    const extracted = extractTitleFromUrl(val);
                    if (extracted) {
                      setNewGroupBookTitle(extracted);
                    }
                  }
                }}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Link Label <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></span>
                {newGroupBookLink && (
                  <button
                    type="button"
                    className="link-autofill-btn"
                    onClick={() => {
                      const extracted = extractTitleFromUrl(newGroupBookLink);
                      if (extracted) setNewGroupBookTitle(extracted);
                    }}
                  >
                    Autofill from URL
                  </button>
                )}
              </label>
              <input type="text" placeholder="e.g. The Gospel of Mark — ESV Study Bible" value={newGroupBookTitle} onChange={e => setNewGroupBookTitle(e.target.value)} />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowNewGroupForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Plus size={14} />
              Create Group
            </button>
          </div>
        </form>
      )}

      {groupsError && (
        <p className="section-error">{groupsError}</p>
      )}

      {joinActionMessage && (
        <p className="group-join-message">{joinActionMessage}</p>
      )}

      {displayedGroupEntries.length === 0 ? (
        <div className="groups-empty">
          {groupFilter === 'mine' ? (
            <>
              <p>You're not linked to any groups yet.</p>
              <button
                className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem', marginTop: '0.5rem' }}
                onClick={() => setGroupFilter('all')}
              >
                View All Groups
              </button>
            </>
          ) : (
            <p>No groups have been created yet.</p>
          )}
        </div>
      ) : (
        <div className="groups-card-grid">
          {displayedGroupEntries.map(([key, group]) => {
            const isExpanded = expandedGroupId === key;
            const isMember = group.students?.some(s => s.linkedUserId === userId);
            const groupJoinStatus = group.joinStatus || 'closed';
            const myPendingRequest = joinRequests.find(request => request.group_id === key && request.requester_id === userId);
            const pendingRequests = pendingRequestsByGroup[key] || [];
            const canApproveThisGroup = canManageJoinRequestsForGroup(group);
            const upcomingMeeting = formatUpcoming(group);
            return (
              <div
                id={`group-${key}`}
                key={key}
                onDragOver={canSortGroups ? (e) => handleDragOver(e, key) : undefined}
                onDrop={canSortGroups ? (e) => handleDropGroup(e, key) : undefined}
                className={`group-card ${isExpanded ? 'expanded' : ''} ${draggedGroupKey === key ? 'dragging' : ''} ${dragOverGroupKey === key ? 'drop-target' : ''}`}
                onClick={() => {
                  if (draggedGroupKey) return;
                  setExpandedGroupId(isExpanded ? null : key);
                }}
              >
                <div className="group-card-top">
                  {canSortGroups && (
                    <button
                      type="button"
                      className="group-drag-handle"
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => handleDragStart(e, key)}
                      onDragEnd={handleDragEnd}
                      title="Drag to reorder group"
                      aria-label={`Reorder ${group.name}`}
                    >
                      <GripVertical size={16} />
                    </button>
                  )}
                  <div className="group-card-main">
                    <h3 className="group-card-name">{group.name}</h3>
                    <div className="group-card-meta">
                      <span className="group-meta-item">
                        <Clock size={12} />
                        {[group.meetingDay, group.meetingTime].filter(Boolean).join(' · ') || 'TBD'}
                      </span>
                      <span className="group-meta-item">
                        <Users size={12} />
                        {group.students?.length ?? 0} members
                      </span>
                      {upcomingMeeting && (
                        <span className="group-meta-item group-next-meeting">
                          <Calendar size={12} />
                          Next: {upcomingMeeting}
                        </span>
                      )}
                    </div>
                    {group.topic && (
                      <span className="badge badge-gold" style={{ fontSize: '0.65rem', marginTop: '0.4rem', display: 'inline-block' }}>
                        {group.topic}
                      </span>
                    )}
                    <span className={`group-join-status ${groupJoinStatus === 'open' ? 'open' : 'closed'}`}>
                      {groupJoinStatus === 'open' ? <Unlock size={11} /> : <Lock size={11} />}
                      {groupJoinStatus === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {!isExpanded && !isMember && groupJoinStatus === 'open' && (
                      <button
                        type="button"
                        className="group-join-btn"
                        disabled={joinActionLoading === key}
                        onClick={e => {
                          e.stopPropagation();
                          joinOrRequestGroup(key);
                        }}
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.78rem',
                          borderRadius: '6px',
                          marginRight: '0.5rem'
                        }}
                      >
                        <UserPlus size={12} />
                        {joinActionLoading === key ? 'Working...' : 'Join Group'}
                      </button>
                    )}
                    {canCreateGroups && isExpanded && (
                      <>
                        <button
                          className="btn-icon"
                          title="Edit group"
                          onClick={e => { e.stopPropagation(); onEditGroup(key); }}
                          style={{ padding: '0.3rem', borderRadius: '6px' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-icon text-red"
                          title="Delete group"
                          onClick={async e => {
                            e.stopPropagation();
                            const deleted = await deleteGroup(key);
                            if (deleted) setExpandedGroupId(null);
                          }}
                          style={{ padding: '0.3rem', borderRadius: '6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <div className="group-card-chevron">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="group-card-detail" onClick={e => e.stopPropagation()}>
                    <div className="group-detail-meta-row">
                      <div className="group-detail-field">
                        <span className="group-detail-label">Leader</span>
                        <span className="group-detail-value">{group.leader || '—'}</span>
                      </div>
                      {group.coLeader && (
                        <div className="group-detail-field">
                          <span className="group-detail-label">Co-Leader</span>
                          <span className="group-detail-value">{group.coLeader}</span>
                        </div>
                      )}
                      <div className="group-detail-field">
                        <span className="group-detail-label">Frequency</span>
                        <span className="group-detail-value">{group.frequency || '—'}</span>
                      </div>
                      {group.meetingLocation && (
                        <div className="group-detail-field">
                          <span className="group-detail-label">Location</span>
                          <span className="group-detail-value">{group.meetingLocation}</span>
                        </div>
                      )}
                    </div>
                    {!isMember && (
                      <div className="group-join-action-row">
                        <button
                          type="button"
                          className="group-join-btn"
                          disabled={Boolean(myPendingRequest) || joinActionLoading === key}
                          onClick={e => { e.stopPropagation(); joinOrRequestGroup(key); }}
                        >
                          <UserPlus size={14} />
                          {joinActionLoading === key
                            ? 'Working...'
                            : myPendingRequest
                              ? 'Request Pending'
                              : groupJoinStatus === 'open'
                                ? 'Join Group'
                                : 'Request to Join'}
                        </button>
                        {groupJoinStatus === 'closed' && !myPendingRequest && (
                          <span className="group-join-help">Leader approval required.</span>
                        )}
                      </div>
                    )}
                    {isMember && (
                      <p className="group-member-note">You are a member of this group.</p>
                    )}
                    {canApproveThisGroup && pendingRequests.length > 0 && (
                      <div className="group-join-requests">
                        <span className="group-detail-label">Pending Join Requests</span>
                        {pendingRequests.map((request) => (
                          <div key={request.id} className="group-join-request-row">
                            <div>
                              <strong>{request.requester_name}</strong>
                              {request.requester_email && <span>{request.requester_email}</span>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="group-accept-btn"
                                disabled={joinActionLoading === request.id}
                                onClick={e => { e.stopPropagation(); approveJoinRequest(request); }}
                              >
                                <Check size={13} />
                                {joinActionLoading === request.id ? 'Working...' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                className="group-decline-btn"
                                disabled={joinActionLoading === request.id}
                                onClick={e => { e.stopPropagation(); declineJoinRequest(request); }}
                              >
                                <X size={13} />
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {group.bookLink && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <a
                          href={group.bookLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="group-book-link"
                        >
                          📖 {group.bookTitle || 'Study Resource'} →
                        </a>
                      </div>
                    )}

                    {/* Members — read-only summary */}
                    <div className="group-members-list">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="group-detail-label">Members</span>
                        {canCreateGroups && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            onClick={e => { e.stopPropagation(); onEditGroup(key); }}
                          >
                            <Pencil size={10} /> Manage
                          </button>
                        )}
                      </div>
                      {group.students?.length > 0 ? (
                        <div className="group-member-tags">
                          {group.students.map(s => (
                            <span
                              key={s.id}
                              className={`group-member-tag ${s.linkedUserId === userId ? 'you' : ''}`}
                            >
                              {s.name}{s.linkedUserId === userId ? ' (You)' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No members yet.</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
