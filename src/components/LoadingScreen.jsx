import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import './LoadingScreen.css';

// Lightweight progress meter for the app's initial load. The real load has no
// measurable steps, so we ease the bar toward ~94% and let it sit there until
// the app is ready and this screen is unmounted (a common, reassuring pattern).
export default function LoadingScreen({ label = 'Loading Student Portal…' }) {
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 94) return p;
        const step = Math.max(0.6, (96 - p) * 0.1); // ease-out toward the cap
        return Math.min(94, p + step);
      });
    }, 160);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-logo">
          <BookOpen size={30} />
        </div>
        <h2>Miqra Kodesh</h2>
        <p className="loading-label">{label}</p>
        <div
          className="loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="loading-pct">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
