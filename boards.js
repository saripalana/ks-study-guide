(function () {
  const frame = document.getElementById('examFrame');
  const loading = document.getElementById('loading');

  function examApp() {
    const VERSION = 'v1';
    const KEY = {
      ids: 'ksBoardsIds' + VERSION,
      count: 'ksBoardsCount' + VERSION,
      mode: 'ksBoardsMode' + VERSION,
      timerEnabled: 'ksBoardsTimerEnabled' + VERSION,
      timerMinutes: 'ksBoardsTimerMinutes' + VERSION,
      timerEnd: 'ksBoardsTimerEnd' + VERSION,
      timerActive: 'ksBoardsTimerActive' + VERSION,
      setupSeen: 'ksBoardsSetupSeen' + VERSION,
      app: 'kaplanBoardPrepState'
    };

    const fullBank = QUESTIONS.slice();
    const byId = new Map(fullBank.map(function (q) { return [q.id, q]; }));
    let timerInterval = null;

    function intInRange(value, fallback, min, max) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    }

    function questionCount(value) {
      return intInRange(value, 40, 1, fullBank.length);
    }

    function suggestedMinutes(count) {
      return Math.max(1, Math.ceil(count * 500 / 425));
    }

    function minuteCount(value, count) {
      return intInRange(value, suggestedMinutes(count), 1, 999);
    }

    function shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      return copy;
    }

    function savedIds() {
      try {
        const ids = JSON.parse(localStorage.getItem(KEY.ids) || '[]');
        if (!Array.isArray(ids) || !ids.length) return null;
        return ids.every(function (id) { return byId.has(id); }) ? ids : null;
      } catch (error) {
        return null;
      }
    }

    function makeSet(count) {
      const ids = shuffle(fullBank).slice(0, count).map(function (q) { return q.id; });
      localStorage.setItem(KEY.ids, JSON.stringify(ids));
      localStorage.setItem(KEY.count, String(count));
      return ids;
    }

    function resetSelectedAnswers(ids, mode) {
      try {
        const state = JSON.parse(localStorage.getItem(KEY.app) || '{}');
        state.answered = state.answered || {};
        state.testAnswers = state.testAnswers || {};
        state.testSubmitted = state.testSubmitted || {};
        ids.forEach(function (id) {
          delete state.answered[id];
          delete state.testAnswers[id];
        });
        delete state.testSubmitted['all|study'];
        state.chapter = 'all';
        state.view = 'study';
        state.mode = mode;
        state.index = 0;
        state.atSummary = false;
        localStorage.setItem(KEY.app, JSON.stringify(state));
      } catch (error) {
        console.warn('Could not reset the practice set.', error);
      }
    }

    function applySet() {
      let ids = savedIds();
      if (!ids) ids = makeSet(40);
      const selected = ids.map(function (id) { return byId.get(id); }).filter(Boolean);
      QUESTIONS.splice(0, QUESTIONS.length);
      selected.forEach(function (q) { QUESTIONS.push(q); });

      const select = document.getElementById('chapterSelect');
      if (select) {
        const all = select.querySelector('option[value="all"]');
        if (all) all.textContent = 'Practice Set (' + selected.length + ' questions)';
        select.value = 'all';
        select.disabled = true;
        select.dispatchEvent(new Event('change'));
      }
      return selected.length;
    }

    function chooseMode(mode) {
      const safe = mode === 'quiz' ? 'quiz' : 'test';
      const button = document.querySelector('.mode-toggle button[data-mode="' + safe + '"]');
      if (button) button.click();
      const badge = document.getElementById('boardsModeBadge');
      if (badge) badge.textContent = safe === 'test' ? 'TEST MODE' : 'TUTOR MODE';
      return safe;
    }

    function formatTime(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const two = function (n) { return String(n).padStart(2, '0'); };
      return h ? h + ':' + two(m) + ':' + two(s) : m + ':' + two(s);
    }

    function stopTimer() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      localStorage.setItem(KEY.timerActive, 'false');
    }

    function finishForTimeout() {
      stopTimer();
      const finish = document.getElementById('finishTestBtn');
      if (finish && finish.style.display !== 'none') finish.click();
      setTimeout(function () {
        alert('Time is up. Your test has been submitted for review.');
      }, 100);
    }

    function updateTimer() {
      const display = document.getElementById('boardsTimer');
      if (!display) return;
      const mode = localStorage.getItem(KEY.mode) === 'quiz' ? 'quiz' : 'test';
      const enabled = mode === 'test' && localStorage.getItem(KEY.timerEnabled) === 'true';
      const active = localStorage.getItem(KEY.timerActive) === 'true';
      const end = Number(localStorage.getItem(KEY.timerEnd) || 0);

      display.classList.remove('warning', 'critical');
      if (!enabled) {
        display.textContent = mode === 'test' ? 'UNTIMED' : 'TUTOR';
        return;
      }
      if (!active || !end) {
        if (document.querySelector('.summary-panel')) display.textContent = 'COMPLETED';
        else {
          display.textContent = 'TIME ENDED';
          display.classList.add('critical');
        }
        return;
      }

      const remaining = end - Date.now();
      display.textContent = formatTime(remaining);
      if (remaining <= 60000) display.classList.add('critical');
      else if (remaining <= 300000) display.classList.add('warning');
      if (remaining <= 0) finishForTimeout();
    }

    function startTimerDisplay() {
      if (timerInterval) clearInterval(timerInterval);
      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    }

    function addExamHeader(count) {
      const header = document.querySelector('header');
      if (!header || document.getElementById('boardsHeader')) return;

      const bar = document.createElement('div');
      bar.id = 'boardsHeader';
      bar.className = 'boards-header';
      bar.innerHTML =
        '<div><div class="boards-title">Psychiatry Board Practice Exam</div>' +
        '<div class="boards-subtitle">Unofficial ABPN-style interface · Kaplan &amp; Sadock question set</div></div>' +
        '<div class="boards-status">' +
        '<span class="boards-badge" id="boardsModeBadge">TEST MODE</span>' +
        '<span class="boards-timer" id="boardsTimer">--:--</span>' +
        '<button type="button" id="hideTimerBtn" class="boards-light-btn">Hide Timer</button>' +
        '<button type="button" id="newSetBtn" class="boards-light-btn">New Practice Set</button>' +
        '</div>';
      header.insertBefore(bar, header.firstChild);

      const home = document.getElementById('homeBtn');
      if (home) home.textContent = 'Exit';
      const finish = document.getElementById('finishTestBtn');
      if (finish) finish.textContent = 'End Exam';
      const select = document.getElementById('chapterSelect');
      if (select) select.title = count + ' randomly selected questions';

      document.getElementById('newSetBtn').addEventListener('click', function () { showSetup(true); });
      document.getElementById('hideTimerBtn').addEventListener('click', function () {
        const timer = document.getElementById('boardsTimer');
        const isHidden = timer.style.visibility === 'hidden';
        timer.style.visibility = isHidden ? 'visible' : 'hidden';
        this.textContent = isHidden ? 'Hide Timer' : 'Show Timer';
      });
      if (finish) finish.addEventListener('click', function () { stopTimer(); updateTimer(); });

      const content = document.getElementById('content');
      if (content) {
        new MutationObserver(function () {
          if (document.querySelector('.summary-panel')) { stopTimer(); updateTimer(); }
        }).observe(content, { childList: true, subtree: true });
      }
    }

    function showSetup(canCancel) {
      const old = document.getElementById('boardsSetup');
      if (old) old.remove();

      const count = questionCount(localStorage.getItem(KEY.count));
      const mode = localStorage.getItem(KEY.mode) === 'quiz' ? 'quiz' : 'test';
      const timerOn = localStorage.getItem(KEY.timerEnabled) !== 'false';
      const minutes = minuteCount(localStorage.getItem(KEY.timerMinutes), count);

      const overlay = document.createElement('div');
      overlay.id = 'boardsSetup';
      overlay.className = 'boards-overlay';
      overlay.innerHTML =
        '<div class="boards-dialog" role="dialog" aria-modal="true">' +
        '<h2>Build a Practice Exam</h2>' +
        '<p class="boards-intro">Choose the size and testing style for a new randomized set.</p>' +
        '<label class="boards-label" for="boardsCount">Number of questions</label>' +
        '<div class="boards-row"><input id="boardsCount" type="number" min="1" max="' + fullBank.length + '" value="' + count + '"><span>1–' + fullBank.length + '</span></div>' +
        '<div class="boards-label boards-space">Mode</div>' +
        '<div class="boards-mode-grid">' +
        '<label class="boards-mode-card ' + (mode === 'quiz' ? 'selected' : '') + '" data-mode="quiz"><input type="radio" name="boardsMode" value="quiz" ' + (mode === 'quiz' ? 'checked' : '') + '><strong>Tutor mode</strong><span>Immediate answer and explanation after each question.</span></label>' +
        '<label class="boards-mode-card ' + (mode === 'test' ? 'selected' : '') + '" data-mode="test"><input type="radio" name="boardsMode" value="test" ' + (mode === 'test' ? 'checked' : '') + '><strong>Test mode</strong><span>Answers stay hidden until the exam is submitted.</span></label>' +
        '</div>' +
        '<div class="boards-timer-box">' +
        '<label><input id="boardsTimerEnabled" type="checkbox" ' + (timerOn ? 'checked' : '') + '> Use a countdown timer</label>' +
        '<div class="boards-row boards-small-space"><input id="boardsMinutes" type="number" min="1" max="999" value="' + minutes + '"><span>minutes</span><button type="button" id="abpnPaceBtn" class="boards-secondary">Use ABPN pace</button></div>' +
        '<div class="boards-note">ABPN pace is based on 500 testing minutes for 425 questions, approximately 71 seconds per question.</div>' +
        '</div>' +
        '<div class="boards-actions">' + (canCancel ? '<button type="button" id="cancelBoardsSetup" class="boards-secondary">Cancel</button>' : '') + '<button type="button" id="startBoardsSet" class="boards-primary">Start New Set</button></div>' +
        '<div class="boards-disclaimer">Unofficial study tool. Not produced or endorsed by ABPN.</div>' +
        '</div>';
      document.body.appendChild(overlay);

      const countInput = document.getElementById('boardsCount');
      const minutesInput = document.getElementById('boardsMinutes');
      const timerCheckbox = document.getElementById('boardsTimerEnabled');
      const timerBox = overlay.querySelector('.boards-timer-box');
      let manualMinutes = false;

      function selectedMode() {
        const selected = document.querySelector('input[name="boardsMode"]:checked');
        return selected && selected.value === 'quiz' ? 'quiz' : 'test';
      }

      function refreshSetup() {
        const selected = selectedMode();
        overlay.querySelectorAll('.boards-mode-card').forEach(function (card) {
          card.classList.toggle('selected', card.getAttribute('data-mode') === selected);
        });
        const available = selected === 'test';
        timerCheckbox.disabled = !available;
        minutesInput.disabled = !available || !timerCheckbox.checked;
        timerBox.classList.toggle('disabled', !available);
      }

      overlay.querySelectorAll('input[name="boardsMode"]').forEach(function (radio) { radio.addEventListener('change', refreshSetup); });
      timerCheckbox.addEventListener('change', refreshSetup);
      countInput.addEventListener('input', function () {
        if (!manualMinutes) minutesInput.value = String(suggestedMinutes(questionCount(countInput.value)));
      });
      minutesInput.addEventListener('input', function () { manualMinutes = true; });
      document.getElementById('abpnPaceBtn').addEventListener('click', function () {
        manualMinutes = false;
        minutesInput.value = String(suggestedMinutes(questionCount(countInput.value)));
      });
      const cancel = document.getElementById('cancelBoardsSetup');
      if (cancel) cancel.addEventListener('click', function () { overlay.remove(); });

      document.getElementById('startBoardsSet').addEventListener('click', function () {
        const newCount = questionCount(countInput.value);
        const newMode = selectedMode();
        const useTimer = newMode === 'test' && timerCheckbox.checked;
        const newMinutes = minuteCount(minutesInput.value, newCount);
        const ids = makeSet(newCount);

        localStorage.setItem(KEY.mode, newMode);
        localStorage.setItem(KEY.timerEnabled, useTimer ? 'true' : 'false');
        localStorage.setItem(KEY.timerMinutes, String(newMinutes));
        localStorage.setItem(KEY.setupSeen, 'true');
        if (useTimer) {
          localStorage.setItem(KEY.timerEnd, String(Date.now() + newMinutes * 60000));
          localStorage.setItem(KEY.timerActive, 'true');
        } else {
          localStorage.removeItem(KEY.timerEnd);
          localStorage.setItem(KEY.timerActive, 'false');
        }
        resetSelectedAnswers(ids, newMode);
        window.location.reload();
      });

      refreshSetup();
      setTimeout(function () { countInput.focus(); countInput.select(); }, 50);
    }

    const count = applySet();
    addExamHeader(count);
    const mode = chooseMode(localStorage.getItem(KEY.mode));
    const all = document.getElementById('landingAllBtn');
    if (all) all.click();
    if (mode !== 'test') {
      localStorage.setItem(KEY.timerActive, 'false');
      localStorage.removeItem(KEY.timerEnd);
    }
    startTimerDisplay();
    if (!localStorage.getItem(KEY.setupSeen)) setTimeout(function () { showSetup(false); }, 100);
  }

  frame.addEventListener('load', function () {
    try {
      const doc = frame.contentDocument;
      const css = doc.createElement('link');
      css.rel = 'stylesheet';
      css.href = './boards.css?v=1';
      doc.head.appendChild(css);

      const script = doc.createElement('script');
      script.textContent = '(' + examApp.toString() + ')();';
      doc.body.appendChild(script);
      loading.style.display = 'none';
      frame.style.display = 'block';
    } catch (error) {
      loading.textContent = 'The practice exam could not be opened. Please refresh the page.';
      console.error(error);
    }
  });
})();
