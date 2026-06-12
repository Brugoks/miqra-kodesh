import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ThumbsUp, ImagePlus } from 'lucide-react';
import Select from './ui/Select';
import {
  createTicket,
  searchSimilar,
  FEEDBACK_CATEGORIES,
  FEEDBACK_APP_AREAS,
} from '../lib/feedbackApi';

const MAX_SCREENSHOTS = 5;

export default function FeedbackSubmitForm({ session, onCancel, onSubmitted, userVotes, onVote, activeOrgId }) {
  const [category, setCategory] = useState('bug');
  const [categoryDetail, setCategoryDetail] = useState('');
  const [appArea, setAppArea] = useState('home');
  const [appAreaDetail, setAppAreaDetail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef(null);
  const fileInputRef = useRef(null);

  // Debounced duplicate suggestions while typing the title
  useEffect(() => {
    clearTimeout(searchTimer.current);
    const query = title.trim();
    searchTimer.current = setTimeout(async () => {
      if (query.length < 4) {
        setSimilar([]);
        return;
      }
      try {
        setSimilar(await searchSimilar(query, 5, activeOrgId));
      } catch {
        setSimilar([]);
      }
    }, query.length < 4 ? 0 : 400);
    return () => clearTimeout(searchTimer.current);
  }, [title, activeOrgId]);

  // Revoke object URLs on unmount
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);

  const addFiles = (incoming) => {
    const images = Array.from(incoming || []).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setFiles((prevFiles) => {
      const next = [...prevFiles, ...images].slice(0, MAX_SCREENSHOTS);
      setPreviews((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p));
        return next.map((f) => URL.createObjectURL(f));
      });
      return next;
    });
  };

  const handleFiles = (e) => {
    addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Let users paste screenshots (Ctrl/Cmd+V) anywhere in the form.
  const handlePaste = (e) => {
    const images = Array.from(e.clipboardData?.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (images.length > 0) {
      e.preventDefault();
      addFiles(images);
    }
  };

  const removeFile = (index) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setPreviews((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p));
      return next.map((f) => URL.createObjectURL(f));
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please add a title.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe your feedback.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createTicket({
        user: session?.user,
        category,
        categoryDetail,
        appArea,
        appAreaDetail,
        title: title.trim(),
        description: description.trim(),
        files,
        activeOrgId,
      });
      onSubmitted();
    } catch {
      setError('Could not submit your feedback. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="feedback-form-page">
      <button className="feedback-back" onClick={onCancel}>
        <ChevronLeft size={15} /> Back to board
      </button>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          Submit Feedback
        </h2>

        <form onSubmit={handleSubmit} onPaste={handlePaste}>
          <div className="feedback-form-row">
            <div className="form-group">
              <label htmlFor="feedback-category">Feedback Type</label>
              <Select
                id="feedback-category"
                value={category}
                onValueChange={(value) => {
                  setCategory(value);
                  if (value !== 'other') setCategoryDetail('');
                }}
                options={FEEDBACK_CATEGORIES}
              />
            </div>
            {category === 'other' && (
              <div className="form-group">
                <label htmlFor="feedback-category-other">Other type</label>
                <input
                  id="feedback-category-other"
                  type="text"
                  placeholder="What kind of feedback is this?"
                  value={categoryDetail}
                  onChange={(e) => setCategoryDetail(e.target.value)}
                  maxLength={80}
                />
              </div>
            )}
          </div>
          <div className="feedback-form-row">
            <div className="form-group">
              <label htmlFor="feedback-area">Location Within The App</label>
              <Select
                id="feedback-area"
                value={appArea}
                onValueChange={(value) => {
                  setAppArea(value);
                  if (value !== 'other') setAppAreaDetail('');
                }}
                options={FEEDBACK_APP_AREAS}
              />
            </div>
            {appArea === 'other' && (
              <div className="form-group">
                <label htmlFor="feedback-area-other">Other location</label>
                <input
                  id="feedback-area-other"
                  type="text"
                  placeholder="Where in the app?"
                  value={appAreaDetail}
                  onChange={(e) => setAppAreaDetail(e.target.value)}
                  maxLength={80}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="feedback-title">Title</label>
            <input
              id="feedback-title"
              type="text"
              placeholder="Summarize your feedback in one line"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
            />
          </div>

          {similar.length > 0 && (
            <div className="feedback-similar">
              <div className="feedback-similar-title">
                Looks similar — upvote an existing request instead?
              </div>
              {similar.map((t) => (
                <div key={t.id} className="feedback-similar-item">
                  <button
                    type="button"
                    className={`feedback-vote ${userVotes?.has(t.id) ? 'voted' : ''}`}
                    onClick={() => onVote(t)}
                  >
                    <ThumbsUp size={13} />
                    <span>{t.votes}</span>
                  </button>
                  <span className="title">{t.title}</span>
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="feedback-description">Description</label>
            <textarea
              id="feedback-description"
              rows={5}
              placeholder="What happened? What would you like to see?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="feedback-screenshots">
              Screenshots <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional, up to {MAX_SCREENSHOTS})</span>
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_SCREENSHOTS}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ImagePlus size={15} /> Add screenshots
            </button>
            <span style={{ marginLeft: '0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              or paste an image (Ctrl+V)
            </span>
            <input
              id="feedback-screenshots"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              style={{ display: 'none' }}
            />
            {previews.length > 0 && (
              <div className="feedback-screenshots">
                {previews.map((src, i) => (
                  <div key={src} className="feedback-screenshot-thumb">
                    <img src={src} alt={`Screenshot ${i + 1}`} />
                    <button type="button" onClick={() => removeFile(i)} aria-label="Remove screenshot">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="feedback-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
