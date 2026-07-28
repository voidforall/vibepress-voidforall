# Reactions — spec

*Reactions* is the optional community-discussion enrichment on a story (`config.enrich: true`; see
`generate.md` Step 4b). It is **not** a summary and **not** an essay. It is a small comment-section:
a few **direct quotes** pulled verbatim from a thread the agent actually read, each attributed and
linked. The reader shows them collapsed under the story, expanding on click.

Think "the three comments worth reading," not "here is what the thread was about."

## Data contract

A story may carry an optional `discussion` object:

```json
"discussion": {
  "quotes": [
    {
      "text": "The 90-day FCC timeline is wishful thinking — I've shipped three radios and none cleared in under six months.",
      "author": "hwguy",
      "url": "https://news.ycombinator.com/item?id=40000124"
    },
    {
      "text": "Margins don't matter here. The hardware is a funnel into their payment-processing take rate; that's the real business.",
      "author": "fin_reader",
      "url": "https://news.ycombinator.com/item?id=40000131"
    }
  ],
  "sourceLinks": [
    { "title": "Hacker News thread", "url": "https://news.ycombinator.com/item?id=40000100" }
  ]
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `quotes` | **yes** (if `discussion` present) | Non-empty array. Aim for **2–4** quotes; never more than 5. |
| `quotes[].text` | **yes** | Non-empty string. The comment, **verbatim** or lightly trimmed (see below). One to three sentences — a quote, not a wall of text. |
| `quotes[].author` | no | The commenter's handle/username, as shown in the thread. Omit if you don't have it. Never invent one. |
| `quotes[].url` | no | `http(s)` permalink to that specific comment, when the source exposes one. |
| `sourceLinks` | no | Thread-level `{title,url}` links, each `http(s)` — the thread(s) the quotes came from. |

**Provenance rule (fail-closed):** every `discussion` must be traceable to at least one link — either
a `quotes[].url` **or** a `sourceLinks[].url`. The validator rejects a `discussion` with no link at all.

## Sourcing & fidelity rules

- **Only from a thread you actually fetched and read** (a Hacker News or Reddit thread among the
  candidates, or one you opened while investigating). If you didn't read a discussion for this story,
  **omit `discussion`** — never invent, paraphrase from memory, or synthesize plausible reactions.
- **Quote verbatim.** Copy the comment's words. You may trim to the relevant clause with an ellipsis
  (`…`) and fix nothing else — do not rewrite, sharpen, translate (except in a translated edition; see
  below), or "clean up" a quote. If a comment is too long to quote whole, quote the sharpest sentence.
- **Represent the thread honestly.** Pick quotes that capture the real substance and the actual range
  of views — including disagreement. Don't cherry-pick to manufacture a consensus or a fight that
  wasn't there.
- **Attribute accurately.** `author` must be the handle actually on the comment; `url` must point at
  that comment (or the thread). Never guess a username or a permalink.
- **No vote theater.** Don't quote "+1", "this", pure jokes, or score/upvote chatter. Quote comments
  that carry an argument, a correction, a datapoint, or a well-put dissent.
- **Keep it short.** A Reactions block is a handful of short quotes. It is deliberately *not* a
  summary and *not* long-form — if you're writing prose about the thread, you're doing the wrong thing.

## Rendering (reader)

- Shown as a collapsible **Reactions** section under the story (`<details>`, closed by default), with a
  count next to the label. Expands on click; forced open in print.
- Each quote renders as a blockquote with an attribution line — `— author` linking to `quotes[].url`
  when present (or a bare `— author`, or a "source ↗" link when only a URL is available).
- Absent `discussion` renders nothing. Malformed quotes are dropped by the reader; the validator is the
  gate that stops a malformed edition from publishing in the first place.

## Translations

In a translated edition (`config.languages`), translate each `quotes[].text` into the target language
(a localized edition shouldn't strand an English quote), but keep `author` and **every** URL
(`quotes[].url`, `sourceLinks[].url`) **identical** — the link still points at the original comment, so
a reader can always check the words against the source. Do not add or drop quotes between languages.

## Anti-examples

- ❌ `"quotes": [{ "text": "Commenters were divided on the timeline and the pricing." }]` — that's a
  summary, not a quote. Quote the actual comments instead.
- ❌ A single 200-word quote reproducing half a blog-style comment — trim to the sharp sentence.
- ❌ Inventing `author: "a hardware engineer"` — either the real handle or omit `author`.
- ❌ `discussion` with quotes but no `url` anywhere — unsourced; the validator rejects it.
