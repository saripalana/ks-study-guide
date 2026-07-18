(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const frame = document.getElementById('examFrame');
  if (!Config || !Store || !C || !frame) return;

  function refreshNavigator() {
    if (!frame.contentDocument) return;
    const documentInside = frame.contentDocument;
    const navigator = documentInside.getElementById('qnav');
    if (!navigator) return;

    const config = C.activeConfig();
    const state = C.appState();
    if (!config) return;

    const submitted = !!state.testSubmitted['all|study'];
    let answeredCount = 0;
    let correctCount = 0;
    let incorrectCount = 0;

    navigator.querySelectorAll('.qnav-pill').forEach(function (pill, index) {
      const id = config.ids[index];
      const question = C.byId.get(id);
      let status = 'unanswered';

      if (config.mode === 'quiz') {
        const answer = state.answered[id];
        if (answer) status = answer.correct ? 'correct' : 'incorrect';
      } else if (submitted) {
        const selected = state.testAnswers[id];
        status = !selected ? 'omitted' : (question && selected === question.correctLetter ? 'correct' : 'incorrect');
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

    function setCount(id, value) {
      const element = documentInside.getElementById(id);
      if (element) element.textContent = String(value);
    }

    setCount('boardsAnsweredCount', answeredCount);
    setCount('boardsRemainingCount', Math.max(0, config.ids.length - answeredCount));
    setCount('boardsCorrectCount', correctCount);
    setCount('boardsIncorrectCount', incorrectCount);
  }

  function attach() {
    if (!frame.contentDocument || !frame.contentDocument.body) return;
    const documentInside = frame.contentDocument;
    if (documentInside.body.dataset.boardsNavigatorStatusAttached === 'true') {
      refreshNavigator();
      return;
    }
    documentInside.body.dataset.boardsNavigatorStatusAttached = 'true';

    documentInside.addEventListener('click', function () {
      setTimeout(refreshNavigator, 0);
      setTimeout(refreshNavigator, 80);
    }, true);

    const navigator = documentInside.getElementById('qnav');
    if (navigator) {
      new MutationObserver(function () { setTimeout(refreshNavigator, 0); }).observe(navigator, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
    refreshNavigator();
  }

  frame.addEventListener('load', function () { setTimeout(attach, 150); });
  Store.subscribe(function (change) {
    if (change.key === Config.storage.keys.app || change.key === Config.storage.keys.config) {
      setTimeout(refreshNavigator, 0);
    }
  });
  window.addEventListener('message', function () { setTimeout(refreshNavigator, 50); });

  window.BoardsNavigatorStatus = Object.freeze({ attach: attach, refresh: refreshNavigator });
})();
