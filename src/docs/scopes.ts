export const SCOPE_START = "<!-- scopes:start -->";
export const SCOPE_END = "<!-- scopes:end -->";

/** The generated section, markers included, so it can replace itself in place. */
export function renderScopeBlock(scopes: readonly string[]): string {
  return [SCOPE_START, "", ...scopes.map((scope) => `- \`${scope}\``), "", SCOPE_END].join("\n");
}

export function extractScopeBlock(markdown: string): string | undefined {
  const start = markdown.indexOf(SCOPE_START);
  const end = markdown.indexOf(SCOPE_END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return markdown.slice(start, end + SCOPE_END.length);
}

/** Replaces the generated section, leaving the rest of the document alone. */
export function replaceScopeBlock(markdown: string, scopes: readonly string[]): string {
  const start = markdown.indexOf(SCOPE_START);
  const end = markdown.indexOf(SCOPE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`docs page is missing the scope markers ${SCOPE_START} / ${SCOPE_END}`);
  }
  return (
    markdown.slice(0, start) + renderScopeBlock(scopes) + markdown.slice(end + SCOPE_END.length)
  );
}
