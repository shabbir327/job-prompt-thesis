import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "content-type": "application/json",
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function slugifyPart(text: string) {
  return clean(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toSearchUrl(q: string, location = "") {
  const qClean = clean(q);
  const locationClean = clean(location);

  if (!qClean) return "https://www.jobindex.dk/jobsoegning";

  const qSlug = slugifyPart(qClean);
  const locationSlug = slugifyPart(locationClean);

  if (qSlug && locationSlug) {
    return `https://www.jobindex.dk/jobsoegning/${qSlug}/${locationSlug}`;
  }

  const encoded = encodeURIComponent(qClean).replace(/%20/g, "+");
  return `https://www.jobindex.dk/jobsoegning?q=${encoded}`;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(s: string) {
  return decodeHtml(s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "da-DK,da;q=0.9,en;q=0.8",
  "referer": "https://www.jobindex.dk/",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const q = clean(body?.q);
    const location = clean(body?.location);

    if (!q) {
      return new Response(JSON.stringify({ jobs: [], error: "Missing q" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const searchUrl = toSearchUrl(q, location);
    const res = await fetch(searchUrl, { headers: FETCH_HEADERS });
    const raw = await res.text();

    const html = raw
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ");

    const jobs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();

    const h4Re =
      /<h4[\s\S]*?<a[^>]+href="(https?:\/\/[^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h4>/gi;

    let match: RegExpExecArray | null;

    while ((match = h4Re.exec(html)) !== null) {
      if (jobs.length >= 3) break;

      const url = match[1].trim();
      const title = stripTags(match[2]);

      if (!url || !title || seen.has(url)) continue;

      try {
        const u = new URL(url);
        if (
          u.hostname === "www.jobindex.dk" &&
          !u.pathname.startsWith("/jobannonce") &&
          !u.pathname.startsWith("/job")
        ) {
          continue;
        }
      } catch {
        continue;
      }

      seen.add(url);
      jobs.push({ title, url });
    }

    return new Response(
      JSON.stringify({
        jobs,
        searchUrl,
      }),
      { headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ jobs: [], error: String(e) }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
