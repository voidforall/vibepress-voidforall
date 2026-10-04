/* Continuous, time-driven motion for the 2026-10-04 briefing. Each tick receives the player's
 * context (see assets/briefing/player.js) and must be a pure function of time, so seeking works. */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function frac(x) { return x - Math.floor(x); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function byId(id) { return document.getElementById(id); }

  // Draw a pathLength=1 path to progress k, and park a dot at its tip.
  function drawPath(path, dot, k, showDot) {
    path.setAttribute("stroke-dashoffset", String(1 - k));
    var total = path.getTotalLength();
    var pt = path.getPointAtLength(total * k);
    dot.setAttribute("cx", pt.x);
    dot.setAttribute("cy", pt.y);
    dot.setAttribute("opacity", showDot && k > 0 ? "1" : "0");
  }

  function typeText(node, text, k) {
    var n = Math.round(text.length * k);
    if (node.textContent.length !== n) node.textContent = text.slice(0, n);
  }

  // --- 01 caps ---------------------------------------------------------------
  function caps(c) {
    var run = c.p(c.L(1), c.L(3) - 0.2);
    drawPath(byId("cap-runaway"), byId("cap-runaway-dot"), c.ease(run), c.lt < c.L(3));
    var capped = c.p(c.L(3) + 0.4, c.L(4) + 2.2);
    drawPath(byId("cap-capped"), byId("cap-capped-dot"), c.ease(capped), true);
  }

  // --- 02 artifacts ------------------------------------------------------------
  var ART = { cx: 310, cy: 215, rx: 262, ry: 168, n: 6, packets: 3, built: false, agents: [], dots: [] };
  function buildArtifacts() {
    var links = byId("art-links");
    var agentsG = byId("art-agents");
    var packetsG = byId("art-packets");
    for (var i = 0; i < ART.n; i++) {
      var a = (-90 + i * 360 / ART.n) * Math.PI / 180;
      var x = ART.cx + ART.rx * Math.cos(a);
      var y = ART.cy + ART.ry * Math.sin(a);
      var line = svg("line", { "class": "link", x1: x, y1: y, x2: ART.cx, y2: ART.cy }, links);
      var g = svg("g", { "class": "agent" }, agentsG);
      svg("circle", { cx: x, cy: y, r: 27 }, g);
      var label = svg("text", { x: x, y: y + 5 }, g);
      label.textContent = "agent";
      label.setAttribute("style", "font-size:12px");
      ART.agents.push({ x: x, y: y, g: g, line: line });
      for (var k = 0; k < ART.packets; k++) {
        ART.dots.push({ agent: i, k: k, el: svg("circle", { "class": "packet", r: 6, opacity: 0 }, packetsG) });
      }
    }
    ART.built = true;
  }
  function artifacts(c) {
    if (!ART.built) buildArtifacts();
    ART.agents.forEach(function (ag, i) {
      var vis = c.p(0.6 + i * 0.35, 1.0 + i * 0.35);
      ag.g.setAttribute("opacity", vis);
      ag.line.setAttribute("opacity", vis);
    });
    var flowing = c.p(c.L(1) + 0.6, c.L(1) + 1.4);
    ART.dots.forEach(function (d) {
      var ag = ART.agents[d.agent];
      // Travel from the agent to the repo's edge, staggered so commits arrive concurrently.
      var k = frac(c.lt * 0.42 + d.agent * 0.29 + d.k / ART.packets);
      var stop = 0.62;
      d.el.setAttribute("cx", lerp(ag.x, ART.cx, k * stop));
      d.el.setAttribute("cy", lerp(ag.y, ART.cy, k * stop));
      d.el.setAttribute("opacity", String(flowing * Math.min(1, (1 - k) * 4)));
    });
  }

  // --- 03 feud -----------------------------------------------------------------
  var FEUD = { built: false, leaks: [] };
  var LEAK_PATHS = [
    [[300, 120], [350, 112], [440, 140]],
    [[290, 190], [350, 192], [440, 165]],
    [[230, 150], [350, 112], [440, 150]],
  ];
  function feud(c) {
    if (!FEUD.built) {
      var g = byId("feud-leaks");
      LEAK_PATHS.forEach(function () { FEUD.leaks.push(svg("circle", { "class": "leak", r: 8, opacity: 0 }, g)); });
      FEUD.built = true;
    }
    var leaking = c.p(c.when("s2+3.4"), c.when("s2+4"));
    FEUD.leaks.forEach(function (el, i) {
      var pts = LEAK_PATHS[i];
      var k = frac(c.lt * 0.38 + i / LEAK_PATHS.length);
      var seg = k < 0.5 ? 0 : 1;
      var local = seg === 0 ? k * 2 : (k - 0.5) * 2;
      el.setAttribute("cx", lerp(pts[seg][0], pts[seg + 1][0], local));
      el.setAttribute("cy", lerp(pts[seg][1], pts[seg + 1][1], local));
      el.setAttribute("opacity", String(leaking * (k > 0.9 ? (1 - k) * 10 : 1)));
    });
    // LeCun's marker starts undecided, then moves to "engineering" as the narration says so.
    var settle = c.ease(c.p(c.E(4) - 2.2, c.E(4) - 0.6));
    byId("feud-pin").style.left = (50 + 44 * settle) + "%";
  }

  // --- 04 kali -----------------------------------------------------------------
  var KALI_CMD = "nmap -sV 10.0.0.5";
  function kali(c) {
    typeText(byId("kali-cmd"), KALI_CMD, c.p(1.6, 4.0));
    var fill = c.ease(c.p(c.L(3) + 0.6, c.L(3) + 2.4));
    byId("kali-fill").style.width = (42 * fill) + "%";
    byId("kali-val").textContent = Math.round(42 * fill) + "%";
    byId("kali-val").style.left = (42 * fill) + "%";
    byId("kali-term").classList.toggle("glow", c.lt >= c.L(5));
    Array.prototype.forEach.call(c.el.querySelectorAll("[data-count]"), function (node) {
      var from = c.when(node.getAttribute("data-from"));
      var k = c.ease(c.p(from, from + 1.6));
      var value = Math.round(Number(node.getAttribute("data-count")) * k);
      node.textContent = value.toLocaleString("en-US");
    });
  }

  // --- 05 gpu ------------------------------------------------------------------
  function gpu(c) {
    var k = c.ease(c.p(c.L(1) + 1.2, c.L(1) + 5.2));
    var x = 205;
    var y = lerp(45, 275, k);
    var tilt = Math.sin(k * Math.PI) * -6;
    byId("gpu-card").setAttribute("transform", "translate(" + x + " " + y + ") rotate(" + tilt + " 125 50)");
    var bars = c.ease(c.p(c.L(3) + 0.4, c.L(3) + 2.4));
    byId("gpu-before").style.width = (66 * bars) + "%";
    byId("gpu-after").style.width = (66 * 1.3 * bars) + "%";
  }

  // --- 06 cringely ---------------------------------------------------------------
  function cringely(c) {
    typeText(byId("crt-line"), "CRINGELY", c.p(c.L(1) + 0.4, c.L(1) + 2.2));
  }

  window.BRIEFING_TICKS = { caps: caps, artifacts: artifacts, feud: feud, kali: kali, gpu: gpu, cringely: cringely };
})();
