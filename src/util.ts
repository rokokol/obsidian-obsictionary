/** Human-readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The plural "s" for a count, for notices that read as sentences. */
export function plural(count: number): string {
  return count === 1 ? "" : "s";
}
