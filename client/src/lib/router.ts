import { useEffect, useState, type MouseEvent } from "react";

/** The current pathname, updated on back/forward and on `navigate`. */
export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onChange = () => setPath(location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return path;
}

export function navigate(path: string): void {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Click handler for in-app <a href> links: plain clicks navigate without a reload; modified clicks
 * (new tab, new window) and non-primary buttons are left to the browser.
 */
export function onLinkClick(e: MouseEvent<HTMLAnchorElement>): void {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const href = e.currentTarget.getAttribute("href");
  if (!href) return;
  e.preventDefault();
  navigate(href);
}
