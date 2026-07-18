(function () {
  'use strict';
  if (!window.BoardsCore || !window.BoardsCore.fullBank.length) {
    document.body.innerHTML = '<p style="padding:24px;font-family:Arial,sans-serif">The question bank could not be loaded.</p>';
    return;
  }
  window.BoardsExam.init();
  window.BoardsDashboard.init();
  window.BoardsDashboard.render();
})();
