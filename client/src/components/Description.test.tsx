import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Description } from "./Description.tsx";

// Rendered to a string, so no DOM is needed: what matters is which HTML the Markdown produces.
function render(text: string): string {
  return renderToStaticMarkup(
    createElement(Description, {
      text,
      editable: false,
      editing: false,
      onEditingChange: () => {},
      onChange: () => {},
    }),
  );
}

describe("S9 markdown descriptions", () => {
  it("AC2 renders emphasis, code, and lists", () => {
    const html = render("Buy **oat** milk, `2 l`\n\n- one\n- two");
    expect(html).toContain("<strong>oat</strong>");
    expect(html).toContain("<code>2 l</code>");
    expect(html).toContain("<li>one</li>");
  });

  it("AC5 raw HTML in the text is shown as text, never rendered", () => {
    const html = render('hello <script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("AC5 links open in a new tab with a safe rel", () => {
    const html = render("see [the spec](https://example.com/spec)");
    expect(html).toContain('href="https://example.com/spec"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("AC5 javascript: links are not rendered as links", () => {
    const html = render("[x](javascript:alert(1))");
    expect(html).not.toContain('href="javascript:');
  });
});
