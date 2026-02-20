/**
 * Strip JSX components and clean raw MDX into readable markdown.
 */
export function cleanMdx(raw: string): string {
  let text = raw;

  // Remove import statements
  text = text.replace(/^import\s+.*$/gm, "");

  // Remove frontmatter
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, "");

  // Replace <LiveCodeEditor ... /> with a note
  text = text.replace(/<LiveCodeEditor\s[^]*?\/>/g, "[Interactive example — view on the documentation site]");

  // Remove <PropertiesTables /> or <PropertiesTables>...</PropertiesTables>
  text = text.replace(/<PropertiesTables\s*\/>/g, "");
  text = text.replace(/<PropertiesTables[^>]*>[\s\S]*?<\/PropertiesTables>/g, "");

  // Transform <DoAndDont> blocks
  text = text.replace(/<DoAndDont>/g, "");
  text = text.replace(/<\/DoAndDont>/g, "");
  text = text.replace(/<Do>\s*/g, "**Do:**\n");
  text = text.replace(/<\/Do>\s*/g, "\n");
  text = text.replace(/<Dont>\s*/g, "**Don't:**\n");
  text = text.replace(/<\/Dont>\s*/g, "\n");

  // Unwrap simple wrapper JSX tags (keep inner content)
  text = text.replace(/<(Section|Anatomy|Overview|Guidelines)[^>]*>/g, "");
  text = text.replace(/<\/(Section|Anatomy|Overview|Guidelines)>/g, "");

  // Remove self-closing JSX tags like <ComponentName prop="val" />
  text = text.replace(/<[A-Z][A-Za-z]*\s[^]*?\/>/g, "");
  // Remove remaining self-closing JSX tags without attributes
  text = text.replace(/<[A-Z][A-Za-z]*\s*\/>/g, "");

  // Remove opening/closing JSX tags that wrap content (preserve content)
  text = text.replace(/<[A-Z][A-Za-z]*[^>]*>/g, "");
  text = text.replace(/<\/[A-Z][A-Za-z]*>/g, "");

  // Clean up excessive blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
