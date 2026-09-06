import { navigate } from "../lib/router.ts";

export function NotFound() {
  return (
    <main className="app">
      <h1>This list does not exist</h1>
      <p className="muted">
        A list is reached only through its link, which contains a long random token. This one
        matches no list: the link may be incomplete, mistyped, or from a list that was never
        created.
      </p>
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
