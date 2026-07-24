# Sources

A paper's `config.json` lists its material under `sources`, a typed array. Each entry has a `type`
and type-specific options. Deterministic sources (everything except `websearch`) are collected by
`assets/scripts/gather.py`, which fetches and normalizes them with zero dependencies. `websearch` is
run by the model during generate, because search is a Claude tool rather than a plain HTTP call.

`gather.py` is resilient by design: if one source errors (a feed is down, an API blocks the request),
it records the failure under `skipped` and keeps going. A paper should never fail to publish because
one source had a bad day.

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
Top posts from a subreddit's public JSON.
```json
{ "type": "reddit", "subreddit": "MachineLearning", "sort": "top", "time": "day", "limit": 10 }
```
- `subreddit` (required), `sort` (`top`/`hot`/`new`, default `top`), `time` (`day`/`week`, default `day`).
- **Best-effort:** Reddit blocks unauthenticated requests from many IPs (especially cloud/CI), so
  this may return an HTTP 403 and be skipped. It generally works from a personal machine. Do not rely
  on it as a paper's only source.

### `websearch`
Topic discovery the model runs itself, with optional domain scoping.
```json
{ "type": "websearch", "query": "major AI model release", "recencyDays": 2, "sites": ["thursdai.news"], "limit": 8 }
```
- `query` (required) — the search.
- `recencyDays` — bias toward items from the last N days.
- `sites` — restrict results to these domains (maps to the search tool's `allowed_domains`).
- `gather.py` skips these and lists them under `skipped`; the generate flow reads that list and runs
  each search with the WebSearch tool.

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
