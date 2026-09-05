import { useEffect, useRef, useState } from "react";

type Props = { editToken: string; viewToken: string };

/** The two share links for a list. Only edit-role users ever see this panel. */
export function ShareLinks({ editToken, viewToken }: Props) {
  const base = `${location.origin}/l/`;
  return (
    <section className="share" aria-label="Share this list">
      <ShareRow
        label="Can edit"
        hint="Anyone with this link can change the list."
        url={base + editToken}
      />
      <ShareRow
        label="Can view"
        hint="Anyone with this link can only look."
        url={base + viewToken}
      />
    </section>
  );
}

function ShareRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (insecure context or permission denied): leave the text selected so
      // the user can copy it with the keyboard.
      input.current?.focus();
      input.current?.select();
    }
  }

  return (
    <div className="share-row">
      <div className="share-text">
        <strong>{label}</strong>
        <span className="muted"> · {hint}</span>
        <input
          ref={input}
          className="share-url"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <button className="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
