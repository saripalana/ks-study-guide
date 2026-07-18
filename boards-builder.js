(function () {
  'use strict';

  const C = window.BoardsCore;
  if (!C || !C.fullBank || !C.fullBank.length) return;

  const SETTINGS_KEY = C.KEY.settings;
  const allChapters = Array.from(new Map(C.fullBank.map(function (question) {
    return [String(question.chapter), {
      value: String(question.chapter),
      chapter: question.chapter,
      title: question.chapterTitle || ('Chapter ' + question.chapter)
    }];
  })).values()).sort(function (left, right) { return Number(left.chapter) - Number(right.chapter); });

  const sourceDefinitions = [
    { value: 'original', title: 'Original unchanged', copy: 'Imported bank material with no AI content changes.' },
    { value: 'ai-revised', title: 'AI-revised originals', copy: 'Original cards with a reviewed, reversible overlay.' },
    { value: 'ai-created', title: 'AI-created supplements', copy: 'Separate personal cards created by ChatGPT.' },
    { value: 'user-created', title: 'User-created supplements', copy: 'Separate personal cards created by you.' }
  ];

  let selectedPool = 'all';
  let selectedChapters = new Set(allChapters.map(function (item) { return item.value; }));
  let selectedSources = new Set(sourceDefinitions.map(function (item) { return item.value; }));

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function questionSource(question) {
    return question && question.provenance && question.provenance.studySource || 'original';
  }

  function currentStatus(question) {
    return C.statusForQuestion(question, C.appState(), C.historyState(), C.activeConfig());
  }

  function matchesPool(question, pool) {
    const state = C.appState();
    const status = currentStatus(question);
    if (pool === 'new') return status === 'unused';
    if (pool === 'used') return status !== 'unused';
    if (pool === 'incorrect') return status === 'incorrect' || status === 'omitted';
    if (pool === 'flagged') return !!state.flagged[question.id];
    return true;
  }

  function matchesBaseFilters(question) {
    return selectedChapters.has(String(question.chapter)) && selectedSources.has(questionSource(question));
  }

  function eligibleQuestions() {
    return C.fullBank.filter(function (question) {
      return matchesBaseFilters(question) && matchesPool(question, selectedPool);
    });
  }

  function poolCount(pool) {
    return C.fullBank.reduce(function (count, question) {
      return count + (matchesBaseFilters(question) && matchesPool(question, pool) ? 1 : 0);
    }, 0);
  }

  function subjectPoolCount(chapter) {
    return C.fullBank.reduce(function (count, question) {
      const included = String(question.chapter) === chapter && selectedSources.has(questionSource(question)) && matchesPool(question, selectedPool);
      return count + (included ? 1 : 0);
    }, 0);
  }

  function sourcePoolCount(source) {
    return C.fullBank.reduce(function (count, question) {
      const included = questionSource(question) === source && selectedChapters.has(String(question.chapter)) && matchesPool(question, selectedPool);
      return count + (included ? 1 : 0);
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
    if (Array.isArray(settings.sources)) {
      const allowed = new Set(sourceDefinitions.map(function (item) { return item.value; }));
      const restored = settings.sources.map(String).filter(function (value) { return allowed.has(value); });
      if (restored.length) selectedSources = new Set(restored);
    }
  }

  function saveBuilderSettings() {
    const previous = C.readJson(SETTINGS_KEY, {}) || {};
    previous.pool = selectedPool;
    previous.chapters = Array.from(selectedChapters);
    previous.sources = Array.from(selectedSources);
    C.writeJson(SETTINGS_KEY, previous, { reason: 'Practice builder settings updated' });
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
    grid.innerHTML = allChapters.map(function (item) {
      const checked = selectedChapters.has(item.value);
      const available = subjectPoolCount(item.value);
      return '<label class="subject-option' + (checked ? ' selected' : '') + '">' +
        '<input type="checkbox" value="' + escapeHtml(item.value) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="subject-check" aria-hidden="true"></span>' +
        '<span class="subject-copy"><strong>Chapter ' + escapeHtml(item.chapter) + '</strong><span>' + escapeHtml(item.title) + '</span></span>' +
        '<span class="subject-count">' + available + '</span>' +
        '</label>';
    }).join('');

    grid.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) selectedChapters.add(checkbox.value);
        else selectedChapters.delete(checkbox.value);
        saveBuilderSettings();
        updateBuilder();
      });
    });
  }

  function renderSources() {
    const grid = document.getElementById('sourceSelectionGrid');
    if (!grid) return;
    grid.innerHTML = sourceDefinitions.map(function (item) {
      const checked = selectedSources.has(item.value);
      return '<label class="subject-option' + (checked ? ' selected' : '') + '">' +
        '<input type="checkbox" value="' + escapeHtml(item.value) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="subject-check" aria-hidden="true"></span>' +
        '<span class="subject-copy"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.copy) + '</span></span>' +
        '<span class="subject-count">' + sourcePoolCount(item.value) + '</span>' +
        '</label>';
    }).join('');

    grid.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) selectedSources.add(checkbox.value);
        else selectedSources.delete(checkbox.value);
        saveBuilderSettings();
        updateBuilder();
      });
    });
  }

  function updateBuilder() {
    renderPoolButtons();
    renderSubjects();
    renderSources();

    const eligible = eligibleQuestions();
    const countInput = document.getElementById('questionCount');
    const rangeText = document.getElementById('questionRangeText');
    const startButton = document.getElementById('startNewSetBtn');
    const subjectSummary = document.getElementById('subjectSelectionSummary');
    const sourceSummary = document.getElementById('sourceSelectionSummary');
    const warning = document.getElementById('builderWarning');

    if (subjectSummary) {
      subjectSummary.textContent = selectedChapters.size === allChapters.length
        ? 'All subjects selected'
        : selectedChapters.size + ' of ' + allChapters.length + ' subjects selected';
    }
    if (sourceSummary) {
      sourceSummary.textContent = selectedSources.size === sourceDefinitions.length
        ? 'All content sources selected'
        : selectedSources.size + ' of ' + sourceDefinitions.length + ' sources selected';
    }

    if (rangeText) rangeText.textContent = 'of ' + eligible.length + ' eligible questions';
    if (countInput) {
      countInput.max = String(Math.max(1, eligible.length));
      const current = C.clampInteger(countInput.value, 40, 1, Math.max(1, eligible.length));
      if (eligible.length && current > eligible.length) countInput.value = String(eligible.length);
    }

    const canStart = eligible.length > 0 && selectedChapters.size > 0 && selectedSources.size > 0;
    if (startButton) startButton.disabled = !canStart;
    if (warning) {
      warning.textContent = canStart ? '' : (!selectedChapters.size
        ? 'Select at least one subject.'
        : !selectedSources.size
          ? 'Select at least one content source.'
          : 'No questions match this subject, source, and question-pool combination.');
      warning.hidden = canStart;
    }
  }

  function injectBuilderUi() {
    if (document.getElementById('questionPoolOptions')) return;
    const startButton = document.getElementById('startNewSetBtn');
    if (!startButton) return;
    const card = startButton.closest('.dashboard-card');
    const firstSection = card && card.querySelector('.form-section');
    if (!card || !firstSection) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'uworldBuilderOptions';
    wrapper.innerHTML =
      '<div class="form-section builder-section">' +
        '<div class="builder-heading-row"><div><div class="field-label">Subjects</div><div id="subjectSelectionSummary" class="builder-summary"></div></div>' +
        '<div class="builder-mini-actions"><button type="button" id="selectAllSubjects" class="builder-link-button">Select all</button><button type="button" id="clearAllSubjects" class="builder-link-button">Clear</button></div></div>' +
        '<div id="subjectSelectionGrid" class="subject-selection-grid"></div>' +
      '</div>' +
      '<div class="form-section builder-section">' +
        '<div class="builder-heading-row"><div><div class="field-label">Content sources</div><div id="sourceSelectionSummary" class="builder-summary"></div></div>' +
        '<div class="builder-mini-actions"><button type="button" id="selectAllSources" class="builder-link-button">Select all</button><button type="button" id="clearAllSources" class="builder-link-button">Clear</button></div></div>' +
        '<div id="sourceSelectionGrid" class="subject-selection-grid"></div>' +
      '</div>' +
      '<div class="form-section builder-section">' +
        '<div class="field-label">Question pool</div>' +
        '<div id="questionPoolOptions" class="pool-grid">' +
          '<button type="button" class="pool-card" data-pool="all"><span class="pool-title">All / Random</span><span class="pool-copy">Randomly sample from every eligible question.</span><strong class="pool-count">0</strong></button>' +
          '<button type="button" class="pool-card" data-pool="new"><span class="pool-title">New</span><span class="pool-copy">Questions you have not answered before.</span><strong class="pool-count">0</strong></button>' +
          '<button type="button" class="pool-card" data-pool="used"><span class="pool-title">Used</span><span class="pool-copy">Questions previously answered or submitted.</span><strong class="pool-count">0</strong></button>' +
          '<button type="button" class="pool-card" data-pool="incorrect"><span class="pool-title">Incorrect</span><span class="pool-copy">Questions last answered incorrectly or omitted.</span><strong class="pool-count">0</strong></button>' +
          '<button type="button" class="pool-card" data-pool="flagged"><span class="pool-title">Flagged</span><span class="pool-copy">Questions currently marked for review.</span><strong class="pool-count">0</strong></button>' +
        '</div>' +
        '<div id="builderWarning" class="builder-warning" hidden></div>' +
      '</div>';
    card.insertBefore(wrapper, firstSection);

    document.getElementById('selectAllSubjects').addEventListener('click', function () {
      selectedChapters = new Set(allChapters.map(function (item) { return item.value; }));
      saveBuilderSettings();
      updateBuilder();
    });
    document.getElementById('clearAllSubjects').addEventListener('click', function () {
      selectedChapters.clear();
      saveBuilderSettings();
      updateBuilder();
    });
    document.getElementById('selectAllSources').addEventListener('click', function () {
      selectedSources = new Set(sourceDefinitions.map(function (item) { return item.value; }));
      saveBuilderSettings();
      updateBuilder();
    });
    document.getElementById('clearAllSources').addEventListener('click', function () {
      selectedSources.clear();
      saveBuilderSettings();
      updateBuilder();
    });
    document.querySelectorAll('#questionPoolOptions .pool-card').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedPool = button.getAttribute('data-pool');
        saveBuilderSettings();
        updateBuilder();
      });
    });
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
      const ids = C.shuffle(eligible).slice(0, requested).map(function (question) { return question.id; });

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
      config.sources = Array.from(selectedSources);
      config.timingPrecision = 'milliseconds';
      config.questionTiming = {};
      C.writeJson(C.KEY.config, config, { reason: 'Practice set source and timing settings saved' });

      const previous = C.readJson(SETTINGS_KEY, {}) || {};
      previous.count = requested;
      previous.mode = mode;
      previous.timing = timed ? 'timed' : 'untimed';
      previous.durationSeconds = durationSeconds;
      previous.pool = selectedPool;
      previous.chapters = Array.from(selectedChapters);
      previous.sources = Array.from(selectedSources);
      C.writeJson(SETTINGS_KEY, previous, { reason: 'Practice builder settings saved' });
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
