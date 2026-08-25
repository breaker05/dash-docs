// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./button";

// Base UI's ButtonPrimitive defaults nativeButton:true and warns (console.error
// in dev) when the `render` prop produces a non-<button> element. Every
// link-styled-as-button in this app must pass nativeButton={false}.

function renderToBody(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Button with a link render prop", () => {
  it("warns when nativeButton is left at its default (the bug)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = renderToBody(
      <Button render={<a href="https://example.com/x" />}>Go</Button>,
    );
    const warned = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes("nativeButton"),
    );
    cleanup();
    expect(warned).toBe(true);
  });

  it("renders an anchor without warnings when nativeButton is false (the pattern to use)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = renderToBody(
      <Button render={<a href="https://example.com/x" />} nativeButton={false}>
        Go
      </Button>,
    );
    const warned = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes("nativeButton"),
    );
    const anchor = document.querySelector('a[href="https://example.com/x"]');
    expect(anchor).toBeTruthy();
    cleanup();
    expect(warned).toBe(false);
  });
});
