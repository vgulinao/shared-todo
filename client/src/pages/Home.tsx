import { useState } from "react";
import { navigate, onLinkClick } from "../lib/router.ts";
import { forget, loadRecent, saveRecent, timeAgo } from "../lib/recent.ts";

export function Home() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState(loadRecent);

  async function createList() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", { method: "POST" });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      const { editToken } = (await res.json()) as { editToken: string };
      navigate(`/l/${editToken}`);
    } catch (err) {
      setError(`Could not create a list (${err instanceof Error ? err.message : "unknown error"})`);
      setBusy(false);
    }
  }

  function remove(token: string) {
    const next = forget(recent, token);
    setRecent(next);
    saveRecent(next);
  }

  return (
    <main className="app home">
      <h1>Shared To-Do</h1>
      <p className="muted">A to-do list you can share with a link. No account needed.</p>
      <button className="primary" onClick={createList} disabled={busy}>
        {busy ? "Creating…" : "New list"}
      </button>
      {error && <p className="error">{error}</p>}

      {recent.length > 0 && (
        <section className="recent" aria-label="Lists you opened on this device">
          <h2>Recent on this device</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.token}>
                <a href={`/l/${r.token}`} onClick={onLinkClick}>
                  {r.title}
                </a>
                <span className="tag">{r.role}</span>
                <span className="muted when">{timeAgo(r.at)}</span>
                <button
                  className="item-delete"
                  aria-label={`Forget ${r.title} on this device`}
                  title="Forget on this device"
                  onClick={() => remove(r.token)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Only links this browser has opened. Nothing is stored on the server.
          </p>
        </section>
      )}
    </main>
  );
}
