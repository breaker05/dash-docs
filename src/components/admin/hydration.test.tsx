// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

// server-action and next/navigation mocks so client components mount standalone
vi.mock("@/server/actions/pages", () => ({
  movePageAction: vi.fn(),
  createPageAction: vi.fn(),
  updateDraftAction: vi.fn(),
  renamePageAction: vi.fn(),
  setVisibilityAction: vi.fn(),
  setPageIconAction: vi.fn(),
  deletePageAction: vi.fn(),
  setHomePageAction: vi.fn(),
}));
vi.mock("@/server/actions/publish", () => ({
  publishAction: vi.fn(),
  unpublishAction: vi.fn(),
}));
vi.mock("@/server/actions/revisions", () => ({
  saveVersionAction: vi.fn(),
  restoreRevisionAction: vi.fn(),
}));
vi.mock("@/server/actions/tags", () => ({
  setPageTagsAction: vi.fn(),
  createTagAction: vi.fn(),
  renameTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
}));
vi.mock("@/server/actions/settings", () => ({
  updatePdfSettingsAction: vi.fn(),
  setPdfChromeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/pages/p1",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { PageTree, type TreeItem } from "./page-tree";
import { PageEditor } from "./editor";

const items: TreeItem[] = [
  {
    id: "p1",
    title: "Guides",
    slug: "guides",
    parentId: null,
    isHome: false,
    icon: "plug",
    effectiveVisibility: "public",
    published: true,
    hasUnpublishedChanges: false,
    children: [
      {
        id: "p2",
        title: "Webhooks",
        slug: "webhooks",
        parentId: "p1",
        isHome: false,
        icon: null,
        effectiveVisibility: "internal",
        published: false,
        hasUnpublishedChanges: false,
        children: [],
      },
    ],
  },
];

const editorPage = {
  id: "p1",
  title: "Guides",
  contentMd: "# Hello\n\nSome text.",
  slug: "guides",
  path: "guides",
  isHome: false,
  icon: null,
  pdfChrome: true,
  visibility: "public" as const,
  effectiveVisibility: "public" as const,
  published: true,
  hasUnpublishedChanges: false,
};

/**
 * SSR the component, hydrate the same tree, and collect React's hydration
 * complaints (attribute mismatches arrive via console.error, tree mismatches
 * via onRecoverableError).
 */
async function hydrationErrors(ui: React.ReactElement): Promise<string[]> {
  const messages: string[] = [];
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    });
  const html = renderToString(ui);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, ui, {
      onRecoverableError: (err) => messages.push(String(err)),
    });
  });
  await act(async () => {});
  act(() => root?.unmount());
  container.remove();
  errorSpy.mockRestore();
  return messages.filter((m) => /hydrat|did not match|didn't match/i.test(m));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin edit page hydration", () => {
  it("PageTree hydrates without mismatches", async () => {
    const errors = await hydrationErrors(<PageTree items={items} />);
    expect(errors).toEqual([]);
  });

  it("PageEditor (with metadata panel) hydrates without mismatches", async () => {
    const errors = await hydrationErrors(
      <PageEditor
        page={editorPage}
        role="admin"
        tags={{ all: [{ id: "t1", name: "Lead API" }], selected: [] }}
      />,
    );
    expect(errors).toEqual([]);
  });
});
