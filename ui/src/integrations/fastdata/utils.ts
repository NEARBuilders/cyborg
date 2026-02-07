/** Extract @mentions from text. Returns valid NEAR account IDs. */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([\w.-]+\.(?:near|tg))/g);
  return matches ? [...new Set(matches.map((m) => m.slice(1)))] : [];
}

/** Extract #hashtags from text. Returns lowercase tag strings. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#(\w+)/g);
  return matches ? [...new Set(matches.map((m) => m.slice(1).toLowerCase()))] : [];
}
