(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Registry = window.BoardsDashboardRegistry;
  if (!Config || !Config.exam || !Registry) return;

  let timer = null;

  function targetDate() {
    const parts = String(Config.exam.date || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(function (value) { return !Number.isFinite(value); })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function mountCountdown(container) {
    const card = document.createElement('aside');
    card.id = 'examCountdown';
    card.className = 'exam-countdown-card';
    card.setAttribute('role', 'timer');
    card.setAttribute('aria-live', 'off');
    card.setAttribute('aria-label', 'ABPN examination countdown');
    card.innerHTML =
      '<div class="exam-countdown-kicker">ABPN EXAM COUNTDOWN</div>' +
      '<div id="examCountdownValue" class="exam-countdown-value">Calculating…</div>' +
      '<div id="examCountdownLabel" class="exam-countdown-label"></div>';
    container.appendChild(card);
    return card;
  }

  function update() {
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
    Registry.register({
      id: 'exam-countdown',
      region: 'welcome-tools',
      order: 10,
      mount: mountCountdown
    });
    update();
    timer = setInterval(update, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
