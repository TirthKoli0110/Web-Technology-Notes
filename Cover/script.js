/* ==========================================================================
   Tirth Koli – Portfolio
   ========================================================================== */
(function () {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasMouse = matchMedia("(hover: hover)").matches;
  const TAU = Math.PI * 2;

  const pointer = { x: -9999, y: -9999 };

  const label = {
    el: document.getElementById("shape"),
    shapeName: "",
    timer: 0,
    showShape(name) {
      this.shapeName = name;
      if (this.el) this.el.textContent = "\u2728 " + name;
    },
    toast(text, ms = 1800) {
      if (this.el) this.el.textContent = text;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.showShape(this.shapeName), ms);
    },
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  const PALETTES = [
    { name: "Icy Teal & Cyan",        colors: ["#12a3a0", "#00c9a7", "#00b4d8", "#3dbeff", "#25c55e"] },
    { name: "Deep Indigo & Midnight", colors: ["#1b1464", "#3b2fa8", "#2a5bd7", "#5a8dff", "#7c4dff"] },
    { name: "Sunset Coral",           colors: ["#c2185b", "#ff4d6d", "#ff7a3d", "#ffb347", "#ffd166"] },
    { name: "Aurora Purple",          colors: ["#4c1d95", "#7c3aed", "#c026d3", "#22d3ee", "#34d399"] },
    { name: "Forest Emerald",         colors: ["#064e3b", "#059669", "#10b981", "#6ee7b7", "#a3e635"] },
  ];

  const PALETTE_INTERVAL_MS = 7000;
  const PALETTE_FADE_MS = 2200;
  const palette = { hex: PALETTES[0].colors.slice() };
  let setShaderColors = null;

  function applyPalette(rgbColors) {
    palette.hex = rgbColors.map(rgbToHex);
    if (setShaderColors) setShaderColors(palette.hex);

    const style = document.documentElement.style;
    ["--sea", "--teal", "--cyan", "--sky", "--green"].forEach((name, i) => {
      style.setProperty(name, palette.hex[i]);
    });
  }

  function initPalette() {
    let index = 0;
    let current = PALETTES[0].colors.map(hexToRgb);
    let fadeFrame = 0;

    function fadeToCurrentPalette() {
      const from = current.map((c) => c.slice());
      const to = PALETTES[index].colors.map(hexToRgb);
      const duration = reduceMotion ? 1 : PALETTE_FADE_MS;
      const start = performance.now();

      cancelAnimationFrame(fadeFrame);

      (function step(now) {
        let k = Math.min(1, (now - start) / duration);
        k = k * k * (3 - 2 * k);
        current = from.map((c, i) => c.map((v, j) => v + (to[i][j] - v) * k));
        applyPalette(current);
        if (k < 1) fadeFrame = requestAnimationFrame(step);
      })(start);

      label.toast("\uD83C\uDFA8 " + PALETTES[index].name);
    }

    const bgBtn = document.getElementById("bgbtn");
    if (bgBtn) {
      bgBtn.addEventListener("click", () => {
        index = (index + 1) % PALETTES.length;
        fadeToCurrentPalette();
      });
    
    }

    applyPalette(current);
    if (reduceMotion) return;

    setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % PALETTES.length;
      fadeToCurrentPalette();
    }, PALETTE_INTERVAL_MS);
  }

  /* WebGL Background (Aurora & Snow) */
  const VERTEX_SHADER = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform vec2  uResolution;
    uniform float uTime;
    uniform vec2  uPointer;
    uniform vec3  uC0, uC1, uC2, uC3, uC4;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += vec2(dot(p, p + vec2(45.32)));
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
        p = p * 2.0 + vec2(7.0);
        amp *= 0.5;
      }
      return sum / 0.9375;
    }

    float snow(vec2 uv, float scale, float speed) {
      uv *= scale;
      uv.y += uTime * speed;
      uv.x += sin(uv.y * 0.6 + uTime * 0.3) * 0.4;

      vec2 cell = floor(uv);
      vec2 local = fract(uv) - vec2(0.5);
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

      vec2 q = vec2(fbm(p * 2.0 + vec2(uTime * 0.08)),
                    fbm(p * 2.0 + vec2(5.2, 1.3) - vec2(uTime * 0.1)));
      float f = fbm(p * 2.2 + q * 2.4 + vec2(glow * 0.7 + uTime * 0.04));

      vec3 col = mix(uC0, uC1, smoothstep(0.12, 0.4, f));
      col = mix(col, uC2, smoothstep(0.35, 0.6, f));
      col = mix(col, uC3, smoothstep(0.55, 0.82, f));
      col = mix(col, uC4, smoothstep(0.5, 0.9, q.y) * 0.55);

      col += glow * vec3(0.18);
      col *= 1.0 - 0.3 * dot(p, p);
      col = col * 0.22 + vec3(0.01, 0.04, 0.07);

      col += vec3(0.85, 0.95, 1.0) * (snow(uv, 14.0, 0.35) * 0.9 + snow(uv + vec2(3.1), 26.0, 0.55) * 0.7);
      col += vec3((hash(uv * 120.0 + vec2(fract(uTime * 0.05))) - 0.5) * 0.038);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createProgram(gl) {
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  }

  function initBackground() {
    const canvas = document.getElementById("background");
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    const program = gl && createProgram(gl);

    if (!program) {
      document.body.classList.add("no-webgl");
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uPointer = gl.getUniformLocation(program, "uPointer");
    const uColors = [0, 1, 2, 3, 4].map((i) => gl.getUniformLocation(program, "uC" + i));

    setShaderColors = (hexColors) => {
      hexColors.forEach((hex, i) => {
        const [r, g, b] = hexToRgb(hex);
        gl.uniform3f(uColors[i], r / 255, g / 255, b / 255);
      });
    };
    setShaderColors(palette.hex);

    function resize() {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(innerWidth * scale));
      canvas.height = Math.max(1, Math.floor(innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    addEventListener("resize", resize);

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    addEventListener("pointermove", (e) => {
      const size = Math.min(innerWidth, innerHeight);
      targetX = (e.clientX - innerWidth / 2) / size;
      targetY = (innerHeight / 2 - e.clientY) / size;
    });

    const startTime = performance.now();
    function draw(now) {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduceMotion ? 5 : (now - startTime) / 1000);
      gl.uniform2f(uPointer, currentX, currentY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!reduceMotion) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* Particle Canvas & Shapes */
  const textPointCache = {};
  function getTextPoints(text, font, baselineY) {
    const key = text + font;
    if (textPointCache[key]) return textPointCache[key];

    const off = document.createElement("canvas");
    off.width = 400;
    off.height = 200;
    const c = off.getContext("2d");
    c.fillStyle = "#fff";
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 200, baselineY);

    const data = c.getImageData(0, 0, 400, 200).data;
    const points = [];
    for (let y = 0; y < 200; y += 2) {
      for (let x = 0; x < 400; x += 2) {
        if (data[(y * 400 + x) * 4 + 3] > 128) points.push(x, y);
      }
    }
    return (textPointCache[key] = points);
  }

  function textShape(text, font, baselineY) {
    return function () {
      const points = getTextPoints(text, font, baselineY);
      if (!points.length) {
        const a = Math.random() * TAU;
        return [Math.cos(a), Math.sin(a)];
      }
      const j = Math.floor((Math.random() * points.length) / 2) * 2;
      return [
        (points[j] - 200) / 200 + (Math.random() - 0.5) * 0.01,
        (points[j + 1] - 100) / 200 + (Math.random() - 0.5) * 0.01,
      ];
    };
  }

  /** DRAGON PARTICLE GENERATOR */
  function dragonPoint() {
    const jitter = () => (Math.random() - 0.5) * 0.015;
    const spine = (t) => {
      const angle = t * 7.85 + 0.3;
      return [-1 + 2 * t, -0.28 * Math.sin(angle), 2, -0.28 * Math.cos(angle) * 7.85];
    };
    const bodyWidth = (t) => 0.015 + 0.085 * Math.pow(t, 0.8);
    const normalOf = (c) => {
      const len = Math.hypot(c[2], c[3]) || 1;
      return [c[3] / len, -c[2] / len];
    };

    const head = spine(1);
    const roll = Math.random();
    let p;

    if (roll < 0.52) {
      // Dragon Body
      const t = Math.random();
      const c = spine(t);
      const [nx, ny] = normalOf(c);
      const w = bodyWidth(t) * (Math.random() * 2 - 1);
      p = [c[0] + nx * w, c[1] + ny * w];
    } else if (roll < 0.66) {
      // Dragon Head
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random());
      p = [head[0] + 0.08 + Math.cos(a) * 0.13 * r, head[1] - 0.02 + Math.sin(a) * 0.075 * r];
    } else if (roll < 0.74) {
      // Dragon Horns
      const s = Math.random();
      const left = Math.random() < 0.5;
      const endX = left ? head[0] - 0.14 : head[0] - 0.02;
      const endY = left ? head[1] - 0.24 : head[1] - 0.26;
      p = [
        head[0] + 0.04 + s * (endX - head[0] - 0.04) + jitter(),
        head[1] - 0.06 + s * (endY - head[1] + 0.06) + jitter(),
      ];
    } else if (roll < 0.82) {
      // Dragon Claws / Legs
      const s = Math.random();
      const up = Math.random() < 0.5;
      const endX = up ? head[0] + 0.36 : head[0] + 0.32;
      const endY = up ? head[1] - 0.14 : head[1] + 0.16;
      p = [
        head[0] + 0.2 + s * (endX - head[0] - 0.2) + jitter(),
        head[1] + 0.02 + s * (endY - head[1] - 0.02) + jitter(),
      ];
    } else if (roll < 0.92) {
      // Dragon Spikes
      const t = 0.1 + (Math.floor(Math.random() * 14) / 14) * 0.85;
      const c = spine(t);
      const [nx, ny] = normalOf(c);
      const offset = bodyWidth(t) + Math.random() * 0.07;
      p = [c[0] + nx * offset + jitter(), c[1] + ny * offset];
    } else {
      // Belly Ridges
      const t = [0.3, 0.45, 0.62, 0.78][Math.floor(Math.random() * 4)];
      const c = spine(t);
      const [nx, ny] = normalOf(c);
      const w = bodyWidth(t);
      const s = Math.random();
      const offset = -(w + (s / 0.8) * 0.17);
      p = [c[0] + nx * offset, c[1] + ny * offset];
    }

    return [p[0] * 0.82, p[1] * 0.82];
  }

  const SHAPES = [
    { name: "TK Letters", point: textShape("TK", "800 180px Poppins, sans-serif", 108) },
    { name: "Infinity Loop", point() {
      const a = Math.random() * TAU;
      return [Math.sin(a) * 0.95, Math.sin(2 * a) * 0.48];
    } },
    { name: "Code Brackets", point: textShape("</>", '800 150px monospace', 100) },
    { name: "Wave", point() {
      const x = Math.random() * 2 - 1;
      return [x * 1.05, Math.sin(x * TAU) * 0.3];
    } },
    { name: "Saturn", point() {
      const a = Math.random() * TAU;
      if (Math.random() < 0.5) {
        const r = 0.5 * Math.sqrt(Math.random());
        return [Math.cos(a) * r, Math.sin(a) * r];
      }
      const r = 0.85 + Math.random() * 0.25;
      return [Math.cos(a) * r, Math.sin(a) * r * 0.3];
    } },
    { name: "Dragon", point: dragonPoint },
  ];

  const SECTION_IDS = ["home", "about", "skills", "projects", "contact"];

  function initShapes() {
    const canvas = document.getElementById("scene");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const COUNT = innerWidth < 700 ? 900 : 1500;
    const x = new Float32Array(COUNT);
    const y = new Float32Array(COUNT);
    const vx = new Float32Array(COUNT);
    const vy = new Float32Array(COUNT);
    const targets = [];
    let width = 0, height = 0, current = 0;

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      width = innerWidth;
      height = innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      const wide = width > 800;
      const centerX = wide ? width * 0.7 : width * 0.5;
      const centerY = height * 0.5;
      const scale = wide ? Math.min(width * 0.3, height * 0.42) : Math.min(width * 0.42, height * 0.3);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      const target = targets[current] || targets[0];
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = palette.hex[(c + current) % 5];
        for (let i = c; i < COUNT; i += 4) {
          const goalX = centerX + target[2 * i] * scale;
          const goalY = centerY + target[2 * i + 1] * scale;

          vx[i] += (goalX - x[i]) * 0.015;
          vy[i] += (goalY - y[i]) * 0.015;

          const dx = x[i] - pointer.x;
          const dy = y[i] - pointer.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 10000) {
            const force = (1 - distSq / 10000) * 2;
            vx[i] += (dx / Math.sqrt(distSq)) * force;
            vy[i] += (dy / Math.sqrt(distSq)) * force;
          }

          vx[i] *= 0.88;
          vy[i] *= 0.88;
          x[i] += vx[i];
          y[i] += vy[i];

          ctx.fillRect(x[i], y[i], 2.2, 2.2);
        }
      }

      if (!reduceMotion) requestAnimationFrame(frame);
    }

    function setShape(idx) {
      if (idx !== current) {
        current = idx;
        label.showShape(SHAPES[current].name);
      }
    }

    function updateShape() {
      const middle = innerHeight / 2;
      const scrollProgress = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);

      // Scroll to bottom -> Dragon!
      if (scrollProgress > 0.88) {
        setShape(5); // Dragon!
        return;
      }

      let next = 0;
      SECTION_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= middle && r.bottom >= middle) {
          if (i === 0) next = 0; // TK Letters
          else if (i === 1) next = 1; // Infinity
          else if (i === 2) next = 2; // Brackets
          else if (i === 3) next = 3; // Wave
          else if (i === 4) next = 4; // Saturn
        }
      });

      setShape(next);
    }

    // Clicking the shape badge in the bottom-right corner manually cycles shapes!
    const shapeBadge = document.getElementById("shape");
    if (shapeBadge) {
      shapeBadge.style.cursor = "pointer";
      shapeBadge.title = "Click to change particle shape (including Dragon!)";
      shapeBadge.addEventListener("click", () => {
        const next = (current + 1) % SHAPES.length;
        setShape(next);
      });
    }

    function start() {
      resize();
      SHAPES.forEach((shape) => {
        const t = new Float32Array(2 * COUNT);
        for (let i = 0; i < COUNT; i++) {
          const p = shape.point(i, COUNT);
          t[2 * i] = p[0];
          t[2 * i + 1] = p[1];
        }
        targets.push(t);
      });

      for (let i = 0; i < COUNT; i++) {
        x[i] = Math.random() * width;
        y[i] = Math.random() * height;
      }

      label.showShape(SHAPES[0].name);
      updateShape();

      addEventListener("resize", resize);
      addEventListener("scroll", updateShape, { passive: true });
      addEventListener("pointermove", (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      });

      requestAnimationFrame(frame);
    }

    start();
  }

  /* Search */
  function initSearch() {
    const input = document.getElementById("search");
    const noResults = document.getElementById("no-results");
    const cards = document.querySelectorAll(".unit-card");
    if (!input) return;

    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      let matches = 0;
      cards.forEach((card) => {
        const text = (card.textContent + " " + (card.dataset.keywords || "")).toLowerCase();
        const show = !query || text.includes(query);
        card.hidden = !show;
        if (show) matches++;
      });
      if (noResults) noResults.hidden = matches > 0;
    });

    addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
      if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        input.dispatchEvent(new Event("input"));
        input.blur();
      }
    });
  }

  /* Card Effects */
  function initCards() {
    document.querySelectorAll(".unit-link").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const box = card.getBoundingClientRect();
        const px = e.clientX - box.left;
        const py = e.clientY - box.top;
        card.style.setProperty("--mx", px + "px");
        card.style.setProperty("--my", py + "px");

        if (hasMouse && !reduceMotion) {
          const tiltX = (py / box.height - 0.5) * -7;
          const tiltY = (px / box.width - 0.5) * 7;
          card.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-3px)`;
        }
      });

      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* Contact Reveal */
  function initContactReveal() {
    const items = document.querySelectorAll("#contact .reveal");
    const showAll = () => items.forEach((el) => el.classList.add("in"));
    if (!("IntersectionObserver" in window)) {
      showAll();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        showAll();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    const contact = document.getElementById("contact");
    if (contact) observer.observe(contact);
  }

  
  /* Theme Toggle */
  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    const root = document.documentElement;
    const THEME_KEY = "tk-theme";
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}

    function apply(theme, persist) {
      root.setAttribute("data-theme", theme);
      const isDark = theme === "dark";
      if (btn) {
        btn.textContent = isDark ? "\u2600\uFE0F" : "\uD83C\uDF19";
        btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      }
      if (persist) {
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
      }
    }

    const initial = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    apply(initial, false);

    if (btn) {
      btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        apply(next, true);
      });
    }
  }

  initTheme();
  initBackground();
  initPalette();
  initShapes();
  initSearch();
  initCards();
  initContactReveal();
})();
