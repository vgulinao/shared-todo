import { navigate } from "../lib/router.ts";

export function NotFound() {
  return (
    <main className="app">
      <h1>This list does not exist</h1>
      <p className="muted">The link may be wrong, or the list was never created.</p>
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
      >
        Create a new list
      </a>
    </main>
  );
}
