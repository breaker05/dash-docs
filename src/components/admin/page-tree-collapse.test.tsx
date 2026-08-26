// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const nav = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("@/server/actions/pages", () => ({
  movePageAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { PageTree, type TreeItem } from "./page-tree";

function page(
  id: string,
  title: string,
  parentId: string | null,
  children: TreeItem[] = [],
): TreeItem {
  return {
    id,
    title,
    slug: id,
    parentId,
    isHome: false,
    icon: null,
    effectiveVisibility: "public",
    published: true,
    hasUnpublishedChanges: false,
    children,
  };
}

const items: TreeItem[] = [
  page("p1", "API", null, [
    page("p2", "Webhooks", "p1", [page("p3", "Retries", "p2")]),
  ]),
  page("p4", "Guides", null),
];

let container: HTMLDivElement;
let root: Root | undefined;

async function render(ui: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  nav.pathname = "/admin";
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("admin page tree collapsing", () => {
  it("starts with sections collapsed and shows a child count", async () => {
    await render(<PageTree items={items} />);
    expect(container.textContent).toContain("API");
    expect(container.textContent).toContain("Guides");
    expect(container.textContent).not.toContain("Webhooks");
    const chevron = container.querySelector('[aria-label="Expand API"]');
    expect(chevron).toBeTruthy();
    expect(chevron?.getAttribute("aria-expanded")).toBe("false");
    // collapsed parent shows how many pages are hidden inside it
    expect(container.textContent).toContain("1");
  });

  it("expands on chevron click and persists the choice", async () => {
    await render(<PageTree items={items} />);
    await act(async () => {
      (
        container.querySelector('[aria-label="Expand API"]') as HTMLElement
      ).click();
    });
    expect(container.textContent).toContain("Webhooks");
    // grandchild stays hidden behind its own collapsed parent
    expect(container.textContent).not.toContain("Retries");
    expect(
      JSON.parse(
        window.localStorage.getItem("dash-docs.admin-tree.expanded") ?? "[]",
      ),
    ).toEqual(["p1"]);

    await act(async () => {
      (
        container.querySelector('[aria-label="Collapse API"]') as HTMLElement
      ).click();
    });
    expect(container.textContent).not.toContain("Webhooks");
  });

  it("auto-expands the trail of the page being edited", async () => {
    nav.pathname = "/admin/pages/p3";
    await render(<PageTree items={items} />);
    expect(container.textContent).toContain("Webhooks");
    expect(container.textContent).toContain("Retries");
  });

  it("restores previously expanded sections from localStorage", async () => {
    window.localStorage.setItem(
      "dash-docs.admin-tree.expanded",
      JSON.stringify(["p1", "p2"]),
    );
    await render(<PageTree items={items} />);
    expect(container.textContent).toContain("Webhooks");
    expect(container.textContent).toContain("Retries");
  });
});
