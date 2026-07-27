# Sources

A paper's `config.json` lists its material under `sources`, a typed array. Each entry has a `type`
and type-specific options. Deterministic sources (everything except `websearch`) are collected by
`assets/scripts/gather.py`, which fetches and normalizes them with zero dependencies. `websearch` is
run by the model during generate, because search is a Claude tool rather than a plain HTTP call.

`gather.py` is resilient by design: if one source errors (a feed is down, an API blocks the request),
it records the failure under `skipped` and keeps going. A paper should never fail to publish because
one source had a bad day.

For worked examples that combine these source types into real papers, see the
[cookbook](cookbook.md).

## Source types

### `hackernews`
The Hacker News front page via the Algolia API.
```json
{ "type": "hackernews", "minPoints": 100, "limit": 15 }
```
- `minPoints` — drop stories below this score (default 0).
- `limit` — how many front-page hits to consider (default 15).
Candidates carry the story's external `url` (falling back to the HN item) and `score`.

### `rss`
Any RSS 2.0 or Atom feed, parsed namespace-agnostically.
```json
{ "type": "rss", "url": "https://hnrss.org/newest?points=150", "limit": 10 }
```
- `url` — the feed URL (required).
- `limit` — max items to take (default 10).
Good for site feeds, newsletters with RSS, `hnrss.org` filtered views, and most blogs.

**Google News search feeds are the go-to for per-topic or per-ticker recency.** A Google News RSS
search URL is a deterministic, reliable feed you can point `rss` at — including a `when:1d` recency
window, which is ideal for "what happened to X in the last day" papers (e.g. a portfolio watchlist,
one feed per holding):
```json
{ "type": "rss", "url": "https://news.google.com/rss/search?q=%22Rocket%20Lab%22%20(RKLB%20OR%20stock)%20when%3A1d&hl=en-US&gl=US&ceid=US:en", "limit": 6 }
```
URL-encode the query (`when:1d` → `when%3A1d`). Its item links are Google News redirect URLs; when
you investigate a story, fetch through the redirect and cite the destination article, not the
`news.google.com` link.

### `arxiv`
Recent papers from the arXiv API, newest first.
```json
{ "type": "arxiv", "query": "cat:cs.AI", "limit": 8 }
```
- `query` — an arXiv search query (e.g. `cat:cs.LG`, `all:diffusion`, `au:bengio`).
- `limit` — max results (default 10).

### `reddit`
Top posts from a subreddit, via Reddit's **public RSS feed** (`/r/<sub>/<sort>.rss`).
```json
{ "type": "reddit", "subreddit": "MachineLearning", "sort": "top", "time": "day", "limit": 10 }
```
- `subreddit` (required), `sort` (`top`/`hot`/`new`, default `top`), `time` (`day`/`week`, default `day`).
- **Cloud-safe, no auth.** Reddit's *JSON API* (`.json`) returns 403 from datacenter IPs (every CI
  runner), but the *RSS feed* is served to those same IPs — verified 200 from a GitHub Actions runner —
  so this works under the cloud backend as well as locally. The trade-off vs. the old JSON path: RSS
  carries no per-post score, so ranking leans on recency and the model's judgment instead of upvotes.
- One request per run keeps you well under Reddit's per-IP rate limit; a stray 429 is retried once,
  and a hard failure is reported in the gather output's `skipped` list (never swallowed silently).
- **Optional richer data (not required):** to pull the scored JSON API from the cloud you would need a
  free Reddit OAuth "script" app (client id + secret → token → `oauth.reddit.com`), which authenticated
  requests *are* allowed to make from datacenter IPs. That adds two repo secrets and is not wired up by
  default — the RSS path above is the zero-config recommendation.

### `websearch`
Topic discovery the agent runs itself, with optional domain scoping.
```json
{ "type": "websearch", "query": "major AI model release", "recencyDays": 2, "sites": ["thursdai.news"], "limit": 8 }
```
- `query` (required) — the search.
- `recencyDays` — bias toward items from the last N days.
- `sites` — restrict results to these domains (maps to the search tool's domain filter).
- `gather.py` skips these and lists them under `skipped`; the generate flow reads that list and runs
  each search with the agent's web-search tool.
- **This is the only source type that needs a model tool.** It is best-effort and provider-dependent:
  an agent without web search simply skips `websearch` entries, and the paper still publishes from its
  deterministic sources (HN/RSS/arXiv/Reddit). Give any paper at least one deterministic source so it
  never depends on search alone.

**`sites` must list crawler-accessible domains.** A reliable outlet is not necessarily a fetchable
one: Reuters, WSJ, and the FT block the search crawler, and including even one blocked domain in
`allowed_domains` makes the **entire** search fail with a hard error — you get nothing, not a filtered
list. Scope to reliable sources that are actually accessible: CNBC, AP News, MarketWatch, SEC filings
(`sec.gov`), and press-release wires (Business Wire, PR Newswire, GlobeNewswire — often the primary
source for earnings and filings). If you want a blocked outlet's reporting, reach it another way (an
unscoped search, or a Google News `rss` feed) rather than in `sites`.

## Adding a new deterministic type

Add a collector function to `gather.py` and register it in `COLLECTORS`. It takes the source object
and returns a list of `{ source, type, title, url, score?, publishedAt? }`. Keep it dependency-free
(stdlib `urllib` + `xml.etree`) and let exceptions propagate — the main loop records them as skipped.
