(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Registry = window.BoardsBankRegistry;
  if (!Config || !Store || !Registry) throw new Error('BoardsConfig, BoardsStore, and BoardsBankRegistry must load before BoardsCore.');

  const VERSION = 'v3';
  const KEY = Config.storage.keys;
  const fullBank = Registry.activeQuestions();
  const byId = new Map(fullBank.map(function (question) { return [question.id, question]; }));

  function readJson(key, fallback) {
    return Store.read(key, fallback);
  }

  function writeJson(key, value, options) {
    return Store.write(key, value, options);
  }

  function removeJson(key, options) {
    Store.remove(key, options);
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
    if (config.bankId && config.bankId !== Config.platform.bankId) return null;
    config.ids = config.ids.filter(function (id) { return byId.has(id); });
    return config.ids.length ? config : null;
  }

  function historyState() {
    const history = readJson(KEY.history, {});
    return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
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
    const two = function (number) { return String(number).padStart(2, '0'); };
    return two(Math.floor(total / 3600)) + ':' + two(Math.floor((total % 3600) / 60)) + ':' + two(total % 60);
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      const temporary = copy[index];
      copy[index] = copy[target];
      copy[target] = temporary;
    }
    return copy;
  }

  function statusForQuestion(question, state, history, config) {
    if (config && config.status === 'in_progress' && config.mode === 'test' && state.testAnswers[question.id]) return 'answered';
    if (state.answered[question.id]) return state.answered[question.id].correct ? 'correct' : 'incorrect';
    const stored = history[question.id];
    if (stored && stored.status) return stored.status;
    return 'unused';
  }

  function saveTutorHistory(ids) {
    const state = appState();
    const history = historyState();
    const now = Date.now();
    let changed = false;
    ids.forEach(function (id) {
      const answer = state.answered[id];
      if (!answer) return;
      const next = { status: answer.correct ? 'correct' : 'incorrect', timestamp: now, source: 'tutor', bankId: Config.platform.bankId };
      if (!history[id] || history[id].status !== next.status) changed = true;
      history[id] = next;
    });
    if (changed) writeJson(KEY.history, history, { reason: 'Tutor results updated' });
  }

  function saveSubmittedTestHistory(ids) {
    const state = appState();
    if (!state.testSubmitted['all|study']) return false;
    const history = historyState();
    const now = Date.now();
    let changed = false;
    ids.forEach(function (id) {
      const question = byId.get(id);
      if (!question) return;
      const selected = state.testAnswers[id];
      const status = !selected ? 'omitted' : (selected === question.correctLetter ? 'correct' : 'incorrect');
      if (!history[id] || history[id].status !== status || history[id].source !== 'test') {
        history[id] = { status: status, timestamp: now, source: 'test', bankId: Config.platform.bankId };
        changed = true;
      }
    });
    if (changed) writeJson(KEY.history, history, { reason: 'Test results updated' });
    return true;
  }

  function syncActiveSetResults() {
    const config = activeConfig();
    if (!config) return;
    if (config.mode === 'quiz') {
      saveTutorHistory(config.ids);
      return;
    }
    if (saveSubmittedTestHistory(config.ids) && config.status !== 'completed') {
      config.status = 'completed';
      config.completedAt = config.completedAt || Date.now();
      writeJson(KEY.config, config, { reason: 'Test completed' });
      Store.milestone('Test completed', { bankId: Config.platform.bankId, setId: config.setId, total: config.ids.length });
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
    state.bankId = Config.platform.bankId;
    writeJson(KEY.app, state, { reason: 'New practice set prepared' });
  }

  function createConfig(ids, mode, timed, durationSeconds, kind) {
    clearAnswersForSet(ids, mode);
    const now = Date.now();
    const config = {
      version: VERSION,
      schemaVersion: Config.schemaVersion,
      bankId: Config.platform.bankId,
      setId: Config.platform.bankId + '-set-' + now + '-' + Math.random().toString(36).slice(2, 8),
      ids: ids.slice(),
      mode: mode,
      timed: !!timed,
      durationSeconds: timed ? durationSeconds : null,
      endAt: timed ? now + durationSeconds * 1000 : null,
      status: 'in_progress',
      kind: kind || 'random',
      createdAt: now,
      startedAt: now,
      lastOpenedAt: now,
      questionTimes: {}
    };
    writeJson(KEY.config, config, { reason: 'Practice set created' });
    Store.milestone('Practice set created', { bankId: Config.platform.bankId, setId: config.setId, total: ids.length, mode: mode });
    return config;
  }

  window.BoardsCore = Object.freeze({
    VERSION: VERSION,
    KEY: KEY,
    bankId: Config.platform.bankId,
    bankDefinition: Registry.activeBank,
    fullBank: fullBank,
    byId: byId,
    readJson: readJson,
    writeJson: writeJson,
    removeJson: removeJson,
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
  });
})();
