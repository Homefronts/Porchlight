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

it("leaves Escape to an open dialog or menu", () => {
  for (const role of ["dialog", "menu"]) {
    document.body.innerHTML = `<div role="${role}"></div>`;
    expect(escapeClosesOverlay(esc())).toBe(false);
  }
});
