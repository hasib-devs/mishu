/** Allow-list for link targets in model-generated Markdown.
 *
 * Model output is untrusted. React escapes HTML, but an `href` with a
 * `javascript:` or `data:` scheme is still executable when clicked.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  const value = href.trim();
  if (!value || value.startsWith("//")) return null;

  try {
    const url = new URL(value);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? value : null;
  } catch {
    return null;
  }
}
