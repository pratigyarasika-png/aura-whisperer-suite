import katex from "katex";

/**
 * Render `$inline$` and `$$block$$` LaTeX in a plain-text string into HTML.
 * Non-math text is HTML-escaped so pasted content cannot inject markup.
 */
export function renderMathToHtml(text: string) {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    result += escape(text.slice(lastIndex, match.index));
    const block = match[1];
    const inline = match[2];
    const source = (block ?? inline ?? "").trim();
    try {
      result += katex.renderToString(source, {
        displayMode: Boolean(block),
        throwOnError: false,
        output: "html",
      });
    } catch {
      result += escape(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  result += escape(text.slice(lastIndex));
  return result;
}

export const hasMath = (text: string) => /\$[^$\n]+\$|\$\$[\s\S]+\$\$/.test(text);
