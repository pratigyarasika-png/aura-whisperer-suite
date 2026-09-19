export type SavedPaper = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  snippet?: string | null;
};


export const LIBRARY_KEY = "orbis-library";
export const LIBRARY_EVENT = "orbis-library-change";

export function loadLibrary(): SavedPaper[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedPaper[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: SavedPaper[]) {
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(LIBRARY_EVENT));
}

export function addToLibrary(paper: SavedPaper) {
  const list = loadLibrary();
  if (list.some((item) => item.id === paper.id)) return list;
  const next = [paper, ...list];
  persist(next);
  return next;
}

export function removeFromLibrary(id: string) {
  const next = loadLibrary().filter((item) => item.id !== id);
  persist(next);
  return next;
}

export const citationStyles = [
  { id: "apa", label: "APA 7th" },
  { id: "ieee", label: "IEEE" },
  { id: "harvard", label: "Harvard" },
  { id: "mla", label: "MLA 9th" },
  { id: "chicago", label: "Chicago" },
] as const;

export type CitationStyle = (typeof citationStyles)[number]["id"];

function surname(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name.trim();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, -1)
    .map((part) => `${part[0]!.toUpperCase()}.`)
    .join(" ");
}

function inlineAuthor(paper: SavedPaper) {
  const authors = paper.authors.filter(Boolean);
  if (!authors.length) return paper.title.split(/\s+/).slice(0, 3).join(" ");
  if (authors.length === 1) return surname(authors[0]!);
  if (authors.length === 2) return `${surname(authors[0]!)} & ${surname(authors[1]!)}`;
  return `${surname(authors[0]!)} et al.`;
}

/** Inline marker placed in the document body. `number` is the 1-based bibliography position. */
export function formatInline(paper: SavedPaper, style: CitationStyle, number: number) {
  const year = paper.year ?? "n.d.";
  switch (style) {
    case "ieee":
      return `[${number}]`;
    case "harvard":
      return `(${inlineAuthor(paper)} ${year})`;
    case "mla":
      return `(${inlineAuthor(paper)})`;
    case "chicago":
      return `(${inlineAuthor(paper)} ${year})`;
    default:
      return `(${inlineAuthor(paper)}, ${year})`;
  }
}

/** Full reference-list entry. */
export function formatReference(paper: SavedPaper, style: CitationStyle, number: number) {
  const authors = paper.authors.filter(Boolean);
  const year = paper.year ?? "n.d.";
  const venue = paper.venue ?? "Unpublished manuscript";
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : paper.url ? ` ${paper.url}` : "";

  const apaAuthors = authors.length
    ? authors.map((name) => `${surname(name)}, ${initials(name)}`.trim()).join(", ").replace(/, ([^,]*)$/, ", & $1")
    : "Anonymous";
  const ieeeAuthors = authors.length
    ? authors.map((name) => `${initials(name)} ${surname(name)}`.trim()).join(", ")
    : "Anonymous";
  const mlaAuthors = authors.length
    ? authors.length > 1
      ? `${surname(authors[0]!)}, ${authors[0]!.split(/\s+/).slice(0, -1).join(" ")}, et al.`
      : `${surname(authors[0]!)}, ${authors[0]!.split(/\s+/).slice(0, -1).join(" ")}`
    : "Anonymous";

  switch (style) {
    case "ieee":
      return `[${number}] ${ieeeAuthors}, "${paper.title}," ${venue}, ${year}.${doi}`;
    case "harvard":
      return `${apaAuthors} (${year}) '${paper.title}', ${venue}.${doi}`;
    case "mla":
      return `${mlaAuthors}. "${paper.title}." ${venue}, ${year}.${doi}`;
    case "chicago":
      return `${apaAuthors}. ${year}. "${paper.title}." ${venue}.${doi}`;
    default:
      return `${apaAuthors} (${year}). ${paper.title}. ${venue}.${doi}`;
  }
}
