const UNTITLED_NOTE_TITLE = "Untitled";

export function normalizeNoteBody(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function deriveNoteTitle(body: string): string {
  const firstNonEmptyLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine) return UNTITLED_NOTE_TITLE;
  return firstNonEmptyLine.slice(0, 80);
}

export function deriveNoteExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, 160);
}
