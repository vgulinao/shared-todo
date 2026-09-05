import { useState } from "react";
import { navigate } from "../lib/router.ts";

export function Home() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="app home">
      <h1>Shared To-Do</h1>
      <p className="muted">A to-do list you can share with a link. No account needed.</p>
      <button className="primary" onClick={createList} disabled={busy}>
        {busy ? "Creating…" : "New list"}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
