(function () {
  'use strict';

  const required = [
    ['BoardsConfig', window.BoardsConfig],
    ['BoardsStore', window.BoardsStore],
    ['BoardsCore', window.BoardsCore],
    ['BoardsExam', window.BoardsExam],
    ['BoardsDashboard', window.BoardsDashboard],
    ['BoardsDashboardViews', window.BoardsDashboardViews]
  ];
  const missing = required.filter(function (item) { return !item[1]; }).map(function (item) { return item[0]; });

  if (missing.length || !window.BoardsCore.fullBank.length) {
    document.body.innerHTML = window.BoardsDashboardViews
      ? window.BoardsDashboardViews.startupFailure(missing)
      : '<main><h1>Practice page could not start</h1><p>A required application module did not load correctly.</p></main>';
    console.error('Boards application failed startup validation.', { missing: missing, questions: window.BoardsCore && window.BoardsCore.fullBank.length });
    return;
  }

  const ids = new Set();
  const duplicates = [];
  window.BoardsCore.fullBank.forEach(function (question) {
    if (!question || !question.id || ids.has(question.id)) duplicates.push(question && question.id);
    else ids.add(question.id);
  });
  if (duplicates.length) console.error('Duplicate or invalid question IDs detected.', duplicates);

  window.BoardsExam.init();
  window.BoardsDashboard.init();
  window.BoardsDashboard.render();
  window.dispatchEvent(new CustomEvent(window.BoardsConfig.events.ready, {
    detail: { build: window.BoardsConfig.build, questionCount: window.BoardsCore.fullBank.length }
  }));
})();
