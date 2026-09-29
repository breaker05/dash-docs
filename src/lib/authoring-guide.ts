// Guidance sent to write-enabled MCP clients (as server instructions and via
// the get_authoring_guide tool) so AI-written drafts match what the editor
// produces and renders cleanly.

export const AUTHORING_WORKFLOW = `Dash Docs authoring workflow (write-enabled key):

1. Orient: call list_page_tree to see the whole site (drafts included) and get_authoring_guide for formatting rules. Read any related existing pages (get_draft) so new docs match their tone and don't duplicate them.
2. Decide where it goes: unless the user already said exactly where, propose a plan — page title(s), the parent path each goes under (or top level), and whether it should be internal (team-only) — and get the user's OK before creating anything. For multi-page docs, create the section parent first, then its children.
3. Images: screenshots/diagrams must be hosted by the docs server. Upload each with upload_image (or, if you have a shell, POST it to /api/upload — see the upload_image description) and use the returned URL. Inline base64 data: URIs in page content are uploaded automatically; local paths like ./img.png are rejected.
4. Write: create_page for new pages, update_page for existing ones (pass expectedDraftUpdatedAt from get_draft to avoid overwriting a teammate's edits). Everything is saved as a DRAFT — nothing goes live.
5. Hand off: give the user the editor links returned by the tools; a human reviews and publishes from the editor.`;

export const AUTHORING_GUIDE = `# Dash Docs formatting guide

Pages are Markdown (CommonMark + GitHub tables) rendered with Markdoc.

- The page title is rendered as the H1 — do NOT start content with a "# Title" heading. Start with an intro paragraph, then use ## and ### for sections (they get anchor links and appear in the page outline).
- Code: fenced blocks with a language, e.g. \`\`\`ts, \`\`\`bash, \`\`\`json, \`\`\`http. Inline code with backticks.
- Tables: GitHub-style pipe tables with a header row.
- Callouts (Markdoc tag; blank lines inside are required):

  {% callout type="note" title="Optional title" %}

  Body markdown here.

  {% /callout %}

  type is one of: note, warning, success, danger.
- Links to other docs pages use the page path with a leading slash: [Webhooks](/guides/webhooks). Get paths from list_page_tree. Anchors: [Auth](/api/overview#authentication).
- Images: ![Alt text describing the image](https://…hosted-url…) — always write meaningful alt text.
- Keep it reader-facing: explain what something does and how to use it, with runnable examples. Don't paste internal implementation details, secrets, credentials, internal hostnames, or customer data into public pages; mark team-only material internal.
- Page icons (optional, create_page icon param) must come from the curated set listed in the create_page tool description.`;
