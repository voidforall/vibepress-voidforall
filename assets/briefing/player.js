/* vibepress video briefing player.
 * Plays an HTML "video": a 1280×720 stage of scenes animated against a narration track.
 *
 * The page provides:
 *   window.BRIEFING        — timeline.js: { duration, scenes: [{ id, title, start, end, lines: [{ start, end, text }] }] }
 *   <div id="bp-stage">    — holds <section class="scene" data-scene="<id>"> per timeline scene
 *   window.BRIEFING_TICKS  — optional { <sceneId>: function (ctx) } for continuous, time-driven motion
 *
 * Inside a scene, any element with data-at="<when>" gains the class "on" once the clock passes
 * <when> (and loses it when seeking back), so CSS transitions do the motion and every frame is
 * seekable. <when> is seconds into the scene ("2.5"), a narration line ("s3"), or either with an
 * offset ("s3+1.2"). data-off="<when>" removes "on" again after that time.
 * The narration audio is the clock; if it cannot play, a wall clock takes over (silent playback). */

(function () {
  "use strict";

  var B = window.BRIEFING;
  var TICKS = window.BRIEFING_TICKS || {};
  var STAGE_W = 1280;
  var STAGE_H = 720;
  var IDLE_MS = 2600;
  var CAPTION_HOLD = 0.35;
  var SEEK_STEP = 5;

  var stage = document.getElementById("bp-stage");
  if (!B || !stage) return;

  // --- timing helpers --------------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clock(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function lineStart(scene, n) {
    var lines = scene.lines;
    return lines[clamp(n, 0, lines.length - 1)].start;
  }
  function parseWhen(spec, scene) {
    var m = /^s(\d+)([+-][\d.]+)?$/.exec(spec);
    if (m) return lineStart(scene, Number(m[1])) + (m[2] ? parseFloat(m[2]) : 0);
    var e = /^end([+-][\d.]+)?$/.exec(spec);
    if (e) return scene.end + (e[1] ? parseFloat(e[1]) : 0);
    var n = parseFloat(spec);
    if (isNaN(n)) throw new Error("briefing: bad data-at '" + spec + "' in scene " + scene.id);
    return scene.start + n;
  }

  var scenes = B.scenes.map(function (scene) {
    var el = stage.querySelector('.scene[data-scene="' + scene.id + '"]');
    if (!el) throw new Error("briefing: no markup for scene " + scene.id);
    var cues = Array.prototype.map.call(el.querySelectorAll("[data-at]"), function (node) {
      var off = node.getAttribute("data-off");
      return { node: node, at: parseWhen(node.getAttribute("data-at"), scene), off: off ? parseWhen(off, scene) : Infinity };
    });
    return { data: scene, el: el, cues: cues, tick: TICKS[scene.id] || null };
  });

  function sceneIndexAt(t) {
    var idx = 0;
    for (var i = 0; i < scenes.length; i++) if (t >= scenes[i].data.start) idx = i;
    return idx;
  }

  function tickContext(scene, t) {
    var d = scene.data;
    var lt = t - d.start;
    return {
      t: t,
      lt: lt,
      el: scene.el,
      // Local time at which narration line n begins.
      L: function (n) { return lineStart(d, n) - d.start; },
      // Local time at which narration line n ends.
      E: function (n) { return d.lines[clamp(n, 0, d.lines.length - 1)].end - d.start; },
      // Local time for a data-at style spec ("s2+1.5", "3", "end-1").
      when: function (spec) { return parseWhen(spec, d) - d.start; },
      // 0→1 progress between two local times, clamped.
      p: function (a, b) { return b <= a ? (lt >= a ? 1 : 0) : clamp((lt - a) / (b - a), 0, 1); },
      ease: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    };
  }

  // --- player chrome ---------------------------------------------------------

  var player = document.createElement("div");
  player.className = "bp-player";
  stage.parentNode.insertBefore(player, stage);
  var viewport = document.createElement("div");
  viewport.className = "bp-viewport";
  player.appendChild(viewport);
  viewport.appendChild(stage);

  var chapterTicks = scenes.slice(1).map(function (s) {
    return '<span class="bp-tick" style="left:' + (100 * s.data.start / B.duration) + '%"></span>';
  }).join("");

  player.insertAdjacentHTML("beforeend",
    '<p class="bp-captions" aria-live="off"><span></span></p>' +
    '<button type="button" class="bp-cover" aria-label="Play video briefing">' +
      '<span class="bp-cover-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span>' +
      '<span class="bp-cover-label">Watch · ' + clock(B.duration) + "</span>" +
    "</button>" +
    '<div class="bp-controls">' +
      '<button type="button" class="bp-btn bp-play" aria-label="Play"></button>' +
      '<span class="bp-time">0:00 / ' + clock(B.duration) + "</span>" +
      '<div class="bp-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="' +
        Math.round(B.duration) + '" aria-valuenow="0">' +
        '<div class="bp-rail"><div class="bp-fill"></div>' + chapterTicks + '</div><div class="bp-thumb"></div>' +
        '<span class="bp-hover-label" hidden></span>' +
      "</div>" +
      '<span class="bp-chapter"></span>' +
      '<button type="button" class="bp-btn bp-cc" aria-label="Captions" aria-pressed="true">CC</button>' +
      '<button type="button" class="bp-btn bp-mute" aria-label="Mute" aria-pressed="false"></button>' +
      '<button type="button" class="bp-btn bp-fs" aria-label="Full screen"></button>' +
    "</div>");

  var $ = function (sel) { return player.querySelector(sel); };
  var captionsEl = $(".bp-captions span");
  var cover = $(".bp-cover");
  var playBtn = $(".bp-play");
  var timeEl = $(".bp-time");
  var track = $(".bp-track");
  var fill = $(".bp-fill");
  var thumb = $(".bp-thumb");
  var hoverLabel = $(".bp-hover-label");
  var chapterEl = $(".bp-chapter");
  var ccBtn = $(".bp-cc");
  var muteBtn = $(".bp-mute");
  var fsBtn = $(".bp-fs");

  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 9h4l5-4v14l-5-4H4z"/></svg>',
    muted: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  fsBtn.innerHTML = ICON.fs;

  // --- clock -----------------------------------------------------------------

  var audio = new Audio(B.audio || "narration.m4a");
  audio.preload = "metadata";
  var playing = false;
  var started = false;
  var wallClock = false; // true once audio proved unplayable — silent playback off performance.now()
  var wallOrigin = 0;
  var tNow = 0;

  function now() {
    if (!playing) return tNow;
    return wallClock ? (performance.now() - wallOrigin) / 1000 : audio.currentTime;
  }

  function play() {
    if (tNow >= B.duration - 0.05) seek(0);
    started = true;
    playing = true;
    player.classList.add("bp-started");
    stage.classList.remove("bp-paused");
    if (wallClock) { wallOrigin = performance.now() - tNow * 1000; }
    else {
      audio.currentTime = tNow;
      audio.play().catch(function () {
        // Autoplay policy or a missing/undecodable file: keep the picture moving silently.
        wallClock = true;
        wallOrigin = performance.now() - tNow * 1000;
        muteBtn.disabled = true;
      });
    }
    syncButtons();
    poke();
    requestAnimationFrame(loop);
  }

  function pause() {
    tNow = now();
    playing = false;
    if (!wallClock) audio.pause();
    stage.classList.add("bp-paused");
    syncButtons();
    poke();
  }

  function seek(t) {
    tNow = clamp(t, 0, B.duration);
    if (!wallClock && started) audio.currentTime = tNow;
    if (wallClock) wallOrigin = performance.now() - tNow * 1000;
    render(tNow);
  }

  function loop() {
    if (!playing) return;
    tNow = now();
    if (tNow >= B.duration) {
      tNow = B.duration;
      pause();
      render(tNow);
      player.classList.add("bp-ended");
      return;
    }
    render(tNow);
    requestAnimationFrame(loop);
  }

  // --- render ----------------------------------------------------------------

  var activeIndex = -1;

  function render(t) {
    var idx = sceneIndexAt(t);
    if (idx !== activeIndex) {
      scenes.forEach(function (s, i) { s.el.classList.toggle("active", i === idx); });
      activeIndex = idx;
      chapterEl.textContent = scenes[idx].data.title;
    }
    scenes.forEach(function (s) {
      for (var i = 0; i < s.cues.length; i++) {
        var c = s.cues[i];
        c.node.classList.toggle("on", t >= c.at && t < c.off);
      }
    });
    var current = scenes[idx];
    if (current.tick) current.tick(tickContext(current, t));
    renderCaption(current.data, t);
    renderProgress(t);
  }

  var lastCaption = null;
  function renderCaption(scene, t) {
    var text = "";
    for (var i = 0; i < scene.lines.length; i++) {
      var l = scene.lines[i];
      if (t >= l.start && t <= l.end + CAPTION_HOLD) text = l.text;
    }
    if (text !== lastCaption) {
      captionsEl.textContent = text;
      captionsEl.parentNode.classList.toggle("bp-has-text", !!text);
      lastCaption = text;
    }
  }

  function renderProgress(t) {
    var pct = (100 * t / B.duration) + "%";
    fill.style.width = pct;
    thumb.style.left = pct;
    timeEl.textContent = clock(t) + " / " + clock(B.duration);
    track.setAttribute("aria-valuenow", String(Math.round(t)));
    track.setAttribute("aria-valuetext", clock(t) + ", " + scenes[sceneIndexAt(t)].data.title);
  }

  function syncButtons() {
    playBtn.innerHTML = playing ? ICON.pause : (player.classList.contains("bp-ended") ? ICON.replay : ICON.play);
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    player.classList.toggle("bp-playing", playing);
    var muted = audio.muted;
    muteBtn.innerHTML = muted ? ICON.muted : ICON.sound;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  }

  function toggle() {
    player.classList.remove("bp-ended");
    if (playing) pause(); else play();
  }

  // --- layout ----------------------------------------------------------------

  function fit() {
    var w = viewport.clientWidth;
    var h = viewport.clientHeight;
    var s = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = "translate(-50%, -50%) scale(" + s + ")";
    player.style.setProperty("--bp-scale", String(s));
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(viewport);
  window.addEventListener("resize", fit);

  // --- input -----------------------------------------------------------------

  var idleTimer = 0;
  function poke() {
    player.classList.remove("bp-idle");
    clearTimeout(idleTimer);
    if (playing) idleTimer = setTimeout(function () { player.classList.add("bp-idle"); }, IDLE_MS);
  }

  cover.addEventListener("click", function () { seek(0); play(); });
  playBtn.addEventListener("click", toggle);
  viewport.addEventListener("click", function () { if (started) toggle(); });
  ccBtn.addEventListener("click", function () {
    var on = player.classList.toggle("bp-no-cc") === false;
    ccBtn.setAttribute("aria-pressed", String(on));
  });
  muteBtn.addEventListener("click", function () { audio.muted = !audio.muted; syncButtons(); });
  fsBtn.addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (player.requestFullscreen) player.requestFullscreen().catch(function () {});
  });
  player.addEventListener("pointermove", poke);

  function timeFromPointer(e) {
    var r = track.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * B.duration;
  }
  var dragging = false;
  track.addEventListener("pointerdown", function (e) {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    player.classList.remove("bp-ended");
    seek(timeFromPointer(e));
  });
  track.addEventListener("pointermove", function (e) {
    var t = timeFromPointer(e);
    if (dragging) seek(t);
    var r = track.getBoundingClientRect();
    hoverLabel.hidden = false;
    hoverLabel.textContent = clock(t) + " · " + scenes[sceneIndexAt(t)].data.title;
    hoverLabel.style.left = clamp(e.clientX - r.left, 0, r.width) + "px";
  });
  track.addEventListener("pointerup", function () { dragging = false; });
  track.addEventListener("pointerleave", function () { hoverLabel.hidden = true; });

  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var k = e.key;
    if (k === " " || k === "k") {
      if (e.target && e.target.tagName === "BUTTON" && k === " ") return; // let the button handle it
      e.preventDefault();
      if (!started) { seek(0); play(); } else toggle();
    } else if (k === "ArrowRight" || k === "ArrowLeft") {
      e.preventDefault();
      player.classList.remove("bp-ended");
      seek(now() + (k === "ArrowRight" ? SEEK_STEP : -SEEK_STEP));
      if (playing && !wallClock) audio.currentTime = tNow;
    } else if (k === "c") ccBtn.click();
    else if (k === "m") muteBtn.click();
    else if (k === "f") fsBtn.click();
    else return;
    poke();
  });

  // Poster frame: the intro fully revealed, behind the play cover.
  stage.classList.add("bp-paused");
  fit();
  syncButtons();
  render(Math.min(B.scenes[0].end - 0.5, B.duration));

  // Small public handle for embedding pages and frame-by-frame checks.
  window.BRIEFING_PLAYER = { play: play, pause: pause, seek: function (t) { player.classList.add("bp-started"); seek(t); } };
})();
