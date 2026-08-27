// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AnswerMarkdown } from "./answer-markdown";

describe("AnswerMarkdown", () => {
  it("renders assistant markdown as formatted HTML", () => {
    const html = renderToString(
      <AnswerMarkdown
        text={`Use the \`POST /lead/submit\` endpoint [1].

- **email** — required
- **locationUuid** — required

\`\`\`json
{"email": "a@b.com"}
\`\`\``}
      />,
    );
    expect(html).toContain("<code>POST /lead/submit</code>");
    expect(html).toContain("<strong>email</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<pre");
    expect(html).toContain("[1]");
    expect(html).not.toContain("**email**");
  });

  it("renders partial markdown mid-stream without crashing", () => {
    const html = renderToString(
      <AnswerMarkdown text={"Here is a list:\n\n- first\n- sec"} />,
    );
    expect(html).toContain("<ul>");
    expect(html).toContain("sec");
  });
});
