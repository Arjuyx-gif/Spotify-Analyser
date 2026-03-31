/**
 * MOODIFY Story Engine — Production Refactor
 * Modular ES6 class-based architecture | story.js (vanilla JS, zero dependencies)
 * Public API: window.initStory(data)
 */
(() => {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const CONFIG = Object.freeze({
    SLIDE_DURATION_MS:   5000,
    TRANSITION_MS:       300,
    COUNTER_DURATION_MS: 1500,
    NUM_PARTICLES:       28,
    CLOUD_POSITIONS: [
      { x: 50, y: 48 }, { x: 28, y: 32 }, { x: 72, y: 30 },
      { x: 20, y: 62 }, { x: 78, y: 65 }, { x: 50, y: 22 },
      { x: 35, y: 72 }, { x: 65, y: 75 },
    ],
  });

  // ─── DOM helpers ───────────────────────────────────────────────────────────
  const mk     = (tag, cls = '') => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };
  const mkText = (tag, cls, text) => { const el = mk(tag, cls); el.textContent = text; return el; };
  const mkSlide = cls => mk('div', `ms-slide ${cls}`);
  const rand    = (lo, hi) => lo + Math.random() * (hi - lo);
  const pct     = v => `${Math.round(v * 100)}%`;

  // ═══════════════════════════════════════════════════════════════════════════
  // StoryState — Centralized state container, zero UI logic
  // ═══════════════════════════════════════════════════════════════════════════
  class StoryState {
    constructor(data) {
      this._current   = 0;
      this._paused    = false;
      this._timer     = null;
      this._rafs      = [];
      this._data      = data;
      this._listeners = new Map();
    }

    get current()    { return this._current; }
    get paused()     { return this._paused; }
    get data()       { return this._data; }
    get slideCount() { return StorySlides.registry.length; }

    set current(idx) {
      const prev = this._current;
      this._current = idx;
      this._emit('slide:change', { prev, next: idx });
    }
    set paused(val) {
      this._paused = val;
      this._emit(val ? 'story:pause' : 'story:resume');
    }

    on(event, fn)  { if (!this._listeners.has(event)) this._listeners.set(event, []); this._listeners.get(event).push(fn); }
    _emit(ev, pay) { (this._listeners.get(ev) || []).forEach(fn => fn(pay)); }

    scheduleAdvance(navigate) {
      this.clearTimer();
      this._timer = setTimeout(() => {
        if (!this._paused) { navigate(1); return; }
        const poll = setInterval(() => { if (!this._paused) { clearInterval(poll); navigate(1); } }, 300);
      }, CONFIG.SLIDE_DURATION_MS);
    }
    clearTimer()    { clearTimeout(this._timer); this._timer = null; }
    trackRAF(id)    { this._rafs.push(id); }
    cancelRAFs()    { this._rafs.forEach(id => cancelAnimationFrame(id)); this._rafs = []; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // StoryInsights — Pure logic layer, zero DOM access
  // Input: raw Spotify data | Output: structured insight objects
  // ═══════════════════════════════════════════════════════════════════════════
  class StoryInsights {
    constructor(data) {
      this._raw  = data;
      this._avgs = data?.audio_features?.averages ?? {};
    }

    compute() {
      if (this._cache) return this._cache;
      const {
        energy = 0, valence = 0, danceability = 0,
        acousticness = 0, instrumentalness = 0, speechiness = 0,
      } = this._avgs;

      const topArtists = this._raw?.top_artists ?? [];
      const topGenres  = this._normalizeGenres();
      const af = { energy, valence, danceability, acousticness, instrumentalness, speechiness };

      this._cache = {
        displayName:      this._resolveDisplayName(),
        topArtistName:    topArtists[0]?.name ?? 'Unknown Artist',
        topGenres,
        artistCount:      topArtists.length,
        genreCount:       topGenres.length,
        energyPct:        Math.round(energy * 100),
        mood:             this._deriveMood(af),
        traits:           this._deriveTraits(af, topArtists, topGenres),
        listenerArchetype: this._deriveArchetype(af, topArtists, topGenres),
        summaryMessage:   this._deriveSummary(af, topArtists, topGenres),
      };
      return this._cache;
    }

    _resolveDisplayName() {
      return this._raw?.user?.name ?? this._raw?.display_name ?? 'Music Lover';
    }

    _normalizeGenres() {
      const r = this._raw;
      if (Array.isArray(r?.top_genres) && r.top_genres.length) return r.top_genres.slice(0, 8);
      if (r?.genre_distribution && typeof r.genre_distribution === 'object') {
        return Object.entries(r.genre_distribution)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
      }
      return [];
    }

    /**
     * Maps audio feature intersections → { label, description, reason, background }
     * Deterministic: ordered from most-specific to most-general condition.
     */
    _deriveMood({ energy: E, valence: V, danceability: D, acousticness: A, instrumentalness: I, speechiness: S }) {
      if (E > 0.75 && V > 0.70 && D > 0.65) return {
        label: '⚡ Radiant & Unstoppable',
        description: 'Your music is high-octane, euphoric, and built for momentum.',
        reason: `Energy ${pct(E)}, Valence ${pct(V)}, Danceability ${pct(D)} — a power trifecta.`,
        background: 'linear-gradient(135deg, #0a2a0a, #1a4a1a)',
      };
      if (E > 0.75 && V < 0.40) return {
        label: '🔥 Intense & Driven',
        description: 'Raw power and emotional weight — music as fuel.',
        reason: `High energy (${pct(E)}) + low valence (${pct(V)}) signals hard-hitting, cathartic listening.`,
        background: 'linear-gradient(135deg, #1a0a0a, #2a0a0a)',
      };
      if (D > 0.75 && E > 0.60) return {
        label: '💃 Born to Dance',
        description: 'Your library is a non-stop dancefloor.',
        reason: `Danceability ${pct(D)}, Energy ${pct(E)} — built for movement.`,
        background: 'linear-gradient(135deg, #1a0a2a, #2a0a3a)',
      };
      if (E < 0.40 && V > 0.60 && A > 0.50) return {
        label: '🌿 Warm & Reflective',
        description: 'Gentle, acoustic, and emotionally open — music as a sanctuary.',
        reason: `Low energy (${pct(E)}), high valence (${pct(V)}), acoustic presence (${pct(A)}).`,
        background: 'linear-gradient(135deg, #0a1a2a, #0a2a3a)',
      };
      if (E < 0.40 && V < 0.40) return {
        label: '🌙 Introspective & Deep',
        description: 'Quiet, moody, and emotionally complex listening patterns.',
        reason: `Low energy (${pct(E)}) + low valence (${pct(V)}) — introspective fingerprint.`,
        background: 'linear-gradient(135deg, #0a0a1a, #0a0a2a)',
      };
      if (I > 0.60) return {
        label: '🎹 Focus-State Listener',
        description: 'Pure sound, no distractions — music for deep immersion.',
        reason: `Instrumentalness ${pct(I)} — deep focus or ambient listening pattern.`,
        background: 'linear-gradient(135deg, #0a0a2a, #1a1a3a)',
      };
      if (S > 0.40) return {
        label: '🎤 Word-Driven',
        description: 'Lyrics and rhymes carry your listening experience.',
        reason: `High speechiness (${pct(S)}) — vocal, lyric-dense preference.`,
        background: 'linear-gradient(135deg, #0a1a2a, #1a2a3a)',
      };
      if (V > 0.70 && E < 0.55) return {
        label: '☀️ Effortlessly Happy',
        description: 'Positivity without the overdrive — feel-good at cruise control.',
        reason: `High valence (${pct(V)}), moderate energy (${pct(E)}).`,
        background: 'linear-gradient(135deg, #0a1a0a, #1a2a0a)',
      };
      return {
        label: '🎵 Balanced Explorer',
        description: 'You move freely across the full emotional spectrum.',
        reason: `Energy ${pct(E)}, Valence ${pct(V)} — a versatile, cross-genre listener.`,
        background: 'linear-gradient(135deg, #0a0a2a, #0a0a3a)',
      };
    }

    /**
     * Derives up to 5 data-grounded trait labels.
     */
    _deriveTraits({ energy: E, valence: V, danceability: D, acousticness: A, instrumentalness: I, speechiness: S }, artists, genres) {
      const t = [];
      if (E > 0.75)      t.push('⚡ High-Energy');
      else if (E < 0.35) t.push('🌊 Low & Mellow');
      else               t.push('🎚️ Mid-Range Energy');

      if (V > 0.70)      t.push('😊 Positive Vibe');
      else if (V < 0.35) t.push('🌑 Dark Edge');
      else               t.push('🎭 Complex Emotions');

      if (D > 0.72) t.push('💃 Dance-Ready');
      else if (D < 0.40) t.push('🎧 Non-Conformist');

      if (A > 0.55) t.push('🎸 Acoustic-Leaning');
      if (I > 0.50) t.push('🎹 Instrumental Lover');
      if (S > 0.35) t.push('🎤 Lyric-Driven');

      if (artists.length > 30)     t.push('🌍 Eclectic Explorer');
      else if (artists.length < 8) t.push('🔁 Devoted Repeater');
      if (genres.length > 5)       t.push('🎼 Genre-Fluid');

      return t.slice(0, 5);
    }

    /**
     * Returns a single archetype object { label, description, reason }.
     */
    _deriveArchetype({ energy: E, valence: V, danceability: D, acousticness: A }, artists, genres) {
      const ac = artists.length, gc = genres.length;
      if (ac > 30 && gc > 6) return { label: 'The Omnivore',  description: 'You consume music voraciously across styles, cultures, and eras.', reason: `${ac} artists, ${gc} genres — statistical outlier in breadth.` };
      if (ac < 8  && E > 0.6) return { label: 'The Devotee',   description: 'You find your sound and commit — hard.',                            reason: `Only ${ac} core artists, all high-energy (${pct(E)}).` };
      if (A > 0.6 && E < 0.45) return { label: 'The Purist',   description: 'Raw, unfiltered musicianship over production spectacle.',            reason: `Acousticness ${pct(A)}, low energy ${pct(E)}.` };
      if (D > 0.7 && V > 0.65) return { label: 'The Hedonist', description: 'Music is your party — every playlist a dancefloor.',                reason: `Danceability ${pct(D)}, Valence ${pct(V)}.` };
      return { label: 'The Wanderer', description: 'No fixed lane — mood over genre, feeling over formula.', reason: `Balanced energy (${pct(E)}) and valence (${pct(V)}) — context-driven.` };
    }

    _deriveSummary(af, artists, genres) {
      const { label } = this._deriveArchetype(af, artists, genres);
      return `${artists.length} artists. ${genres.length} genres. One ${label}.`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // StoryAnimations — CSS-class-only transitions, GPU-friendly, RAF-coordinated
  // ═══════════════════════════════════════════════════════════════════════════
  class StoryAnimations {
    constructor(prefersReduced) {
      this.reduced = prefersReduced;
    }

    /** Append el, make visible, apply entrance animation via CSS classes. */
    enter(el, type) {
      if (this.reduced) { el.classList.add('ms-active'); return Promise.resolve(); }
      el.classList.add(`ms-anim-${type}`, 'ms-active');
      return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.classList.add('ms-enter-active');
          resolve();
        }));
      });
    }

    /** Apply exit CSS class, then remove from DOM after transition completes. */
    exit(el) {
      if (this.reduced || !el?.parentNode) { el?.remove(); return Promise.resolve(); }
      el.classList.add('ms-exit-active');
      el.classList.remove('ms-enter-active');
      return new Promise(resolve => setTimeout(() => { el.remove(); resolve(); }, CONFIG.TRANSITION_MS + 50));
    }

    pauseProgress(bar)  { bar?.querySelector('.ms-seg-active .ms-seg-fill')?.style.setProperty('animation-play-state', 'paused'); }
    resumeProgress(bar) { bar?.querySelector('.ms-seg-active .ms-seg-fill')?.style.setProperty('animation-play-state', 'running'); }

    animateCounter(numEl, target, suffix, duration, trackFn) {
      if (this.reduced) { numEl.textContent = target + suffix; return; }
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        numEl.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target) + suffix;
        if (p < 1) trackFn(requestAnimationFrame(tick));
      };
      trackFn(requestAnimationFrame(tick));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // StorySlides — Config-driven registry: { id, transition, counters?, render(data, insights) }
  // ═══════════════════════════════════════════════════════════════════════════
  class StorySlides {
    static get registry() {
      return [

        // ── Slide 0: Intro ────────────────────────────────────────────────
        {
          id: 'intro', transition: 'fade',
          render(data, ins) {
            const slide = mkSlide('ms-slide-1');
            const pw = mk('div', 'ms-particles');
            const frag = document.createDocumentFragment();
            for (let i = 0; i < CONFIG.NUM_PARTICLES; i++) {
              const dot = mk('div', 'ms-particle');
              dot.style.cssText = `left:${rand(0,100)}%;bottom:${rand(0,100)}%;animation-duration:${rand(8,20)}s;animation-delay:-${rand(0,15)}s;opacity:${(0.3+Math.random()*0.3).toFixed(2)};width:${rand(3,8)}px;height:${rand(3,8)}px`;
              frag.appendChild(dot);
            }
            pw.appendChild(frag); slide.appendChild(pw);
            const c = mk('div', 'ms-center-content');
            c.appendChild(mkText('div', 'ms-title ms-fade-in', 'Your 2026 in Music'));
            c.appendChild(mkText('div', 'ms-subtitle-green ms-fade-in ms-delay-04', ins.displayName));
            slide.appendChild(c);
            return slide;
          },
        },

        // ── Slide 1: Top Artist ───────────────────────────────────────────
        {
          id: 'top-artist', transition: 'zoom',
          render(data, ins) {
            const slide = mkSlide('ms-slide-2 ms-bg-green-radial');
            const c = mk('div', 'ms-center-content');
            c.appendChild(mkText('div', 'ms-label-muted', 'Your most played artist was'));
            c.appendChild(mkText('div', 'ms-artist-name ms-fade-in', ins.topArtistName));
            slide.appendChild(c);
            return slide;
          },
        },

        // ── Slide 2: Mood ─────────────────────────────────────────────────
        {
          id: 'mood', transition: 'fade',
          render(data, ins) {
            const { mood } = ins;
            const slide = mkSlide('ms-slide-3');
            slide.style.background = mood.background;
            const c = mk('div', 'ms-center-content');
            c.appendChild(mkText('div', 'ms-label-muted', 'Your music mood is'));

            const moodEl = mk('div', 'ms-mood-label');
            [...mood.label].forEach((ch, i) => {
              const span = mk('span', 'ms-char');
              span.textContent = ch === ' ' ? '\u00a0' : ch;
              span.style.animationDelay = `${i * 0.05}s`;
              moodEl.appendChild(span);
            });
            c.appendChild(moodEl);

            const desc = mkText('div', 'ms-mood-desc ms-fade-in', mood.description);
            desc.style.animationDelay = `${mood.label.length * 0.05 + 0.2}s`;
            c.appendChild(desc);

            const reason = mkText('div', 'ms-mood-reason ms-fade-in', mood.reason);
            reason.style.animationDelay = `${mood.label.length * 0.05 + 0.5}s`;
            c.appendChild(reason);

            slide.appendChild(c);
            return slide;
          },
        },

        // ── Slide 3: Traits / DNA ─────────────────────────────────────────
        {
          id: 'traits', transition: 'fade',
          render(data, ins) {
            const slide = mkSlide('ms-slide-4');
            const c = mk('div', 'ms-center-content');
            c.appendChild(mkText('div', 'ms-label-muted', 'Your musical DNA'));
            const wrap = mk('div', 'ms-pills-wrap');
            const frag = document.createDocumentFragment();
            ins.traits.forEach((trait, i) => {
              const pill = mkText('span', 'ms-dna-pill', trait);
              pill.style.animationDelay = `${i * 0.15}s`;
              frag.appendChild(pill);
            });
            wrap.appendChild(frag); c.appendChild(wrap); slide.appendChild(c);
            return slide;
          },
        },

        // ── Slide 4: Genre Cloud ──────────────────────────────────────────
        {
          id: 'genres', transition: 'blur',
          render(data, ins) {
            const slide = mkSlide('ms-slide-5');
            slide.appendChild(mkText('div', 'ms-label-muted ms-cloud-label', 'Your top genres'));
            if (!ins.topGenres.length) { slide.appendChild(mkText('div', 'ms-center-content ms-title', 'No genre data')); return slide; }
            const cloudWrap = mk('div', 'ms-cloud-wrap');
            const maxC = Math.max(...ins.topGenres.map(g => g.count || 1));
            const minC = Math.min(...ins.topGenres.map(g => g.count || 1));
            const range = maxC - minC || 1;
            const frag = document.createDocumentFragment();
            ins.topGenres.forEach((genre, i) => {
              const pos = CONFIG.CLOUD_POSITIONS[i] ?? { x: 50, y: 50 };
              const norm = ((genre.count || 1) - minC) / range;
              const word = mkText('div', 'ms-cloud-word ms-fade-in', genre.name ?? genre);
              const opacity = (1 - (i / ins.topGenres.length) * 0.6).toFixed(2);
              word.style.cssText = `font-size:${Math.round(14 + norm * 34)}px;opacity:0;animation-delay:${i * 0.1}s;animation-fill-mode:forwards;left:${pos.x}%;top:${pos.y}%`;
              word.style.setProperty('--final-opacity', opacity);
              frag.appendChild(word);
            });
            cloudWrap.appendChild(frag); slide.appendChild(cloudWrap);
            return slide;
          },
        },

        // ── Slide 5: Stats Counters ───────────────────────────────────────
        {
          id: 'stats', transition: 'fade', counters: true,
          render(data, ins) {
            const slide = mkSlide('ms-slide-6');
            const c = mk('div', 'ms-center-content');
            const row = mk('div', 'ms-counters-row');
            const frag = document.createDocumentFragment();
            [
              { target: ins.artistCount, suffix: '',  label: 'artists explored',  id: 'cnt-artists' },
              { target: ins.genreCount,  suffix: '',  label: 'genres discovered', id: 'cnt-genres'  },
              { target: ins.energyPct,   suffix: '%', label: 'avg energy',        id: 'cnt-energy'  },
            ].forEach(({ target, suffix, label, id }, i) => {
              const wrap = mk('div', 'ms-counter ms-fade-in');
              wrap.style.animationDelay = `${i * 0.2}s`;
              const num = mkText('div', 'ms-counter-num', `0${suffix}`);
              num.id = id; num.dataset.target = target; num.dataset.suffix = suffix;
              wrap.appendChild(num);
              wrap.appendChild(mkText('div', 'ms-counter-label', label));
              frag.appendChild(wrap);
            });
            row.appendChild(frag); c.appendChild(row); slide.appendChild(c);
            return slide;
          },
        },

        // ── Slide 6: Outro ────────────────────────────────────────────────
        {
          id: 'outro', transition: 'fade',
          render(data, ins) {
            const slide = mkSlide('ms-slide-7');
            const c = mk('div', 'ms-center-content');
            c.appendChild(mkText('div', 'ms-title ms-fade-in', "That's your MOODIFY"));
            c.appendChild(mkText('div', 'ms-archetype-label ms-fade-in ms-delay-02', ins.listenerArchetype.label));
            c.appendChild(mkText('div', 'ms-archetype-desc ms-fade-in ms-delay-04', ins.listenerArchetype.description));
            c.appendChild(mkText('div', 'ms-summary-msg ms-fade-in ms-delay-06', ins.summaryMessage));

            const btnRow = mk('div', 'ms-outro-btns ms-fade-in ms-delay-08');
            const shareBtn = mkText('button', 'ms-btn-green', 'Share');
            shareBtn.setAttribute('aria-label', 'Share your MOODIFY Story');
            shareBtn.addEventListener('click', e => e.stopPropagation());

            const closeBtn = mkText('button', 'ms-btn-outline', 'Close');
            closeBtn.setAttribute('aria-label', 'Close MOODIFY Story');
            closeBtn.addEventListener('click', e => {
              e.stopPropagation();
              document.getElementById('moodify-story-root')?.__close?.();
            });
            btnRow.appendChild(shareBtn); btnRow.appendChild(closeBtn);
            c.appendChild(btnRow); slide.appendChild(c);
            return slide;
          },
        },

      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // StoryUI — DOM orchestrator, event handling, virtualized rendering
  // Keeps only prev / current / next slides in the DOM at all times.
  // ═══════════════════════════════════════════════════════════════════════════
  class StoryUI {
    constructor(state, anim, insights) {
      this._state    = state;
      this._anim     = anim;
      this._insights = insights.compute();
      this._registry = StorySlides.registry;
      this._root = this._container = this._progressBar = null;
      this._segments   = [];
      this._domSlots   = new Map(); // idx → DOM element (virtual window)
      this._busy       = false;
      this._touchX     = 0;
      this._handlers   = {};
    }

    mount() {
      this._injectStyles();

      this._root = mk('div', '');
      this._root.id = 'moodify-story-root';
      this._root.setAttribute('role', 'dialog');
      this._root.setAttribute('aria-modal', 'true');
      this._root.setAttribute('aria-label', 'MOODIFY Story');
      this._root.__close = () => this.unmount();

      this._buildProgress();
      this._buildContainer();
      this._buildNavZones();
      this._bindEvents();

      document.body.appendChild(this._root);
      document.body.style.overflow = 'hidden';

      this._state.on('slide:change', ({ prev, next }) => this._onSlideChange(prev, next));
      this._state.on('story:pause',  () => this._anim.pauseProgress(this._progressBar));
      this._state.on('story:resume', () => this._anim.resumeProgress(this._progressBar));

      this._renderWindow(0, null);
      this._updateProgress(0);
      if (!this._anim.reduced) this._state.scheduleAdvance(d => this._navigate(d));
    }

    unmount() {
      this._state.clearTimer();
      this._state.cancelRAFs();
      document.removeEventListener('keydown', this._handlers.keydown);
      document.body.style.overflow = '';
      this._root?.remove();
      document.getElementById('moodify-story-styles')?.remove();
    }

    // ── Navigation ──────────────────────────────────────────────────────────
    _navigate(dir) {
      if (this._busy) return;
      const next = this._state.current + dir;
      if (next < 0) return;
      if (next >= this._state.slideCount) { this.unmount(); return; }
      this._state.cancelRAFs();
      this._state.clearTimer();
      this._state.current = next;
    }

    _goTo(idx) {
      if (idx < 0 || idx >= this._state.slideCount || this._busy) return;
      this._state.cancelRAFs();
      this._state.clearTimer();
      this._state.current = idx;
    }

    // ── Slide change (driven by state event) ────────────────────────────────
    async _onSlideChange(prevIdx, nextIdx) {
      this._busy = true;
      this._updateProgress(nextIdx);
      await this._renderWindow(nextIdx, prevIdx);
      this._busy = false;
      if (!this._anim.reduced) this._state.scheduleAdvance(d => this._navigate(d));
    }

    /**
     * Virtualized render window: only [idx-1, idx, idx+1] exist in DOM.
     * Exit previous, enter current, silently pre-render neighbors.
     */
    async _renderWindow(idx, prevIdx) {
      const keep = new Set(
        [idx - 1, idx, idx + 1].filter(i => i >= 0 && i < this._state.slideCount)
      );

      // Exit the departing slide
      if (prevIdx !== null && this._domSlots.has(prevIdx)) {
        const exiting = this._domSlots.get(prevIdx);
        this._domSlots.delete(prevIdx);
        await this._anim.exit(exiting);
      }

      // Prune any stale slides outside the window
      for (const [i, el] of this._domSlots) {
        if (!keep.has(i)) { el.remove(); this._domSlots.delete(i); }
      }

      // Enter the current slide
      await this._anim.enter(this._ensureSlide(idx), this._registry[idx].transition ?? 'fade');

      // Trigger counters if needed
      if (this._registry[idx].counters) {
        setTimeout(() => this._runCounters(this._domSlots.get(idx)), 400);
      }

      // Silently pre-render neighbors (no animation)
      [idx - 1, idx + 1].forEach(i => {
        if (i >= 0 && i < this._state.slideCount && !this._domSlots.has(i)) this._ensureSlide(i);
      });
    }

    _ensureSlide(idx) {
      if (this._domSlots.has(idx)) return this._domSlots.get(idx);
      const el = this._registry[idx].render(this._state.data, this._insights);
      el.setAttribute('aria-label', `Slide ${idx + 1} of ${this._state.slideCount}`);
      this._container.appendChild(el);
      this._domSlots.set(idx, el);
      return el;
    }

    // ── Progress bar ────────────────────────────────────────────────────────
    _buildProgress() {
      this._progressBar = mk('div', 'ms-progress-bar');
      this._progressBar.setAttribute('role', 'tablist');
      this._progressBar.setAttribute('aria-label', 'Story slides');
      const frag = document.createDocumentFragment();
      this._registry.forEach((_, i) => {
        const seg = mk('div', 'ms-seg');
        seg.setAttribute('role', 'tab');
        seg.setAttribute('aria-label', `Slide ${i + 1}`);
        seg.setAttribute('tabindex', '0');
        seg.innerHTML = '<div class="ms-seg-fill"></div>';
        seg.addEventListener('click', () => this._goTo(i));
        seg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._goTo(i); });
        frag.appendChild(seg);
        this._segments.push(seg);
      });
      this._progressBar.appendChild(frag);
      this._root.appendChild(this._progressBar);
    }

    _updateProgress(idx) {
      this._segments.forEach((seg, i) => {
        seg.classList.remove('ms-seg-active', 'ms-seg-done');
        seg.setAttribute('aria-selected', String(i === idx));
        if (i < idx)      seg.classList.add('ms-seg-done');
        else if (i === idx) seg.classList.add('ms-seg-active');
      });
    }

    _buildContainer() {
      this._container = mk('div', 'ms-slide-container');
      this._container.setAttribute('aria-live', 'polite');
      this._root.appendChild(this._container);
    }

    _buildNavZones() {
      const mkZone = (cls, label, dir) => {
        const z = mk('div', `ms-zone ${cls}`);
        z.setAttribute('role', 'button'); z.setAttribute('aria-label', label); z.setAttribute('tabindex', '-1');
        z.addEventListener('click', () => this._navigate(dir));
        this._root.appendChild(z);
      };
      mkZone('ms-zone-left',  'Previous slide', -1);
      mkZone('ms-zone-right', 'Next slide',      1);
    }

    // ── Events ──────────────────────────────────────────────────────────────
    _bindEvents() {
      this._handlers.keydown    = e => this._onKey(e);
      this._handlers.touchstart = e => { this._touchX = e.touches[0].clientX; };
      this._handlers.touchend   = e => {
        const dx = e.changedTouches[0].clientX - this._touchX;
        if (Math.abs(dx) > 50) this._navigate(dx < 0 ? 1 : -1);
      };
      document.addEventListener('keydown', this._handlers.keydown);
      this._root.addEventListener('touchstart', this._handlers.touchstart, { passive: true });
      this._root.addEventListener('touchend',   this._handlers.touchend,   { passive: true });
      this._root.addEventListener('mouseenter', () => { this._state.paused = true;  });
      this._root.addEventListener('mouseleave', () => { this._state.paused = false; });
    }

    _onKey(e) {
      ({ ArrowRight: () => this._navigate(1), ArrowLeft: () => this._navigate(-1), Escape: () => this.unmount(), Home: () => this._goTo(0), End: () => this._goTo(this._state.slideCount - 1) })[e.key]?.();
    }

    _runCounters(slideEl) {
      slideEl?.querySelectorAll('.ms-counter-num').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix ?? '';
        this._anim.animateCounter(el, target, suffix, CONFIG.COUNTER_DURATION_MS, id => this._state.trackRAF(id));
      });
    }

    // ── Style injection ──────────────────────────────────────────────────────
    _injectStyles() {
      if (document.getElementById('moodify-story-styles')) return;
      const s = document.createElement('style');
      s.id = 'moodify-story-styles';
      s.textContent = STORY_CSS;
      document.head.appendChild(s);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS — Single source of truth, separated from JS logic
  // ═══════════════════════════════════════════════════════════════════════════
  const STORY_CSS = `
    #moodify-story-root {
      position:fixed;inset:0;z-index:9999;background:#000;
      font-family:'Inter',-apple-system,sans-serif;color:#fff;
      overflow:hidden;user-select:none;-webkit-user-select:none;
    }

    /* ── Progress ── */
    .ms-progress-bar { position:absolute;top:0;left:0;right:0;height:4px;display:flex;gap:4px;padding:0 4px;z-index:10;box-sizing:border-box; }
    .ms-seg { flex:1;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;cursor:pointer; }
    .ms-seg-fill { height:100%;width:0%;background:#1DB954;border-radius:2px; }
    .ms-seg-done .ms-seg-fill { width:100%; }
    .ms-seg-active .ms-seg-fill { animation:msFillBar ${CONFIG.SLIDE_DURATION_MS}ms linear forwards; }
    .ms-seg:focus-visible { outline:2px solid #1DB954;outline-offset:2px; }

    /* ── Slide container & slides ── */
    .ms-slide-container { position:absolute;inset:0; }
    .ms-slide { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;visibility:hidden;opacity:0;will-change:transform,opacity,filter; }
    .ms-slide.ms-active { visibility:visible; }

    /* ── Transitions (CSS-class-only, GPU-friendly) ── */
    .ms-anim-fade { transition:opacity ${CONFIG.TRANSITION_MS}ms ease; }
    .ms-anim-fade.ms-enter-active { opacity:1; }
    .ms-anim-zoom { transform:scale(0.88);transition:opacity ${CONFIG.TRANSITION_MS}ms ease,transform 0.6s cubic-bezier(0.34,1.56,0.64,1); }
    .ms-anim-zoom.ms-enter-active { transform:scale(1);opacity:1; }
    .ms-anim-blur { filter:blur(20px);transition:opacity ${CONFIG.TRANSITION_MS}ms ease,filter 0.5s ease; }
    .ms-anim-blur.ms-enter-active { filter:blur(0px);opacity:1; }
    .ms-exit-active { opacity:0!important;pointer-events:none;transition:opacity ${CONFIG.TRANSITION_MS}ms ease!important; }

    /* ── Nav zones ── */
    .ms-zone { position:absolute;top:0;bottom:0;width:40%;z-index:5;cursor:pointer; }
    .ms-zone-left { left:0; } .ms-zone-right { right:0; }

    /* ── Layout ── */
    .ms-center-content { text-align:center;padding:40px 24px;max-width:800px;width:100%;position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:16px; }

    /* ── Typography ── */
    .ms-title           { font-size:clamp(36px,6vw,72px);font-weight:800;line-height:1.1;letter-spacing:-1px; }
    .ms-subtitle        { font-size:clamp(14px,2vw,18px);color:rgba(255,255,255,0.6);line-height:1.5; }
    .ms-subtitle-green  { font-size:clamp(18px,3vw,28px);font-weight:600;color:#1DB954; }
    .ms-label-muted     { font-size:16px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.1em;font-weight:500; }
    .ms-artist-name     { font-size:clamp(48px,8vw,96px);font-weight:900;line-height:1;letter-spacing:-2px;margin-top:12px; }
    .ms-mood-label      { font-size:clamp(40px,7vw,80px);font-weight:900;line-height:1.1;letter-spacing:-1px;margin-top:8px; }
    .ms-mood-desc       { font-size:16px;color:rgba(255,255,255,0.65);max-width:480px;line-height:1.6; }
    .ms-mood-reason     { font-size:12px;color:rgba(255,255,255,0.3);max-width:480px;line-height:1.5;font-style:italic;margin-top:-4px; }
    .ms-archetype-label { font-size:clamp(22px,3.5vw,36px);font-weight:700;color:#1DB954;letter-spacing:-0.5px; }
    .ms-archetype-desc  { font-size:15px;color:rgba(255,255,255,0.55);max-width:460px;line-height:1.6; }
    .ms-summary-msg     { font-size:13px;color:rgba(255,255,255,0.35);letter-spacing:0.05em;margin-top:4px; }

    /* ── Keyframes ── */
    @keyframes msFadeIn     { from{opacity:0}to{opacity:1} }
    @keyframes msFillBar    { from{width:0%}to{width:100%} }
    @keyframes msCharIn     { from{opacity:0}to{opacity:1} }
    @keyframes msFlyIn      { from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1} }
    @keyframes msCloudIn    { from{opacity:0}to{opacity:var(--final-opacity,0.8)} }
    @keyframes msFloatUp    { 0%{transform:translateY(0);opacity:var(--p-opacity,0.4)}100%{transform:translateY(-110vh);opacity:0} }
    @keyframes msGradientCycle { 0%,100%{background-position:0% 50%}50%{background-position:100% 50%} }
    @keyframes msPulse      { 0%,100%{box-shadow:0 0 12px rgba(29,185,84,0.4)}50%{box-shadow:0 0 24px rgba(29,185,84,0.7)} }

    .ms-fade-in  { animation:msFadeIn 0.6s ease forwards;opacity:0; }
    .ms-delay-02 { animation-delay:.2s; }
    .ms-delay-04 { animation-delay:.4s; }
    .ms-delay-06 { animation-delay:.6s; }
    .ms-delay-08 { animation-delay:.8s; }
    .ms-char     { display:inline;opacity:0;animation:msCharIn 0.15s ease forwards; }

    /* ── Slide-specific ── */
    .ms-bg-green-radial { background:radial-gradient(ellipse at center,rgba(29,185,84,0.18) 0%,#000 70%); }
    .ms-particles { position:absolute;inset:0;pointer-events:none;overflow:hidden; }
    .ms-particle  { position:absolute;border-radius:50%;background:#1DB954;animation:msFloatUp linear infinite;will-change:transform; }

    .ms-pills-wrap  { display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:12px;max-width:700px; }
    .ms-dna-pill    { display:inline-block;padding:14px 28px;font-size:18px;font-weight:600;background:rgba(29,185,84,0.15);border:1px solid rgba(29,185,84,0.4);border-radius:999px;opacity:0;animation:msFlyIn 0.5s ease forwards; }

    .ms-cloud-label { position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:3; }
    .ms-cloud-wrap  { position:absolute;inset:0; }
    .ms-cloud-word  { position:absolute;transform:translate(-50%,-50%);font-weight:700;white-space:nowrap;animation:msCloudIn 0.6s ease forwards;cursor:default;color:#fff; }

    .ms-slide-6 { background:linear-gradient(rgba(29,185,84,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,185,84,0.05) 1px,transparent 1px),#000;background-size:48px 48px; }
    .ms-counters-row { display:flex;gap:clamp(24px,6vw,80px);align-items:flex-start;flex-wrap:wrap;justify-content:center;margin-top:8px; }
    .ms-counter      { display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;animation:msFadeIn 0.6s ease forwards; }
    .ms-counter-num  { font-size:clamp(48px,8vw,80px);font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-2px; }
    .ms-counter-label{ font-size:14px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em; }

    .ms-slide-7  { background:linear-gradient(135deg,#0a1f0a,#0a1a2a,#0f0a2a,#0a1f0a);background-size:400% 400%;animation:msGradientCycle 6s ease infinite; }
    .ms-outro-btns { display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;justify-content:center;opacity:0;animation:msFadeIn 0.6s ease forwards; }

    .ms-btn-green,.ms-btn-outline { padding:12px 32px;border-radius:999px;font-size:16px;font-weight:700;cursor:pointer;transition:transform 0.15s ease,box-shadow 0.15s ease;font-family:inherit;position:relative;z-index:10; }
    .ms-btn-green   { background:#1DB954;color:#000;border:none; }
    .ms-btn-outline { background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.35); }
    .ms-btn-green:hover   { transform:scale(1.04);box-shadow:0 0 20px rgba(29,185,84,0.4); }
    .ms-btn-outline:hover { transform:scale(1.04);opacity:.85; }
    .ms-btn-green:focus-visible,.ms-btn-outline:focus-visible { outline:2px solid #1DB954;outline-offset:3px; }

    /* ── Story trigger btn (dashboard) ── */
    .story-trigger-btn { background:#1DB954;color:#000;font-weight:700;font-size:13px;padding:10px 24px;border-radius:999px;border:none;cursor:pointer;font-family:'Inter',sans-serif;animation:msPulse 2s ease-in-out infinite;transition:transform .15s ease;white-space:nowrap;flex-shrink:0; }
    .story-trigger-btn:hover { transform:scale(1.05);animation-play-state:paused; }

    /* ── Reduced motion ── */
    @media (prefers-reduced-motion:reduce) {
      .ms-anim-zoom,.ms-anim-blur,.ms-anim-fade,
      .ms-seg-active .ms-seg-fill,.ms-particle,
      .ms-fade-in,.ms-char,.ms-dna-pill,.ms-cloud-word,
      .ms-slide-7 { animation:none!important;transition:none!important;transform:none!important;filter:none!important; }
      .ms-slide.ms-active { opacity:1;visibility:visible; }
      .ms-exit-active { opacity:0!important; }
      .ms-cloud-word { opacity:var(--final-opacity,0.8)!important; }
    }
  `;

  // ═══════════════════════════════════════════════════════════════════════════
  // Error state — shown when data is absent / malformed
  // ═══════════════════════════════════════════════════════════════════════════
  function showErrorStory() {
    if (document.getElementById('moodify-story-root')) return;
    const s = document.createElement('style');
    s.id = 'moodify-story-styles'; s.textContent = STORY_CSS;
    document.head.appendChild(s);
    const root = mk('div', ''); root.id = 'moodify-story-root';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const c = mk('div', '');
    c.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
    c.appendChild(mkText('div', 'ms-title', '🎵 No data yet — listen to more music!'));
    const btn = mkText('button', 'ms-btn-outline', 'Close');
    btn.addEventListener('click', () => { root.remove(); s.remove(); });
    c.appendChild(btn); root.appendChild(c); document.body.appendChild(root);
    const esc = e => { if (e.key === 'Escape') { root.remove(); s.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public entry point — drop-in compatible with original API
  // ═══════════════════════════════════════════════════════════════════════════
  function initStory(data) {
    if (!data?.top_artists?.length) { showErrorStory(); return; }
    if (document.getElementById('moodify-story-root')) return;

    const reduced    = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state      = new StoryState(data);
    const insights   = new StoryInsights(data);
    const animations = new StoryAnimations(reduced);
    const ui         = new StoryUI(state, animations, insights);

    ui.mount();
  }

  window.initStory = initStory;

})();
