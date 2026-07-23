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

  function renderTimeline(paper, editions, activeId) {
    timeline.hidden = false;
    timeline.innerHTML = "";
    editions.forEach(function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = entry.date || entry.id;
      if (entry.id === activeId) btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", function () {
        location.hash = "#/" + encodeURIComponent(paper.slug) + "/" + encodeURIComponent(entry.id);
      });
      timeline.appendChild(btn);
    });
  }

  function renderPaper(slug, wantedDate) {
    setStatus("Loading " + slug + "…");
    getJson("papers/" + encodeURIComponent(slug) + "/index.json")
      .then(function (paper) {
        paper.slug = paper.slug || slug;
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
            renderTimeline(paper, editions, id);
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
      window.addEventListener("hashchange", route);
      route();
    })
    .catch(function (err) { setStatus("Could not load the newsstand. " + err.message); });
})();
