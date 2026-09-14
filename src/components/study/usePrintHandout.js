import { useEffect, useState } from 'react';

// The handout is only mounted while printing. Kept in the DOM permanently it
// would duplicate every heading on the page for assistive tech and queries
// alike; mounted on demand, the print dialog opens once it has rendered.
export function usePrintHandout() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);
  return { printing, print: () => setPrinting(true) };
}
