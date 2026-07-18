(function () {
  'use strict';

  const C = window.BoardsCore;
  const exam = window.BoardsExam;
  if (!C || !exam) return;

  exam.launch = function () {
    const config = C.activeConfig();
    if (!config) return;
    config.lastOpenedAt = Date.now();
    C.writeJson(C.KEY.config, config, { reason: 'Practice set opened' });

    const dashboardScreen = document.getElementById('dashboardScreen');
    const examScreen = document.getElementById('examScreen');
    const examFrame = document.getElementById('examFrame');
    const examLoading = document.getElementById('examLoading');
    if (!dashboardScreen || !examScreen || !examFrame || !examLoading) return;

    dashboardScreen.hidden = true;
    examScreen.hidden = false;
    examLoading.style.display = 'flex';
    examLoading.textContent = 'Opening your provenance-aware practice set…';
    document.body.style.overflow = 'hidden';
    examFrame.src = './boards-study.html?boards=' + Date.now();
  };
})();
