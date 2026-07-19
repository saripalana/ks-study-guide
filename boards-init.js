(function () {
  'use strict';

  const required = [
    ['BoardsConfig', window.BoardsConfig],
    ['BoardsQuestionBankRegistry', window.BoardsQuestionBankRegistry],
    ['BoardsStore', window.BoardsStore],
    ['BoardsCore', window.BoardsCore],
    ['BoardsExam', window.BoardsExam],
    ['BoardsDashboard', window.BoardsDashboard],
    ['BoardsDashboardViews', window.BoardsDashboardViews],
    ['BoardsBankConsistency', window.BoardsBankConsistency],
    ['BoardsVaultBankScope', window.BoardsVaultBankScope],
    ['BoardsHardResetService', window.BoardsHardResetService],
    ['BoardsHardReset', window.BoardsHardReset]
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
  if (duplicates.length) {
    document.body.innerHTML = window.BoardsDashboardViews.startupFailure(['unique question IDs']);
    console.error('Duplicate or invalid question IDs detected.', duplicates);
    return;
  }

  const consistency = window.BoardsBankConsistency.validateCurrentState();
  if (!consistency.valid) {
    document.body.innerHTML = window.BoardsDashboardViews.startupFailure(['question-bank data consistency']);
    console.error('Question-bank consistency validation failed.', consistency);
    return;
  }

  window.BoardsExam.init();
  window.BoardsDashboard.init();
  window.BoardsDashboard.render();
  window.dispatchEvent(new CustomEvent(window.BoardsConfig.events.ready, {
    detail: {
      build: window.BoardsConfig.build,
      bankId: window.BoardsConfig.bank.id,
      bankTitle: window.BoardsConfig.bank.title,
      bankQuestionHash: window.BoardsConfig.bank.questionHash,
      questionCount: window.BoardsCore.fullBank.length,
      completedTests: consistency.completedTests
    }
  }));
})();