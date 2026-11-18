(function () {
  "use strict";

  var STORAGE_KEY = "wt-done";
  var THEME_KEY = "wt-theme";
  var SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/{}";
  var SCRAMBLE_SPEED_MS = 28;

  var prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasMouse = matchMedia("(hover: hover)").matches;

  var targetDark = 0.0;
  var currentDark = 0.0;

  /* ==========================================================================
     Shaders (Mobile-optimized with highp precision & overflow protection)
     ========================================================================== */
  var VERTEX_SHADER = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  var FRAGMENT_SHADER = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform vec2  uResolution;
    uniform float uTime;
    uniform vec2  uPointer;
    uniform float uDark;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    float fbm(vec2 p) {
      float amp = 0.5;
      float sum = 0.0;
      for (int i = 0; i < 4; i++) {
        sum += amp * valueNoise(p);
        p = p * 2.0 + 7.0;
        amp *= 0.5;
      }
      return sum / 0.9375;
    }

    float snow(vec2 uv, float scale, float speed) {
      uv *= scale;
      uv.y += uTime * speed;
      uv.x += sin(uv.y * 0.6 + uTime * 0.3) * 0.4;

      vec2 cell = floor(uv);
      vec2 local = fract(uv) - 0.5;
      float rnd = hash(cell);
      vec2 offset = vec2(rnd - 0.5, fract(rnd * 7.0) - 0.5) * 0.6;

      float flake = smoothstep(0.11, 0.0, length(local - offset));
      float hasFlake = step(0.45, fract(rnd * 13.0));
      float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + rnd * 40.0);
      return flake * hasFlake * twinkle;
    }

    void main() {
      vec2 p  = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
      vec2 uv = gl_FragCoord.xy / max(uResolution.y, 1.0);

      float glow = exp(-dot(p - uPointer, p - uPointer) * 7.0);

      vec2 q = vec2(fbm(p * 2.0 + uTime * 0.08),
                    fbm(p * 2.0 + vec2(5.2, 1.3) - uTime * 0.1));
      float f = fbm(p * 2.2 + q * 2.4 + glow * 0.7 + uTime * 0.04);

      vec3 sea   = vec3(0.07, 0.64, 0.63);
      vec3 teal  = vec3(0.0, 0.788, 0.655);
      vec3 cyan  = vec3(0.0, 0.706, 0.847);
      vec3 sky   = vec3(0.239, 0.745, 1.0);
      vec3 green = vec3(0.145, 0.773, 0.369);

      vec3 col = mix(sea, teal, smoothstep(0.12, 0.4, f));
      col = mix(col, cyan, smoothstep(0.35, 0.6, f));
      col = mix(col, sky,  smoothstep(0.55, 0.82, f));
      col = mix(col, green, smoothstep(0.5, 0.9, q.y) * 0.55);

      col += glow * vec3(0.18);
      col *= 1.0 - 0.3 * dot(p, p);

      // Dark Mode tinting
      col = mix(col, col * 0.22 + vec3(0.01, 0.04, 0.07), uDark);

      col += vec3(0.85, 0.95, 1.0) * (snow(uv, 14.0, 0.35) * 0.9 + snow(uv + 3.1, 26.0, 0.55) * 0.7);

      // Normalized noise grain (safe against mobile overflow)
      col += (hash(uv * 120.0 + fract(uTime * 0.05)) - 0.5) * 0.038;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createProgram(gl, vertexSource, fragmentSource) {
    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  }

  function initBackground() {
    var canvas = document.getElementById("background");
    if (!canvas) return;

    var gl = canvas.getContext("webgl", { antialias: false, alpha: false }) ||
             canvas.getContext("experimental-webgl", { antialias: false, alpha: false });

    if (!gl) {
      document.body.classList.add("no-webgl");
      return;
    }

    var program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) {
      document.body.classList.add("no-webgl");
      return;
    }
    gl.useProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    var uResolution = gl.getUniformLocation(program, "uResolution");
    var uTime = gl.getUniformLocation(program, "uTime");
    var uPointer = gl.getUniformLocation(program, "uPointer");
    var uDark = gl.getUniformLocation(program, "uDark");

    function resize() {
      var scale = Math.min(window.devicePixelRatio || 1, 1.5) * (window.innerWidth < 700 ? 0.7 : 1);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    var targetX = 0, targetY = 0;
    var currentX = 0, currentY = 0;

    window.addEventListener("pointermove", function (e) {
      var size = Math.min(window.innerWidth, window.innerHeight);
      targetX = (e.clientX - window.innerWidth / 2) / size;
      targetY = (window.innerHeight / 2 - e.clientY) / size;
    });

    var startTime = performance.now();

    function drawFrame(now) {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      currentDark += (targetDark - currentDark) * 0.08;

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, prefersReducedMotion ? 5 : (now - startTime) / 1000);
      gl.uniform2f(uPointer, currentX, currentY);
      gl.uniform1f(uDark, currentDark);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!prefersReducedMotion) requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  }

  /* ==========================================================================
     Dark / Light Mode Toggle
     ========================================================================== */
  function initThemeToggle() {
    var toggleBtn = document.getElementById("theme-toggle");
    var root = document.documentElement;
    var saved = null;

    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}

    function applyTheme(theme, persist) {
      root.setAttribute("data-theme", theme);
      var isDark = theme === "dark";
      targetDark = isDark ? 1.0 : 0.0;
      if (prefersReducedMotion) currentDark = targetDark;

      if (toggleBtn) {
        toggleBtn.textContent = isDark ? "☀️" : "🌙";
        toggleBtn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      }

      if (persist) {
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}
      }
    }

    applyTheme(saved === "dark" ? "dark" : "light", false);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next, true);
      });
    }
  }

  /* ==========================================================================
     Revision Progress & Celebration
     ========================================================================== */
  function triggerConfetti() {
    if (prefersReducedMotion) return;
    var colors = ["#00c9a7", "#00b4d8", "#3dbeff", "#12a3a0", "#25c55e", "#ffffff"];
    for (var i = 0; i < 45; i++) {
      var piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.animationDelay = Math.random() * 0.5 + "s";
      piece.style.animationDuration = (1.8 + Math.random() * 1.5) + "s";
      document.body.appendChild(piece);
      setTimeout(function (el) { el.remove(); }, 3500, piece);
    }
  }

  function initProgressTracker() {
    var cards = document.querySelectorAll(".unit-card");
    if (!cards || cards.length === 0) return; // Exit on sub-pages (Unit1.html, etc.)

    var progressFill = document.getElementById("progress-fill");
    var progressTrack = document.querySelector(".progress-track");
    var progressText = document.getElementById("progress-text");
    var completionBanner = document.getElementById("completion-banner");
    var wasAllDone = false;

    var done = loadProgress();

    function loadProgress() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch (e) {
        return {};
      }
    }

    function saveProgress() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
      } catch (e) {}
    }

    function render(fromUserClick) {
      var revisedCount = 0;

      cards.forEach(function (card, index) {
        var isDone = !!done[index];
        var button = card.querySelector(".revise-btn");

        card.classList.toggle("done", isDone);
        if (button) {
          button.setAttribute("aria-pressed", isDone);
          button.textContent = isDone ? "\u2713 Revised" : "Mark as revised";
        }

        if (isDone) revisedCount++;
      });

      var percent = Math.round((revisedCount / cards.length) * 100);

      if (progressFill) progressFill.style.width = percent + "%";
      if (progressTrack) progressTrack.setAttribute("aria-valuenow", percent);
      if (progressText) {
        progressText.textContent = revisedCount + " of " + cards.length + " units revised (" + percent + "% Complete)";
      }

      var allDone = revisedCount === cards.length;
      if (completionBanner) {
        completionBanner.hidden = !allDone;
      }

      if (allDone && fromUserClick && !wasAllDone) {
        triggerConfetti();
      }
      wasAllDone = allDone;
    }

    cards.forEach(function (card, index) {
      var button = document.createElement("button");
      button.className = "revise-btn";
      button.type = "button";

      button.addEventListener("click", function () {
        done[index] = !done[index];
        saveProgress();
        render(true);
      });

      card.appendChild(button);
    });

    render(false);
  }

  /* ==========================================================================
     Unit Search Filter
     ========================================================================== */
  function initSearch() {
    var searchInput = document.getElementById("search-input");
    var noResults = document.getElementById("no-results");
    var cards = document.querySelectorAll(".unit-card");
    if (!searchInput || cards.length === 0) return;

    searchInput.addEventListener("input", function () {
      var query = searchInput.value.trim().toLowerCase();
      var matchCount = 0;

      cards.forEach(function (card) {
        var link = card.querySelector(".unit-link");
        var text = ((link ? link.textContent : "") + " " + (card.dataset.keywords || "")).toLowerCase();
        var matches = !query || text.indexOf(query) !== -1;
        card.hidden = !matches;
        if (matches) matchCount++;
      });

      if (noResults) noResults.hidden = matchCount > 0;
    });

    window.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input"));
        searchInput.blur();
      }
      if (e.key === "Enter" && document.activeElement === searchInput) {
        var firstMatch = document.querySelector(".unit-card:not([hidden]) .unit-link");
        if (firstMatch) firstMatch.click();
      }
    });
  }

  /* ==========================================================================
     Card 3D Tilt & Scramble Effect
     ========================================================================== */
  function initCardEffects() {
    var links = document.querySelectorAll(".unit-link");
    if (!links || links.length === 0) return;

    links.forEach(function (link) {
      var title = link.querySelector(".unit-title");
      if (!title) return;
      var originalText = title.textContent;
      var scrambleTimer;

      link.addEventListener("pointermove", function (e) {
        var box = link.getBoundingClientRect();
        var x = e.clientX - box.left;
        var y = e.clientY - box.top;

        link.style.setProperty("--mx", x + "px");
        link.style.setProperty("--my", y + "px");

        if (hasMouse && !prefersReducedMotion) {
          var tiltX = (y / box.height - 0.5) * -7;
          var tiltY = (x / box.width - 0.5) * 7;
          link.style.transform = "rotateX(" + tiltX + "deg) rotateY(" + tiltY + "deg) translateY(-3px)";
        }
      });

      link.addEventListener("pointerleave", function () {
        link.style.transform = "";
      });

      link.addEventListener("pointerenter", function () {
        if (prefersReducedMotion) return;

        var revealedLetters = 0;
        clearInterval(scrambleTimer);

        scrambleTimer = setInterval(function () {
          title.textContent = originalText
            .split("")
            .map(function (char, position) {
              if (char === " " || position < revealedLetters) return char;
              return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            })
            .join("");

          revealedLetters++;
          if (revealedLetters > originalText.length) {
            clearInterval(scrambleTimer);
            title.textContent = originalText;
          }
        }, SCRAMBLE_SPEED_MS);
      });
    });
  }

  initThemeToggle();
  initBackground();
  initProgressTracker();
  initSearch();
  initCardEffects();
})();