import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";

/** The four review grades exposed in the UI. */
export type ReviewRating = "again" | "hard" | "good" | "easy";

export const REVIEW_RATINGS: readonly ReviewRating[] = ["again", "hard", "good", "easy"];

const GRADE: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Compact on-disk shape stored in the hidden `srs` column (JSON, no pipes). */
interface StoredSrs {
  s: number; // state (0..3)
  r: number; // reps
  l: number; // lapses
  S: number; // stability
  D: number; // difficulty
  e: number; // elapsed_days
  c: number; // scheduled_days
  d: string; // due (ISO)
  t?: string; // last_review (ISO)
}

const round = (n: number): number => Math.round(n * 10000) / 10000;

/** A brand-new, never-reviewed card. */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Serialize a card into the compact `srs` cell value. */
export function encodeCard(card: Card): string {
  const stored: StoredSrs = {
    s: card.state,
    r: card.reps,
    l: card.lapses,
    S: round(card.stability),
    D: round(card.difficulty),
    e: card.elapsed_days,
    c: card.scheduled_days,
    d: card.due.toISOString(),
    ...(card.last_review ? { t: card.last_review.toISOString() } : {}),
  };
  return JSON.stringify(stored);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a stored `srs` cell back into a card. Returns null when the cell is
 * empty or malformed — callers treat that as a fresh card.
 */
export function decodeCard(cell: string): Card | null {
  const trimmed = cell.trim();
  if (trimmed === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const s = asNumber(o["s"]);
  const r = asNumber(o["r"]);
  const l = asNumber(o["l"]);
  const S = asNumber(o["S"]);
  const D = asNumber(o["D"]);
  const e = asNumber(o["e"]);
  const c = asNumber(o["c"]);
  const due = asIsoDate(o["d"]);
  if (s === null || r === null || l === null || S === null || D === null) return null;
  if (e === null || c === null || due === null) return null;

  const last = asIsoDate(o["t"]);
  const card: Card = {
    state: s,
    reps: r,
    lapses: l,
    stability: S,
    difficulty: D,
    elapsed_days: e,
    scheduled_days: c,
    due,
    ...(last ? { last_review: last } : {}),
  };
  return card;
}

/** Decode the cell, falling back to a fresh card for new/blank rows. */
export function cardFromCell(cell: string, now: Date = new Date()): Card {
  return decodeCard(cell) ?? newCard(now);
}

function scheduler(retention: number): ReturnType<typeof fsrs> {
  return fsrs(generatorParameters({ request_retention: retention }));
}

/** Apply a grade and return the next card state. */
export function review(
  card: Card,
  rating: ReviewRating,
  retention: number,
  now: Date = new Date(),
): Card {
  return scheduler(retention).next(card, now, GRADE[rating]).card;
}

/** Preview the next due date for each rating (for button hints). */
export function previewDueDates(
  card: Card,
  retention: number,
  now: Date = new Date(),
): Record<ReviewRating, Date> {
  const f = scheduler(retention);
  return {
    again: f.next(card, now, GRADE.again).card.due,
    hard: f.next(card, now, GRADE.hard).card.due,
    good: f.next(card, now, GRADE.good).card.due,
    easy: f.next(card, now, GRADE.easy).card.due,
  };
}

/** Whether the card is due for review at `now`. */
export function isDue(card: Card, now: Date = new Date()): boolean {
  return card.due.getTime() <= now.getTime();
}

/** Readable YYYY-MM-DD for the mirrored `due` column. */
export function dueDateString(card: Card): string {
  return card.due.toISOString().slice(0, 10);
}
