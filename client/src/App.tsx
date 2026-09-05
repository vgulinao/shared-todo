import { Home } from "./pages/Home.tsx";
import { ListPage } from "./pages/ListPage.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { usePath } from "./lib/router.ts";

export function App() {
  const path = usePath();
  if (path === "/") return <Home />;
  const token = path.match(/^\/l\/([A-Za-z0-9_-]+)$/)?.[1];
  if (token) return <ListPage key={token} token={token} />;
  return <NotFound />;
}
