(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const Views = window.BoardsDashboardViews;
  const Registry = window.BoardsDashboardRegistry;
  if (!Config || !Store || !C || !Views || !Registry) throw new Error('Analytics dependencies are unavailable.');

  const TESTS_KEY = Config.storage.keys.tests;
  const DELETED_KEY = Config.storage.keys.deletedTests;
  const CONFIG_KEY = Config.storage.keys.config;
  const APP_KEY = Config.storage.keys.app;
  const byId = C.byId;

  let renderTimer = null;
  let pendingTimes = {};
  let pendingSetId = null;
  let secondsSinceFlush = 0;

  function formatSeconds(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    if (seconds < 60) return seconds + ' sec';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes < 60) return minutes + 'm ' + String(remainder).padStart(2, '0') + 's';
    return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  }

  function formatDate(value) {
    return new Date(value).toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function tests() {
    const value = Store.read(TESTS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function deletedTests() {
    const value = Store.read(DELETED_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function saveTests(value, reason) {
    Store.write(TESTS_KEY, value.slice(0, Config.limits.savedTests), { reason: reason || 'Saved-test history updated' });
  }

  function state() {
    const value = Store.read(APP_KEY, {});
    value.answered = value.answered || {};
    value.testAnswers = value.testAnswers || {};
    value.testSubmitted = value.testSubmitted || {};
    value.flagged = value.flagged || {};
    return value;
  }

  function ensureConfig() {
    const config = Store.read(CONFIG_KEY, null);
    if (!config || !Array.isArray(config.ids)) return null;
    let changed = false;
    if (!config.setId) {
      config.setId = 'set-' + (config.createdAt || Date.now());
      changed = true;
    }
    if (!config.questionTimes || typeof config.questionTimes !== 'object') {
      config.questionTimes = {};
      changed = true;
    }
    if (!config.startedAt) {
      config.startedAt = config.createdAt || Date.now();
      changed = true;
    }
    if (changed) Store.write(CONFIG_KEY, config, { reason: 'Upgraded active-set metadata' });
    return config;
  }

  function buildRecord(config, appState) {
    const results = {};
    const categories = {};
    let correct = 0;
    let incorrect = 0;
    let omitted = 0;
    let answered = 0;
    let totalSeconds = 0;

    config.ids.forEach(function (id) {
      const question = byId.get(id);
      if (!question) return;
      let selectedLetter = null;
      let status = 'unused';

      if (config.mode === 'quiz') {
        const answer = appState.answered[id];
        if (answer) {
          selectedLetter = answer.selectedLetter || null;
          status = answer.correct ? 'correct' : 'incorrect';
        }
      } else {
        selectedLetter = appState.testAnswers[id] || null;
        status = !selectedLetter ? 'omitted' : (selectedLetter === question.correctLetter ? 'correct' : 'incorrect');
      }

      const seconds = Math.max(0, Number(config.questionTimes[id]) || 0);
      results[id] = { status: status, selectedLetter: selectedLetter, seconds: seconds };
      if (status === 'correct') { correct += 1; answered += 1; }
      else if (status === 'incorrect') { incorrect += 1; answered += 1; }
      else if (status === 'omitted') omitted += 1;
      if (status !== 'unused') totalSeconds += seconds;

      const categoryKey = String(question.chapter);
      if (!categories[categoryKey]) {
        categories[categoryKey] = {
          chapter: question.chapter,
          title: question.chapterTitle || ('Chapter ' + question.chapter),
          total: 0,
          correct: 0,
          incorrect: 0,
          omitted: 0,
          seconds: 0
        };
      }
      const category = categories[categoryKey];
      if (status !== 'unused') category.total += 1;
      if (status === 'correct') category.correct += 1;
      else if (status === 'incorrect') category.incorrect += 1;
      else if (status === 'omitted') category.omitted += 1;
      if (status !== 'unused') category.seconds += seconds;
    });

    const denominator = config.mode === 'test' ? config.ids.length : answered;
    return {
      schemaVersion: Config.schemaVersion,
      setId: config.setId,
      mode: config.mode,
      timed: !!config.timed,
      kind: config.kind || 'random',
      pool: config.pool || null,
      chapters: Array.isArray(config.chapters) ? config.chapters.slice() : null,
      createdAt: config.createdAt || Date.now(),
      completedAt: config.completedAt || Date.now(),
      total: config.ids.length,
      answered: answered,
      correct: correct,
      incorrect: incorrect,
      omitted: omitted,
      scorePct: denominator ? Math.round(correct / denominator * 1000) / 10 : 0,
      elapsedSeconds: Math.max(0, Math.round(((config.completedAt || Date.now()) - (config.startedAt || config.createdAt || Date.now())) / 1000)),
      averageSeconds: answered ? Math.round(totalSeconds / answered * 10) / 10 : 0,
      ids: config.ids.slice(),
      results: results,
      flagged: Object.assign({}, appState.flagged),
      categories: Object.values(categories).map(function (category) {
        const denominator = category.correct + category.incorrect + category.omitted;
        category.accuracyPct = denominator ? Math.round(category.correct / denominator * 1000) / 10 : 0;
        const timedAnswers = category.correct + category.incorrect;
        category.averageSeconds = timedAnswers ? Math.round(category.seconds / timedAnswers * 10) / 10 : 0;
        return category;
      }).sort(function (left, right) { return left.chapter - right.chapter; })
    };
  }

  function archiveCompleted() {
    flushQuestionTimes();
    const config = ensureConfig();
    if (!config || config.status !== 'completed') return;
    if (deletedTests().indexOf(config.setId) >= 0) return;

    const record = buildRecord(config, state());
    const list = tests();
    const index = list.findIndex(function (item) { return item.setId === record.setId; });
    if (index >= 0 && JSON.stringify(list[index]) === JSON.stringify(record)) return;
    if (index >= 0) list[index] = record;
    else list.unshift(record);
    saveTests(list, 'Completed test archived');
  }

  function accumulateQuestionTime() {
    const config = ensureConfig();
    const exam = document.getElementById('examScreen');
    if (!config || config.status !== 'in_progress' || !exam || exam.hidden) return;
    const appState = state();
    if (appState.atSummary) return;
    const index = Number(appState.index);
    if (!Number.isInteger(index) || index < 0 || index >= config.ids.length) return;
    const id = config.ids[index];
    if (!id) return;

    if (pendingSetId && pendingSetId !== config.setId) pendingTimes = {};
    pendingSetId = config.setId;
    pendingTimes[id] = (Number(pendingTimes[id]) || 0) + 1;
    secondsSinceFlush += 1;
    if (secondsSinceFlush >= 5) flushQuestionTimes();
  }

  function flushQuestionTimes() {
    if (!Object.keys(pendingTimes).length) return;
    const config = ensureConfig();
    if (!config || config.setId !== pendingSetId) {
      pendingTimes = {};
      pendingSetId = null;
      secondsSinceFlush = 0;
      return;
    }
    config.questionTimes = config.questionTimes || {};
    Object.keys(pendingTimes).forEach(function (id) {
      config.questionTimes[id] = (Number(config.questionTimes[id]) || 0) + pendingTimes[id];
    });
    pendingTimes = {};
    secondsSinceFlush = 0;
    Store.write(CONFIG_KEY, config, { reason: 'Question timing updated' });
  }

  function analytics() {
    const list = tests();
    const categories = {};
    let correct = 0;
    let incorrect = 0;
    let omitted = 0;
    let seconds = 0;
    let responses = 0;
    const unique = new Set();

    list.forEach(function (test) {
      Object.entries(test.results || {}).forEach(function (entry) {
        const id = entry[0];
        const result = entry[1];
        if (!result || result.status === 'unused') return;
        unique.add(id);
        if (result.status === 'correct') { correct += 1; responses += 1; }
        else if (result.status === 'incorrect') { incorrect += 1; responses += 1; }
        else if (result.status === 'omitted') omitted += 1;
        seconds += Number(result.seconds) || 0;

        const question = byId.get(id);
        if (!question) return;
        const key = String(question.chapter);
        if (!categories[key]) {
          categories[key] = {
            chapter: question.chapter,
            title: question.chapterTitle || ('Chapter ' + question.chapter),
            attempts: 0,
            correct: 0,
            incorrect: 0,
            omitted: 0,
            seconds: 0
          };
        }
        const category = categories[key];
        category.attempts += 1;
        if (result.status === 'correct') category.correct += 1;
        else if (result.status === 'incorrect') category.incorrect += 1;
        else category.omitted += 1;
        category.seconds += Number(result.seconds) || 0;
      });
    });

    const denominator = correct + incorrect + omitted;
    return {
      tests: list.length,
      unique: unique.size,
      responses: responses,
      accuracy: denominator ? Math.round(correct / denominator * 1000) / 10 : 0,
      average: responses ? Math.round(seconds / responses * 10) / 10 : 0,
      categories: Object.values(categories).map(function (category) {
        const denominator = category.correct + category.incorrect + category.omitted;
        category.accuracy = denominator ? Math.round(category.correct / denominator * 1000) / 10 : 0;
        const timedAnswers = category.correct + category.incorrect;
        category.average = timedAnswers ? Math.round(category.seconds / timedAnswers * 10) / 10 : 0;
        return category;
      }).sort(function (left, right) { return left.chapter - right.chapter; })
    };
  }

  function mountUi() {
    const existing = document.getElementById('analyticsSection');
    if (existing) return existing;
    const wrapper = Views.createAnalyticsSection();
    if (!document.getElementById('testReviewModal')) {
      const modal = Views.createTestReviewModal();
      document.body.appendChild(modal);
      modal.addEventListener('click', function (event) { if (event.target === modal) modal.hidden = true; });
      modal.querySelector('#closeHistoryModal').addEventListener('click', function () { modal.hidden = true; });
    }
    return wrapper;
  }

  function ensureUi() {
    if (document.getElementById('analyticsSection')) return;
    Registry.register({ id: 'analytics-history', region: 'analytics', order: 100, mount: mountUi });
  }

  function deleteSavedTest(id) {
    const list = tests();
    const test = list.find(function (item) { return item.setId === id; });
    if (!test || !confirm('Delete this saved test? A recoverable backup will be created first.')) return;

    if (window.BoardsMaintenance && window.BoardsMaintenance.backupNow) {
      const backupId = window.BoardsMaintenance.backupNow('Before deleting a saved test', {
        type: 'delete-test', setId: id, total: test.total, scorePct: test.scorePct
      });
      if (!backupId) {
        alert('Delete canceled because a recovery backup could not be saved.');
        return;
      }
    }

    const tombstones = deletedTests();
    if (tombstones.indexOf(id) < 0) tombstones.unshift(id);
    Store.write(DELETED_KEY, tombstones.slice(0, Config.limits.deletedTestTombstones), { reason: 'Saved test deleted' });
    saveTests(list.filter(function (item) { return item.setId !== id; }), 'Saved test deleted');

    const config = ensureConfig();
    if (config && config.setId === id && config.status === 'completed') {
      Store.remove(CONFIG_KEY, { reason: 'Deleted completed active set' });
    }
    Store.milestone('Saved test deleted', { setId: id });
    render();
  }

  function answerText(question, letter) {
    const index = question.choiceLetters.indexOf(letter);
    return index >= 0 ? question.choices[index] : '';
  }

  function showReview(id) {
    const test = tests().find(function (item) { return item.setId === id; });
    if (!test) return;
    const modal = document.getElementById('testReviewModal');
    const detail = document.getElementById('historyDetail');
    if (!modal || !detail) return;
    detail.innerHTML = Views.testReviewDetail(test, byId, answerText, formatDate, formatSeconds);
    modal.hidden = false;
  }

  function render() {
    ensureUi();
    archiveCompleted();
    const metrics = analytics();
    const metricContainer = document.getElementById('analyticsMetrics');
    const categoryContainer = document.getElementById('categoryTable');
    const historyContainer = document.getElementById('testHistory');
    if (!metricContainer || !categoryContainer || !historyContainer) return;

    metricContainer.innerHTML = Views.analyticsMetrics(metrics, formatSeconds);
    categoryContainer.innerHTML = Views.categoryTable(metrics.categories, formatSeconds);
    historyContainer.innerHTML = Views.testHistoryRows(tests(), formatDate, formatSeconds);

    historyContainer.querySelectorAll('.review-history').forEach(function (button) {
      button.addEventListener('click', function () { showReview(button.getAttribute('data-id')); });
    });
    historyContainer.querySelectorAll('.delete-history').forEach(function (button) {
      button.addEventListener('click', function () { deleteSavedTest(button.getAttribute('data-id')); });
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);
  }

  function init() {
    ensureUi();
    render();
    setInterval(accumulateQuestionTime, 1000);
    Store.subscribe(function (change) {
      if (change.key === CONFIG_KEY && change.reason === 'Question timing updated') return;
      scheduleRender();
    });
    window.addEventListener('message', function () {
      flushQuestionTimes();
      scheduleRender();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushQuestionTimes();
    });
    window.addEventListener('beforeunload', flushQuestionTimes);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsAnalytics = Object.freeze({
    render: render,
    archiveCompleted: archiveCompleted,
    flushQuestionTimes: flushQuestionTimes,
    deleteSavedTest: deleteSavedTest
  });
})();
