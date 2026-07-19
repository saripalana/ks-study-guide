(function () {
  'use strict';

  // Generated production catalog. Future validated question banks are added here
  // by the content build workflow before the question-bank registry initializes.
  const existing = Array.isArray(window.BOARDS_QUESTION_BANKS) ? window.BOARDS_QUESTION_BANKS : [];
  window.BOARDS_QUESTION_BANKS = existing.slice();
})();