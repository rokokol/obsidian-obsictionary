import { describe, expect, it } from "vitest";
import {
  cardFromCell,
  decodeCard,
  dueDateString,
  encodeCard,
  isDue,
  newCard,
  review,
} from "../src/model/srs";

describe("srs encode/decode", () => {
  it("round-trips a card", () => {
    const card = newCard(new Date("2026-07-07T00:00:00Z"));
    const decoded = decodeCard(encodeCard(card));
    expect(decoded).not.toBeNull();
    expect(decoded?.reps).toBe(card.reps);
    expect(decoded?.state).toBe(card.state);
    expect(decoded?.due.toISOString()).toBe(card.due.toISOString());
  });

  it("treats blank and malformed cells as new cards", () => {
    expect(decodeCard("")).toBeNull();
    expect(decodeCard("not json")).toBeNull();
    expect(decodeCard("{}")).toBeNull();
    expect(cardFromCell("").reps).toBe(0);
  });
});

describe("srs scheduling", () => {
  it("a new card is due immediately", () => {
    const card = newCard(new Date("2026-07-07T00:00:00Z"));
    expect(isDue(card, new Date("2026-07-07T01:00:00Z"))).toBe(true);
  });

  it("a 'good' review pushes the due date into the future", () => {
    const now = new Date("2026-07-07T00:00:00Z");
    const card = newCard(now);
    const next = review(card, "good", 0.9, now);
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
    expect(next.reps).toBe(1);
    expect(dueDateString(next)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("'again' schedules sooner than 'easy'", () => {
    const now = new Date("2026-07-07T00:00:00Z");
    const card = newCard(now);
    const again = review(card, "again", 0.9, now).due.getTime();
    const easy = review(card, "easy", 0.9, now).due.getTime();
    expect(again).toBeLessThan(easy);
  });
});
