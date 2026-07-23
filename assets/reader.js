/* vibepress reader — loads the manifest + one edition, renders client-side.
 * Data is untrusted-at-render only in the sense that we always escape it. */

(function () {
  "use strict";

  var els = {
    title: document.getElementById("edition-title"),
    tagline: document.getElementById("tagline"),
    date: document.getElementById("edition-date"),
    timeline: document.getElementById("timeline"),
    edition: document.getElementById("edition"),
    status: document.getElementById("status"),
    repoLink: document.getElementById("repo-link"),
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(value) {
    var url = String(value == null ? "" : value).trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function formatDate(iso) {
    var d = new Date((iso || "") + "T00:00:00");
    if (isNaN(d.getTime())) return escapeHtml(iso || "");
    return d.toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  }

  function getJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(path + " → HTTP " + res.status);
      return res.json();
    });
  }

  function showStatus(message) {
    els.edition.innerHTML = '<p class="status">' + escapeHtml(message) + "</p>";
  }

  function renderStory(story) {
    var links = Array.isArray(story.sourceLinks) ? story.sourceLinks : [];
    var sources = links
      .map(function (link) {
        var url = safeUrl(link && link.url);
        if (!url) return "";
        var label = escapeHtml((link && link.title) || url);
        return '<li><a href="' + escapeHtml(url) + '" rel="noopener noreferrer" target="_blank">' + label + "</a></li>";
      })
      .filter(Boolean)
      .join("");

    return [
      '<article class="story">',
      story.category ? '<p class="story-category">' + escapeHtml(story.category) + "</p>" : "",
      '<h2 class="story-headline">' + escapeHtml(story.headline) + "</h2>",
      story.summary ? '<p class="story-summary">' + escapeHtml(story.summary) + "</p>" : "",
      story.whyItMatters ? '<p class="story-why"><b>Why it matters</b> — ' + escapeHtml(story.whyItMatters) + "</p>" : "",
      sources ? '<ul class="story-sources">' + sources + "</ul>" : "",
      "</article>",
    ].join("");
  }

  function renderEdition(edition) {
    document.title = (edition.editionTitle || "The Vibe Signal") + " · " + (edition.date || "");
    els.date.textContent = formatDate(edition.date);

    var stories = Array.isArray(edition.stories) ? edition.stories : [];
    if (!stories.length) {
      showStatus("This edition has no stories yet.");
      return;
    }

    var html = "";
    if (edition.editorNote) {
      html += '<p class="editor-note">' + escapeHtml(edition.editorNote) + "</p>";
    }
    html += stories.map(renderStory).join("");
    els.edition.innerHTML = html;
  }

  function renderTimeline(editions, activeId, onSelect) {
    els.timeline.innerHTML = "";
    editions.forEach(function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = entry.date || entry.id;
      if (entry.id === activeId) btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", function () {
        if (location.hash !== "#" + entry.id) location.hash = entry.id;
        onSelect(entry.id);
      });
      els.timeline.appendChild(btn);
    });
  }

  function editionPath(id) {
    return "editions/" + encodeURIComponent(id) + ".json";
  }

  function loadEdition(id, editions) {
    showStatus("Loading edition " + id + "…");
    getJson(editionPath(id))
      .then(function (edition) {
        renderEdition(edition);
        renderTimeline(editions, id, function (nextId) {
          loadEdition(nextId, editions);
        });
        els.edition.focus();
      })
      .catch(function (err) {
        showStatus("Could not load edition " + id + ". " + err.message);
      });
  }

  function start(manifest) {
    var editions = Array.isArray(manifest.editions) ? manifest.editions.slice() : [];
    // Newest first by date/id.
    editions.sort(function (a, b) {
      return (b.date || b.id || "").localeCompare(a.date || a.id || "");
    });

    if (manifest.editionTitle) els.title.textContent = manifest.editionTitle;
    if (manifest.tagline) els.tagline.textContent = manifest.tagline;
    if (safeUrl(manifest.repoUrl)) els.repoLink.href = manifest.repoUrl;

    if (!editions.length) {
      showStatus("No editions have been published yet. The next scheduled run will create one.");
      return;
    }

    var hashId = location.hash.replace(/^#/, "");
    var initial = editions.some(function (e) { return e.id === hashId; })
      ? hashId
      : editions[0].id;

    loadEdition(initial, editions);

    window.addEventListener("hashchange", function () {
      var id = location.hash.replace(/^#/, "");
      if (editions.some(function (e) { return e.id === id; })) loadEdition(id, editions);
    });
  }

  getJson("index.json")
    .then(start)
    .catch(function (err) {
      showStatus("Could not load the edition index. " + err.message);
    });
})();
