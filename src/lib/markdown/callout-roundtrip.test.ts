// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { roundtripMarkdown } from "./convert";

describe("callout WYSIWYG round-trip", () => {
  it("preserves a typed, titled callout with rich content", () => {
    const md = `# Page

{% callout type="warning" title="Heads up" %}

Rate limits apply to **all** endpoints:

- 100 requests/minute
- bursts up to 200

{% /callout %}

After the callout.`;
    const out = roundtripMarkdown(md);
    expect(out).toContain('{% callout type="warning" title="Heads up" %}');
    expect(out).toContain("{% /callout %}");
    expect(out).toContain("Rate limits apply to **all** endpoints");
    expect(out).toContain("- 100 requests/minute");
    expect(out).toContain("After the callout.");
    // stable under repeated round-trips
    expect(roundtripMarkdown(out)).toBe(out);
  });

  it("defaults to note type and escapes quotes in titles", () => {
    const md = `{% callout %}

Plain note.

{% /callout %}`;
    const out = roundtripMarkdown(md);
    expect(out).toContain('{% callout type="note" %}');

    const quoted = roundtripMarkdown(
      `{% callout type="danger" title="Don't \\"ship\\" this" %}\n\nBody.\n\n{% /callout %}`,
    );
    expect(quoted).toContain('title="Don\'t \\"ship\\" this"');
    expect(roundtripMarkdown(quoted)).toBe(quoted);
  });

  it("leaves an unclosed callout tag as plain text", () => {
    const md = `{% callout type="note" %}

no closing tag here`;
    const out = roundtripMarkdown(md);
    expect(out).not.toContain("{% /callout %}");
  });

  it("round-trips strikethrough and horizontal rules", () => {
    const md = `Some ~~struck~~ text.

---

After the rule.`;
    const out = roundtripMarkdown(md);
    expect(out).toContain("~~struck~~");
    expect(out).toContain("---");
  });
});
