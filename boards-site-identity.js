(function () {
  'use strict';

  const SITE_NAME = 'ABPN Psychiatry Study';
  const SITE_EYEBROW = 'ABPN PSYCHIATRY STUDY SITE';

  function apply() {
    const registry = window.BoardsQuestionBankRegistry;
    const bank = registry && registry.activeBank ? registry.activeBank() : null;
    const eyebrow = document.querySelector('.dashboard-topbar .dashboard-eyebrow');
    const heading = document.querySelector('.dashboard-topbar h1');
    const welcomeHeading = document.querySelector('.welcome-row h2');
    const welcomeCopy = document.querySelector('.welcome-row p');

    if (eyebrow) eyebrow.textContent = SITE_EYEBROW;
    if (heading) heading.textContent = SITE_NAME;
    if (welcomeHeading) welcomeHeading.textContent = 'Study dashboard';
    if (welcomeCopy) welcomeCopy.textContent = 'Choose a question bank, create or resume a practice set, and review your progress across the ABPN study site.';

    document.title = bank ? SITE_NAME + ' · ' + bank.shortTitle : SITE_NAME;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();

  window.addEventListener('ksboards:active-question-bank-changed', apply);
  window.BoardsSiteIdentity = Object.freeze({ apply: apply, siteName: SITE_NAME });
})();