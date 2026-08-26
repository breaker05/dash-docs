import { describe, expect, it } from "vitest";
import { extractGaId } from "./analytics";

describe("extractGaId", () => {
  it("accepts a bare measurement ID", () => {
    expect(extractGaId("G-ABC123XYZ")).toBe("G-ABC123XYZ");
    expect(extractGaId("  gt-abcd12  ")).toBe("GT-ABCD12");
  });

  it("extracts the ID from a pasted gtag snippet", () => {
    const snippet = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1A2B3C4D5E"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-1A2B3C4D5E');
</script>`;
    expect(extractGaId(snippet)).toBe("G-1A2B3C4D5E");
  });

  it("rejects input with no measurement ID", () => {
    expect(extractGaId("")).toBeNull();
    expect(extractGaId("UA-12345-1 is the old format")).toBeNull();
    expect(extractGaId("<script>alert(1)</script>")).toBeNull();
  });
});
