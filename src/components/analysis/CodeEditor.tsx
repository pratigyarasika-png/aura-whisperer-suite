/** Lightweight Python editor: line numbers + syntax highlighting overlay. */

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const KEYWORDS = new Set([
  "and", "as", "assert", "break", "class", "continue", "def", "del", "elif", "else", "except",
  "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None",
  "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
]);

const BUILTINS = new Set([
  "abs", "dict", "enumerate", "float", "int", "len", "list", "max", "min", "print", "range",
  "round", "set", "sorted", "str", "sum", "tuple", "zip",
]);

type Token = { text: string; cls: string };

const TOKEN_RE =
  /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\s\w]+)/g;

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(code))) {
    const [text, comment, string_, number, word, space] = match;
    if (comment) tokens.push({ text, cls: "text-muted-foreground italic" });
    else if (string_) tokens.push({ text, cls: "text-emerald-500" });
    else if (number) tokens.push({ text, cls: "text-orange-500" });
    else if (word)
      tokens.push({
        text,
        cls: KEYWORDS.has(word)
          ? "text-violet-500 font-medium"
          : BUILTINS.has(word)
            ? "text-sky-500"
            : "",
      });
    else if (space) tokens.push({ text, cls: "" });
    else tokens.push({ text, cls: "text-pink-500" });
  }
  return tokens;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function CodeEditor({ value, onChange, className, ariaLabel = "Python script" }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = Math.max(1, value.split("\n").length);

  const sync = () => {
    const area = textareaRef.current;
    if (!area) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = area.scrollTop;
      highlightRef.current.scrollLeft = area.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop;
  };

  useLayoutEffect(sync, [value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const area = event.currentTarget;
    const { selectionStart, selectionEnd } = area;
    const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => {
      area.selectionStart = area.selectionEnd = selectionStart + 4;
    });
  };

  return (
    <div
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-background font-mono text-[12px] leading-5",
        className,
      )}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-border bg-muted/40 px-2 py-3 text-right text-muted-foreground"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>

      <div className="relative min-w-0">
        <pre
          ref={highlightRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-3 py-3"
        >
          {tokenize(value).map((token, i) => (
            <span key={i} className={token.cls}>
              {token.text}
            </span>
          ))}
          {"\n"}
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          aria-label={ariaLabel}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onScroll={sync}
          onKeyDown={handleKeyDown}
          className="relative h-full min-h-[320px] w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 text-transparent caret-foreground outline-none"
        />
      </div>
    </div>
  );
}
