import { useState } from 'react';
import { Trash2, Check, X } from 'lucide-react';
import { extractTitleFromUrl } from '../../lib/extractTitleFromUrl';
import { nextMeetingDate, toDateKey } from '../../lib/meetings';
import { makeMemberId } from './useGroups';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Full-page group settings editor (rendered instead of the Fellowship page
// while a group is being edited). Mounted with key={groupKey}, so form state
// initializes fresh for each group.
export default function GroupEditor({ groupKey, userId, groupsApi, onClose }) {
  const { groups, profiles, saveGroups, deleteGroup } = groupsApi;
  const group = groups[groupKey];

  const [editGroupName, setEditGroupName] = useState(group?.name || '');
  const [editGroupDay, setEditGroupDay] = useState(group?.meetingDay || '');
  const [editGroupTime, setEditGroupTime] = useState(group?.meetingTime || '');
  const [editGroupEndTime, setEditGroupEndTime] = useState(group?.meetingEndTime || '');
  const [editGroupFrequency, setEditGroupFrequency] = useState(group?.frequency || 'Weekly');
  const [editGroupTopic, setEditGroupTopic] = useState(group?.topic || '');
  const [editGroupLeader, setEditGroupLeader] = useState(group?.leader || '');
  const [editGroupCoLeader, setEditGroupCoLeader] = useState(group?.coLeader || '');
  const [editGroupLocation, setEditGroupLocation] = useState(group?.meetingLocation || '');
  const [editGroupBookLink, setEditGroupBookLink] = useState(group?.bookLink || '');
  const [editGroupBookTitle, setEditGroupBookTitle] = useState(group?.bookTitle || '');
  const [editGroupJoinStatus, setEditGroupJoinStatus] = useState(group?.joinStatus || 'closed');
  const [editGroupNextMeetingDate, setEditGroupNextMeetingDate] = useState(() => {
    if (group?.nextMeetingDate) return group.nextMeetingDate;
    const calc = group ? nextMeetingDate(group) : null;
    return calc ? toDateKey(calc) : '';
  });

  // Member management state
  const [addMemberMode, setAddMemberMode] = useState('manual'); // 'manual' | 'search'
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberLinkMessage, setMemberLinkMessage] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  // { [studentId]: { open: bool, search: string } }
  const [linkPickerState, setLinkPickerState] = useState({});

  if (!group) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    const existing = groups[groupKey];
    const updated = {
      ...groups,
      [groupKey]: {
        ...existing,
        name: editGroupName.trim() || existing.name,
        meetingDay: editGroupDay,
        meetingTime: editGroupTime.trim(),
        meetingEndTime: editGroupEndTime.trim(),
        frequency: editGroupFrequency,
        topic: editGroupTopic.trim(),
        leader: editGroupLeader.trim() || 'Unassigned',
        coLeader: editGroupCoLeader.trim(),
        meetingLocation: editGroupLocation.trim(),
        bookLink: editGroupBookLink.trim(),
        bookTitle: editGroupBookTitle.trim(),
        joinStatus: editGroupJoinStatus,
        nextMeetingDate: editGroupNextMeetingDate || '',
        sortOrder: existing.sortOrder || 0,
      }
    };
    await saveGroups(updated);
    onClose();
  };

  const handleDelete = async () => {
    const deleted = await deleteGroup(groupKey);
    if (deleted) onClose();
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;
    const normalizedEmail = newMemberEmail.trim().toLowerCase();
    const matchingProfile = normalizedEmail
      ? profiles.find(p => p.email?.toLowerCase() === normalizedEmail)
      : null;
    const existing = groups[groupKey];
    const newStudent = {
      id: makeMemberId(),
      name,
      email: normalizedEmail || '',
      linkedUserId: matchingProfile?.id || null,
      linkedUserName: matchingProfile?.full_name || '',
    };
    const updated = {
      ...groups,
      [groupKey]: { ...existing, students: [...(existing.students || []), newStudent] }
    };
    await saveGroups(updated);
    setMemberLinkMessage(matchingProfile ? `${name} was linked to their app account.` : '');
    setNewMemberName('');
    setNewMemberEmail('');
  };

  const handleAddFromProfile = async (profile) => {
    const existing = groups[groupKey];
    if (existing.students?.some(s => s.linkedUserId === profile.id)) {
      setMemberLinkMessage(`${profile.full_name || profile.email} is already in this group.`);
      return;
    }
    const newStudent = {
      id: makeMemberId(),
      name: profile.full_name || profile.email,
      email: profile.email || '',
      linkedUserId: profile.id,
      linkedUserName: profile.full_name || '',
    };
    const updated = {
      ...groups,
      [groupKey]: { ...existing, students: [...(existing.students || []), newStudent] }
    };
    await saveGroups(updated);
    setMemberLinkMessage(`${newStudent.name} added and linked.`);
    setAddMemberSearch('');
  };

  const handleLinkToProfile = async (studentId, profile) => {
    const current = groups[groupKey];
    const updated = {
      ...groups,
      [groupKey]: {
        ...current,
        students: current.students.map(s =>
          s.id === studentId
            ? { ...s, linkedUserId: profile.id, linkedUserName: profile.full_name || '' }
            : s
        )
      }
    };
    await saveGroups(updated);
    setLinkPickerState(prev => ({ ...prev, [studentId]: { open: false, search: '' } }));
  };

  const handleUnlinkMember = async (studentId) => {
    const current = groups[groupKey];
    const updated = {
      ...groups,
      [groupKey]: {
        ...current,
        students: current.students.map(s =>
          s.id === studentId
            ? { ...s, linkedUserId: null, linkedUserName: '' }
            : s
        )
      }
    };
    await saveGroups(updated);
  };

  const handleRemoveMember = async (studentId) => {
    const current = groups[groupKey];
    const student = current.students?.find(s => s.id === studentId);
    if (!student || !window.confirm(`Remove ${student.name} from ${current.name}?`)) return;
    const updated = {
      ...groups,
      [groupKey]: { ...current, students: current.students.filter(s => s.id !== studentId) }
    };
    await saveGroups(updated);
  };

  return (
    <div className="edit-group-page-container animate-fade-in">
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          onClick={onClose}
        >
          ← Back to Fellowship
        </button>
      </div>

      <div className="edit-group-page-card">
        <form onSubmit={handleSave}>
          {/* Header */}
          <div className="edit-group-page-header">
            <div>
              <h2 className="edit-group-page-title">Group Settings</h2>
              <p className="edit-group-page-subtitle">{group.name}</p>
            </div>
            <button
              type="button"
              className="btn-danger"
              style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              onClick={handleDelete}
            >
              <Trash2 size={14} /> Delete Group
            </button>
          </div>

          {/* Body */}
          <div className="edit-group-page-body">
            {/* Section: Identity */}
            <div className="edit-group-section">
              <span className="edit-group-section-label">Group Identity</span>
              <div className="edit-group-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Group Name</label>
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={e => setEditGroupName(e.target.value)}
                    required
                    placeholder="e.g. High School Boys"
                  />
                </div>
                <div className="form-group">
                  <label>Leader</label>
                  <input type="text" value={editGroupLeader} onChange={e => setEditGroupLeader(e.target.value)} placeholder="e.g. Dan K." />
                </div>
                <div className="form-group">
                  <label>Co-Leader <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
                  <input type="text" value={editGroupCoLeader} onChange={e => setEditGroupCoLeader(e.target.value)} placeholder="e.g. Sarah M." />
                </div>
                <div className="form-group">
                  <label>Join Setting</label>
                  <select value={editGroupJoinStatus} onChange={e => setEditGroupJoinStatus(e.target.value)}>
                    <option value="open">Open - students can join immediately</option>
                    <option value="closed">Closed - approval required</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Topic / Study Focus</label>
                  <input type="text" value={editGroupTopic} onChange={e => setEditGroupTopic(e.target.value)} placeholder="e.g. Walking in Unity (Ephesians 4)" />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Meeting Location</label>
                  <input type="text" value={editGroupLocation} onChange={e => setEditGroupLocation(e.target.value)} placeholder="e.g. Youth Room, Room 102" />
                </div>
              </div>
            </div>

            {/* Section: Schedule */}
            <div className="edit-group-section">
              <span className="edit-group-section-label">Schedule</span>
              <div className="edit-group-grid">
                <div className="form-group">
                  <label>Meeting Day</label>
                  <select value={editGroupDay} onChange={e => setEditGroupDay(e.target.value)}>
                    <option value="">Select day…</option>
                    {WEEKDAYS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Meeting Time</label>
                  <input type="text" value={editGroupTime} onChange={e => setEditGroupTime(e.target.value)} placeholder="e.g. 6:30 PM" />
                </div>
                <div className="form-group">
                  <label>Meeting End Time</label>
                  <input type="text" value={editGroupEndTime} onChange={e => setEditGroupEndTime(e.target.value)} placeholder="e.g. 8:00 PM" />
                </div>
                <div className="form-group">
                  <label>Frequency</label>
                  <select value={editGroupFrequency} onChange={e => setEditGroupFrequency(e.target.value)}>
                    <option value="Weekly">Weekly</option>
                    <option value="Every Other Week">Every Other Week</option>
                    <option value="Once a Month">Once a Month</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Next Meeting Date</label>
                  <input type="date" value={editGroupNextMeetingDate} onChange={e => setEditGroupNextMeetingDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Section: Study Resource */}
            <div className="edit-group-section">
              <span className="edit-group-section-label">📖 Study Resource</span>
              <div className="edit-group-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Resource URL</label>
                  <input
                    type="url"
                    value={editGroupBookLink}
                    onChange={e => {
                      const val = e.target.value;
                      setEditGroupBookLink(val);
                      if (!editGroupBookTitle.trim() && val) {
                        const extracted = extractTitleFromUrl(val);
                        if (extracted) {
                          setEditGroupBookTitle(extracted);
                        }
                      }
                    }}
                    placeholder="https://amazon.com/book or any URL"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Link Label <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></span>
                    {editGroupBookLink && (
                      <button
                        type="button"
                        className="link-autofill-btn"
                        onClick={() => {
                          const extracted = extractTitleFromUrl(editGroupBookLink);
                          if (extracted) setEditGroupBookTitle(extracted);
                        }}
                      >
                        Autofill from URL
                      </button>
                    )}
                  </label>
                  <input type="text" value={editGroupBookTitle} onChange={e => setEditGroupBookTitle(e.target.value)} placeholder="e.g. The Gospel of Mark — ESV Study Bible" />
                </div>
              </div>
            </div>

            {/* Section: Members */}
            <div className="edit-group-section">
              <span className="edit-group-section-label">👥 Members ({group.students?.length ?? 0})</span>

              {/* Add member tabbed panel */}
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                  {[{ id: 'manual', label: 'Manual Entry' }, { id: 'search', label: 'Search Registered' }].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { setAddMemberMode(tab.id); setMemberLinkMessage(''); }}
                      className={`member-add-tab ${addMemberMode === tab.id ? 'active' : ''}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div style={{ padding: '0.75rem' }}>
                  {addMemberMode === 'manual' ? (
                    <>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Full name"
                          value={newMemberName}
                          onChange={e => setNewMemberName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMember(); } }}
                          className="member-add-input"
                          autoFocus
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="email"
                          placeholder="Email for account linking (optional)"
                          value={newMemberEmail}
                          onChange={e => setNewMemberEmail(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMember(); } }}
                          className="member-add-input"
                        />
                        <button type="button" className="btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }} onClick={handleAddMember}>
                          Add
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search by name or email…"
                        value={addMemberSearch}
                        onChange={e => setAddMemberSearch(e.target.value)}
                        autoFocus
                        className="member-add-input"
                        style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem' }}
                      />
                      <div style={{ maxHeight: '180px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', overflowX: 'hidden' }}>
                        {(() => {
                          const alreadyIn = new Set((group.students || []).map(s => s.linkedUserId).filter(Boolean));
                          const filtered = profiles.filter(p => {
                            if (alreadyIn.has(p.id)) return false;
                            if (!addMemberSearch) return true;
                            return p.full_name?.toLowerCase().includes(addMemberSearch.toLowerCase()) || p.email?.toLowerCase().includes(addMemberSearch.toLowerCase());
                          });
                          if (filtered.length === 0) return <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.75rem', margin: 0 }}>{profiles.length === 0 ? 'No registered users found.' : 'No matching users.'}</p>;
                          return filtered.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleAddFromProfile(p)}
                              className="member-profile-row"
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{p.full_name || '(No name)'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.email}</div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 700, marginLeft: '0.5rem', flexShrink: 0 }}>+ Add</span>
                            </button>
                          ));
                        })()}
                      </div>
                    </>
                  )}
                  {memberLinkMessage && <p style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', margin: '0.5rem 0 0', fontWeight: 500 }}>{memberLinkMessage}</p>}
                </div>
              </div>

              {/* Member list */}
              {(group.students?.length ?? 0) === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No members yet. Add one above.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {group.students?.map(s => {
                    const isLinked = Boolean(s.linkedUserId);
                    const pickerOpen = linkPickerState[s.id]?.open;
                    const pickerSearch = linkPickerState[s.id]?.search || '';
                    const filteredProfiles = profiles.filter(p =>
                      !pickerSearch ||
                      p.full_name?.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                      p.email?.toLowerCase().includes(pickerSearch.toLowerCase())
                    );
                    return (
                      <div key={s.id} className="member-row">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {s.name}{s.linkedUserId === userId ? ' (You)' : ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => { setMemberLinkMessage(''); setLinkPickerState(prev => ({ ...prev, [s.id]: { open: !pickerOpen, search: '' } })); }}
                              className={`member-link-btn ${isLinked ? 'linked' : ''}`}
                            >
                              {isLinked ? 'Swap' : 'Link Account'}
                            </button>
                            {isLinked && (
                              <button
                                type="button"
                                onClick={() => handleUnlinkMember(s.id)}
                                className="member-link-btn linked"
                              >
                                Unlink
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(s.id)}
                              className="member-remove-btn"
                              title="Remove member"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                        <span className={`member-link-status ${isLinked ? 'linked' : ''}`}>
                          {isLinked ? `✓ Linked${s.email ? ': ' + s.email : ''}` : s.email ? `Unlinked · ${s.email}` : 'No account email'}
                        </span>

                        {/* Inline account picker */}
                        {pickerOpen && (
                          <div style={{ marginTop: '0.4rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <input
                              type="text"
                              placeholder="Search by name or email…"
                              value={pickerSearch}
                              onChange={e => setLinkPickerState(prev => ({ ...prev, [s.id]: { open: true, search: e.target.value } }))}
                              autoFocus
                              className="member-picker-search"
                            />
                            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                              {filteredProfiles.length === 0
                                ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', margin: 0 }}>No matching accounts.</p>
                                : filteredProfiles.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleLinkToProfile(s.id, p)}
                                    className="member-profile-row"
                                  >
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.full_name || '(No name)'}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.email}</div>
                                  </button>
                                ))
                              }
                            </div>
                            <button
                              type="button"
                              onClick={() => setLinkPickerState(prev => ({ ...prev, [s.id]: { open: false, search: '' } }))}
                              className="member-picker-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer / Actions */}
          <div className="edit-group-page-footer">
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.6rem 1.4rem' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '0.6rem 1.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 700 }}
            >
              <Check size={15} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
