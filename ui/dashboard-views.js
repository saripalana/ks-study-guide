(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function fromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html).trim();
    return template.content.firstElementChild;
  }

  function emptyState(message) {
    return '<div class="analytics-empty">' + escapeHtml(message) + '</div>';
  }

  function summaryStats(items) {
    return (items || []).map(function (item) {
      return '<div class="stat-card ' + escapeHtml(item.className || '') + '"><div class="stat-value">' +
        escapeHtml(item.value) + '</div><div class="stat-label">' + escapeHtml(item.label) + '</div></div>';
    }).join('');
  }

  function resumeCard(model) {
    if (!model) return '';
    return '<div class="resume-heading"><div><div class="card-kicker">' +
      escapeHtml(model.completed ? 'COMPLETED SET' : 'CURRENT SET') + '</div><h3>' + escapeHtml(model.count) +
      '-question ' + escapeHtml(model.label) + '</h3><div class="field-help">' + escapeHtml(model.timeLabel) +
      '</div></div><span class="resume-mode">' + escapeHtml(model.modeLabel) + '</span></div>' +
      '<div class="resume-meta"><div class="resume-metric"><strong>' + escapeHtml(model.answered) +
      '</strong><span>Answered</span></div><div class="resume-metric"><strong>' + escapeHtml(model.remaining) +
      '</strong><span>Remaining</span></div><div class="resume-metric"><strong>' + escapeHtml(model.flagged) +
      '</strong><span>Flagged</span></div></div>' +
      '<div class="resume-actions"><button type="button" id="resumeSetBtn" class="primary-button">' +
      escapeHtml(model.completed ? 'Review set' : 'Resume set') +
      '</button><button type="button" id="discardSetBtn" class="secondary-button">Remove set</button></div>';
  }

  function bankLegend() {
    return '<span class="legend-item"><span class="legend-swatch unused"></span>Unused</span>' +
      '<span class="legend-item"><span class="legend-swatch answered"></span>Answered, not scored</span>' +
      '<span class="legend-item"><span class="legend-swatch correct"></span>Correct</span>' +
      '<span class="legend-item"><span class="legend-swatch incorrect"></span>Incorrect / omitted</span>' +
      '<span class="legend-item"><span class="legend-swatch flagged"></span>Flagged</span>';
  }

  function bankFilters(filters, currentFilter) {
    return (filters || []).map(function (item) {
      return '<button type="button" class="filter-button ' + (currentFilter === item[0] ? 'selected' : '') +
        '" data-filter="' + escapeHtml(item[0]) + '">' + escapeHtml(item[1]) + '</button>';
    }).join('');
  }

  function questionBankTiles(items) {
    return (items || []).map(function (item) {
      return '<button type="button" class="bank-tile ' + escapeHtml(item.status) +
        (item.flagged ? ' flagged' : '') + (item.matches ? '' : ' filtered-out') +
        '" data-question-id="' + escapeHtml(item.id) + '" title="' + escapeHtml(item.title) +
        '" aria-label="' + escapeHtml(item.title) + '">' + escapeHtml(item.number) + '</button>';
    }).join('');
  }

  function createAnalyticsSection() {
    return fromHtml(
      '<section id="analyticsSection" class="analytics-section">' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">ANALYTICS</div><h3>Performance by category</h3></div></div>' +
          '<div id="analyticsMetrics" class="analytics-metrics"></div>' +
          '<div id="categoryTable"></div>' +
        '</article>' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">HISTORY</div><h3>Previous tests</h3>' +
          '<p class="field-help">Completed sets are saved for detailed review and included in Drive backup.</p></div></div>' +
          '<div id="testHistory"></div>' +
        '</article>' +
      '</section>'
    );
  }

  function createTestReviewModal() {
    return fromHtml(
      '<div id="testReviewModal" class="history-modal" hidden>' +
        '<div class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="historyReviewTitle">' +
          '<button id="closeHistoryModal" class="history-close" type="button" aria-label="Close review">×</button>' +
          '<div id="historyDetail"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function analyticsMetrics(metrics, formatSeconds) {
    return [
      ['Completed tests', metrics.tests],
      ['Unique questions completed', metrics.unique],
      ['Total answered', metrics.responses],
      ['Overall accuracy', metrics.accuracy + '%'],
      ['Average time / question', formatSeconds(metrics.average)]
    ].map(function (item) {
      return '<div class="analytics-metric"><strong>' + escapeHtml(item[1]) + '</strong><span>' + escapeHtml(item[0]) + '</span></div>';
    }).join('');
  }

  function categoryTable(categories, formatSeconds) {
    if (!Array.isArray(categories) || !categories.length) {
      return emptyState('Complete a test or tutor set to begin building category analytics.');
    }
    return '<div class="category-table"><div class="category-row category-head"><span>Category</span><span>Completed</span><span>Correct</span><span>Accuracy</span><span>Avg time</span></div>' +
      categories.map(function (category) {
        return '<div class="category-row"><span><strong>Ch ' + escapeHtml(category.chapter) + '</strong> ' + escapeHtml(category.title) +
          '</span><span>' + Number(category.attempts || 0) + '</span><span>' + Number(category.correct || 0) + '</span><span>' +
          escapeHtml(category.accuracy) + '%</span><span>' + escapeHtml(formatSeconds(category.average)) + '</span></div>';
      }).join('') + '</div>';
  }

  function testHistoryRows(tests, formatDate, formatSeconds) {
    if (!Array.isArray(tests) || !tests.length) return emptyState('No completed tests saved yet.');
    return tests.map(function (test) {
      return '<div class="history-row"><div><strong>' + Number(test.total || 0) + ' questions · ' +
        (test.mode === 'test' ? 'Test' : 'Tutor') + '</strong><span>' + escapeHtml(formatDate(test.completedAt)) +
        '</span></div><div class="history-score">' + escapeHtml(test.scorePct) + '%</div><div class="history-meta">' +
        Number(test.correct || 0) + ' correct · ' + Number(test.incorrect || 0) + ' incorrect · ' + Number(test.omitted || 0) +
        ' omitted<br>' + escapeHtml(formatSeconds(test.averageSeconds)) + ' / question</div><div class="history-actions">' +
        '<button type="button" class="secondary-button review-history" data-id="' + escapeHtml(test.setId) + '">Review</button>' +
        '<button type="button" class="secondary-button delete-history" data-id="' + escapeHtml(test.setId) + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  function testReviewDetail(test, byId, answerText, formatDate, formatSeconds) {
    const categoryRows = (test.categories || []).map(function (category) {
      return '<tr><td>Ch ' + escapeHtml(category.chapter) + ' — ' + escapeHtml(category.title) + '</td><td>' + Number(category.total || 0) +
        '</td><td>' + Number(category.correct || 0) + '</td><td>' + escapeHtml(category.accuracyPct) + '%</td><td>' +
        escapeHtml(formatSeconds(category.averageSeconds)) + '</td></tr>';
    }).join('');

    const questions = (test.ids || []).map(function (questionId, index) {
      const question = byId.get(questionId);
      const result = (test.results || {})[questionId] || {};
      if (!question) return '';
      const selected = result.selectedLetter || 'Omitted';
      const selectedText = result.selectedLetter ? answerText(question, result.selectedLetter) : '';
      const correctText = answerText(question, question.correctLetter);
      return '<details class="review-question ' + escapeHtml(result.status) + '"><summary>Question ' + (index + 1) + ' · Ch ' +
        escapeHtml(question.chapter) + ' Q' + escapeHtml(question.qnum) + ' · ' + escapeHtml(result.status) + ' · ' +
        escapeHtml(formatSeconds(result.seconds)) + '</summary><p>' + escapeHtml(question.question) + '</p><p><strong>Your answer:</strong> ' +
        escapeHtml(selected) + (selectedText ? ' — ' + escapeHtml(selectedText) : '') + '</p><p><strong>Correct answer:</strong> ' +
        escapeHtml(question.correctLetter) + ' — ' + escapeHtml(correctText) + '</p><p class="review-explanation">' +
        escapeHtml(question.explanation || '') + '</p></details>';
    }).join('');

    return '<h2 id="historyReviewTitle">Saved test review</h2><div class="review-summary"><strong>' + escapeHtml(test.scorePct) +
      '%</strong><span>' + Number(test.correct || 0) + ' correct · ' + Number(test.incorrect || 0) + ' incorrect · ' +
      Number(test.omitted || 0) + ' omitted</span><span>' + escapeHtml(formatSeconds(test.averageSeconds)) +
      ' average per answered question</span><span>' + escapeHtml(formatDate(test.completedAt)) +
      '</span></div><h3>Category breakdown</h3><div class="review-table-wrap"><table><thead><tr><th>Category</th><th>Completed</th><th>Correct</th><th>Accuracy</th><th>Avg time</th></tr></thead><tbody>' +
      categoryRows + '</tbody></table></div><h3>Question review</h3>' + questions;
  }

  function createBuilderOptions() {
    return fromHtml(
      '<div id="uworldBuilderOptions">' +
        '<div class="form-section builder-section">' +
          '<div class="builder-heading-row"><div><div class="field-label">Subjects</div><div id="subjectSelectionSummary" class="builder-summary"></div></div>' +
          '<div class="builder-mini-actions"><button type="button" id="selectAllSubjects" class="builder-link-button">Select all</button>' +
          '<button type="button" id="clearAllSubjects" class="builder-link-button">Clear</button></div></div>' +
          '<div id="subjectSelectionGrid" class="subject-selection-grid"></div>' +
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
          '<div id="builderWarning" class="builder-warning" role="status" hidden></div>' +
        '</div>' +
      '</div>'
    );
  }

  function subjectOptions(chapters, selectedChapters, countForChapter) {
    return chapters.map(function (item) {
      const checked = selectedChapters.has(item.value);
      const available = countForChapter(item.value);
      return '<label class="subject-option' + (checked ? ' selected' : '') + '">' +
        '<input type="checkbox" value="' + escapeHtml(item.value) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="subject-check" aria-hidden="true"></span>' +
        '<span class="subject-copy"><strong>Chapter ' + escapeHtml(item.chapter) + '</strong><span>' + escapeHtml(item.title) + '</span></span>' +
        '<span class="subject-count">' + Number(available || 0) + '</span></label>';
    }).join('');
  }

  function startupFailure(missing) {
    return '<main class="startup-error"><h1>Practice page could not start</h1><p>A required application module did not load correctly.</p>' +
      '<p><strong>Missing:</strong> ' + escapeHtml((missing || []).join(', ') || 'question data') +
      '</p><p>Refresh the page. If the problem continues, check the repository validation workflow.</p></main>';
  }

  window.BoardsDashboardViews = Object.freeze({
    summaryStats: summaryStats,
    resumeCard: resumeCard,
    bankLegend: bankLegend,
    bankFilters: bankFilters,
    questionBankTiles: questionBankTiles,
    createAnalyticsSection: createAnalyticsSection,
    createTestReviewModal: createTestReviewModal,
    analyticsMetrics: analyticsMetrics,
    categoryTable: categoryTable,
    testHistoryRows: testHistoryRows,
    testReviewDetail: testReviewDetail,
    createBuilderOptions: createBuilderOptions,
    subjectOptions: subjectOptions,
    startupFailure: startupFailure
  });
})();
