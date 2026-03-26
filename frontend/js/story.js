/**
 * MOODIFY Story — Spotify Wrapped-style full-screen slideshow
 * story.js  (vanilla JS + CSS, no external libraries)
 *
 * Public API:  initStory(data)
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────
  const SLIDE_DURATION_MS = 5000;
  const TRANSITION_DURATION_MS = 300;
  const COUNTER_DURATION_MS = 1500;
  const NUM_PARTICLES = 30;
  const NUM_SLIDES = 7;

  // 8 safe word-cloud positions (% x, % y) to avoid collisions/overflow
  const CLOUD_POSITIONS = [
    { x: 50, y: 48 },
    { x: 28, y: 32 },
    { x: 72, y: 30 },
    { x: 20, y: 62 },
    { x: 78, y: 65 },
    { x: 50, y: 22 },
    { x: 35, y: 72 },
    { x: 65, y: 75 },
  ];

  // ─── Main entry point ────────────────────────────────────────────────────────
  function initStory(data) {
    // Guard
    if (!data || !data.top_artists || data.top_artists.length === 0) {
      showErrorStory();
      return;
    }

    // Prevent duplicate
    if (document.getElementById('moodify-story-root')) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Inject styles ─────────────────────────────────────────────────────────
    injectStyles(prefersReduced);

    // ── Build overlay ─────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'moodify-story-root';
    document.body.appendChild(root);

    // ── Normalize data shape ──────────────────────────────────────────────────
    // display_name lives at data.user.name in the API response
    const displayName = (data.user && data.user.name) || data.display_name || 'Music Lover';

    // genre_distribution is a {name: count} object; convert to [{name, count}] array
    let topGenres;
    if (Array.isArray(data.top_genres) && data.top_genres.length) {
      topGenres = data.top_genres.slice(0, 8);
    } else if (data.genre_distribution && typeof data.genre_distribution === 'object') {
      topGenres = Object.entries(data.genre_distribution)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    } else {
      topGenres = [];
    }

    // Gather remaining data
    const topArtistName = (data.top_artists[0] && data.top_artists[0].name) || 'Unknown Artist';
    const moodLabel = (data.mood_profile && data.mood_profile.mood) || '🎵 Music Lover';
    const moodDesc = (data.mood_profile && data.mood_profile.mood_desc) || '';
    const traits = (data.mood_profile && data.mood_profile.traits && data.mood_profile.traits.length)
      ? data.mood_profile.traits
      : ['Balanced Listener 🎧'];
    const energy = (data.audio_features && data.audio_features.averages && data.audio_features.averages.energy) || 0;
    const artistCount = data.top_artists.length;
    const genreCount = topGenres.length || Object.keys(data.genre_distribution || {}).length;
    const energyPct = Math.round(energy * 100);

    // ── State ─────────────────────────────────────────────────────────────────
    let currentSlide = 0;
    let autoTimer = null;
    let paused = false;
    let touchStartX = 0;
    let activeCounterRAFs = [];

    // ── Progress bar ──────────────────────────────────────────────────────────
    const progressBar = document.createElement('div');
    progressBar.className = 'ms-progress-bar';
    const segments = [];
    for (let i = 0; i < NUM_SLIDES; i++) {
      const seg = document.createElement('div');
      seg.className = 'ms-seg';
      seg.dataset.index = i;
      seg.innerHTML = '<div class="ms-seg-fill"></div>';
      seg.addEventListener('click', () => goToSlide(i));
      progressBar.appendChild(seg);
      segments.push(seg);
    }
    root.appendChild(progressBar);

    // ── Slide container ───────────────────────────────────────────────────────
    const slideContainer = document.createElement('div');
    slideContainer.className = 'ms-slide-container';
    root.appendChild(slideContainer);

    // ── Navigation click zones ────────────────────────────────────────────────
    const zoneLeft = document.createElement('div');
    zoneLeft.className = 'ms-zone ms-zone-left';
    zoneLeft.addEventListener('click', () => navigate(-1));
    root.appendChild(zoneLeft);

    const zoneRight = document.createElement('div');
    zoneRight.className = 'ms-zone ms-zone-right';
    zoneRight.addEventListener('click', () => navigate(1));
    root.appendChild(zoneRight);

    // ── Pause on hover ────────────────────────────────────────────────────────
    root.addEventListener('mouseenter', () => { paused = true; pauseProgress(); });
    root.addEventListener('mouseleave', () => { paused = false; resumeProgress(); });

    // ── Touch swipe ───────────────────────────────────────────────────────────
    root.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    }, { passive: true });

    // ── Keyboard ──────────────────────────────────────────────────────────────
    function onKey(e) {
      if (e.key === 'ArrowRight') navigate(1);
      else if (e.key === 'ArrowLeft') navigate(-1);
      else if (e.key === 'Escape') closeStory();
    }
    document.addEventListener('keydown', onKey);

    // ── Slide builders ────────────────────────────────────────────────────────
    const slideBuilders = [
      () => buildSlide1(displayName),
      () => buildSlide2(topArtistName),
      () => buildSlide3(moodLabel, moodDesc),
      () => buildSlide4(traits),
      () => buildSlide5(topGenres),
      () => buildSlide6(artistCount, genreCount, energyPct),
      () => buildSlide7(),
    ];

    const transitionTypes = ['fade', 'zoom', 'fade', 'fade', 'blur', 'fade', 'fade'];

    // ── Core navigation functions ─────────────────────────────────────────────
    function goToSlide(index) {
      if (index < 0 || index >= NUM_SLIDES) return;
      stopCounters();
      const oldSlide = currentSlide;
      currentSlide = index;
      renderSlide(currentSlide, oldSlide);
      if (!prefersReduced) scheduleAdvance();
    }

    function navigate(dir) {
      const next = currentSlide + dir;
      if (next < 0) return;
      if (next >= NUM_SLIDES) { closeStory(); return; }
      goToSlide(next);
    }

    function closeStory() {
      stopCounters();
      clearTimeout(autoTimer);
      document.removeEventListener('keydown', onKey);
      const r = document.getElementById('moodify-story-root');
      const s = document.getElementById('moodify-story-styles');
      if (r) r.remove();
      if (s) s.remove();
    }

    function stopCounters() {
      activeCounterRAFs.forEach(id => cancelAnimationFrame(id));
      activeCounterRAFs = [];
    }

    // ── Render a slide ────────────────────────────────────────────────────────
    function renderSlide(idx, prevIdx) {
      // Update progress segments
      segments.forEach((seg, i) => {
        seg.classList.remove('ms-seg-active', 'ms-seg-done');
        if (i < idx) {
          seg.classList.add('ms-seg-done');
        } else if (i === idx) {
          seg.classList.add('ms-seg-active');
        }
      });

      // Build new slide element
      const newSlide = slideBuilders[idx]();
      const type = transitionTypes[idx];

      if (prefersReduced) {
        // Instant switch for reduced motion
        slideContainer.innerHTML = '';
        newSlide.style.opacity = '1';
        slideContainer.appendChild(newSlide);
        if (idx === 5) startCounters(newSlide, artistCount, genreCount, energyPct);
        return;
      }

      // Exit old
      const oldSlide = slideContainer.querySelector('.ms-slide');
      if (oldSlide) {
        oldSlide.style.opacity = '0';
        oldSlide.style.pointerEvents = 'none';
        setTimeout(() => { if (oldSlide.parentNode) oldSlide.remove(); }, TRANSITION_DURATION_MS);
      }

      // Enter new
      applyEntranceTransition(newSlide, type);
      slideContainer.appendChild(newSlide);

      // Trigger entrance (rAF ensures initial state paints first)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyEntranceActive(newSlide, type);
        });
      });

      if (idx === 5) {
        // Start counters after fade-in completes
        setTimeout(() => startCounters(newSlide, artistCount, genreCount, energyPct), 400);
      }
    }

    function applyEntranceTransition(el, type) {
      el.style.opacity = '0';
      if (type === 'zoom') {
        el.style.transform = 'scale(0.8)';
        el.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)`;
      } else if (type === 'blur') {
        el.style.filter = 'blur(20px)';
        el.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease, filter 0.5s ease`;
      } else {
        el.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease`;
      }
    }

    function applyEntranceActive(el, type) {
      el.style.opacity = '1';
      if (type === 'zoom') el.style.transform = 'scale(1)';
      if (type === 'blur') el.style.filter = 'blur(0px)';
    }

    // ── Auto-advance ──────────────────────────────────────────────────────────
    function scheduleAdvance() {
      clearTimeout(autoTimer);
      if (prefersReduced) return;
      autoTimer = setTimeout(() => {
        if (!paused) navigate(1);
        else {
          // Wait more if paused
          const interval = setInterval(() => {
            if (!paused) {
              clearInterval(interval);
              navigate(1);
            }
          }, 300);
        }
      }, SLIDE_DURATION_MS);
    }

    function pauseProgress() {
      clearTimeout(autoTimer);
      // Pause CSS fill animation
      const fill = progressBar.querySelector('.ms-seg-active .ms-seg-fill');
      if (fill) fill.style.animationPlayState = 'paused';
    }

    function resumeProgress() {
      const fill = progressBar.querySelector('.ms-seg-active .ms-seg-fill');
      if (fill) fill.style.animationPlayState = 'running';
      scheduleAdvance();
    }

    // ── Close function bound to Slide 7 ──────────────────────────────────────
    window.__moodifyStoryClose = closeStory;

    // ── Initial render ────────────────────────────────────────────────────────
    goToSlide(0);
  }

  // ─── Slide Builders ─────────────────────────────────────────────────────────

  function buildSlide1(displayName) {
    const slide = createSlide('ms-slide-1');

    // Particle dots
    const particleContainer = document.createElement('div');
    particleContainer.className = 'ms-particles';
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const dot = document.createElement('div');
      dot.className = 'ms-particle';
      dot.style.left = Math.random() * 100 + '%';
      dot.style.bottom = Math.random() * 100 + '%';
      dot.style.animationDuration = (8 + Math.random() * 12) + 's';
      dot.style.animationDelay = -(Math.random() * 15) + 's';
      dot.style.opacity = (0.3 + Math.random() * 0.3).toFixed(2);
      dot.style.width = dot.style.height = (3 + Math.random() * 5) + 'px';
      particleContainer.appendChild(dot);
    }
    slide.appendChild(particleContainer);

    // Content
    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const title = document.createElement('div');
    title.className = 'ms-title ms-fade-in';
    title.textContent = 'Your 2026 in Music';
    content.appendChild(title);

    const name = document.createElement('div');
    name.className = 'ms-subtitle-green ms-fade-in ms-delay-04';
    name.textContent = displayName;
    content.appendChild(name);

    slide.appendChild(content);
    return slide;
  }

  function buildSlide2(artistName) {
    const slide = createSlide('ms-slide-2');
    slide.style.background = 'radial-gradient(ellipse at center, rgba(29,185,84,0.18) 0%, #000 70%)';

    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const label = document.createElement('div');
    label.className = 'ms-label-muted';
    label.textContent = 'Your most played artist was';
    content.appendChild(label);

    const name = document.createElement('div');
    name.className = 'ms-artist-name';
    name.textContent = artistName;
    content.appendChild(name);

    slide.appendChild(content);
    return slide;
  }

  function buildSlide3(moodLabel, moodDesc) {
    const slide = createSlide('ms-slide-3');

    // Dynamic background by mood
    const mood = moodLabel.toLowerCase();
    let bg = 'linear-gradient(135deg, #0a0a2a, #0a0a3a)';
    if (mood.includes('hype') || mood.includes('energy')) bg = 'linear-gradient(135deg, #0a2a0a, #1a4a1a)';
    else if (mood.includes('intense') || mood.includes('dark')) bg = 'linear-gradient(135deg, #1a0a1a, #2a0a2a)';
    else if (mood.includes('chill') || mood.includes('happy') || mood.includes('upbeat')) bg = 'linear-gradient(135deg, #0a1a2a, #0a2a3a)';
    slide.style.background = bg;

    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const label = document.createElement('div');
    label.className = 'ms-label-muted';
    label.textContent = 'Your music mood is';
    content.appendChild(label);

    // Character-by-character reveal
    const moodEl = document.createElement('div');
    moodEl.className = 'ms-mood-label';
    const chars = [...moodLabel];
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'ms-char';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.animationDelay = (i * 0.05) + 's';
      moodEl.appendChild(span);
    });
    content.appendChild(moodEl);

    const desc = document.createElement('div');
    desc.className = 'ms-mood-desc ms-fade-in';
    desc.style.animationDelay = (chars.length * 0.05 + 0.2) + 's';
    desc.textContent = moodDesc;
    content.appendChild(desc);

    slide.appendChild(content);
    return slide;
  }

  function buildSlide4(traits) {
    const slide = createSlide('ms-slide-4');

    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const label = document.createElement('div');
    label.className = 'ms-label-muted';
    label.textContent = 'Your musical DNA';
    content.appendChild(label);

    const pillsWrap = document.createElement('div');
    pillsWrap.className = 'ms-pills-wrap';

    traits.forEach((trait, i) => {
      const pill = document.createElement('span');
      pill.className = 'ms-dna-pill ms-fly-in';
      pill.textContent = trait;
      pill.style.animationDelay = (i * 0.15) + 's';
      pillsWrap.appendChild(pill);
    });
    content.appendChild(pillsWrap);
    slide.appendChild(content);
    return slide;
  }

  function buildSlide5(genres) {
    const slide = createSlide('ms-slide-5');
    slide.style.position = 'relative';

    const label = document.createElement('div');
    label.className = 'ms-label-muted ms-cloud-label';
    label.textContent = 'Your top genres';
    slide.appendChild(label);

    if (!genres || genres.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ms-center-content ms-title';
      empty.textContent = 'No genre data';
      slide.appendChild(empty);
      return slide;
    }

    const cloudWrap = document.createElement('div');
    cloudWrap.className = 'ms-cloud-wrap';

    const maxCount = Math.max(...genres.map(g => g.count || 1));
    const minCount = Math.min(...genres.map(g => g.count || 1));
    const countRange = maxCount - minCount || 1;

    genres.slice(0, 8).forEach((genre, i) => {
      const pos = CLOUD_POSITIONS[i] || { x: 50, y: 50 };
      const normalized = ((genre.count || 1) - minCount) / countRange;
      const fontSize = Math.round(14 + normalized * 34); // 14px–48px
      const opacity = (1 - (i / (genres.length || 1)) * 0.6).toFixed(2);

      const word = document.createElement('div');
      word.className = 'ms-cloud-word ms-fade-in';
      word.textContent = genre.name || genre;
      word.style.fontSize = fontSize + 'px';
      word.style.opacity = '0';
      word.style.animationDelay = (i * 0.1) + 's';
      word.style.animationFillMode = 'forwards';
      word.style.left = pos.x + '%';
      word.style.top = pos.y + '%';
      word.style.setProperty('--final-opacity', opacity);

      cloudWrap.appendChild(word);
    });

    slide.appendChild(cloudWrap);
    return slide;
  }

  function buildSlide6(artistCount, genreCount, energyPct) {
    const slide = createSlide('ms-slide-6');

    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const row = document.createElement('div');
    row.className = 'ms-counters-row';

    const counterDefs = [
      { target: artistCount, suffix: '', label: 'artists explored', id: 'cnt-artists' },
      { target: genreCount, suffix: '', label: 'genres discovered', id: 'cnt-genres' },
      { target: energyPct, suffix: '%', label: 'avg energy', id: 'cnt-energy' },
    ];

    counterDefs.forEach((def, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'ms-counter ms-fade-in';
      wrap.style.animationDelay = (i * 0.2) + 's';

      const numEl = document.createElement('div');
      numEl.className = 'ms-counter-num';
      numEl.id = def.id;
      numEl.textContent = '0' + def.suffix;
      numEl.dataset.target = def.target;
      numEl.dataset.suffix = def.suffix;

      const labelEl = document.createElement('div');
      labelEl.className = 'ms-counter-label';
      labelEl.textContent = def.label;

      wrap.appendChild(numEl);
      wrap.appendChild(labelEl);
      row.appendChild(wrap);
    });

    content.appendChild(row);
    slide.appendChild(content);
    return slide;
  }

  function buildSlide7() {
    const slide = createSlide('ms-slide-7');

    const content = document.createElement('div');
    content.className = 'ms-center-content';

    const title = document.createElement('div');
    title.className = 'ms-title ms-fade-in';
    title.textContent = "That's your MOODIFY";
    content.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'ms-subtitle ms-fade-in ms-delay-04';
    sub.textContent = 'Made with ❤️ and your Spotify data';
    content.appendChild(sub);

    const btnRow = document.createElement('div');
    btnRow.className = 'ms-outro-btns ms-fade-in ms-delay-08';

    const shareBtn = document.createElement('button');
    shareBtn.className = 'ms-btn-green';
    shareBtn.textContent = 'Share';
    shareBtn.addEventListener('click', e => e.stopPropagation());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ms-btn-outline';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (window.__moodifyStoryClose) window.__moodifyStoryClose();
    });

    btnRow.appendChild(shareBtn);
    btnRow.appendChild(closeBtn);
    content.appendChild(btnRow);
    slide.appendChild(content);
    return slide;
  }

  // ─── Counter animation ───────────────────────────────────────────────────────
  function startCounters(slideEl, artistCount, genreCount, energyPct) {
    const nums = slideEl.querySelectorAll('.ms-counter-num');
    nums.forEach(numEl => {
      const target = parseInt(numEl.dataset.target, 10);
      const suffix = numEl.dataset.suffix || '';
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / COUNTER_DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOut cubic
        const current = Math.round(eased * target);
        numEl.textContent = current + suffix;
        if (progress < 1) {
          const raf = requestAnimationFrame(tick);
          (window.__moodifyCounterRAFs = window.__moodifyCounterRAFs || []).push(raf);
        }
      }
      const id = requestAnimationFrame(tick);
      (window.__moodifyCounterRAFs = window.__moodifyCounterRAFs || []).push(id);
    });
  }

  // ─── Error slide ─────────────────────────────────────────────────────────────
  function showErrorStory() {
    injectStyles(false);
    const root = document.createElement('div');
    root.id = 'moodify-story-root';

    const content = document.createElement('div');
    content.className = 'ms-center-content';
    content.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';

    const msg = document.createElement('div');
    msg.className = 'ms-title';
    msg.style.fontSize = '24px';
    msg.textContent = 'No data available yet — listen to more music!';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ms-btn-outline';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      document.getElementById('moodify-story-root')?.remove();
      document.getElementById('moodify-story-styles')?.remove();
    });

    content.appendChild(msg);
    content.appendChild(closeBtn);
    root.appendChild(content);
    document.body.appendChild(root);

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        document.getElementById('moodify-story-root')?.remove();
        document.getElementById('moodify-story-styles')?.remove();
        document.removeEventListener('keydown', esc);
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function createSlide(extraClass) {
    const slide = document.createElement('div');
    slide.className = 'ms-slide ' + (extraClass || '');
    return slide;
  }

  // ─── Style injection ─────────────────────────────────────────────────────────
  function injectStyles(prefersReduced) {
    if (document.getElementById('moodify-story-styles')) return;

    const animBlock = prefersReduced ? `
      .ms-fade-in, .ms-delay-04, .ms-delay-08 { opacity: 1 !important; animation: none !important; }
      .ms-char { opacity: 1 !important; animation: none !important; }
      .ms-dna-pill, .ms-fly-in { opacity: 1 !important; transform: none !important; animation: none !important; }
      .ms-cloud-word { opacity: var(--final-opacity, 0.8) !important; animation: none !important; }
      .ms-seg-active .ms-seg-fill { animation: none !important; width: 100%; }
      .ms-particle { animation: none !important; opacity: 0.3 !important; }
    ` : `
      @keyframes msFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes msFloatUp {
        0%   { transform: translateY(0);    opacity: var(--p-opacity, 0.4); }
        100% { transform: translateY(-110vh); opacity: 0; }
      }
      @keyframes msFillBar {
        from { width: 0%; }
        to   { width: 100%; }
      }
      @keyframes msCharIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes msFlyIn {
        from { transform: translateY(60px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes msCloudIn {
        from { opacity: 0; }
        to   { opacity: var(--final-opacity, 0.8); }
      }
      @keyframes msGradientCycle {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes msPulse {
        0%, 100% { box-shadow: 0 0 12px rgba(29,185,84,0.4); }
        50%       { box-shadow: 0 0 24px rgba(29,185,84,0.7); }
      }
    `;

    const css = `
      /* ── Root overlay ─────────────────────────────────────── */
      #moodify-story-root {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #000;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #fff;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
      }

      /* ── Progress bar ─────────────────────────────────────── */
      .ms-progress-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        display: flex;
        gap: 4px;
        padding: 0 4px;
        z-index: 10;
        box-sizing: border-box;
      }
      .ms-seg {
        flex: 1;
        background: rgba(255,255,255,0.2);
        border-radius: 2px;
        overflow: hidden;
        cursor: pointer;
        position: relative;
      }
      .ms-seg-fill {
        height: 100%;
        width: 0%;
        background: #1DB954;
        border-radius: 2px;
      }
      .ms-seg-done .ms-seg-fill {
        width: 100%;
      }
      .ms-seg-active .ms-seg-fill {
        animation: msFillBar ${SLIDE_DURATION_MS}ms linear forwards;
      }

      /* ── Slide container ──────────────────────────────────── */
      .ms-slide-container {
        position: absolute;
        inset: 0;
      }
      .ms-slide {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      /* ── Click zones ──────────────────────────────────────── */
      .ms-zone {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 40%;
        z-index: 5;
        cursor: pointer;
      }
      .ms-zone-left  { left: 0; }
      .ms-zone-right { right: 0; }

      /* ── Center layout ────────────────────────────────────── */
      .ms-center-content {
        text-align: center;
        padding: 40px 24px;
        max-width: 800px;
        width: 100%;
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      /* ── Typography ───────────────────────────────────────── */
      .ms-title {
        font-size: clamp(36px, 6vw, 72px);
        font-weight: 800;
        color: #fff;
        line-height: 1.1;
        letter-spacing: -1px;
      }
      .ms-subtitle {
        font-size: clamp(14px, 2vw, 18px);
        color: rgba(255,255,255,0.6);
        line-height: 1.5;
      }
      .ms-subtitle-green {
        font-size: clamp(18px, 3vw, 28px);
        font-weight: 600;
        color: #1DB954;
      }
      .ms-label-muted {
        font-size: 16px;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 500;
      }
      .ms-artist-name {
        font-size: clamp(48px, 8vw, 96px);
        font-weight: 900;
        color: #fff;
        line-height: 1.0;
        letter-spacing: -2px;
        margin-top: 12px;
      }
      .ms-mood-label {
        font-size: clamp(40px, 7vw, 80px);
        font-weight: 900;
        color: #fff;
        line-height: 1.1;
        letter-spacing: -1px;
        margin-top: 8px;
      }
      .ms-mood-desc {
        font-size: 16px;
        color: rgba(255,255,255,0.6);
        max-width: 480px;
        line-height: 1.6;
      }

      /* ── Animations ───────────────────────────────────────── */
      ${animBlock}

      .ms-fade-in {
        animation: msFadeIn 0.6s ease forwards;
        opacity: 0;
      }
      .ms-delay-04 { animation-delay: 0.4s; }
      .ms-delay-08 { animation-delay: 0.8s; }

      .ms-char {
        display: inline;
        opacity: 0;
        animation: msCharIn 0.15s ease forwards;
      }

      /* ── Slide 1 — Particles ──────────────────────────────── */
      .ms-particles {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .ms-particle {
        position: absolute;
        border-radius: 50%;
        background: #1DB954;
        animation: msFloatUp linear infinite;
        will-change: transform;
      }

      /* ── Slide 4 — DNA pills ──────────────────────────────── */
      .ms-pills-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: center;
        margin-top: 12px;
        max-width: 700px;
      }
      .ms-dna-pill {
        display: inline-block;
        padding: 14px 28px;
        font-size: 18px;
        font-weight: 600;
        color: #fff;
        background: rgba(29,185,84,0.15);
        border: 1px solid rgba(29,185,84,0.4);
        border-radius: 999px;
        opacity: 0;
        animation: msFlyIn 0.5s ease forwards;
      }

      /* ── Slide 5 — Word cloud ─────────────────────────────── */
      .ms-cloud-label {
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
      }
      .ms-cloud-wrap {
        position: absolute;
        inset: 0;
      }
      .ms-cloud-word {
        position: absolute;
        transform: translate(-50%, -50%);
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
        animation: msCloudIn 0.6s ease forwards;
        cursor: default;
      }

      /* ── Slide 6 — Counters, grid bg ─────────────────────── */
      .ms-slide-6 {
        background:
          linear-gradient(rgba(29,185,84,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(29,185,84,0.05) 1px, transparent 1px),
          #000;
        background-size: 48px 48px;
      }
      .ms-counters-row {
        display: flex;
        gap: clamp(24px, 6vw, 80px);
        align-items: flex-start;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 8px;
      }
      .ms-counter {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        opacity: 0;
        animation: msFadeIn 0.6s ease forwards;
      }
      .ms-counter-num {
        font-size: clamp(48px, 8vw, 80px);
        font-weight: 900;
        color: #fff;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        letter-spacing: -2px;
      }
      .ms-counter-label {
        font-size: 14px;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      /* ── Slide 7 — Outro ──────────────────────────────────── */
      .ms-slide-7 {
        background: linear-gradient(135deg, #0a1f0a, #0a1a2a, #0f0a2a, #0a1f0a);
        background-size: 400% 400%;
        animation: msGradientCycle 6s ease infinite;
      }
      .ms-outro-btns {
        display: flex;
        gap: 16px;
        margin-top: 8px;
        flex-wrap: wrap;
        justify-content: center;
        opacity: 0;
        animation: msFadeIn 0.6s ease forwards;
      }

      /* ── Buttons ──────────────────────────────────────────── */
      .ms-btn-green, .ms-btn-outline {
        padding: 12px 32px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.15s ease, opacity 0.15s ease;
        font-family: inherit;
        letter-spacing: 0.02em;
        position: relative;
        z-index: 10;
      }
      .ms-btn-green {
        background: #1DB954;
        color: #000;
        border: none;
      }
      .ms-btn-outline {
        background: transparent;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.35);
      }
      .ms-btn-green:hover  { transform: scale(1.04); }
      .ms-btn-outline:hover { transform: scale(1.04); opacity: 0.85; }

      /* ── Story trigger button (stats bar) ─────────────────── */
      .story-trigger-btn {
        background: #1DB954;
        color: #000;
        font-weight: 700;
        font-size: 13px;
        padding: 10px 24px;
        border-radius: 999px;
        border: none;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        letter-spacing: 0.02em;
        animation: msPulse 2s ease-in-out infinite;
        transition: transform 0.15s ease;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .story-trigger-btn:hover {
        transform: scale(1.05);
        animation-play-state: paused;
      }
    `;

    const style = document.createElement('style');
    style.id = 'moodify-story-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Export ──────────────────────────────────────────────────────────────────
  window.initStory = initStory;

})();
