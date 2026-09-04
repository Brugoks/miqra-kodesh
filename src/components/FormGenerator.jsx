import { useState, useEffect, useCallback, useMemo } from 'react';
import './FormGenerator.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';
import Avatar from './ui/Avatar';
import QRShareButton from './QRShareButton';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  ClipboardList,
  CheckCircle,
  XCircle,
  FileText,
  Send,
  Trash,
  ChevronLeft,
  Edit,
  UserCheck,
  RefreshCw,
  FileEdit,
  Info,
  Calendar,
  List,
  CircleDot,
  CheckSquare,
  Type,
  AlignLeft,
  Clock,
  Save,
  X
} from 'lucide-react';

// Default mock profiles for local storage / offline demo
const DEFAULT_MOCK_PROFILES = [
  { id: 'prof_1', full_name: 'Sarah Miller', email: 'sarah@example.com', avatar_url: '' },
  { id: 'prof_2', full_name: 'Hannah Abbott', email: 'hannah@example.com', avatar_url: '' },
  { id: 'prof_3', full_name: 'Daniel Kim', email: 'daniel@example.com', avatar_url: '' },
  { id: 'prof_4', full_name: 'Lucas Davis', email: 'lucas@example.com', avatar_url: '' },
];

// Default form templates for local storage / offline demo
const DEFAULT_MOCK_FORMS = [
  {
    id: 'form_camp_rsvp',
    title: 'Youth Summer Camp RSVP',
    description: 'Please let us know if you are attending the 2026 Youth Summer Camp and provide shirt sizes and food allergies.',
    fields: [
      { id: 'f_attending', type: 'radio', label: 'Will you be attending?', required: true, options: ['Yes, absolutely!', 'No, I cannot make it'] },
      { id: 'f_shirt', type: 'select', label: 'Shirt Size', required: true, options: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'] },
      { id: 'f_allergies', type: 'textarea', label: 'Please list any food allergies or medical considerations:', required: false, placeholder: 'Peanuts, gluten-free, etc.' },
      { id: 'f_phone', type: 'number', label: 'Emergency Contact Phone Number', required: true, placeholder: '123-456-7890' }
    ],
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'form_prayer_interest',
    title: 'Prayer & Outreach Team Interest',
    description: 'Are you interested in joining our church outreach or prayer team? Fill out this quick questionnaire.',
    fields: [
      { id: 'f_teams', type: 'checkbox', label: 'Which teams are you interested in joining?', required: true, options: ['Sunday Morning Prayer Group', 'Weekly Midweek Outreach', 'Monthly Service Projects'] },
      { id: 'f_experience', type: 'textarea', label: 'Tell us briefly why you would like to serve here:', required: false, placeholder: 'Share your heart...' },
      { id: 'f_start_date', type: 'date', label: 'When are you available to start serving?', required: true }
    ],
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  }
];

export default function FormGenerator({ session, userRole, activeOrgId, isLeaderPortalView = false }) {
  const user = session?.user;
  const isLeader = isLeaderPortalView || canAccessLeaderTools(userRole);

  // View States: 
  // For Leader: 'templates' | 'submissions' | 'assignments' | 'builder' | 'submission-detail'
  // For Student: 'assigned' | 'history' | 'fill-form'
  const [activeTab, setActiveTab] = useState(isLeader ? 'templates' : 'assigned');
  
  // Data States
  const [forms, setForms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Active selections
  const [selectedForm, setSelectedForm] = useState(null); // Used for editing or previewing
  const [selectedAssignment, setSelectedAssignment] = useState(null); // Used for review details or filling

  // Send Form Modal States
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTargetForm, setSendTargetForm] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  // Form Builder Workspace State
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderDescription, setBuilderDescription] = useState('');
  const [builderFields, setBuilderFields] = useState([]);
  const [isEditingId, setIsEditingId] = useState(null); // if editing an existing template

  // Form Renderer State
  const [formResponses, setFormResponses] = useState({});
  const [formErrors, setFormErrors] = useState({});

  // Leader Review State
  const [reviewNotes, setReviewNotes] = useState('');

  // --- 1. INITIALIZE & FETCH DATA ---
  const loadData = () => {
    setLoading(true);
    setError('');
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (hasSupabaseConfig && supabase && activeOrgId) {
        try {
          const [{ data: formsData, error: formsErr }, { data: assignsData, error: assignsErr }] = await Promise.all([
            supabase
              .from('forms')
              .select('*')
              .eq('organization_id', activeOrgId)
              .order('created_at', { ascending: false }),
            supabase
              .from('form_assignments')
              .select('*')
              .eq('organization_id', activeOrgId)
              .order('created_at', { ascending: false })
          ]);

          if (ignore) return;
          if (formsErr) throw formsErr;
          if (assignsErr) throw assignsErr;

          setForms(formsData || []);
          setAssignments(assignsData || []);

          let { data: profileData, error: profileError } = await supabase.rpc('org_members', { org_id: activeOrgId });
          if (ignore) return;
          if (profileError) {
            const { data: fallbackProfiles } = await supabase
              .from('profiles')
              .select('id, full_name, email, avatar_url')
              .eq('active_organization_id', activeOrgId);
            if (!ignore) setProfiles(fallbackProfiles || []);
          } else {
            setProfiles(profileData || []);
          }
        } catch (err) {
          if (!ignore) {
            console.error('Error fetching forms data from Supabase:', err);
            setError('Failed to fetch forms. Please try again.');
          }
        }
      } else {
        try {
          const savedForms = localStorage.getItem('miqra_forms');
          if (savedForms) {
            setForms(JSON.parse(savedForms));
          } else {
            setForms(DEFAULT_MOCK_FORMS);
            localStorage.setItem('miqra_forms', JSON.stringify(DEFAULT_MOCK_FORMS));
          }

          const savedAssignments = localStorage.getItem('miqra_form_assignments');
          if (savedAssignments) {
            setAssignments(JSON.parse(savedAssignments));
          } else {
            setAssignments([]);
            localStorage.setItem('miqra_form_assignments', JSON.stringify([]));
          }

          const savedRoster = localStorage.getItem('miqra_roster');
          if (savedRoster) {
            const parsedRoster = JSON.parse(savedRoster);
            const formattedProfiles = parsedRoster.map(s => ({
              id: s.linkedUserId || `local_${s.name.replace(/\s+/g, '_')}`,
              full_name: s.name,
              email: s.email || '',
              avatar_url: ''
            }));
            if (!ignore) setProfiles(formattedProfiles);
          } else {
            if (!ignore) setProfiles(DEFAULT_MOCK_PROFILES);
          }
        } catch (err) {
          if (!ignore) {
            console.error('Error loading fallback local storage data:', err);
            setError('Failed to load local offline forms.');
          }
        }
      }
      if (!ignore) setLoading(false);
    })();

    return () => { ignore = true; };
  }, [activeOrgId, refreshKey]);

  // Set default view on tab switch
  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setSelectedForm(null);
    setSelectedAssignment(null);
    setSuccessMsg('');
    setError('');
  };

  // --- 2. FORM BUILDER ACTIONS ---
  const handleStartNewForm = () => {
    setBuilderTitle('');
    setBuilderDescription('');
    setBuilderFields([
      { id: `f_${Date.now()}_1`, type: 'text', label: 'Full Name', required: true }
    ]);
    setIsEditingId(null);
    setActiveTab('builder');
  };

  const handleStartEditForm = (form) => {
    setBuilderTitle(form.title);
    setBuilderDescription(form.description || '');
    setBuilderFields(form.fields || []);
    setIsEditingId(form.id);
    setActiveTab('builder');
  };

  const handleAddField = (type) => {
    const defaultOptions = ['radio', 'checkbox', 'select'].includes(type) ? ['Option 1', 'Option 2'] : undefined;
    const newField = {
      id: `f_${Date.now()}_${builderFields.length + 1}`,
      type,
      label: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
      required: false,
      placeholder: '',
      options: defaultOptions
    };
    setBuilderFields([...builderFields, newField]);
  };

  const handleRemoveField = (fieldId) => {
    setBuilderFields(builderFields.filter(f => f.id !== fieldId));
  };

  const handleFieldChange = (fieldId, key, value) => {
    setBuilderFields(builderFields.map(f => {
      if (f.id === fieldId) {
        return { ...f, [key]: value };
      }
      return f;
    }));
  };

  const handleAddOption = (fieldId) => {
    setBuilderFields(builderFields.map(f => {
      if (f.id === fieldId) {
        const currentOptions = f.options || [];
        return { ...f, options: [...currentOptions, `Option ${currentOptions.length + 1}`] };
      }
      return f;
    }));
  };

  const handleOptionChange = (fieldId, optionIndex, newValue) => {
    setBuilderFields(builderFields.map(f => {
      if (f.id === fieldId) {
        const nextOptions = [...(f.options || [])];
        nextOptions[optionIndex] = newValue;
        return { ...f, options: nextOptions };
      }
      return f;
    }));
  };

  const handleRemoveOption = (fieldId, optionIndex) => {
    setBuilderFields(builderFields.map(f => {
      if (f.id === fieldId) {
        return { ...f, options: (f.options || []).filter((_, i) => i !== optionIndex) };
      }
      return f;
    }));
  };

  const handleMoveField = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === builderFields.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newFields = [...builderFields];
    const temp = newFields[index];
    newFields[index] = newFields[targetIndex];
    newFields[targetIndex] = temp;
    setBuilderFields(newFields);
  };

  const handleSaveFormTemplate = async (e) => {
    e.preventDefault();
    if (!builderTitle.trim()) {
      setError('Form title is required.');
      return;
    }
    if (builderFields.length === 0) {
      setError('Please add at least one field to the form.');
      return;
    }

    setLoading(true);
    const timestamp = new Date().toISOString();

    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const payload = {
          title: builderTitle.trim(),
          description: builderDescription.trim() || null,
          fields: builderFields,
          organization_id: activeOrgId,
          updated_at: timestamp
        };

        if (isEditingId) {
          const { error: saveErr } = await supabase
            .from('forms')
            .update(payload)
            .eq('id', isEditingId);
          if (saveErr) throw saveErr;
        } else {
          payload.created_by = user?.id || null;
          const { error: saveErr } = await supabase
            .from('forms')
            .insert(payload);
          if (saveErr) throw saveErr;
        }
        setSuccessMsg(isEditingId ? 'Template updated successfully!' : 'New template created successfully!');
        setActiveTab('templates');
        loadData();
      } catch (err) {
        console.error('Error saving form to Supabase:', err);
        setError('Failed to save form template.');
        setLoading(false);
      }
    } else {
      // Local storage save
      try {
        const savedForms = localStorage.getItem('miqra_forms');
        let parsed = savedForms ? JSON.parse(savedForms) : [];
        
        if (isEditingId) {
          parsed = parsed.map(f => {
            if (f.id === isEditingId) {
              return {
                ...f,
                title: builderTitle.trim(),
                description: builderDescription.trim(),
                fields: builderFields,
                updated_at: timestamp
              };
            }
            return f;
          });
        } else {
          parsed.unshift({
            id: `form_${Date.now()}`,
            title: builderTitle.trim(),
            description: builderDescription.trim(),
            fields: builderFields,
            created_at: timestamp,
            updated_at: timestamp
          });
        }

        localStorage.setItem('miqra_forms', JSON.stringify(parsed));
        setForms(parsed);
        setSuccessMsg(isEditingId ? 'Template updated locally!' : 'New template created locally!');
        setActiveTab('templates');
        setLoading(false);
      } catch (err) {
        console.error('Error saving local form:', err);
        setError('Failed to save form template locally.');
        setLoading(false);
      }
    }
  };

  const handleDeleteForm = async (formId) => {
    if (!window.confirm('Are you sure you want to delete this form template? This will delete all its student assignments as well.')) return;

    setLoading(true);
    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const { error: delErr } = await supabase
          .from('forms')
          .delete()
          .eq('id', formId);
        if (delErr) throw delErr;
        setSuccessMsg('Template deleted successfully!');
        loadData();
      } catch (err) {
        console.error('Error deleting form template from Supabase:', err);
        setError('Failed to delete form template.');
        setLoading(false);
      }
    } else {
      try {
        const savedForms = localStorage.getItem('miqra_forms');
        let parsed = savedForms ? JSON.parse(savedForms) : [];
        parsed = parsed.filter(f => f.id !== formId);
        localStorage.setItem('miqra_forms', JSON.stringify(parsed));
        setForms(parsed);

        // Cascade delete local assignments
        const savedAssigns = localStorage.getItem('miqra_form_assignments');
        let parsedAssigns = savedAssigns ? JSON.parse(savedAssigns) : [];
        parsedAssigns = parsedAssigns.filter(a => a.form_id !== formId);
        localStorage.setItem('miqra_form_assignments', JSON.stringify(parsedAssigns));
        setAssignments(parsedAssigns);

        setSuccessMsg('Template deleted locally!');
        setLoading(false);
      } catch (err) {
        console.error('Error deleting local form template:', err);
        setError('Failed to delete form template locally.');
        setLoading(false);
      }
    }
  };

  // --- 3. ASSIGN/SEND FORM TO STUDENTS ---
  const handleOpenSendModal = (form) => {
    setSendTargetForm(form);
    setSelectedStudentIds([]);
    setShowSendModal(true);
  };

  const handleSendFormAssignments = async () => {
    if (!sendTargetForm || selectedStudentIds.length === 0) return;

    setLoading(true);
    setShowSendModal(false);

    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const rows = selectedStudentIds.map(studentId => ({
          form_id: sendTargetForm.id,
          organization_id: activeOrgId,
          student_id: studentId,
          sent_by: user?.id || null,
          status: 'pending'
        }));

        const { error: insErr } = await supabase
          .from('form_assignments')
          .insert(rows);

        if (insErr) throw insErr;
        setSuccessMsg(`Form successfully sent to ${selectedStudentIds.length} students!`);
        loadData();
      } catch (err) {
        console.error('Error sending form assignments in Supabase:', err);
        setError('Failed to send forms.');
        setLoading(false);
      }
    } else {
      try {
        const savedAssigns = localStorage.getItem('miqra_form_assignments');
        const parsedAssigns = savedAssigns ? JSON.parse(savedAssigns) : [];
        const timestamp = new Date().toISOString();

        selectedStudentIds.forEach(studentId => {
          parsedAssigns.unshift({
            id: `assign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            form_id: sendTargetForm.id,
            student_id: studentId,
            sent_by: 'leader_local',
            status: 'pending',
            responses: {},
            created_at: timestamp
          });
        });

        localStorage.setItem('miqra_form_assignments', JSON.stringify(parsedAssigns));
        setAssignments(parsedAssigns);
        setSuccessMsg(`Form sent locally to ${selectedStudentIds.length} students!`);
        setLoading(false);
      } catch (err) {
        console.error('Error sending local assignments:', err);
        setError('Failed to send forms locally.');
        setLoading(false);
      }
    }
  };

  const handleRevokeAssignment = async (assignId) => {
    if (!window.confirm('Are you sure you want to revoke this form assignment?')) return;

    setLoading(true);
    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const { error: delErr } = await supabase
          .from('form_assignments')
          .delete()
          .eq('id', assignId);
        if (delErr) throw delErr;
        setSuccessMsg('Form assignment revoked successfully!');
        loadData();
      } catch (err) {
        console.error('Error revoking form assignment from Supabase:', err);
        setError('Failed to revoke form assignment.');
        setLoading(false);
      }
    } else {
      try {
        const savedAssigns = localStorage.getItem('miqra_form_assignments');
        let parsed = savedAssigns ? JSON.parse(savedAssigns) : [];
        parsed = parsed.filter(a => a.id !== assignId);
        localStorage.setItem('miqra_form_assignments', JSON.stringify(parsed));
        setAssignments(parsed);
        setSuccessMsg('Form assignment revoked locally!');
        setLoading(false);
      } catch (err) {
        console.error('Error revoking local assignment:', err);
        setError('Failed to revoke assignment locally.');
        setLoading(false);
      }
    }
  };

  // --- 4. STUDENT WORKFLOW: FILL & SUBMIT FORM ---
  const handleOpenFillForm = (assignment) => {
    const template = forms.find(f => f.id === assignment.form_id);
    if (!template) {
      setError('Form template could not be found.');
      return;
    }
    setSelectedAssignment(assignment);
    setSelectedForm(template);
    // Pre-fill previous responses if editing a rejected submission
    setFormResponses(assignment.responses || {});
    setFormErrors({});
    setActiveTab('fill-form');
  };

  const handleResponseChange = (fieldId, val, type) => {
    if (type === 'checkbox') {
      const currentVal = formResponses[fieldId] || [];
      const updatedVal = currentVal.includes(val)
        ? currentVal.filter(item => item !== val)
        : [...currentVal, val];
      setFormResponses(prev => ({ ...prev, [fieldId]: updatedVal }));
    } else {
      setFormResponses(prev => ({ ...prev, [fieldId]: val }));
    }

    // Clear error for this field
    if (formErrors[fieldId]) {
      setFormErrors(prev => {
        const copy = { ...prev };
        delete copy[fieldId];
        return copy;
      });
    }
  };

  const handleSubmitFormResponse = async (e) => {
    e.preventDefault();
    if (!selectedAssignment || !selectedForm) return;

    // Validate fields
    const errors = {};
    selectedForm.fields.forEach(field => {
      const value = formResponses[field.id];
      if (field.required) {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          errors[field.id] = `${field.label} is required.`;
        }
      }
    });

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setError('Please resolve all validation errors before submitting.');
      return;
    }

    setLoading(true);
    const timestamp = new Date().toISOString();

    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const { error: submitErr } = await supabase
          .from('form_assignments')
          .update({
            responses: formResponses,
            status: 'submitted',
            submitted_at: timestamp
          })
          .eq('id', selectedAssignment.id);

        if (submitErr) throw submitErr;
        setSuccessMsg('Your form has been submitted to your leaders for review!');
        setActiveTab('assigned');
        loadData();
      } catch (err) {
        console.error('Error submitting form response in Supabase:', err);
        setError('Failed to submit form.');
        setLoading(false);
      }
    } else {
      try {
        const savedAssigns = localStorage.getItem('miqra_form_assignments');
        let parsed = savedAssigns ? JSON.parse(savedAssigns) : [];
        parsed = parsed.map(a => {
          if (a.id === selectedAssignment.id) {
            return {
              ...a,
              responses: formResponses,
              status: 'submitted',
              submitted_at: timestamp
            };
          }
          return a;
        });

        localStorage.setItem('miqra_form_assignments', JSON.stringify(parsed));
        setAssignments(parsed);
        setSuccessMsg('Your form has been submitted locally to your leaders!');
        setActiveTab('assigned');
        setLoading(false);
      } catch (err) {
        console.error('Error saving local form response:', err);
        setError('Failed to submit form response locally.');
        setLoading(false);
      }
    }
  };

  // --- 5. LEADER WORKFLOW: REVIEW SUBMISSIONS ---
  const handleOpenSubmissionDetail = (assignment) => {
    const template = forms.find(f => f.id === assignment.form_id);
    setSelectedAssignment(assignment);
    setSelectedForm(template || null);
    setReviewNotes(assignment.review_notes || '');
    setActiveTab('submission-detail');
  };

  const handleReviewSubmission = async (newStatus) => {
    if (!selectedAssignment) return;

    setLoading(true);
    const timestamp = new Date().toISOString();

    if (hasSupabaseConfig && supabase && activeOrgId) {
      try {
        const { error: revErr } = await supabase
          .from('form_assignments')
          .update({
            status: newStatus,
            reviewed_at: timestamp,
            reviewed_by: user?.id || null,
            review_notes: reviewNotes.trim() || null
          })
          .eq('id', selectedAssignment.id);

        if (revErr) throw revErr;
        setSuccessMsg(`Submission successfully ${newStatus === 'approved' ? 'approved' : 'rejected'}!`);
        setActiveTab('submissions');
        loadData();
      } catch (err) {
        console.error('Error reviewing form submission in Supabase:', err);
        setError('Failed to submit review.');
        setLoading(false);
      }
    } else {
      try {
        const savedAssigns = localStorage.getItem('miqra_form_assignments');
        let parsed = savedAssigns ? JSON.parse(savedAssigns) : [];
        parsed = parsed.map(a => {
          if (a.id === selectedAssignment.id) {
            return {
              ...a,
              status: newStatus,
              reviewed_at: timestamp,
              reviewed_by: 'leader_local',
              review_notes: reviewNotes.trim()
            };
          }
          return a;
        });

        localStorage.setItem('miqra_form_assignments', JSON.stringify(parsed));
        setAssignments(parsed);
        setSuccessMsg(`Submission ${newStatus === 'approved' ? 'approved' : 'rejected'} locally!`);
        setActiveTab('submissions');
        setLoading(false);
      } catch (err) {
        console.error('Error saving local review:', err);
        setError('Failed to save review feedback locally.');
        setLoading(false);
      }
    }
  };

  // --- 6. UTILITIES & FORMATTERS ---
  const getStudentProfile = useCallback((studentId) => {
    return profiles.find(p => p.id === studentId) || { full_name: 'Unknown Student', email: '' };
  }, [profiles]);

  const getFormTemplate = useCallback((formId) => {
    return forms.find(f => f.id === formId) || { title: 'Deleted Form Template', description: '' };
  }, [forms]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(isoString));
  };

  // Lists filtered for lists
  const pendingReviewAssignments = useMemo(() => {
    return assignments.filter(a => a.status === 'submitted');
  }, [assignments]);

  const activeAssignedForms = useMemo(() => {
    // For student: pending or rejected assigned to them
    const currentUserId = user?.id || 'local_student'; // Mock student for offline fallback
    // Filter assignments where student matches user
    return assignments.filter(a => {
      const isStudentMatch = hasSupabaseConfig ? a.student_id === currentUserId : true; // In offline demo show all local assignments for quick testing
      return isStudentMatch && (a.status === 'pending' || a.status === 'rejected');
    });
  }, [assignments, user?.id]);

  const studentHistoryAssignments = useMemo(() => {
    const currentUserId = user?.id || 'local_student';
    return assignments.filter(a => {
      const isStudentMatch = hasSupabaseConfig ? a.student_id === currentUserId : true;
      return isStudentMatch && (a.status === 'submitted' || a.status === 'approved' || a.status === 'rejected');
    });
  }, [assignments, user?.id]);

  // Count helper for badge on sidebar
  const pendingSubmissionCount = pendingReviewAssignments.length;
  const pendingFillCount = activeAssignedForms.filter(a => a.status === 'pending').length;

  return (
    <div className="form-generator-page">
      {!isLeaderPortalView && (
        <section className="form-generator-header card">
          <div className="form-generator-title">
            <FileText size={34} style={{ color: 'var(--accent-gold)' }} />
            <div>
              <h1>Form Generator</h1>
              <p>{isLeader 
                ? 'Design dynamic questionnaires, distribute them to student small groups, and process submissions.'
                : 'Complete forms assigned by your small group leaders and view status updates.'
              }</p>
            </div>
          </div>
          {isLeader && activeTab === 'templates' && (
            <div className="form-generator-actions">
              <QRShareButton
                value={`${window.location.origin}/forms`}
                title="Scan to open your assigned forms"
                buttonLabel="Share QR"
              />
              <button type="button" className="btn-primary" onClick={handleStartNewForm}>
                <Plus size={16} />
                <span>Create Form</span>
              </button>
            </div>
          )}
        </section>
      )}

      {error && <div className="badge badge-danger" style={{ padding: '0.75rem', width: '100%', textTransform: 'none', borderRadius: '8px' }}>{error}</div>}
      {successMsg && <div className="badge badge-success" style={{ padding: '0.75rem', width: '100%', textTransform: 'none', borderRadius: '8px' }}>{successMsg}</div>}

      <div className="form-generator-shell">
        <aside className="form-generator-nav">
          {isLeader ? (
            <>
              <button 
                type="button" 
                className={`form-generator-nav-btn ${activeTab === 'templates' ? 'active' : ''}`}
                onClick={() => handleTabClick('templates')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <List size={16} />
                  <span>My Form Templates</span>
                </div>
              </button>
              <button 
                type="button" 
                className={`form-generator-nav-btn ${activeTab === 'submissions' || activeTab === 'submission-detail' ? 'active' : ''}`}
                onClick={() => handleTabClick('submissions')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ClipboardList size={16} />
                  <span>Submissions</span>
                </div>
                {pendingSubmissionCount > 0 && <span className="badge">{pendingSubmissionCount}</span>}
              </button>
              <button 
                type="button" 
                className={`form-generator-nav-btn ${activeTab === 'assignments' ? 'active' : ''}`}
                onClick={() => handleTabClick('assignments')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Send size={16} />
                  <span>Sent Assignments</span>
                </div>
              </button>
            </>
          ) : (
            <>
              <button 
                type="button" 
                className={`form-generator-nav-btn ${activeTab === 'assigned' || activeTab === 'fill-form' ? 'active' : ''}`}
                onClick={() => handleTabClick('assigned')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileEdit size={16} />
                  <span>Pending Forms</span>
                </div>
                {pendingFillCount > 0 && <span className="badge">{pendingFillCount}</span>}
              </button>
              <button 
                type="button" 
                className={`form-generator-nav-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => handleTabClick('history')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={16} />
                  <span>Submission History</span>
                </div>
              </button>
            </>
          )}
        </aside>

        <main className="form-generator-content">
          {loading && (
            <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <RefreshCw size={24} className="spin" style={{ color: 'var(--accent-gold)' }} />
            </div>
          )}

          {!loading && (
            <>
              {/* --- TAB: MANAGE FORM TEMPLATES (Leader Only) --- */}
              {activeTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  {isLeaderPortalView && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>My Form Templates</h3>
                      <button type="button" className="btn-primary" onClick={handleStartNewForm} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Plus size={16} />
                        <span>Create Form</span>
                      </button>
                    </div>
                  )}
                  <div className="templates-grid">
                  {forms.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                      <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                      <h3>No Form Templates Found</h3>
                      <p style={{ color: 'var(--text-secondary)' }}>Get started by creating your first flexible questionnaire form.</p>
                      <button type="button" className="btn-primary" onClick={handleStartNewForm} style={{ marginTop: '1rem' }}>
                        Create Form
                      </button>
                    </div>
                  ) : (
                    forms.map(form => (
                      <article key={form.id} className="card template-card">
                        <div className="template-card-header">
                          <h3>{form.title}</h3>
                          <p>{form.description || 'No description provided.'}</p>
                          <div className="template-meta-pills">
                            <span className="template-meta-pill">
                              {form.fields?.length || 0} fields
                            </span>
                            <span className="template-meta-pill">
                              Created: {formatDate(form.created_at).split(',')[0]}
                            </span>
                          </div>
                        </div>
                        <div className="template-card-actions">
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ flex: 1, padding: '0.4rem 0' }}
                            onClick={() => handleStartEditForm(form)}
                          >
                            <Edit size={14} /> Edit
                          </button>
                          <button 
                            type="button" 
                            className="btn-primary" 
                            style={{ flex: 1.5, padding: '0.4rem 0' }}
                            onClick={() => handleOpenSendModal(form)}
                          >
                            <Send size={14} /> Send
                          </button>
                          <button 
                            type="button" 
                            className="btn-icon" 
                            style={{ color: 'var(--danger-red)', borderColor: 'var(--danger-border)', padding: '0.4rem' }}
                            onClick={() => handleDeleteForm(form.id)}
                            title="Delete Template"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                </div>
              )}

              {/* --- TAB: SENT ASSIGNMENTS (Leader Only) --- */}
              {activeTab === 'assignments' && (
                <div className="card">
                  <h2>Sent Assignments Tracker</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Track all questionnaires you have sent to students and manage pending invites.
                  </p>
                  
                  <div className="assignments-table-wrap">
                    {assignments.length === 0 ? (
                      <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No form assignments found.</p>
                    ) : (
                      <table className="assignments-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Form Title</th>
                            <th>Date Sent</th>
                            <th>Status</th>
                            <th>Submitted Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map(assign => {
                            const student = getStudentProfile(assign.student_id);
                            const template = getFormTemplate(assign.form_id);
                            return (
                              <tr key={assign.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Avatar src={student.avatar_url} name={student.full_name} size={24} />
                                    <strong>{student.full_name}</strong>
                                  </div>
                                </td>
                                <td>{template.title}</td>
                                <td>{formatDate(assign.created_at)}</td>
                                <td>
                                  <span className={`status-badge ${assign.status}`}>
                                    {assign.status}
                                  </span>
                                </td>
                                <td>{formatDate(assign.submitted_at)}</td>
                                <td>
                                  {assign.status === 'pending' ? (
                                    <button 
                                      type="button" 
                                      className="assignment-fill-btn danger"
                                      onClick={() => handleRevokeAssignment(assign.id)}
                                      title="Revoke sent form"
                                    >
                                      <Trash size={13} /> Revoke
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Submitted</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* --- TAB: SUBMISSIONS QUEUE (Leader Only) --- */}
              {activeTab === 'submissions' && (
                <div className="card">
                  <h2>Pending Review Queue</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Review submitted student responses and accept or request corrections.
                  </p>

                  <div className="assignments-table-wrap">
                    {pendingReviewAssignments.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <UserCheck size={36} style={{ color: 'var(--success-green)', marginBottom: '0.75rem' }} />
                        <h3>Inbox Clear!</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>All student submissions have been reviewed.</p>
                      </div>
                    ) : (
                      <table className="assignments-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Form Submitted</th>
                            <th>Submission Date</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingReviewAssignments.map(assign => {
                            const student = getStudentProfile(assign.student_id);
                            const template = getFormTemplate(assign.form_id);
                            return (
                              <tr key={assign.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Avatar src={student.avatar_url} name={student.full_name} size={28} />
                                    <strong>{student.full_name}</strong>
                                  </div>
                                </td>
                                <td>{template.title}</td>
                                <td>{formatDate(assign.submitted_at)}</td>
                                <td>
                                  <button 
                                    type="button" 
                                    className="btn-primary" 
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                    onClick={() => handleOpenSubmissionDetail(assign)}
                                  >
                                    Review
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* --- VIEW: SUBMISSION DETAIL & REVIEW PANEL (Leader Only) --- */}
              {activeTab === 'submission-detail' && selectedAssignment && selectedForm && (
                <div className="submission-review-workspace">
                  <div className="submission-review-content">
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setActiveTab('submissions')}
                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ChevronLeft size={16} /> Back to Submissions
                    </button>

                    <div className="card">
                      <div className="submission-review-meta">
                        <div className="submission-review-user">
                          <Avatar 
                            src={getStudentProfile(selectedAssignment.student_id).avatar_url} 
                            name={getStudentProfile(selectedAssignment.student_id).full_name} 
                            size={42} 
                          />
                          <div className="submission-review-user-info">
                            <strong>{getStudentProfile(selectedAssignment.student_id).full_name}</strong>
                            <span>Submitted on: {formatDate(selectedAssignment.submitted_at)}</span>
                          </div>
                        </div>
                        <span className={`status-badge ${selectedAssignment.status}`}>
                          {selectedAssignment.status}
                        </span>
                      </div>

                      <div style={{ marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>{selectedForm.title}</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>{selectedForm.description}</p>
                      </div>

                      <div className="submission-review-qa">
                        {selectedForm.fields.map(field => {
                          const answer = selectedAssignment.responses[field.id];
                          const isEmpty = answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);
                          
                          return (
                            <div key={field.id} className="submission-qa-item">
                              <div className="submission-qa-question">
                                {field.label} {field.required && <span style={{ color: 'var(--danger-red)' }}>*</span>}
                              </div>
                              <div className={`submission-qa-answer ${isEmpty ? 'empty' : ''}`}>
                                {isEmpty ? (
                                  'No response'
                                ) : Array.isArray(answer) ? (
                                  <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                                    {answer.map((item, idx) => <li key={idx}>{item}</li>)}
                                  </ul>
                                ) : (
                                  answer
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="review-action-panel">
                    <div className="card" style={{ borderLeft: '4px solid var(--accent-gold)' }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 0 }}>
                        <ClipboardList size={18} className="text-gold" />
                        Submission Action
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Review student responses. Approve the submission to complete the workflow, or reject with feedback to request updates.
                      </p>

                      <div className="form-group" style={{ margin: '1.25rem 0' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                          Review Feedback Notes
                        </label>
                        <textarea
                          rows={4}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Provide correction notes if rejecting, or positive reinforcement if approving..."
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button 
                          type="button" 
                          className="btn-primary" 
                          style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                          onClick={() => handleReviewSubmission('approved')}
                        >
                          <CheckCircle size={16} /> Approve Submission
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger-red)', borderColor: 'var(--danger-border)' }}
                          onClick={() => handleReviewSubmission('rejected')}
                        >
                          <XCircle size={16} /> Reject & Ask for Edits
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- VIEW: FORM BUILDER WORKSPACE (Leader Only) --- */}
              {activeTab === 'builder' && (
                <form onSubmit={handleSaveFormTemplate} className="form-builder-workspace">
                  <div className="form-builder-editor">
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setActiveTab('templates')}
                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ChevronLeft size={16} /> Cancel & Exit Builder
                    </button>

                    <div className="card">
                      <h2 style={{ marginTop: 0 }}>{isEditingId ? 'Edit Form Template' : 'Design New Form'}</h2>
                      
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Form Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Fellowship Camp RSVP"
                          value={builderTitle}
                          onChange={(e) => setBuilderTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Description / Instructions</label>
                        <textarea 
                          rows={2}
                          placeholder="Provide helper text or details for students..."
                          value={builderDescription}
                          onChange={(e) => setBuilderDescription(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Form Fields ({builderFields.length})</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Add widgets below</span>
                      </div>

                      {builderFields.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '2rem', borderStyle: 'dashed' }}>
                          <Info size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No fields added yet. Choose a field type below to begin.</p>
                        </div>
                      ) : (
                        builderFields.map((field, index) => (
                          <article key={field.id} className="form-field-card">
                            <div className="form-field-header">
                              <h4>
                                {field.type === 'text' && <Type size={15} style={{ color: 'var(--accent-gold)' }} />}
                                {field.type === 'textarea' && <AlignLeft size={15} style={{ color: 'var(--accent-gold)' }} />}
                                {field.type === 'number' && <span style={{ fontWeight: 800, fontSize: '0.8rem', width: 15, display: 'inline-block', color: 'var(--accent-gold)' }}>#</span>}
                                {field.type === 'date' && <Calendar size={15} style={{ color: 'var(--accent-gold)' }} />}
                                {field.type === 'select' && <List size={15} style={{ color: 'var(--accent-gold)' }} />}
                                {field.type === 'radio' && <CircleDot size={15} style={{ color: 'var(--accent-gold)' }} />}
                                {field.type === 'checkbox' && <CheckSquare size={15} style={{ color: 'var(--accent-gold)' }} />}
                                <span>{field.label || `Field ${index + 1}`}</span>
                              </h4>
                              <div className="form-field-controls">
                                <button 
                                  type="button" 
                                  className="btn-icon" 
                                  disabled={index === 0}
                                  onClick={() => handleMoveField(index, 'up')}
                                  title="Move Up"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button 
                                  type="button" 
                                  className="btn-icon" 
                                  disabled={index === builderFields.length - 1}
                                  onClick={() => handleMoveField(index, 'down')}
                                  title="Move Down"
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <button 
                                  type="button" 
                                  className="btn-icon text-red" 
                                  style={{ borderColor: 'var(--danger-border)' }}
                                  onClick={() => handleRemoveField(field.id)}
                                  title="Delete Field"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            <div className="form-field-grid">
                              <div className="form-field-grid-row">
                                <label style={{ display: 'grid', gap: '0.2rem' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Field Label</span>
                                  <input 
                                    type="text" 
                                    className="input-sm"
                                    value={field.label}
                                    onChange={(e) => handleFieldChange(field.id, 'label', e.target.value)}
                                    required
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: '0.2rem' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Field Type</span>
                                  <select 
                                    className="input-sm"
                                    value={field.type} 
                                    onChange={(e) => handleFieldChange(field.id, 'type', e.target.value)}
                                  >
                                    <option value="text">Short Text</option>
                                    <option value="textarea">Long Text</option>
                                    <option value="number">Number</option>
                                    <option value="date">Date</option>
                                    <option value="select">Dropdown</option>
                                    <option value="radio">Single Choice (Radio)</option>
                                    <option value="checkbox">Multi Choice (Checkboxes)</option>
                                  </select>
                                </label>
                              </div>

                              {/* Placeholder helper for standard inputs */}
                              {['text', 'textarea', 'number'].includes(field.type) && (
                                <label style={{ display: 'grid', gap: '0.2rem' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Placeholder Helper</span>
                                  <input 
                                    type="text" 
                                    className="input-sm"
                                    placeholder="Placeholder text..."
                                    value={field.placeholder || ''}
                                    onChange={(e) => handleFieldChange(field.id, 'placeholder', e.target.value)}
                                  />
                                </label>
                              )}

                              {/* Custom Options Builder for choice inputs */}
                              {['select', 'radio', 'checkbox'].includes(field.type) && (
                                <div className="form-field-options-list">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Options list</span>
                                    <button 
                                      type="button" 
                                      className="assignment-fill-btn" 
                                      style={{ minHeight: '22px', fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                                      onClick={() => handleAddOption(field.id)}
                                    >
                                      + Add Option
                                    </button>
                                  </div>
                                  {(field.options || []).map((opt, oIdx) => (
                                    <div key={oIdx} className="form-field-option-item">
                                      <input 
                                        type="text" 
                                        className="input-sm" 
                                        value={opt}
                                        onChange={(e) => handleOptionChange(field.id, oIdx, e.target.value)}
                                        required
                                      />
                                      <button 
                                        type="button" 
                                        className="btn-icon text-red" 
                                        disabled={field.options.length <= 1}
                                        onClick={() => handleRemoveOption(field.id, oIdx)}
                                        style={{ padding: '0.2rem' }}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="form-field-checkbox-row">
                                <input 
                                  type="checkbox" 
                                  id={`req_${field.id}`}
                                  checked={field.required}
                                  onChange={(e) => handleFieldChange(field.id, 'required', e.target.checked)}
                                />
                                <label htmlFor={`req_${field.id}`} style={{ cursor: 'pointer' }}>Mandatory Field (Required)</label>
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>

                    <div className="card">
                      <h3>Add Widget</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('text')}>Text</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('textarea')}>Textarea</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('number')}>Number</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('date')}>Date</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('select')}>Dropdown</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('radio')}>Radio</button>
                        <button type="button" className="btn-secondary" onClick={() => handleAddField('checkbox')}>Checkbox</button>
                      </div>
                    </div>
                  </div>

                  <div className="form-builder-preview-panel">
                    <div className="card" style={{ borderLeft: '4px solid var(--accent-gold)' }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 0 }}>
                        <Eye size={18} className="text-gold" /> Live Preview
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        This shows a live representation of what students will experience when completing this questionnaire.
                      </p>

                      <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />

                      <div className="form-render-header" style={{ border: 'none', padding: 0 }}>
                        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{builderTitle || 'Untitled Form Template'}</h2>
                        {builderDescription && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{builderDescription}</p>}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
                        {builderFields.map((field) => (
                          <div key={field.id} className="form-render-field-row">
                            <label style={{ fontSize: '0.88rem' }}>
                              {field.label} {field.required && <span className="required-star">*</span>}
                            </label>

                            {field.type === 'text' && (
                              <input type="text" placeholder={field.placeholder} disabled style={{ minHeight: '34px' }} />
                            )}
                            {field.type === 'textarea' && (
                              <textarea rows={2} placeholder={field.placeholder} disabled />
                            )}
                            {field.type === 'number' && (
                              <input type="number" placeholder={field.placeholder} disabled style={{ minHeight: '34px' }} />
                            )}
                            {field.type === 'date' && (
                              <input type="date" disabled style={{ minHeight: '34px' }} />
                            )}
                            {field.type === 'select' && (
                              <select disabled style={{ height: '34px' }}>
                                <option>— Select Option —</option>
                                {(field.options || []).map((o, idx) => (
                                  <option key={idx}>{o}</option>
                                ))}
                              </select>
                            )}
                            {field.type === 'radio' && (
                              <div className="form-render-options-grid">
                                {(field.options || []).map((o, idx) => (
                                  <label key={idx} className="form-render-option-label" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                                    <input type="radio" disabled />
                                    <span>{o}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            {field.type === 'checkbox' && (
                              <div className="form-render-options-grid">
                                {(field.options || []).map((o, idx) => (
                                  <label key={idx} className="form-render-option-label" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                                    <input type="checkbox" disabled />
                                    <span>{o}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Save size={15} /> Save Template
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {/* --- TAB: PENDING FORMS (Student Only) --- */}
              {activeTab === 'assigned' && (
                <div className="templates-grid">
                  {activeAssignedForms.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                      <CheckCircle size={48} style={{ color: 'var(--success-green)', marginBottom: '1rem' }} />
                      <h3>No Pending Forms!</h3>
                      <p style={{ color: 'var(--text-secondary)' }}>You are completely caught up on your small group questionnaires.</p>
                    </div>
                  ) : (
                    activeAssignedForms.map(assign => {
                      const template = getFormTemplate(assign.form_id);
                      return (
                        <article key={assign.id} className="card template-card" style={{ borderLeft: assign.status === 'rejected' ? '4px solid var(--danger-red)' : '4px solid var(--accent-gold)' }}>
                          <div className="template-card-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <h3>{template.title}</h3>
                              <span className={`status-badge ${assign.status}`}>
                                {assign.status}
                              </span>
                            </div>
                            <p>{template.description}</p>
                            {assign.status === 'rejected' && assign.review_notes && (
                              <div className="review-notes-box" style={{ borderColor: 'var(--danger-red)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                                <h5>Correction Requested</h5>
                                <p>{assign.review_notes}</p>
                              </div>
                            )}
                          </div>
                          <div className="template-card-actions">
                            <button 
                              type="button" 
                              className="btn-primary" 
                              style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => handleOpenFillForm(assign)}
                            >
                              <FileEdit size={14} /> 
                              {assign.status === 'rejected' ? 'Edit & Resubmit' : 'Fill Out Form'}
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              )}

              {/* --- TAB: SUBMISSION HISTORY (Student Only) --- */}
              {activeTab === 'history' && (
                <div className="card">
                  <h2>My Submissions History</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Monitor the status of your submitted questionnaires and review leader feedback.
                  </p>

                  <div className="assignments-table-wrap">
                    {studentHistoryAssignments.length === 0 ? (
                      <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>You have not submitted any forms yet.</p>
                    ) : (
                      <table className="assignments-table">
                        <thead>
                          <tr>
                            <th>Form Title</th>
                            <th>Date Submitted</th>
                            <th>Status</th>
                            <th>Leader Notes</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentHistoryAssignments.map(assign => {
                            const template = getFormTemplate(assign.form_id);
                            return (
                              <tr key={assign.id}>
                                <td><strong>{template.title}</strong></td>
                                <td>{formatDate(assign.submitted_at || assign.created_at)}</td>
                                <td>
                                  <span className={`status-badge ${assign.status}`}>
                                    {assign.status}
                                  </span>
                                </td>
                                <td>
                                  {assign.review_notes ? (
                                    <span style={{ fontSize: '0.85rem' }}>{assign.review_notes}</span>
                                  ) : (
                                    <em style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No notes provided</em>
                                  )}
                                </td>
                                <td>
                                  {assign.status === 'rejected' && (
                                    <button 
                                      type="button" 
                                      className="btn-secondary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                      onClick={() => handleOpenFillForm(assign)}
                                    >
                                      Edit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* --- VIEW: FILL OUT FORM / RENDERING WORKSPACE (Student Only) --- */}
              {activeTab === 'fill-form' && selectedAssignment && selectedForm && (
                <form onSubmit={handleSubmitFormResponse} className="form-render-container card">
                  <div className="form-render-header">
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setActiveTab('assigned')}
                      style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ChevronLeft size={16} /> Back to List
                    </button>
                    <h2>{selectedForm.title}</h2>
                    {selectedForm.description && <p>{selectedForm.description}</p>}
                    
                    {selectedAssignment.status === 'rejected' && selectedAssignment.review_notes && (
                      <div className="review-notes-box" style={{ borderColor: 'var(--danger-red)', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginTop: '1rem' }}>
                        <h5 style={{ color: 'var(--danger-strong)' }}>Leader Feedback Correction Note:</h5>
                        <p>{selectedAssignment.review_notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="form-render-fields">
                    {selectedForm.fields.map(field => {
                      const answer = formResponses[field.id];
                      const error = formErrors[field.id];

                      return (
                        <div key={field.id} className="form-render-field-row">
                          <label>
                            {field.label} {field.required && <span className="required-star">*</span>}
                          </label>

                          {field.type === 'text' && (
                            <input 
                              type="text" 
                              placeholder={field.placeholder || 'Type here...'} 
                              value={answer || ''}
                              onChange={(e) => handleResponseChange(field.id, e.target.value, 'text')}
                            />
                          )}
                          {field.type === 'textarea' && (
                            <textarea 
                              rows={3} 
                              placeholder={field.placeholder || 'Type here...'} 
                              value={answer || ''}
                              onChange={(e) => handleResponseChange(field.id, e.target.value, 'textarea')}
                            />
                          )}
                          {field.type === 'number' && (
                            <input 
                              type="number" 
                              placeholder={field.placeholder || 'e.g. 123'} 
                              value={answer || ''}
                              onChange={(e) => handleResponseChange(field.id, e.target.value, 'number')}
                            />
                          )}
                          {field.type === 'date' && (
                            <input 
                              type="date" 
                              value={answer || ''}
                              onChange={(e) => handleResponseChange(field.id, e.target.value, 'date')}
                            />
                          )}
                          {field.type === 'select' && (
                            <select 
                              value={answer || ''}
                              onChange={(e) => handleResponseChange(field.id, e.target.value, 'select')}
                            >
                              <option value="">— Choose options —</option>
                              {(field.options || []).map((o, idx) => (
                                <option key={idx} value={o}>{o}</option>
                              ))}
                            </select>
                          )}
                          {field.type === 'radio' && (
                            <div className="form-render-options-grid">
                              {(field.options || []).map((o, idx) => (
                                <label key={idx} className="form-render-option-label">
                                  <input 
                                    type="radio" 
                                    name={`rad_${field.id}`}
                                    value={o}
                                    checked={answer === o}
                                    onChange={() => handleResponseChange(field.id, o, 'radio')}
                                  />
                                  <span>{o}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {field.type === 'checkbox' && (
                            <div className="form-render-options-grid">
                              {(field.options || []).map((o, idx) => {
                                const isChecked = Array.isArray(answer) && answer.includes(o);
                                return (
                                  <label key={idx} className="form-render-option-label">
                                    <input 
                                      type="checkbox" 
                                      value={o}
                                      checked={isChecked}
                                      onChange={() => handleResponseChange(field.id, o, 'checkbox')}
                                    />
                                    <span>{o}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {error && <span style={{ color: 'var(--danger-red)', fontSize: '0.8rem', fontWeight: 600 }}>{error}</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => setActiveTab('assigned')}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Send size={14} /> Send Submission
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </main>
      </div>

      {/* --- DIALOG MODAL: SEND FORM TEMPLATE TO STUDENTS --- */}
      {showSendModal && sendTargetForm && (
        <div className="forms-modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="forms-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="reader-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '1.25rem 1.5rem', marginBottom: 0 }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Send Form: {sendTargetForm.title}</h2>
              <button type="button" className="btn-icon" onClick={() => setShowSendModal(false)} style={{ border: 'none', background: 'transparent', padding: '0.2rem' }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="forms-modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                Select students below to distribute this dynamic questionnaire. They will receive it in their Pending Forms tab.
              </p>
              
              <div className="student-selection-list">
                {profiles.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No organization members found.</p>
                ) : (
                  profiles.map(p => {
                    const isSelected = selectedStudentIds.includes(p.id);
                    return (
                      <div 
                        key={p.id} 
                        className={`student-selection-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedStudentIds(prev => 
                            isSelected ? prev.filter(x => x !== p.id) : [...prev, p.id]
                          );
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          readOnly 
                          style={{ width: 'auto', height: 'auto', pointerEvents: 'none' }}
                        />
                        <Avatar src={p.avatar_url} name={p.full_name} size={28} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{p.full_name}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.email}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="forms-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowSendModal(false)}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                disabled={selectedStudentIds.length === 0}
                onClick={handleSendFormAssignments}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Send size={13} />
                <span>Send to {selectedStudentIds.length} {selectedStudentIds.length === 1 ? 'Student' : 'Students'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
