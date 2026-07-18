(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  if (!Config || !Store || !C) return;

  const CONFIG_KEY = Config.storage.keys.config;
  const APP_KEY = Config.storage.keys.app;
  const TESTS_KEY = Config.storage.keys.tests;
  const examFrame = document.getElementById('examFrame');
  const examScreen = document.getElementById('examScreen');

  let frameDocument = null;
  let observer = null;
  let pollTimer = null;
  let segment = null;
  let enriching = false;

  function roundMilliseconds(value) {
    return Math.max(0, Math.round((Number(value) || 0) * 1000) / 1000);
  }

  function readConfig() {
    const config = Store.read(CONFIG_KEY, null);
    return config && Array.isArray(config.ids) ? config : null;
  }

  function readState() {
    const state = Store.read(APP_KEY, {});
    return state && typeof state === 'object' ? state : {};
  }

  function currentContext() {
    const config = readConfig();
    if (!config || config.status !== 'in_progress' || !examScreen || examScreen.hidden) return null;
    const state = readState();
    if (state.atSummary || document.visibilityState === 'hidden') return null;
    const index = Number(state.index);
    if (!Number.isInteger(index) || index < 0 || index >= config.ids.length) return null;
    const questionId = String(config.ids[index] || '');
    return questionId ? { config: config, state: state, questionId: questionId } : null;
  }

  function ensureEntry(config, questionId, wallTime) {
    config.questionTiming = config.questionTiming && typeof config.questionTiming === 'object' ? config.questionTiming : {};
    const entry = config.questionTiming[questionId] && typeof config.questionTiming[questionId] === 'object'
      ? config.questionTiming[questionId]
      : {
          activeMilliseconds: 0,
          firstViewedAt: wallTime,
          lastViewedAt: wallTime,
          firstResponseMilliseconds: null,
          firstResponseAt: null,
          finalResponseAt: null,
          answerChanges: [],
          visits: 0
        };
    if (!entry.firstViewedAt) entry.firstViewedAt = wallTime;
    if (!Array.isArray(entry.answerChanges)) entry.answerChanges = [];
    if (!Number.isFinite(Number(entry.visits))) entry.visits = 0;
    config.questionTiming[questionId] = entry;
    config.timingPrecision = 'milliseconds';
    return entry;
  }

  function saveConfig(config, reason) {
    Store.write(CONFIG_KEY, config, { reason: reason || 'Precise question timing updated' });
  }

  function commitSegment(reason, nowMono, nowWall) {
    if (!segment) return;
    const config = readConfig();
    const endedMono = Number.isFinite(nowMono) ? nowMono : performance.now();
    const endedWall = Number.isFinite(nowWall) ? nowWall : Date.now();
    if (config && config.setId === segment.setId) {
      const entry = ensureEntry(config, segment.questionId, segment.startedWall);
      entry.activeMilliseconds = roundMilliseconds(Number(entry.activeMilliseconds) + Math.max(0, endedMono - segment.startedMono));
      entry.lastViewedAt = endedWall;
      saveConfig(config, reason || 'Precise question segment completed');
    }
    segment = null;
  }

  function startCurrent(reason) {
    const context = currentContext();
    if (!context) {
      commitSegment(reason || 'Question view paused');
      return;
    }
    if (segment && segment.setId === context.config.setId && segment.questionId === context.questionId) return;
    commitSegment('Question changed');
    const wall = Date.now();
    const entry = ensureEntry(context.config, context.questionId, wall);
    entry.visits += 1;
    entry.lastViewedAt = wall;
    saveConfig(context.config, reason || 'Precise question view started');
    segment = {
      setId: context.config.setId,
      questionId: context.questionId,
      startedMono: performance.now(),
      startedWall: wall
    };
  }

  function elapsedForCurrent(questionId, nowMono) {
    const config = readConfig();
    if (!config) return 0;
    const entry = ensureEntry(config, questionId, Date.now());
    let elapsed = Number(entry.activeMilliseconds) || 0;
    if (segment && segment.setId === config.setId && segment.questionId === questionId) {
      elapsed += Math.max(0, (Number.isFinite(nowMono) ? nowMono : performance.now()) - segment.startedMono);
    }
    return roundMilliseconds(elapsed);
  }

  function recordAnswer(letter) {
    const context = currentContext();
    if (!context) return;
    startCurrent('Answer timing started');
    const nowMono = performance.now();
    const nowWall = Date.now();
    const config = readConfig();
    if (!config || config.setId !== context.config.setId) return;
    const entry = ensureEntry(config, context.questionId, nowWall);
    const elapsed = elapsedForCurrent(context.questionId, nowMono);
    if (entry.firstResponseMilliseconds == null) {
      entry.firstResponseMilliseconds = elapsed;
      entry.firstResponseAt = nowWall;
    }
    entry.finalResponseAt = nowWall;
    const last = entry.answerChanges[entry.answerChanges.length - 1];
    if (!last || last.selectedLetter !== letter) {
      entry.answerChanges.push({
        selectedLetter: letter,
        at: nowWall,
        elapsedMilliseconds: elapsed
      });
    }
    saveConfig(config, 'Precise answer event recorded');
  }

  function handleFrameClick(event) {
    const target = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!target) return;
    if (target.classList.contains('choice')) {
      recordAnswer(target.getAttribute('data-letter'));
      return;
    }
    if (target.matches('#nextBtn,#prevBtn,.qnav-pill,#boardsDashboard,#boardsEndSet,#finishTestBtn')) {
      commitSegment('Question navigation recorded', performance.now(), Date.now());
      setTimeout(function () { startCurrent('Question navigation completed'); }, 0);
    }
  }

  function attachFrame() {
    detachFrame();
    try {
      frameDocument = examFrame && examFrame.contentDocument;
      if (!frameDocument || !frameDocument.body) return;
      frameDocument.addEventListener('click', handleFrameClick, true);
      frameDocument.addEventListener('visibilitychange', function () {
        if (frameDocument.hidden) commitSegment('Study frame hidden');
        else startCurrent('Study frame visible');
      });
      const content = frameDocument.getElementById('content');
      if (content) {
        observer = new MutationObserver(function () { setTimeout(function () { startCurrent('Question render detected'); }, 0); });
        observer.observe(content, { childList: true, subtree: true });
      }
      startCurrent('Study frame loaded');
      pollTimer = setInterval(function () { startCurrent('Timing consistency check'); }, 250);
    } catch (error) {
      console.error('Exact timing could not attach to the study frame.', error);
    }
  }

  function detachFrame() {
    commitSegment('Study frame detached');
    if (observer) observer.disconnect();
    observer = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (frameDocument) frameDocument.removeEventListener('click', handleFrameClick, true);
    frameDocument = null;
  }

  function enrichSavedTests() {
    if (enriching) return;
    const config = readConfig();
    if (!config || !config.setId || !config.questionTiming) return;
    const tests = Store.read(TESTS_KEY, []);
    if (!Array.isArray(tests)) return;
    const index = tests.findIndex(function (test) { return test && test.setId === config.setId; });
    if (index < 0) return;
    const test = tests[index];
    let changed = test.timingPrecision !== 'milliseconds';
    let totalMilliseconds = 0;
    let timedQuestions = 0;

    Object.keys(test.results || {}).forEach(function (questionId) {
      const timing = config.questionTiming[questionId];
      const result = test.results[questionId];
      if (!timing || !result) return;
      const milliseconds = roundMilliseconds(timing.activeMilliseconds);
      if (result.milliseconds !== milliseconds) changed = true;
      result.milliseconds = milliseconds;
      result.seconds = Math.round((milliseconds / 1000) * 1000) / 1000;
      result.firstResponseMilliseconds = timing.firstResponseMilliseconds == null ? null : roundMilliseconds(timing.firstResponseMilliseconds);
      result.firstViewedAt = timing.firstViewedAt || null;
      result.lastViewedAt = timing.lastViewedAt || null;
      result.firstResponseAt = timing.firstResponseAt || null;
      result.finalResponseAt = timing.finalResponseAt || null;
      result.visits = Number(timing.visits) || 0;
      result.answerChanges = Array.isArray(timing.answerChanges) ? timing.answerChanges.slice() : [];
      if (result.status !== 'unused') {
        totalMilliseconds += milliseconds;
        timedQuestions += 1;
      }
    });

    test.bankId = test.bankId || Config.platform.bankId;
    test.timingPrecision = 'milliseconds';
    test.activeQuestionMilliseconds = roundMilliseconds(totalMilliseconds);
    test.averageMilliseconds = timedQuestions ? roundMilliseconds(totalMilliseconds / timedQuestions) : 0;
    test.averageSeconds = Math.round((test.averageMilliseconds / 1000) * 1000) / 1000;
    test.timingCapturedAt = Date.now();

    if (!changed && test.activeQuestionMilliseconds === totalMilliseconds) return;
    enriching = true;
    tests[index] = test;
    Store.write(TESTS_KEY, tests, { reason: 'Saved test enriched with millisecond timing' });
    enriching = false;
  }

  function formatExact(milliseconds) {
    return (Math.max(0, Number(milliseconds) || 0) / 1000).toFixed(3) + ' s exact';
  }

  function enhanceReviewDisplay(button) {
    const id = button && button.getAttribute('data-id');
    if (!id) return;
    setTimeout(function () {
      const test = (Store.read(TESTS_KEY, []) || []).find(function (item) { return item && item.setId === id; });
      const detail = document.getElementById('historyDetail');
      if (!test || !detail) return;
      const summaries = detail.querySelectorAll('details.review-question > summary');
      summaries.forEach(function (summary, index) {
        const questionId = test.ids && test.ids[index];
        const result = questionId && test.results && test.results[questionId];
        if (!result || result.milliseconds == null) return;
        const base = summary.textContent.replace(/\s·\s\d+(?:\.\d+)?(?:\s*sec|m\s*\d+s|h\s*\d+m).*$/i, '');
        summary.textContent = base + ' · ' + formatExact(result.milliseconds);
      });
      const reviewSummary = detail.querySelector('.review-summary');
      if (reviewSummary && test.averageMilliseconds != null && !reviewSummary.querySelector('.exact-average')) {
        const line = document.createElement('span');
        line.className = 'exact-average';
        line.textContent = formatExact(test.averageMilliseconds) + ' average active time';
        reviewSummary.appendChild(line);
      }
    }, 80);
  }

  function init() {
    if (examFrame) examFrame.addEventListener('load', function () { setTimeout(attachFrame, 0); });
    document.addEventListener('click', function (event) {
      const review = event.target && event.target.closest && event.target.closest('.review-history');
      if (review) enhanceReviewDisplay(review);
    }, true);
    Store.subscribe(function (change) {
      if (change.key === TESTS_KEY || (change.key === CONFIG_KEY && change.reason !== 'Precise question timing updated')) {
        setTimeout(enrichSavedTests, 0);
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') commitSegment('Browser tab hidden');
      else startCurrent('Browser tab visible');
    });
    window.addEventListener('beforeunload', function () {
      commitSegment('Page unloading');
      enrichSavedTests();
    });
    window.addEventListener('message', function () {
      setTimeout(function () {
        if (examScreen && examScreen.hidden) commitSegment('Returned to dashboard');
        enrichSavedTests();
      }, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsExactTiming = Object.freeze({
    flush: commitSegment,
    enrichSavedTests: enrichSavedTests,
    formatExact: formatExact
  });
})();
