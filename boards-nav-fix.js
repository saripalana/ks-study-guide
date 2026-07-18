(function () {
  'use strict';

  const APP_KEY = 'kaplanBoardPrepState';
  const CONFIG_KEY = 'ksBoardsActiveSetv3';
  const frame = document.getElementById('examFrame');

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function refreshNavigator() {
    if (!frame || !frame.contentDocument) return;
    const doc = frame.contentDocument;
    const qnav = doc.getElementById('qnav');
    if (!qnav) return;

    const config = readJson(CONFIG_KEY, null);
    const state = readJson(APP_KEY, {});
    if (!config || !Array.isArray(config.ids)) return;

    state.answered = state.answered || {};
    state.testAnswers = state.testAnswers || {};
    state.testSubmitted = state.testSubmitted || {};
    state.flagged = state.flagged || {};

    const submitted = !!state.testSubmitted['all|study'];
    const questionMap = new Map((window.QUESTIONS || []).map(function (q) { return [q.id, q]; }));
    let answeredCount = 0;
    let correctCount = 0;
    let incorrectCount = 0;

    qnav.querySelectorAll('.qnav-pill').forEach(function (pill, index) {
      const id = config.ids[index];
      const q = questionMap.get(id);
      let status = 'unanswered';

      if (config.mode === 'quiz') {
        const answer = state.answered[id];
        if (answer) status = answer.correct ? 'correct' : 'incorrect';
      } else if (submitted) {
        const selected = state.testAnswers[id];
        status = !selected ? 'omitted' : (q && selected === q.correctLetter ? 'correct' : 'incorrect');
      } else if (state.testAnswers[id]) {
        status = 'answered';
      }

      pill.classList.toggle('q-answered', status === 'answered');
      pill.classList.toggle('q-correct', status === 'correct');
      pill.classList.toggle('q-incorrect', status === 'incorrect');
      pill.classList.toggle('q-omitted', status === 'omitted');

      if (status !== 'unanswered') answeredCount += 1;
      if (status === 'correct') correctCount += 1;
      if (status === 'incorrect' || status === 'omitted') incorrectCount += 1;
    });

    const answered = doc.getElementById('boardsAnsweredCount');
    const remaining = doc.getElementById('boardsRemainingCount');
    const correct = doc.getElementById('boardsCorrectCount');
    const incorrect = doc.getElementById('boardsIncorrectCount');
    if (answered) answered.textContent = String(answeredCount);
    if (remaining) remaining.textContent = String(Math.max(0, config.ids.length - answeredCount));
    if (correct) correct.textContent = String(correctCount);
    if (incorrect) incorrect.textContent = String(incorrectCount);
  }

  function attach() {
    if (!frame || !frame.contentDocument) return;
    const doc = frame.contentDocument;
    if (!doc.body || doc.body.dataset.boardsNavFixAttached === 'true') return;
    doc.body.dataset.boardsNavFixAttached = 'true';

    doc.addEventListener('click', function () {
      setTimeout(refreshNavigator, 0);
      setTimeout(refreshNavigator, 80);
    }, true);

    const observer = new MutationObserver(function () {
      setTimeout(refreshNavigator, 0);
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    refreshNavigator();
  }

  if (frame) frame.addEventListener('load', function () { setTimeout(attach, 150); });
  setInterval(function () {
    attach();
    refreshNavigator();
  }, 500);
})();
