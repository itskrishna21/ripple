/**
 * Lightweight HTML normalizer — no external dependencies.
 *
 * Strategy (v1):
 * 1. Remove noisy structural tags with their full subtree content
 *    (script, style, nav, header, footer, aside, noscript, template).
 * 2. Strip all remaining HTML tags, leaving text content.
 * 3. Decode common HTML entities.
 * 4. Collapse consecutive whitespace to a single space.
 *
 * The hash is taken over the normalized text, so cosmetic markup changes
 * (class renames, minor layout edits) don't produce false diffs.
 */

const REMOVE_TAGS = [
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "noscript",
  "template",
];

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
};

export function normalize(html: string, _url: string): string {
  let text = html;

  // Remove full subtrees for noisy structural elements.
  for (const tag of REMOVE_TAGS) {
    text = text.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      " ",
    );
  }

  // Strip remaining tags (keep text content).
  text = text.replace(/<[^>]+>/g, " ");

  // Decode entities.
  text = text.replace(
    /&(?:amp|lt|gt|quot|apos|#39|nbsp|#160);/gi,
    (match) => ENTITY_MAP[match.toLowerCase()] ?? match,
  );

  // Collapse whitespace.
  text = text.replace(/\s+/g, " ").trim();

  return text;
}
