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
    if (controls) {
      var buttons = controls.querySelectorAll("button[data-template]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-template") === chosen));
      }
    }
  }

  function buildControls() {
    controls = document.createElement("div");
    controls.id = "vp-controls";
    controls.innerHTML =
      '<button type="button" data-template="standard" title="Web reading layout">Web</button>' +
      '<button type="button" data-template="classic" title="Old-newspaper print layout">Print</button>' +
      '<button type="button" data-action="print" title="Print this edition" aria-label="Print">⎙</button>';
    controls.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      if (btn.getAttribute("data-action") === "print") { window.print(); return; }
      var t = normalizeTemplate(btn.getAttribute("data-template"));
      try { localStorage.setItem("vp-template", t); } catch (err) {}
      document.documentElement.setAttribute("data-template", t);
      applyTemplate(t);
    });
    document.body.appendChild(controls);
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

  function formatDate(iso) {
    var d = new Date((iso || "") + "T00:00:00");
    if (isNaN(d.getTime())) return escapeHtml(iso || "");
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
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
    applyTemplate("standard");
    navState = null;
    timeline.hidden = true;
    masthead.innerHTML =
      '<p class="masthead-kicker">Newsstand</p>' +
      '<h1 class="masthead-title">' + escapeHtml(site.publisher || "The Newsstand") + "</h1>" +
      (site.tagline ? '<p class="masthead-sub">' + escapeHtml(site.tagline) + "</p>" : "");

    var papers = (site.papers || []).slice().sort(function (a, b) {
      return (b.latestDate || "").localeCompare(a.latestDate || "");
    });

    if (!papers.length) {
      setStatus("No papers yet. The next scheduled run will publish one.");
      return;
    }

    main.innerHTML =
      '<div class="newsstand">' +
      papers.map(function (p) {
        var href = "#/" + encodeURIComponent(p.slug);
        return (
          '<a class="paper-card" href="' + href + '">' +
          '<h2 class="paper-card-title">' + escapeHtml(p.name || p.slug) + "</h2>" +
          (p.tagline ? '<p class="paper-card-tagline">' + escapeHtml(p.tagline) + "</p>" : "") +
          (p.latestHeadline ? '<p class="paper-card-lead">' + escapeHtml(p.latestHeadline) + "</p>" : "") +
          '<p class="paper-card-meta">' +
          (p.latestDate ? escapeHtml(p.latestDate) : "no editions yet") +
          (p.editionCount ? " · " + p.editionCount + " edition" + (p.editionCount === 1 ? "" : "s") : "") +
          "</p>" +
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
  function dayNumber(dateStr) {
    var p = String(dateStr || "").split("-");
    return p[2] ? String(Number(p[2])) : (dateStr || "");
  }

  function navGoto(id) {
    if (navState) location.hash = "#/" + encodeURIComponent(navState.paper.slug) + "/" + encodeURIComponent(id);
  }
  function navStep(direction) {
    if (!navState) return;
    var target = direction === "older" ? navState.editions[navState.index + 1] : navState.editions[navState.index - 1];
    if (target) navGoto(target.id);
  }

  function archiveEl() { return timeline.querySelector(".nav-archive"); }
  function toggleBtn() { return timeline.querySelector(".nav-current"); }
  function closeArchive() {
    var a = archiveEl(); if (a) a.hidden = true;
    var t = toggleBtn(); if (t) t.setAttribute("aria-expanded", "false");
  }
  function toggleArchive() {
    var a = archiveEl(); if (!a) return;
    a.hidden = !a.hidden;
    var t = toggleBtn(); if (t) t.setAttribute("aria-expanded", String(!a.hidden));
  }

  function onTimelineClick(e) {
    var btn = e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    var goto = btn.getAttribute("data-goto");
    if (goto) { navGoto(goto); closeArchive(); return; }
    var nav = btn.getAttribute("data-nav");
    if (nav === "older" || nav === "newer") navStep(nav);
    else if (nav === "toggle") toggleArchive();
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
      var days = g.items.map(function (e) {
        return '<button type="button" data-goto="' + escapeHtml(e.id) + '"' +
          (e.id === activeId ? ' aria-current="true"' : "") +
          ' title="' + escapeHtml(e.date || e.id) + '">' + escapeHtml(dayNumber(e.date || e.id)) + "</button>";
      }).join("");
      return '<section class="arch-group"><h3>' + escapeHtml(monthLabel(g.key)) + "</h3>" +
        '<div class="arch-days">' + days + "</div></section>";
    }).join("");

    var hasNewer = index > 0;
    var hasOlder = index < editions.length - 1;

    timeline.hidden = false;
    timeline.innerHTML =
      '<div class="nav-bar">' +
        '<button type="button" class="nav-older" data-nav="older"' + (hasOlder ? "" : " disabled") + ">‹ Older</button>" +
        '<button type="button" class="nav-current" data-nav="toggle" aria-haspopup="true" aria-expanded="false">' +
          '<span class="nav-date">' + escapeHtml(formatDate(editions[index].date || activeId)) + "</span>" +
          '<span class="nav-count">' + (index + 1) + " / " + editions.length + "</span>" +
        "</button>" +
        '<button type="button" class="nav-newer" data-nav="newer"' + (hasNewer ? "" : " disabled") + ">Newer ›</button>" +
      "</div>" +
      '<div class="nav-archive" hidden>' + archive + "</div>";
  }

  function renderPaper(slug, wantedDate) {
    setStatus("Loading " + slug + "…");
    getJson("papers/" + encodeURIComponent(slug) + "/index.json")
      .then(function (paper) {
        paper.slug = paper.slug || slug;
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
      document.addEventListener("click", function (e) {
        if (!timeline.hidden && !timeline.contains(e.target)) closeArchive();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { closeArchive(); return; }
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
