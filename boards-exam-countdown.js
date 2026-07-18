(function () {
  'use strict';

  const Config = window.BoardsConfig;
  if (!Config || !Config.exam) return;

  let timer = null;

  function targetDate() {
    const parts = String(Config.exam.date || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(function (value) { return !Number.isFinite(value); })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function addStyles() {
    if (document.getElementById('examCountdownCss')) return;
    const style = document.createElement('style');
    style.id = 'examCountdownCss';
    style.textContent =
      '.welcome-row{align-items:stretch;gap:18px}' +
      '.exam-countdown-card{margin-left:auto;min-width:330px;padding:16px 18px;border:1px solid #bfd1e3;border-radius:10px;background:linear-gradient(135deg,#f7fbff,#eef5fc);box-shadow:0 1px 2px rgba(15,42,71,.05)}' +
      '.exam-countdown-kicker{font-size:11px;font-weight:800;letter-spacing:.09em;color:#2768a5}' +
      '.exam-countdown-value{margin-top:5px;font-size:25px;line-height:1.15;font-weight:850;color:#0f2a47;font-variant-numeric:tabular-nums}' +
      '.exam-countdown-label{margin-top:5px;font-size:12px;color:#62758a}' +
      '.exam-countdown-card.exam-day{border-color:#7bc291;background:#edf8f1}' +
      '.exam-countdown-card.exam-day .exam-countdown-value{color:#17633a}' +
      '@media(max-width:900px){.welcome-row{flex-direction:column}.exam-countdown-card{margin-left:0;min-width:0;width:100%}}';
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (document.getElementById('examCountdown')) return;
    const welcome = document.querySelector('.welcome-row');
    if (!welcome) return;
    addStyles();
    const card = document.createElement('aside');
    card.id = 'examCountdown';
    card.className = 'exam-countdown-card';
    card.setAttribute('aria-live', 'polite');
    card.innerHTML =
      '<div class="exam-countdown-kicker">ABPN EXAM COUNTDOWN</div>' +
      '<div id="examCountdownValue" class="exam-countdown-value">Calculating…</div>' +
      '<div id="examCountdownLabel" class="exam-countdown-label"></div>';
    welcome.appendChild(card);
  }

  function update() {
    ensureUi();
    const card = document.getElementById('examCountdown');
    const value = document.getElementById('examCountdownValue');
    const label = document.getElementById('examCountdownLabel');
    const target = targetDate();
    if (!card || !value || !label || !target) return;

    const now = new Date();
    const difference = target.getTime() - now.getTime();
    const displayDate = Config.exam.displayDate || target.toLocaleDateString([], {
      month: 'long', day: 'numeric', year: 'numeric'
    });

    if (difference <= 0) {
      const endOfDate = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
      card.classList.add('exam-day');
      if (now < endOfDate) {
        value.textContent = 'Exam day';
        label.textContent = (Config.exam.name || 'ABPN examination') + ' · ' + displayDate;
      } else {
        value.textContent = 'Exam date passed';
        label.textContent = displayDate;
        if (timer) clearInterval(timer);
      }
      return;
    }

    card.classList.remove('exam-day');
    const totalSeconds = Math.floor(difference / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const two = function (number) { return String(number).padStart(2, '0'); };
    value.textContent = days + 'd ' + two(hours) + 'h ' + two(minutes) + 'm ' + two(seconds) + 's';
    label.textContent = 'Until ' + displayDate + ' begins in this browser’s local time.';
  }

  function init() {
    update();
    timer = setInterval(update, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
