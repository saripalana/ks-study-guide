(function () {
  'use strict';

  const C = window.BoardsCore;
  const Views = window.BoardsDashboardViews;
  if (!C || !Views) throw new Error('Dashboard dependencies are unavailable.');

  const dashboardScreen = document.getElementById('dashboardScreen');
  const questionCountInput = document.getElementById('questionCount');
  const questionRangeText = document.getElementById('questionRangeText');
  const timerHoursInput = document.getElementById('timerHours');
  const timerMinutesInput = document.getElementById('timerMinutes');
  const timerSecondsInput = document.getElementById('timerSeconds');
  const timerFields = document.getElementById('timerFields');
  const summaryStats = document.getElementById('summaryStats');
  const resumeCard = document.getElementById('resumeCard');
  const bankGrid = document.getElementById('bankGrid');
  const bankLegend = document.getElementById('bankLegend');
  const bankFilters = document.getElementById('bankFilters');

  let selectedMode = 'test';
  let selectedTiming = 'timed';
  let currentFilter = 'all';
  let timeWasManuallyChanged = false;

  function readDurationInputs() {
    const hours = C.clampInteger(timerHoursInput.value, 0, 0, 99);
    const minutes = C.clampInteger(timerMinutesInput.value, 0, 0, 59);
    const seconds = C.clampInteger(timerSecondsInput.value, 0, 0, 59);
    return Math.max(1, hours * 3600 + minutes * 60 + seconds);
  }

  function setDurationInputs(totalSeconds) {
    const parts = C.splitDuration(totalSeconds);
    timerHoursInput.value = String(parts.hours);
    timerMinutesInput.value = String(parts.minutes);
    timerSecondsInput.value = String(parts.seconds);
  }

  function selectMode(mode) {
    selectedMode = mode === 'quiz' ? 'quiz' : 'test';
    document.querySelectorAll('#modeOptions .option-card').forEach(function (button) {
      button.classList.toggle('selected', button.getAttribute('data-mode') === selectedMode);
    });
  }

  function selectTiming(timing) {
    selectedTiming = timing === 'untimed' ? 'untimed' : 'timed';
    document.querySelectorAll('#timingOptions .segment').forEach(function (button) {
      button.classList.toggle('selected', button.getAttribute('data-timing') === selectedTiming);
    });
    timerFields.classList.toggle('disabled', selectedTiming === 'untimed');
  }

  function createSet(ids, mode, timed, durationSeconds, kind) {
    C.createConfig(ids, mode, timed, durationSeconds, kind);
    C.writeJson(C.KEY.settings, {
      count: ids.length,
      mode: mode,
      timing: timed ? 'timed' : 'untimed',
      durationSeconds: durationSeconds
    });
    window.BoardsExam.launch();
  }

  function createRandomSet() {
    const count = C.clampQuestionCount(questionCountInput.value);
    questionCountInput.value = String(count);
    const ids = C.shuffle(C.fullBank).slice(0, count).map(function (question) { return question.id; });
    const timed = selectedTiming === 'timed';
    createSet(ids, selectedMode, timed, timed ? readDurationInputs() : null, 'random');
  }

  function createFocusedSet(type) {
    C.syncActiveSetResults();
    const state = C.appState();
    const history = C.historyState();
    const config = C.activeConfig();
    const ids = C.fullBank.filter(function (question) {
      if (type === 'flagged') return !!state.flagged[question.id];
      const status = C.statusForQuestion(question, state, history, config);
      return status === 'incorrect' || status === 'omitted';
    }).map(function (question) { return question.id; });
    if (ids.length) createSet(C.shuffle(ids), 'quiz', false, null, type);
  }

  function renderSummaryStats() {
    const state = C.appState();
    const history = C.historyState();
    const config = C.activeConfig();
    let correct = 0;
    let incorrect = 0;
    let answered = 0;
    let unused = 0;
    let flagged = 0;

    C.fullBank.forEach(function (question) {
      const status = C.statusForQuestion(question, state, history, config);
      if (status === 'correct') correct += 1;
      else if (status === 'incorrect' || status === 'omitted') incorrect += 1;
      else if (status === 'answered') answered += 1;
      else unused += 1;
      if (state.flagged[question.id]) flagged += 1;
    });

    summaryStats.innerHTML = Views.summaryStats([
      { value: C.fullBank.length, label: 'Total questions' },
      { value: correct, label: 'Correct', className: 'correct' },
      { value: incorrect, label: 'Incorrect / omitted', className: 'incorrect' },
      { value: answered, label: 'Answered, not scored' },
      { value: flagged, label: 'Flagged', className: 'flagged' },
      { value: unused, label: 'Unused', className: 'unused' }
    ]);

    document.getElementById('reviewIncorrectCount').textContent = String(incorrect);
    document.getElementById('reviewFlaggedCount').textContent = String(flagged);
    document.getElementById('reviewIncorrectBtn').disabled = incorrect === 0;
    document.getElementById('reviewFlaggedBtn').disabled = flagged === 0;
  }

  function renderResumeCard() {
    const config = C.activeConfig();
    if (!config) {
      resumeCard.innerHTML = '';
      return;
    }

    const state = C.appState();
    const answered = C.countProgress(config, state);
    const flagged = config.ids.reduce(function (count, id) { return count + (state.flagged[id] ? 1 : 0); }, 0);
    const remainingSeconds = config.timed && config.endAt ? Math.max(0, Math.ceil((config.endAt - Date.now()) / 1000)) : null;
    const completed = config.status === 'completed' || (config.mode === 'test' && !!state.testSubmitted['all|study']);
    const kind = config.kind || 'practice';
    const label = kind === 'random' ? 'practice set' : kind + ' review';
    const timeLabel = config.timed ? (remainingSeconds > 0 ? C.formatClock(remainingSeconds) + ' remaining' : 'Time expired') : 'Untimed';

    resumeCard.innerHTML = Views.resumeCard({
      completed: completed,
      count: config.ids.length,
      label: label,
      timeLabel: timeLabel,
      modeLabel: config.mode === 'test' ? 'TEST MODE' : 'TUTOR MODE',
      answered: answered,
      remaining: config.ids.length - answered,
      flagged: flagged
    });

    document.getElementById('resumeSetBtn').addEventListener('click', window.BoardsExam.launch);
    document.getElementById('discardSetBtn').addEventListener('click', function () {
      if (!confirm('Remove the current set? Recorded results and flags will remain saved.')) return;
      localStorage.removeItem(C.KEY.config);
      render();
    });
  }

  function renderLegendAndFilters() {
    bankLegend.innerHTML = Views.bankLegend();
    const filters = [['all', 'All'], ['unused', 'Unused'], ['answered', 'Answered'], ['correct', 'Correct'], ['incorrect', 'Incorrect'], ['flagged', 'Flagged']];
    bankFilters.innerHTML = Views.bankFilters(filters, currentFilter);
    bankFilters.querySelectorAll('.filter-button').forEach(function (button) {
      button.addEventListener('click', function () {
        currentFilter = button.getAttribute('data-filter');
        renderQuestionBank();
      });
    });
  }

  function renderQuestionBank() {
    const state = C.appState();
    const history = C.historyState();
    const config = C.activeConfig();
    renderLegendAndFilters();
    const items = C.fullBank.map(function (question, index) {
      const status = C.statusForQuestion(question, state, history, config);
      const flagged = !!state.flagged[question.id];
      const matches = currentFilter === 'all' || currentFilter === status ||
        (currentFilter === 'incorrect' && (status === 'incorrect' || status === 'omitted')) ||
        (currentFilter === 'flagged' && flagged);
      const title = 'Question ' + (index + 1) + ' · Chapter ' + question.chapter + ', Q' + question.qnum + ' · ' + status + (flagged ? ' · flagged' : '');
      return {
        id: question.id,
        number: index + 1,
        status: status,
        flagged: flagged,
        matches: matches,
        title: title
      };
    });
    bankGrid.innerHTML = Views.questionBankTiles(items);
  }

  function render() {
    C.syncActiveSetResults();
    questionRangeText.textContent = 'of ' + C.fullBank.length + ' available';
    questionCountInput.max = String(C.fullBank.length);
    renderSummaryStats();
    renderResumeCard();
    renderQuestionBank();
  }

  function loadSettings() {
    const settings = C.readJson(C.KEY.settings, null);
    const count = settings ? C.clampQuestionCount(settings.count) : 40;
    questionCountInput.value = String(count);
    selectMode(settings && settings.mode === 'quiz' ? 'quiz' : 'test');
    selectTiming(settings && settings.timing === 'untimed' ? 'untimed' : 'timed');
    setDurationInputs(settings && settings.durationSeconds ? settings.durationSeconds : C.boardPaceSeconds(count));
  }

  function init() {
    loadSettings();
    document.querySelectorAll('#modeOptions .option-card').forEach(function (button) {
      button.addEventListener('click', function () { selectMode(button.getAttribute('data-mode')); });
    });
    document.querySelectorAll('#timingOptions .segment').forEach(function (button) {
      button.addEventListener('click', function () { selectTiming(button.getAttribute('data-timing')); });
    });
    questionCountInput.addEventListener('input', function () {
      if (!timeWasManuallyChanged) setDurationInputs(C.boardPaceSeconds(C.clampQuestionCount(questionCountInput.value)));
    });
    [timerHoursInput, timerMinutesInput, timerSecondsInput].forEach(function (input) {
      input.addEventListener('input', function () { timeWasManuallyChanged = true; });
    });
    document.getElementById('boardPaceBtn').addEventListener('click', function () {
      timeWasManuallyChanged = false;
      setDurationInputs(C.boardPaceSeconds(C.clampQuestionCount(questionCountInput.value)));
    });
    document.getElementById('startNewSetBtn').addEventListener('click', createRandomSet);
    document.getElementById('reviewIncorrectBtn').addEventListener('click', function () { createFocusedSet('incorrect'); });
    document.getElementById('reviewFlaggedBtn').addEventListener('click', function () { createFocusedSet('flagged'); });
    setInterval(function () { if (!dashboardScreen.hidden) renderResumeCard(); }, 1000);
  }

  window.BoardsDashboard = { init: init, render: render };
})();
