import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Paper = {
  id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  citations: number;
  openAccess: boolean;
  pdfUrl: string | null;
  landingUrl: string | null;
  source: string;
  type: string | null;
  indexedIn: string[];
};

const inputSchema = z.object({
  query: z.string().trim().min(1).max(300),
  source: z.enum(["openalex", "crossref", "semanticscholar", "pubmed", "doaj"]).default("openalex"),
  mode: z.enum(["keyword", "doi", "patent", "dataset"]).default("keyword"),
  yearFrom: z.number().int().min(1800).max(2100).default(2000),
  yearTo: z.number().int().min(1800).max(2100).default(new Date().getFullYear()),
  openAccessOnly: z.boolean().default(false),
  sort: z.enum(["relevance", "citations", "year"]).default("relevance"),
});

const UA = "Orbis-Research-Workspace (contact: research@orbis.app)";

function clean(text?: string | null) {
  if (!text) return null;
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null;
}

function reconstructAbstract(inverted?: Record<string, number[]> | null) {
  if (!inverted) return null;
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const p of positions) slots[p] = word;
  }
  return clean(slots.join(" "));
}

async function getJson(url: string, attempt = 0): Promise<any> {
  const polite = url.includes("api.openalex.org") && !url.includes("mailto=")
    ? `${url}&mailto=research@orbis.app`
    : url;
  const res = await fetch(polite, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json() as Promise<any>;
}

async function searchOpenAlex(i: z.infer<typeof inputSchema>): Promise<Paper[]> {
  const filters = [`from_publication_date:${i.yearFrom}-01-01`, `to_publication_date:${i.yearTo}-12-31`];
  if (i.openAccessOnly) filters.push("is_oa:true");
  if (i.mode === "dataset") filters.push("type:dataset");
  if (i.mode === "patent") filters.push("type:other");
  if (i.mode === "doi") filters.push(`doi:${i.query.replace(/^https?:\/\/doi\.org\//i, "")}`);

  const params = new URLSearchParams({
    filter: filters.join(","),
    per_page: "25",
    sort: i.sort === "citations" ? "cited_by_count:desc" : i.sort === "year" ? "publication_year:desc" : "relevance_score:desc",
  });
  if (i.mode !== "doi") params.set("search", i.query);

  const data = await getJson(`https://api.openalex.org/works?${params.toString()}`);
  return (data.results ?? []).map((w: any): Paper => ({
    id: w.id,
    title: clean(w.display_name) ?? "Untitled",
    abstract: reconstructAbstract(w.abstract_inverted_index),
    authors: (w.authorships ?? []).slice(0, 8).map((a: any) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "") : null,
    citations: w.cited_by_count ?? 0,
    openAccess: Boolean(w.open_access?.is_oa),
    pdfUrl: w.best_oa_location?.pdf_url ?? w.primary_location?.pdf_url ?? null,
    landingUrl: w.doi ?? w.primary_location?.landing_page_url ?? null,
    source: "OpenAlex",
    type: w.type ?? null,
    indexedIn: w.indexed_in ?? [],
  }));
}

async function searchCrossref(i: z.infer<typeof inputSchema>): Promise<Paper[]> {
  if (i.mode === "doi") {
    const doi = i.query.replace(/^https?:\/\/doi\.org\//i, "");
    const data = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    return [mapCrossref(data.message)];
  }
  const params = new URLSearchParams({
    query: i.query,
    rows: "25",
    filter: `from-pub-date:${i.yearFrom}-01-01,until-pub-date:${i.yearTo}-12-31${i.mode === "dataset" ? ",type:dataset" : ""}`,
  });
  if (i.sort === "citations") {
    params.set("sort", "is-referenced-by-count");
    params.set("order", "desc");
  } else if (i.sort === "year") {
    params.set("sort", "published");
    params.set("order", "desc");
  }
  const data = await getJson(`https://api.crossref.org/works?${params.toString()}`);
  const items = (data.message?.items ?? []).map(mapCrossref);
  return i.openAccessOnly ? items.filter((p: Paper) => p.openAccess) : items;
}

function mapCrossref(w: any): Paper {
  const pdf = (w.link ?? []).find((l: any) => l["content-type"] === "application/pdf");
  return {
    id: w.DOI,
    title: clean(Array.isArray(w.title) ? w.title[0] : w.title) ?? "Untitled",
    abstract: clean(w.abstract),
    authors: (w.author ?? []).slice(0, 8).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")),
    year: w.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: Array.isArray(w["container-title"]) ? w["container-title"][0] ?? null : null,
    doi: w.DOI ?? null,
    citations: w["is-referenced-by-count"] ?? 0,
    openAccess: Boolean(pdf),
    pdfUrl: pdf?.URL ?? null,
    landingUrl: w.URL ?? null,
    source: "Crossref",
    type: w.type ?? null,
    indexedIn: ["crossref"],
  };
}

async function searchSemanticScholar(i: z.infer<typeof inputSchema>): Promise<Paper[]> {
  const fields = "title,abstract,year,venue,authors,citationCount,externalIds,openAccessPdf,url,publicationTypes";
  if (i.mode === "doi") {
    const doi = i.query.replace(/^https?:\/\/doi\.org\//i, "");
    const w = await getJson(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`);
    return [mapS2(w)];
  }
  const params = new URLSearchParams({
    query: i.query,
    limit: "25",
    fields,
    year: `${i.yearFrom}-${i.yearTo}`,
  });
  if (i.openAccessOnly) params.set("openAccessPdf", "");
  const data = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`);
  return (data.data ?? []).map(mapS2);
}

function mapS2(w: any): Paper {
  return {
    id: w.paperId ?? w.externalIds?.DOI ?? w.title,
    title: clean(w.title) ?? "Untitled",
    abstract: clean(w.abstract),
    authors: (w.authors ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
    year: w.year ?? null,
    venue: w.venue || null,
    doi: w.externalIds?.DOI ?? null,
    citations: w.citationCount ?? 0,
    openAccess: Boolean(w.openAccessPdf?.url),
    pdfUrl: w.openAccessPdf?.url ?? null,
    landingUrl: w.url ?? null,
    source: "Semantic Scholar",
    type: (w.publicationTypes ?? [])[0] ?? null,
    indexedIn: w.externalIds?.PubMed ? ["pubmed"] : [],
  };
}

async function searchPubMed(i: z.infer<typeof inputSchema>): Promise<Paper[]> {
  const term =
    i.mode === "doi"
      ? `${i.query.replace(/^https?:\/\/doi\.org\//i, "")}[DOI]`
      : `${i.query} AND ("${i.yearFrom}"[PDAT] : "${i.yearTo}"[PDAT])${i.openAccessOnly ? " AND free full text[Filter]" : ""}`;
  const search = await getJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=25&sort=${
      i.sort === "year" ? "pub_date" : "relevance"
    }&term=${encodeURIComponent(term)}`,
  );
  const ids: string[] = search.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const summary = await getJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
  );
  return ids
    .map((id) => summary.result?.[id])
    .filter(Boolean)
    .map((w: any): Paper => {
      const doi = (w.articleids ?? []).find((a: any) => a.idtype === "doi")?.value ?? null;
      return {
        id: `pubmed-${w.uid}`,
        title: clean(w.title) ?? "Untitled",
        abstract: null,
        authors: (w.authors ?? []).slice(0, 8).map((a: any) => a.name),
        year: w.pubdate ? Number(String(w.pubdate).slice(0, 4)) || null : null,
        venue: w.fulljournalname ?? w.source ?? null,
        doi,
        citations: 0,
        openAccess: false,
        pdfUrl: null,
        landingUrl: `https://pubmed.ncbi.nlm.nih.gov/${w.uid}/`,
        source: "PubMed",
        type: "article",
        indexedIn: ["pubmed"],
      };
    });
}

/** DOAJ API v2 — open-access journal articles only. */
async function searchDoaj(i: z.infer<typeof inputSchema>): Promise<Paper[]> {
  const bare = i.query.replace(/^https?:\/\/doi\.org\//i, "");
  // DOAJ returns nothing when a year range is embedded in the query string,
  // so the query stays plain and the year window is applied client-side below.
  const term = i.mode === "doi" ? `doi:"${bare}"` : i.query;
  const data = await getJson(
    `https://doaj.org/api/v2/search/articles/${encodeURIComponent(term)}?pageSize=50`,
  );
  const papers = (data.results ?? []).map((item: any): Paper => {
    const bib = item.bibjson ?? {};
    const doi = (bib.identifier ?? []).find((id: any) => id.type === "doi")?.value ?? null;
    const fulltext = (bib.link ?? []).find((l: any) => l.type === "fulltext")?.url ?? null;
    return {
      id: `doaj-${item.id}`,
      title: clean(bib.title) ?? "Untitled",
      abstract: clean(bib.abstract),
      authors: (bib.author ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
      year: bib.year ? Number(bib.year) || null : null,
      venue: bib.journal?.title ?? null,
      doi,
      citations: 0,
      openAccess: true,
      pdfUrl: fulltext,
      landingUrl: fulltext ?? (doi ? `https://doi.org/${doi}` : null),
      source: "DOAJ",
      type: "article",
      indexedIn: ["doaj"],
    };
  });
  return papers.filter(
    (p: Paper) => p.year === null || (p.year >= i.yearFrom && p.year <= i.yearTo),
  );
}

export const searchPapers = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ papers: Paper[]; notice: string | null }> => {
    const runners = {
      openalex: searchOpenAlex,
      crossref: searchCrossref,
      semanticscholar: searchSemanticScholar,
      pubmed: searchPubMed,
      doaj: searchDoaj,
    } as const;
    const order = [
      data.source,
      ...(["openalex", "semanticscholar", "crossref", "doaj", "pubmed"] as const).filter((s) => s !== data.source),
    ];

    try {
      let papers: Paper[] = [];
      let usedFallback: string | null = null;
      let lastError: unknown = null;
      for (const source of order) {
        try {
          papers = await runners[source](data);
          if (source !== data.source) usedFallback = source;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!papers.length && lastError && usedFallback === null) throw lastError;

      if (data.sort === "citations") papers = [...papers].sort((a, b) => b.citations - a.citations);
      if (data.sort === "year") papers = [...papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

      return {
        papers,
        notice: usedFallback
          ? `Your chosen source was unavailable, so these results come from ${usedFallback}.`
          : papers.length
            ? null
            : "No records matched these filters.",
      };
    } catch (error) {
      return {
        papers: [],
        notice: error instanceof Error ? `Source unavailable right now (${error.message}).` : "Source unavailable right now.",
      };
    }
  });
