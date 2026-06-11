import { MessageSquarePlus } from 'lucide-react';

export default function FeedbackButton({ onClick }) {
  return (
    <button
      type="button"
      className="feedback-fab"
      onClick={onClick}
      aria-label="Open feedback board"
    >
      <MessageSquarePlus size={18} />
      <span>Feedback?</span>
    </button>
  );
}
