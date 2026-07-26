/* vibepress reader — a newsstand of papers, each with its own dated editions.
 * Routes off the URL hash:
 *   #/                    → newsstand (all papers)
 *   #/<slug>              → a paper's latest edition
 *   #/<slug>/<date>       → a specific edition
 * All rendered content is escaped; the data files are the only source of truth. */

(function () {
  "use strict";

  var masthead = document.getElementById("masthead");
  var timeline = document.getElementById("timeline");
  var main = document.getElementById("main");
  var repoLink = document.getElementById("repo-link");

  var site = null; // cached site.json
  var navState = null; // { paper, editions (newest-first), id, index } for the current paper
  var currentAccent = ""; // the active paper's accent hex, or "" on the newsstand / none

  // --- templates -------------------------------------------------------------
  // A paper declares a default look via its `template` field ("standard" | "classic").
  // A reader can override it for their session with the on-page switcher; the choice
  // is remembered in localStorage. Layout is entirely CSS-driven off <html data-template>.

  var TEMPLATES = ["standard", "classic"];
  var controls = null;

  function storedOverride() {
    try { return localStorage.getItem("vp-template"); } catch (e) { return null; }
  }

  function normalizeTemplate(value) {
    return TEMPLATES.indexOf(value) === -1 ? "standard" : value;
  }

  function applyTemplate(paperDefault) {
    var chosen = normalizeTemplate(storedOverride() || paperDefault || "standard");
    document.documentElement.setAttribute("data-template", chosen);
    // A paper's accent gives it a visual identity in the standard look; classic is
    // deliberately monochrome ink-on-newsprint, so the accent is suppressed there.
    if (currentAccent && chosen !== "classic") {
      document.documentElement.style.setProperty("--accent", currentAccent);
    } else {
      document.documentElement.style.removeProperty("--accent");
    }
    if (controls) {
      var buttons = controls.querySelectorAll("button[data-template]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-template") === chosen));
      }
    }
  }

  // Colour theme: Auto (follow the OS via prefers-color-scheme), or a manual Light/Dark
  // that wins over it. Cycled from the toolbar, remembered in localStorage.
  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "◐ Auto", light: "☀ Light", dark: "🌙 Dark" };

  function storedTheme() {
    try { return localStorage.getItem("vp-theme") || "auto"; } catch (e) { return "auto"; }
  }
  function applyTheme(mode) {
    if (THEMES.indexOf(mode) === -1) mode = "auto";
    if (mode === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", mode);
    if (controls) {
      var b = controls.querySelector('button[data-action="theme"]');
      if (b) { b.textContent = THEME_LABEL[mode]; b.setAttribute("title", "Theme: " + mode + " — click to change"); }
    }
  }

  function buildControls() {
    controls = document.createElement("div");
    controls.id = "vp-controls";
    controls.innerHTML =
      '<button type="button" data-template="standard" title="Web reading layout">Web</button>' +
      '<button type="button" data-template="classic" title="Old-newspaper print layout">Print</button>' +
      '<button type="button" data-action="print" title="Print this edition" aria-label="Print">⎙</button>' +
      '<button type="button" data-action="theme" title="Theme"></button>';
    controls.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "print") { window.print(); return; }
      if (action === "theme") {
        var next = THEMES[(THEMES.indexOf(storedTheme()) + 1) % THEMES.length];
        try { localStorage.setItem("vp-theme", next); } catch (err) {}
        applyTheme(next);
        return;
      }
      var t = normalizeTemplate(btn.getAttribute("data-template"));
      try { localStorage.setItem("vp-template", t); } catch (err) {}
      document.documentElement.setAttribute("data-template", t);
      applyTemplate(t);
    });
    document.body.appendChild(controls);
    applyTheme(storedTheme());
  }

  // --- helpers ---------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(value) {
    var url = String(value == null ? "" : value).trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  // Only accept a hex colour, so a paper's `accent` can never inject arbitrary CSS.
  function safeColor(value) {
    var c = String(value == null ? "" : value).trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : "";
  }

  function formatDate(iso) {
    var d = new Date((iso || "") + "T00:00:00");
    if (isNaN(d.getTime())) return escapeHtml(iso || "");
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  // A friendly "how fresh is this paper" label for the newsstand cards.
  function relativeDate(iso) {
    var d = new Date((iso || "") + "T00:00:00");
    if (isNaN(d.getTime())) return escapeHtml(iso || "");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.round((today - d) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    if (days < 14) return "Last week";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function getJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(path + " → HTTP " + res.status);
      return res.json();
    });
  }

  function setStatus(message) {
    timeline.hidden = true;
    main.innerHTML = '<p class="status">' + escapeHtml(message) + "</p>";
  }

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
    return { slug: parts[0] || null, date: parts[1] || null };
  }

  function paperEntry(slug) {
    var papers = (site && site.papers) || [];
    for (var i = 0; i < papers.length; i++) if (papers[i].slug === slug) return papers[i];
    return null;
  }

  // --- newsstand -------------------------------------------------------------

  function renderNewsstand() {
    document.title = (site.publisher || "The Newsstand");
    currentAccent = "";
    applyTemplate("standard");
    navState = null;
    timeline.hidden = true;
    var papers = (site.papers || []).slice().sort(function (a, b) {
      return (b.latestDate || "").localeCompare(a.latestDate || "");
    });

    var count = papers.length;
    masthead.innerHTML =
      '<p class="masthead-kicker">The Newsstand</p>' +
      '<h1 class="masthead-title">' + escapeHtml(site.publisher || "The Newsstand") + "</h1>" +
      (site.tagline ? '<p class="masthead-sub">' + escapeHtml(site.tagline) + "</p>" : "") +
      '<p class="newsstand-meta">' + count + (count === 1 ? " paper" : " papers") +
        ", each publishing itself</p>";

    if (!papers.length) {
      setStatus("No papers yet. The next scheduled run will publish one.");
      return;
    }

    main.innerHTML =
      '<div class="newsstand">' +
      papers.map(function (p) {
        var href = "#/" + encodeURIComponent(p.slug);
        var accent = safeColor(p.accent);
        var count = p.editionCount || 0;
        return (
          '<a class="paper-card" href="' + href + '"' +
          (accent ? ' style="--card-accent:' + accent + '"' : "") + ">" +
          '<div class="paper-card-top">' +
            '<span class="paper-card-emoji" aria-hidden="true">' + escapeHtml(p.emoji || "📰") + "</span>" +
            (count ? '<span class="paper-card-badge">' + count + (count === 1 ? " edition" : " editions") + "</span>" : "") +
          "</div>" +
          '<h2 class="paper-card-title">' + escapeHtml(p.name || p.slug) + "</h2>" +
          (p.tagline ? '<p class="paper-card-tagline">' + escapeHtml(p.tagline) + "</p>" : "") +
          (p.latestHeadline ? '<p class="paper-card-lead">' + escapeHtml(p.latestHeadline) + "</p>" : "") +
          '<div class="paper-card-foot">' +
            '<span class="paper-card-date">' + (p.latestDate ? escapeHtml(relativeDate(p.latestDate)) : "no editions yet") + "</span>" +
            '<span class="paper-card-cta">Read →</span>' +
          "</div>" +
          "</a>"
        );
      }).join("") +
      "</div>";
  }

  // --- one paper -------------------------------------------------------------

  function renderStory(story) {
    var links = (Array.isArray(story.sourceLinks) ? story.sourceLinks : [])
      .map(function (link) {
        var url = safeUrl(link && link.url);
        if (!url) return "";
        return '<li><a href="' + escapeHtml(url) + '" rel="noopener noreferrer" target="_blank">' +
          escapeHtml((link && link.title) || url) + "</a></li>";
      }).filter(Boolean).join("");

    return [
      '<article class="story">',
      story.category ? '<p class="story-category">' + escapeHtml(story.category) + "</p>" : "",
      '<h2 class="story-headline">' + escapeHtml(story.headline) + "</h2>",
      story.summary ? '<p class="story-summary">' + escapeHtml(story.summary) + "</p>" : "",
      story.whyItMatters ? '<p class="story-why"><b>Why it matters</b> — ' + escapeHtml(story.whyItMatters) + "</p>" : "",
      links ? '<ul class="story-sources">' + links + "</ul>" : "",
      "</article>",
    ].join("");
  }

  function renderEdition(paper, edition) {
    document.title = (paper.name || paper.slug) + " · " + (edition.date || "");
    masthead.innerHTML =
      '<p class="masthead-kicker"><a href="#/" class="back-link">← Newsstand</a></p>' +
      (paper.emoji ? '<div class="masthead-emoji" aria-hidden="true">' + escapeHtml(paper.emoji) + "</div>" : "") +
      '<h1 class="masthead-title">' + escapeHtml(paper.name || paper.slug) + "</h1>" +
      '<p class="masthead-date">' + formatDate(edition.date) + "</p>";

    var stories = Array.isArray(edition.stories) ? edition.stories : [];
    var html = "";
    if (edition.editorNote) html += '<p class="editor-note">' + escapeHtml(edition.editorNote) + "</p>";
    html += stories.length ? stories.map(renderStory).join("") : '<p class="status">This edition has no stories.</p>';
    main.innerHTML = '<div class="edition">' + html + "</div>";
    main.focus();
  }

  // --- edition navigation ----------------------------------------------------
  // A compact prev/next bar plus a grouped, scrollable archive, so navigation
  // stays tidy no matter how many editions accumulate.

  function monthKey(dateStr) { return String(dateStr || "").slice(0, 7); }
  function monthLabel(ym) {
    var p = ym.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return isNaN(d.getTime()) ? ym : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function shortDate(dateStr) {
    var d = new Date(String(dateStr || "") + "T00:00:00");
    return isNaN(d.getTime()) ? String(dateStr || "")
      : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  function navGoto(id) {
    if (navState) location.hash = "#/" + encodeURIComponent(navState.paper.slug) + "/" + encodeURIComponent(id);
  }
  function navStep(direction) {
    if (!navState) return;
    var target = direction === "older" ? navState.editions[navState.index + 1] : navState.editions[navState.index - 1];
    if (target) navGoto(target.id);
  }

  // The archive is a slide-in sidebar drawer — opened only when browsing back,
  // so it never clutters the reading view and has room to scroll for long runs.
  function setDrawer(open) {
    ["nav-drawer", "nav-backdrop"].forEach(function (cls) {
      var el = timeline.querySelector("." + cls);
      if (!el) return;
      if (open) el.setAttribute("data-open", "true");
      else el.removeAttribute("data-open");
    });
  }
  function openDrawer() { setDrawer(true); }
  function closeDrawer() { setDrawer(false); }

  function onTimelineClick(e) {
    var target = e.target.closest ? e.target.closest("[data-goto],[data-nav]") : null;
    if (!target) return;
    var goto = target.getAttribute("data-goto");
    if (goto) { navGoto(goto); closeDrawer(); return; }
    var nav = target.getAttribute("data-nav");
    if (nav === "older" || nav === "newer") navStep(nav);
    else if (nav === "open") openDrawer();
    else if (nav === "close") closeDrawer();
  }

  function renderNav(paper, editions, activeId) {
    var index = 0;
    for (var i = 0; i < editions.length; i++) if (editions[i].id === activeId) { index = i; break; }
    navState = { paper: paper, editions: editions, id: activeId, index: index };

    var groups = [], byKey = {};
    editions.forEach(function (e) {
      var k = monthKey(e.date || e.id);
      if (!byKey[k]) { byKey[k] = { key: k, items: [] }; groups.push(byKey[k]); }
      byKey[k].items.push(e);
    });
    var archive = groups.map(function (g) {
      var rows = g.items.map(function (e) {
        return '<button type="button" class="arch-item" data-goto="' + escapeHtml(e.id) + '"' +
          (e.id === activeId ? ' aria-current="true"' : "") + ">" +
          '<span class="ai-date">' + escapeHtml(shortDate(e.date || e.id)) + "</span>" +
          (e.headline ? '<span class="ai-head">' + escapeHtml(e.headline) + "</span>" : "") +
          "</button>";
      }).join("");
      return '<section class="arch-group"><h3>' + escapeHtml(monthLabel(g.key)) + "</h3>" + rows + "</section>";
    }).join("");

    var hasNewer = index > 0;
    var hasOlder = index < editions.length - 1;

    timeline.hidden = false;
    timeline.innerHTML =
      '<div class="nav-bar">' +
        '<button type="button" class="nav-older" data-nav="older"' + (hasOlder ? "" : " disabled") + ">‹ Older</button>" +
        '<button type="button" class="nav-current" data-nav="open" aria-haspopup="dialog">' +
          '<span class="nav-date">' + escapeHtml(formatDate(editions[index].date || activeId)) + "</span>" +
          '<span class="nav-count">' + (index + 1) + " / " + editions.length + "</span>" +
          '<span class="nav-open-icon" aria-hidden="true">▤</span>' +
        "</button>" +
        '<button type="button" class="nav-newer" data-nav="newer"' + (hasNewer ? "" : " disabled") + ">Newer ›</button>" +
      "</div>" +
      '<div class="nav-backdrop" data-nav="close"></div>' +
      '<aside class="nav-drawer" aria-label="Edition archive">' +
        '<div class="drawer-head"><h2>Archive · ' + editions.length + " editions</h2>" +
          '<button type="button" class="drawer-close" data-nav="close" aria-label="Close archive">×</button></div>' +
        '<div class="drawer-list">' + archive + "</div>" +
      "</aside>";
  }

  function renderPaper(slug, wantedDate) {
    setStatus("Loading " + slug + "…");
    getJson("papers/" + encodeURIComponent(slug) + "/index.json")
      .then(function (paper) {
        paper.slug = paper.slug || slug;
        currentAccent = safeColor(paper.accent);
        applyTemplate(paper.template);
        var editions = (Array.isArray(paper.editions) ? paper.editions : []).slice().sort(function (a, b) {
          return (b.date || b.id || "").localeCompare(a.date || a.id || "");
        });
        if (!editions.length) {
          renderEdition(paper, { date: "", stories: [], editorNote: "" });
          timeline.hidden = true;
          return;
        }
        var id = editions.some(function (e) { return e.id === wantedDate; }) ? wantedDate : editions[0].id;
        return getJson("papers/" + encodeURIComponent(slug) + "/editions/" + encodeURIComponent(id) + ".json")
          .then(function (edition) {
            renderEdition(paper, edition);
            renderNav(paper, editions, id);
          });
      })
      .catch(function (err) { setStatus("Could not load " + slug + ". " + err.message); });
  }

  // --- routing ---------------------------------------------------------------

  function route() {
    var r = parseHash();
    if (!r.slug) { renderNewsstand(); return; }
    if (!paperEntry(r.slug) && site) {
      // Unknown slug — fall back to the newsstand rather than a dead view.
      renderNewsstand();
      return;
    }
    renderPaper(r.slug, r.date);
  }

  getJson("site.json")
    .then(function (data) {
      site = data;
      if (safeUrl(site.repoUrl)) repoLink.href = site.repoUrl;
      buildControls();
      timeline.addEventListener("click", onTimelineClick);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { closeDrawer(); return; }
        if (!navState) return;
        var tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "ArrowLeft") navStep("older");
        else if (e.key === "ArrowRight") navStep("newer");
      });
      window.addEventListener("hashchange", route);
      route();
    })
    .catch(function (err) { setStatus("Could not load the newsstand. " + err.message); });
})();
