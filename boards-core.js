(function () {
  'use strict';

  const VERSION = 'v3';
  const KEY = {
    config: 'ksBoardsActiveSet' + VERSION,
    history: 'ksBoardsHistory' + VERSION,
    settings: 'ksBoardsSettings' + VERSION,
    app: 'kaplanBoardPrepState'
  };
  const fullBank = typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS) ? QUESTIONS.slice() : [];
  const byId = new Map(fullBank.map(function (q) { return [q.id, q]; }));

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function appState() {
    const state = readJson(KEY.app, {});
    state.answered = state.answered || {};
    state.testAnswers = state.testAnswers || {};
    state.testSubmitted = state.testSubmitted || {};
    state.flagged = state.flagged || {};
    state.missed = state.missed || {};
    return state;
  }

  function activeConfig() {
    const config = readJson(KEY.config, null);
    if (!config || !Array.isArray(config.ids)) return null;
    config.ids = config.ids.filter(function (id) { return byId.has(id); });
    return config.ids.length ? config : null;
  }

  function historyState() {
    const history = readJson(KEY.history, {});
    return history && typeof history === 'object' ? history : {};
  }

  function clampInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function clampQuestionCount(value) {
    return clampInteger(value, 40, 1, Math.max(1, fullBank.length));
  }

  function boardPaceSeconds(count) {
    return Math.max(1, Math.round(count * (500 * 60 / 425)));
  }

  function splitDuration(totalSeconds) {
    const total = Math.max(0, Math.round(totalSeconds));
    return {
      hours: Math.floor(total / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60
    };
  }

  function formatClock(totalSeconds) {
    const total = Math.max(0, Math.ceil(totalSeconds));
    const two = function (n) { return String(n).padStart(2, '0'); };
    return two(Math.floor(total / 3600)) + ':' + two(Math.floor((total % 3600) / 60)) + ':' + two(total % 60);
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function statusForQuestion(q, state, history, config) {
    const stored = history[q.id];
    if (stored && stored.status) return stored.status;
    if (state.answered[q.id]) return state.answered[q.id].correct ? 'correct' : 'incorrect';
    if (config && config.status === 'in_progress' && config.mode === 'test' && state.testAnswers[q.id]) return 'answered';
    return 'unused';
  }

  function saveTutorHistory(ids) {
    const state = appState();
    const history = historyState();
    const now = Date.now();
    ids.forEach(function (id) {
      const answer = state.answered[id];
      if (answer) history[id] = { status: answer.correct ? 'correct' : 'incorrect', timestamp: now, source: 'tutor' };
    });
    writeJson(KEY.history, history);
  }

  function saveSubmittedTestHistory(ids) {
    const state = appState();
    if (!state.testSubmitted['all|study']) return false;
    const history = historyState();
    const now = Date.now();
    ids.forEach(function (id) {
      const q = byId.get(id);
      if (!q) return;
      const selected = state.testAnswers[id];
      history[id] = {
        status: !selected ? 'omitted' : (selected === q.correctLetter ? 'correct' : 'incorrect'),
        timestamp: now,
        source: 'test'
      };
    });
    writeJson(KEY.history, history);
    return true;
  }

  function syncActiveSetResults() {
    const config = activeConfig();
    if (!config) return;
    if (config.mode === 'quiz') {
      saveTutorHistory(config.ids);
    } else if (saveSubmittedTestHistory(config.ids)) {
      config.status = 'completed';
      config.completedAt = config.completedAt || Date.now();
      writeJson(KEY.config, config);
    }
  }

  function countProgress(config, state) {
    if (!config) return 0;
    const source = config.mode === 'test' ? state.testAnswers : state.answered;
    return config.ids.reduce(function (count, id) { return count + (source[id] ? 1 : 0); }, 0);
  }

  function clearAnswersForSet(ids, mode) {
    const state = appState();
    ids.forEach(function (id) {
      delete state.answered[id];
      delete state.testAnswers[id];
    });
    state.testSubmitted = {};
    state.chapter = 'all';
    state.view = 'study';
    state.mode = mode;
    state.index = 0;
    state.atSummary = false;
    writeJson(KEY.app, state);
  }

  function createConfig(ids, mode, timed, durationSeconds, kind) {
    clearAnswersForSet(ids, mode);
    const now = Date.now();
    const config = {
      version: VERSION,
      ids: ids,
      mode: mode,
      timed: !!timed,
      durationSeconds: timed ? durationSeconds : null,
      endAt: timed ? now + durationSeconds * 1000 : null,
      status: 'in_progress',
      kind: kind || 'random',
      createdAt: now,
      lastOpenedAt: now
    };
    writeJson(KEY.config, config);
    return config;
  }

  window.BoardsCore = {
    VERSION: VERSION,
    KEY: KEY,
    fullBank: fullBank,
    byId: byId,
    readJson: readJson,
    writeJson: writeJson,
    appState: appState,
    activeConfig: activeConfig,
    historyState: historyState,
    clampInteger: clampInteger,
    clampQuestionCount: clampQuestionCount,
    boardPaceSeconds: boardPaceSeconds,
    splitDuration: splitDuration,
    formatClock: formatClock,
    shuffle: shuffle,
    statusForQuestion: statusForQuestion,
    syncActiveSetResults: syncActiveSetResults,
    countProgress: countProgress,
    createConfig: createConfig
  };
})();
