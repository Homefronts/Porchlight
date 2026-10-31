// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { escapeClosesOverlay } from "./escape";

const esc = () => new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
afterEach(() => void (document.body.innerHTML = ""));

it("takes a plain Escape", () => {
  expect(escapeClosesOverlay(esc())).toBe(true);
});

it("ignores other keys and a handled Escape", () => {
  expect(escapeClosesOverlay(new KeyboardEvent("keydown", { key: "a" }))).toBe(false);
  const e = esc();
  e.preventDefault();
  expect(escapeClosesOverlay(e)).toBe(false);
});

it("leaves Escape to an open dialog, menu or listbox", () => {
  for (const role of ["dialog", "menu", "listbox"]) {
    document.body.innerHTML = `<div role="${role}" data-state="open"></div>`;
    expect(escapeClosesOverlay(esc())).toBe(false);
  }
});

it("ignores a listbox or menu that isn't an open popup", () => {
  document.body.innerHTML = `<ul role="listbox"></ul><div role="menu" data-state="closed"></div>`;
  expect(escapeClosesOverlay(esc())).toBe(true);
});
