# Google Maps as an enrichment MCP (true Google ratings)

A [`place` card](../README.md#story-enrichment-optional) reads best with a real Google rating, review
count, and a couple of verbatim reviews. A **Google Maps MCP** gives the agent that data directly,
instead of scraping it out of a web search. This is an **enrichment** server, not a discovery
[`mcp` source](configurable-sources.md): the agent calls it in `generate.md` Step 4b while writing
`place`, not to gather candidates.

Declare it on a paper with the optional **`mcpServers`** field, and vibepress does the rest.

## The server

These docs use the reference [`@modelcontextprotocol/server-google-maps`](https://www.npmjs.com/package/@modelcontextprotocol/server-google-maps).
Relevant read tools:

- `maps_search_places` — find a place by text (name + city) → candidates with `place_id`.
- `maps_place_details` — `place_id` → name, address, **`rating`**, **`user_ratings_total`**,
  **`reviews`** (text, author, rating), opening hours, and the place's Maps URL.

vibepress uses only these read lookups; it never writes to Maps.

## Setup — what you need to do

1. **Get a Google Maps Platform API key.** In the [Google Cloud console](https://console.cloud.google.com/):
   create/select a project, **enable the Places API**, and create an API key. Maps Platform requires
   **billing enabled**; usage is metered but comes with a recurring free credit that easily covers a
   handful of place lookups per edition. Restrict the key to the Places API.
2. **Register the MCP with the `claude` CLI** (user scope, so cron/any dir sees it):
   ```sh
   claude mcp add -s user --env GOOGLE_MAPS_API_KEY=YOUR_KEY \
     google-maps -- npx -y @modelcontextprotocol/server-google-maps
   ```
   The name you give here (`google-maps`) is what goes in the paper's `mcpServers`.
3. **Restart** your agent session so it connects (MCP servers attach at startup).

The key lives in the `claude` CLI's own config on your machine — **never** in the vibepress repo, so
the site repo stays safe to make public.

## The vibepress config

Add the server to the paper (alongside any discovery sources):

```json
{
  "name": "The Agenda",
  "mode": "on-demand",
  "enrich": true,
  "mcpServers": ["google-maps"],
  "sources": [
    { "type": "mcp", "server": "xiaohongshu-mcp", "tool": "search_feeds", "args": { "keyword": "…" }, "optional": true },
    { "type": "websearch", "query": "…" }
  ]
}
```

- `mcpServers` lists servers the agent may call for **enrichment** (place ratings, fact-checks). The
  discovery `mcp` source (`xiaohongshu-mcp`) is authorized automatically — no need to repeat it here.
- `run-edition.sh` allowlists `mcp__google-maps__*` for this paper's unattended run (and nothing extra
  for papers that don't declare it).

## Graceful fallback

It stays best-effort. If the Maps MCP isn't connected (not registered, server down, or on the cloud
runner), the agent **falls back to web search** for the rating/review and a `google.com/maps/search`
link — the edition still publishes, just with a non-Google rating. A place it can't verify at all
ships without a `place` card rather than a guessed rating. Never fatal.

## Caveats

- **Billing.** Maps Platform is a paid Google product (with a free monthly credit). Keep the key
  restricted to the Places API and watch usage if you run many editions.
- **Read-only.** vibepress only reads place data; it never posts or edits.
- **Local-first.** Like other MCP servers this is a local-backend thing; the GitHub Actions runner has
  no maps server, so cloud runs fall back to web search.
