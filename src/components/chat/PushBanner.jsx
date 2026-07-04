import { useState } from 'react';
import { Bell } from 'lucide-react';
import { enablePushNotifications, isPushSupported, pushPermission } from '../../lib/push';

export default function PushBanner({ activeOrgId, userId }) {
  const [pushState, setPushState] = useState(() => pushPermission());
  const [dismissed, setDismissed] = useState(false);

  if (!isPushSupported() || pushState !== 'default' || dismissed) return null;

  return (
    <div className="chat-push-banner card">
      <Bell size={18} />
      <span>Get notified when someone @mentions you.</span>
      <div className="chat-push-actions">
        <button type="button" className="btn-primary" onClick={async () => setPushState(await enablePushNotifications(userId, activeOrgId))}>Enable</button>
        <button type="button" className="btn-secondary" onClick={() => setDismissed(true)}>Not now</button>
      </div>
    </div>
  );
}
