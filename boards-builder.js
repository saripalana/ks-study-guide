(function () {
  'use strict';

  const C = window.BoardsCore;
  const Views = window.BoardsDashboardViews;
  const Registry = window.BoardsDashboardRegistry;
  if (!C || !Views || !Registry || !C.fullBank || !C.fullBank.length) return;

  const SETTINGS_KEY = C.KEY.settings;
  const allChapters = Array.from(new Map(C.fullBank.map(function (q) {
    return [String(q.chapter), {
      value: String(q.chapter),
      chapter: q.chapter,
      title: q.chapterTitle || ('Chapter ' + q.chapter)
    }];
  })).values()).sort(function (a, b) { return Number(a.chapter) - Number(b.chapter); });

  let selectedPool = 'all';
  let selectedChapters = new Set(allChapters.map(function (item) { return item.value; }));

  function currentStatus(q) {
    return C.statusForQuestion(q, C.appState(), C.historyState(), C.activeConfig());
  }

  function matchesPool(q, pool) {
    const state = C.appState();
    const status = currentStatus(q);
    if (pool === 'new') return status === 'unused';
    if (pool === 'used') return status !== 'unused';
    if (pool === 'incorrect') return status === 'incorrect' || status === 'omitted';
    if (pool === 'flagged') return !!state.flagged[q.id];
    return true;
  }

  function eligibleQuestions() {
    return C.fullBank.filter(function (q) {
      return selectedChapters.has(String(q.chapter)) && matchesPool(q, selectedPool);
    });
  }

  function poolCount(pool) {
    return C.fullBank.reduce(function (count, q) {
      return count + (selectedChapters.has(String(q.chapter)) && matchesPool(q, pool) ? 1 : 0);
    }, 0);
  }

  function subjectPoolCount(chapter) {
    return C.fullBank.reduce(function (count, q) {
      return count + (String(q.chapter) === chapter && matchesPool(q, selectedPool) ? 1 : 0);
    }, 0);
  }

  function readSavedBuilderSettings() {
    const settings = C.readJson(SETTINGS_KEY, {}) || {};
    const validPools = ['all', 'new', 'used', 'incorrect', 'flagged'];
    selectedPool = validPools.indexOf(settings.pool) >= 0 ? settings.pool : 'all';
    if (Array.isArray(settings.chapters)) {
      const allowed = new Set(allChapters.map(function (item) { return item.value; }));
      const restored = settings.chapters.map(String).filter(function (value) { return allowed.has(value); });
      if (restored.length) selectedChapters = new Set(restored);
    }
  }

  function saveBuilderSettings() {
    const previous = C.readJson(SETTINGS_KEY, {}) || {};
    previous.pool = selectedPool;
    previous.chapters = Array.from(selectedChapters);
    C.writeJson(SETTINGS_KEY, previous);
  }

  function renderPoolButtons() {
    document.querySelectorAll('#questionPoolOptions .pool-card').forEach(function (button) {
      const pool = button.getAttribute('data-pool');
      button.classList.toggle('selected', pool === selectedPool);
      const count = button.querySelector('.pool-count');
      if (count) count.textContent = String(poolCount(pool));
    });
  }

  function renderSubjects() {
    const grid = document.getElementById('subjectSelectionGrid');
    if (!grid) return;
    grid.innerHTML = Views.subjectOptions(allChapters, selectedChapters, subjectPoolCount);

    grid.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) selectedChapters.add(checkbox.value);
        else selectedChapters.delete(checkbox.value);
        saveBuilderSettings();
        updateBuilder();
      });
    });
  }

  function updateBuilder() {
    renderPoolButtons();
    renderSubjects();

    const eligible = eligibleQuestions();
    const countInput = document.getElementById('questionCount');
    const rangeText = document.getElementById('questionRangeText');
    const startButton = document.getElementById('startNewSetBtn');
    const subjectSummary = document.getElementById('subjectSelectionSummary');
    const warning = document.getElementById('builderWarning');

    const subjectCount = selectedChapters.size;
    if (subjectSummary) {
      subjectSummary.textContent = subjectCount === allChapters.length ? 'All subjects selected' : subjectCount + ' of ' + allChapters.length + ' subjects selected';
    }

    if (rangeText) rangeText.textContent = 'of ' + eligible.length + ' eligible questions';
    if (countInput) {
      countInput.max = String(Math.max(1, eligible.length));
      const current = C.clampInteger(countInput.value, 40, 1, Math.max(1, eligible.length));
      if (eligible.length && current > eligible.length) countInput.value = String(eligible.length);
    }

    const canStart = eligible.length > 0 && selectedChapters.size > 0;
    if (startButton) startButton.disabled = !canStart;
    if (warning) {
      warning.textContent = canStart ? '' : (selectedChapters.size ? 'No questions match this subject and question-pool combination.' : 'Select at least one subject.');
      warning.hidden = canStart;
    }
  }

  function mountBuilderUi() {
    const existing = document.getElementById('uworldBuilderOptions');
    if (existing) return existing;
    const wrapper = Views.createBuilderOptions();

    wrapper.querySelector('#selectAllSubjects').addEventListener('click', function () {
      selectedChapters = new Set(allChapters.map(function (item) { return item.value; }));
      saveBuilderSettings();
      updateBuilder();
    });
    wrapper.querySelector('#clearAllSubjects').addEventListener('click', function () {
      selectedChapters.clear();
      saveBuilderSettings();
      updateBuilder();
    });
    wrapper.querySelectorAll('#questionPoolOptions .pool-card').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedPool = button.getAttribute('data-pool');
        saveBuilderSettings();
        updateBuilder();
      });
    });
    setTimeout(updateBuilder, 0);
    return wrapper;
  }

  function injectBuilderUi() {
    if (document.getElementById('questionPoolOptions')) return;
    Registry.register({ id: 'study-set-builder-options', region: 'practice-builder', order: 100, mount: mountBuilderUi });
  }

  function replaceStartButton() {
    const oldButton = document.getElementById('startNewSetBtn');
    if (!oldButton || oldButton.getAttribute('data-builder-ready') === 'true') return;
    const button = oldButton.cloneNode(true);
    button.setAttribute('data-builder-ready', 'true');
    oldButton.replaceWith(button);

    button.addEventListener('click', function () {
      C.syncActiveSetResults();
      const eligible = eligibleQuestions();
      if (!eligible.length) {
        updateBuilder();
        return;
      }

      const countInput = document.getElementById('questionCount');
      const requested = C.clampInteger(countInput.value, Math.min(40, eligible.length), 1, eligible.length);
      countInput.value = String(requested);
      const ids = C.shuffle(eligible).slice(0, requested).map(function (q) { return q.id; });

      const modeButton = document.querySelector('#modeOptions .option-card.selected');
      const mode = modeButton && modeButton.getAttribute('data-mode') === 'quiz' ? 'quiz' : 'test';
      const timingButton = document.querySelector('#timingOptions .segment.selected');
      const timed = !timingButton || timingButton.getAttribute('data-timing') !== 'untimed';
      const hours = C.clampInteger(document.getElementById('timerHours').value, 0, 0, 99);
      const minutes = C.clampInteger(document.getElementById('timerMinutes').value, 0, 0, 59);
      const seconds = C.clampInteger(document.getElementById('timerSeconds').value, 0, 0, 59);
      const durationSeconds = timed ? Math.max(1, hours * 3600 + minutes * 60 + seconds) : null;

      const kind = selectedPool === 'all' ? 'random' : selectedPool;
      const config = C.createConfig(ids, mode, timed, durationSeconds, kind);
      config.pool = selectedPool;
      config.chapters = Array.from(selectedChapters);
      C.writeJson(C.KEY.config, config);

      const previous = C.readJson(SETTINGS_KEY, {}) || {};
      previous.count = requested;
      previous.mode = mode;
      previous.timing = timed ? 'timed' : 'untimed';
      previous.durationSeconds = durationSeconds;
      previous.pool = selectedPool;
      previous.chapters = Array.from(selectedChapters);
      C.writeJson(SETTINGS_KEY, previous);
      window.BoardsExam.launch();
    });
  }

  function init() {
    readSavedBuilderSettings();
    injectBuilderUi();
    replaceStartButton();
    updateBuilder();

    const observer = new MutationObserver(function () {
      if (!document.getElementById('questionPoolOptions')) injectBuilderUi();
      if (!document.querySelector('#startNewSetBtn[data-builder-ready="true"]')) replaceStartButton();
    });
    const dashboard = document.getElementById('dashboardScreen');
    if (dashboard) observer.observe(dashboard, { childList: true, subtree: true });

    window.addEventListener('message', function () { setTimeout(updateBuilder, 200); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
