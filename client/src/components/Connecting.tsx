import { useEffect, useState } from "react";

/** "Connecting…" with a spinner that appears only after a second, so a fast connect shows nothing busy. */
export function Connecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="muted connecting" role="status">
      {slow && <span className="spinner" aria-hidden="true" />}
      Connecting…
    </p>
  );
}
