#!/usr/bin/env python3
"""Best-effort post-publish delivery: POST a compact edition summary to a webhook.

After a paper's edition goes live, optionally push a short summary to a chat webhook
(Slack / Discord / Feishu / DingTalk / any custom endpoint). Zero dependencies
(stdlib urllib). **Never fails the publish**: any error is logged and the script
exits 0. It runs only when a paper opts in and the URL env var is actually set, so
there is no required new secret.

Usage:
    deliver.py <edition.json> <config.json> [--slug <slug>] [--url-base <https://host/path>]

Config (on a paper's config.json), all optional — absent = nothing sent:

    "delivery": {
      "webhook": {
        "urlEnv": "VIBEPRESS_WEBHOOK_URL",   # env var holding the URL (never the URL itself)
        "body": { "text": "🗞️ {paper} — {date}\\n{headline}\\n{url}" },  # platform's JSON shape
        "headers": { "Authorization": "Bearer ${VIBEPRESS_WEBHOOK_TOKEN}" }
      }
    }

The webhook URL comes from the environment variable named by `urlEnv` (kept out of the
repo). `body` is the target platform's request shape with {placeholders}; strings inside
it are rendered and the whole object is sent as JSON (a bare string body is sent as-is).
`headers` values support ${ENV} expansion. Placeholders: {paper} {date} {theme}
{headline} {editorNote} {storyCount} {url}.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request

ENV_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def expand_env(text):
    """Replace ${VAR} with the environment value, leaving unknown vars untouched."""
    return ENV_RE.sub(lambda m: os.environ.get(m.group(1), m.group(0)), str(text))


def derive_url_base(url_base_arg):
    """Best-effort live site base URL: explicit arg, GITHUB_REPOSITORY, or git remote."""
    if url_base_arg:
        return url_base_arg.rstrip("/")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner}.github.io/{name}"
    try:
        url = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL
        ).decode().strip()
        m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
        if m:
            return f"https://{m.group(1)}.github.io/{m.group(2)}"
    except Exception:
        pass
    return ""


def edition_url(url_base, slug, date):
    if not url_base:
        return ""
    return f"{url_base}/#/{slug}/{date}" if slug else url_base


def placeholders(edition, paper_name, url):
    stories = edition.get("stories") or []
    lead = stories[0].get("headline", "") if stories and isinstance(stories[0], dict) else ""
    return {
        "paper": paper_name,
        "date": edition.get("date", ""),
        "theme": edition.get("theme", "") or "",
        "headline": lead or "",
        "editorNote": edition.get("editorNote", "") or "",
        "storyCount": str(len(stories)),
        "url": url,
    }


def render(obj, ph):
    """Substitute {token} placeholders into every string leaf (structure preserved).

    Rendering into the parsed structure (not the serialized text) keeps JSON valid even
    when a headline contains quotes or newlines — json.dumps escapes the values.
    """
    if isinstance(obj, str):
        for key, value in ph.items():
            obj = obj.replace("{" + key + "}", str(value))
        return obj
    if isinstance(obj, dict):
        return {k: render(v, ph) for k, v in obj.items()}
    if isinstance(obj, list):
        return [render(v, ph) for v in obj]
    return obj


def build_payload(body, ph):
    """Return (data_bytes, content_type) for the rendered body."""
    if body is None:
        body = {"text": "{paper} · {date}\n{headline}\n{url}"}
    if isinstance(body, (dict, list)):
        data = json.dumps(render(body, ph), ensure_ascii=False).encode("utf-8")
        return data, "application/json"
    text = render(str(body), ph)
    try:
        json.loads(text)
        return text.encode("utf-8"), "application/json"
    except ValueError:
        return text.encode("utf-8"), "text/plain; charset=utf-8"


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print("usage: deliver.py <edition.json> <config.json> [--slug S] [--url-base URL]", file=sys.stderr)
        return 2
    slug, url_base_arg = None, None
    for i, a in enumerate(argv):
        if a == "--slug" and i + 1 < len(argv):
            slug = argv[i + 1]
        if a == "--url-base" and i + 1 < len(argv):
            url_base_arg = argv[i + 1]

    try:
        edition = load_json(args[0])
        config = load_json(args[1])
    except Exception as exc:  # best-effort: never break the publish
        print(f"deliver: cannot read inputs ({exc}) — skipping", file=sys.stderr)
        return 0

    webhook = (config.get("delivery") or {}).get("webhook") if isinstance(config, dict) else None
    if not isinstance(webhook, dict) or webhook.get("enabled") is False:
        return 0

    url_env = webhook.get("urlEnv", "")
    hook_url = os.environ.get(url_env, "") if url_env else ""
    if not hook_url:
        print(f"deliver: {url_env or 'urlEnv'} not set — nothing sent", file=sys.stderr)
        return 0

    paper_name = edition.get("editionTitle") or (config.get("name") if isinstance(config, dict) else "") or slug or "vibepress"
    url = edition_url(derive_url_base(url_base_arg), slug, edition.get("date", ""))
    ph = placeholders(edition, paper_name, url)

    data, content_type = build_payload(webhook.get("body"), ph)
    headers = {"Content-Type": content_type, "User-Agent": "vibepress-deliver/1.0"}
    for key, value in (webhook.get("headers") or {}).items():
        headers[str(key)] = expand_env(value)

    req = urllib.request.Request(hook_url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"deliver: {paper_name} {edition.get('date', '')} -> HTTP {resp.status}")
    except Exception as exc:  # best-effort: a failed webhook must not fail the run
        print(f"deliver: webhook POST failed (best-effort): {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
