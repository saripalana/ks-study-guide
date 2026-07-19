(function () {
  'use strict';

  const C = window.BoardsCore;
  const dashboardScreen = document.getElementById('dashboardScreen');
  const examScreen = document.getElementById('examScreen');
  const examFrame = document.getElementById('examFrame');
  const examLoading = document.getElementById('examLoading');
  const runtimePayloads = Object.create(null);
  window.BoardsExamRuntimePayloads = runtimePayloads;

  function showDashboard() {
    C.syncActiveSetResults();
    examFrame.removeAttribute('srcdoc');
    examFrame.src = 'about:blank';
    examScreen.hidden = true;
    dashboardScreen.hidden = false;
    document.body.style.overflow = '';
    window.BoardsDashboard.render();
  }

  function runtimeBootstrapScript(token) {
    return '<script>(function(){' +
      'var payload=window.parent.BoardsExamRuntimePayloads&&window.parent.BoardsExamRuntimePayloads["' + token + '"];' +
      'if(!payload)throw new Error("Practice runtime payload is unavailable.");' +
      'window.BOARDS_RUNTIME_CONFIG=payload;' +
      'window.QUESTIONS=payload.questions.slice();' +
      'var appKey=payload.keys.app;' +
      'var proto=Storage.prototype;' +
      'var nativeGet=proto.getItem,nativeSet=proto.setItem,nativeRemove=proto.removeItem;' +
      'proto.getItem=function(key){return nativeGet.call(this,key==="kaplanBoardPrepState"?appKey:key);};' +
      'proto.setItem=function(key,value){return nativeSet.call(this,key==="kaplanBoardPrepState"?appKey:key,value);};' +
      'proto.removeItem=function(key){return nativeRemove.call(this,key==="kaplanBoardPrepState"?appKey:key);};' +
      'delete window.parent.BoardsExamRuntimePayloads["' + token + '"];' +
      '})();<\/script>';
  }

  async function buildRuntimeDocument(token) {
    const response = await fetch('./index.html?boards-runtime-template=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('The study runtime template could not be loaded.');
    const html = await response.text();
    const scripts = '<script src="data.js?v=3"></script>\n<script src="app.js?v=3"></script>';
    if (!html.includes(scripts)) throw new Error('The study runtime script markers were not found.');
    return html.replace(scripts, runtimeBootstrapScript(token) + '\n<script src="app.js?v=3"></script>');
  }

  async function launch() {
    const config = C.activeConfig();
    if (!config) return;
    config.lastOpenedAt = Date.now();
    C.writeJson(C.KEY.config, config);
    dashboardScreen.hidden = true;
    examScreen.hidden = false;
    examLoading.style.display = 'flex';
    examLoading.textContent = 'Opening your practice set…';
    document.body.style.overflow = 'hidden';

    const token = 'runtime-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    runtimePayloads[token] = {
      bank: C.activeBank,
      keys: { app: C.KEY.app, config: C.KEY.config, history: C.KEY.history },
      questions: C.fullBank.slice()
    };

    try {
      const documentText = await buildRuntimeDocument(token);
      examFrame.removeAttribute('src');
      examFrame.srcdoc = documentText;
    } catch (error) {
      delete runtimePayloads[token];
      examLoading.textContent = 'The practice set could not be opened. Return to the dashboard and try again.';
      console.error(error);
    }
  }

  function examBootstrap(runtime) {
    'use strict';

    const VERSION = 'v3';
    const value = runtime || window.BOARDS_RUNTIME_CONFIG || {};
    const KEY = value.keys || {
      config: 'ksBoardsActiveSet' + VERSION,
      history: 'ksBoardsHistory' + VERSION,
      app: 'kaplanBoardPrepState'
    };
    const bank = value.bank || { id: 'ks-psychiatry-core', title: 'K&S Psychiatry Question Bank', shortTitle: 'K&S Psychiatry' };

    function readJson(key, fallback) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null');
        return stored === null ? fallback : stored;
      } catch (error) {
        return fallback;
      }
    }

    function writeJson(key, stored) {
      localStorage.setItem(key, JSON.stringify(stored));
    }

    function getState() {
      const state = readJson(KEY.app, {});
      state.answered = state.answered || {};
      state.testAnswers = state.testAnswers || {};
      state.testSubmitted = state.testSubmitted || {};
      state.flagged = state.flagged || {};
      return state;
    }

    function formatClock(totalSeconds) {
      const total = Math.max(0, Math.ceil(totalSeconds));
      const two = function (number) { return String(number).padStart(2, '0'); };
      return two(Math.floor(total / 3600)) + ':' + two(Math.floor((total % 3600) / 60)) + ':' + two(total % 60);
    }

    function notify(action) {
      window.parent.postMessage({ type: 'ksBoardsV3', action: action, bankId: bank.id }, '*');
    }

    const config = readJson(KEY.config, null);
    if (!config || !Array.isArray(config.ids) || !config.ids.length || (config.bankId && config.bankId !== bank.id)) {
      notify('exit');
      return;
    }

    const originalBank = QUESTIONS.slice();
    const map = new Map(originalBank.map(function (question) { return [question.id, question]; }));
    const selectedQuestions = config.ids.map(function (id) { return map.get(id); }).filter(Boolean);
    if (!selectedQuestions.length) {
      notify('exit');
      return;
    }

    QUESTIONS.splice(0, QUESTIONS.length);
    selectedQuestions.forEach(function (question) { QUESTIONS.push(question); });
    document.body.classList.add('boards-exam-active');

    const pageHeading = document.querySelector('#studyScreen header h1');
    const footer = document.querySelector('#studyScreen footer');
    if (pageHeading) pageHeading.textContent = bank.title;
    if (footer) footer.textContent = selectedQuestions.length + ' selected questions from ' + bank.title + ' — personal study use.';

    const chapterSelect = document.getElementById('chapterSelect');
    if (chapterSelect) {
      const allOption = chapterSelect.querySelector('option[value="all"]');
      if (allOption) allOption.textContent = 'Practice Set (' + selectedQuestions.length + ' questions)';
      chapterSelect.value = 'all';
      chapterSelect.disabled = true;
    }

    const modeButton = document.querySelector('.mode-toggle button[data-mode="' + config.mode + '"]');
    if (modeButton) modeButton.click();
    const allButton = document.getElementById('landingAllBtn');
    if (allButton) allButton.click();

    const header = document.querySelector('#studyScreen header');
    const qnav = document.getElementById('qnav');
    const main = document.querySelector('#studyScreen main');
    const finishButton = document.getElementById('finishTestBtn');

    const customHeader = document.createElement('div');
    customHeader.className = 'boards-exam-header';
    customHeader.innerHTML =
      '<div><div class="boards-exam-title">Psychiatry Board Practice</div><div class="boards-exam-subtitle">' + bank.shortTitle + ' · ' + selectedQuestions.length + ' questions · Unofficial ABPN-style practice</div></div>' +
      '<div class="boards-exam-actions">' +
      '<span class="boards-mode-badge">' + (config.mode === 'test' ? 'TEST MODE' : 'TUTOR MODE') + '</span>' +
      '<span id="boardsLiveTimer" class="boards-live-timer">' + (config.timed ? '00:00:00' : 'UNTIMED') + '</span>' +
      '<button type="button" id="boardsHideTimer" class="boards-header-button">Hide Timer</button>' +
      '<button type="button" id="boardsDashboard" class="boards-header-button">Dashboard</button>' +
      '<button type="button" id="boardsEndSet" class="boards-header-button danger">' + (config.mode === 'test' ? 'End Exam' : 'End Set') + '</button>' +
      '</div>';
    header.insertBefore(customHeader, header.firstChild);

    const workspace = document.createElement('div');
    workspace.className = 'boards-workspace';
    const sidePanel = document.createElement('aside');
    sidePanel.className = 'boards-question-panel';
    const navHeading = document.createElement('div');
    navHeading.className = 'boards-nav-heading';
    navHeading.innerHTML =
      '<h2>Question navigator</h2>' +
      '<div class="boards-nav-counts">' +
      '<div class="boards-nav-count"><strong id="boardsAnsweredCount">0</strong>Answered</div>' +
      '<div class="boards-nav-count"><strong id="boardsRemainingCount">0</strong>Remaining</div>' +
      '<div class="boards-nav-count"><strong id="boardsCorrectCount">0</strong>Correct</div>' +
      '<div class="boards-nav-count"><strong id="boardsIncorrectCount">0</strong>Incorrect</div>' +
      '</div>' +
      '<div class="boards-nav-legend">' +
      '<span><i class="boards-dot"></i>Unanswered</span>' +
      '<span><i class="boards-dot answered"></i>Answered</span>' +
      '<span><i class="boards-dot correct"></i>Correct</span>' +
      '<span><i class="boards-dot incorrect"></i>Incorrect</span>' +
      '<span><i class="boards-dot flagged"></i>Flagged</span>' +
      '</div>';
    sidePanel.appendChild(navHeading);
    sidePanel.appendChild(qnav);
    workspace.appendChild(sidePanel);
    workspace.appendChild(main);
    header.insertAdjacentElement('afterend', workspace);
    if (finishButton) finishButton.textContent = 'End Exam';

    let timerHidden = false;
    let timeoutHandled = false;
    let syncScheduled = false;

    function saveHistoryAndConfig(forceComplete) {
      const state = getState();
      const currentConfig = readJson(KEY.config, null);
      if (!currentConfig) return;
      const history = readJson(KEY.history, {});
      const now = Date.now();

      if (currentConfig.mode === 'quiz') {
        currentConfig.ids.forEach(function (id) {
          const answer = state.answered[id];
          if (answer) history[id] = { status: answer.correct ? 'correct' : 'incorrect', timestamp: now, source: 'tutor', bankId: bank.id };
        });
      } else if (state.testSubmitted['all|study']) {
        currentConfig.ids.forEach(function (id) {
          const question = map.get(id);
          if (!question) return;
          const selected = state.testAnswers[id];
          history[id] = { status: !selected ? 'omitted' : (selected === question.correctLetter ? 'correct' : 'incorrect'), timestamp: now, source: 'test', bankId: bank.id };
        });
        forceComplete = true;
      }

      if (forceComplete) {
        currentConfig.status = 'completed';
        currentConfig.completedAt = currentConfig.completedAt || now;
      }
      writeJson(KEY.history, history);
      writeJson(KEY.config, currentConfig);
      notify('status');
    }

    function statuses() {
      const state = getState();
      const submitted = !!state.testSubmitted['all|study'];
      return selectedQuestions.map(function (question) {
        let status = 'unanswered';
        if (config.mode === 'quiz') {
          const answer = state.answered[question.id];
          if (answer) status = answer.correct ? 'correct' : 'incorrect';
        } else if (submitted) {
          const selected = state.testAnswers[question.id];
          status = !selected ? 'omitted' : (selected === question.correctLetter ? 'correct' : 'incorrect');
        } else if (state.testAnswers[question.id]) {
          status = 'answered';
        }
        return { status: status, flagged: !!state.flagged[question.id] };
      });
    }

    function updateNavigator() {
      const items = statuses();
      let answered = 0;
      let correct = 0;
      let incorrect = 0;
      qnav.querySelectorAll('.qnav-pill').forEach(function (pill, index) {
        const item = items[index];
        if (!item) return;
        pill.classList.toggle('q-omitted', item.status === 'omitted');
        if (item.status !== 'unanswered') answered += 1;
        if (item.status === 'correct') correct += 1;
        if (item.status === 'incorrect' || item.status === 'omitted') incorrect += 1;
      });
      document.getElementById('boardsAnsweredCount').textContent = String(answered);
      document.getElementById('boardsRemainingCount').textContent = String(selectedQuestions.length - answered);
      document.getElementById('boardsCorrectCount').textContent = String(correct);
      document.getElementById('boardsIncorrectCount').textContent = String(incorrect);
    }

    function scheduleSync() {
      if (syncScheduled) return;
      syncScheduled = true;
      setTimeout(function () {
        syncScheduled = false;
        updateNavigator();
        saveHistoryAndConfig(!!document.querySelector('.summary-panel'));
      }, 60);
    }

    function submitTest(automatic) {
      const state = getState();
      if (!state.testSubmitted['all|study'] && finishButton) finishButton.click();
      setTimeout(function () {
        saveHistoryAndConfig(true);
        updateNavigator();
        if (automatic) alert('Time is up. Your exam has been submitted.');
      }, 100);
    }

    function updateTimer() {
      const display = document.getElementById('boardsLiveTimer');
      const currentConfig = readJson(KEY.config, null);
      if (!display || !currentConfig) return;
      display.classList.remove('warning', 'critical');
      if (!currentConfig.timed) {
        display.textContent = 'UNTIMED';
        return;
      }
      if (currentConfig.status === 'completed') {
        display.textContent = 'COMPLETED';
        return;
      }
      const remaining = Math.max(0, Math.ceil((currentConfig.endAt - Date.now()) / 1000));
      display.textContent = formatClock(remaining);
      if (remaining <= 60) display.classList.add('critical');
      else if (remaining <= 300) display.classList.add('warning');
      if (remaining <= 0 && !timeoutHandled) {
        timeoutHandled = true;
        if (currentConfig.mode === 'test') submitTest(true);
        else {
          saveHistoryAndConfig(true);
          alert('Time is up. Your tutor set has ended.');
          notify('exit');
        }
      }
    }

    document.getElementById('boardsHideTimer').addEventListener('click', function () {
      const display = document.getElementById('boardsLiveTimer');
      timerHidden = !timerHidden;
      display.style.visibility = timerHidden ? 'hidden' : 'visible';
      this.textContent = timerHidden ? 'Show Timer' : 'Hide Timer';
    });
    document.getElementById('boardsDashboard').addEventListener('click', function () {
      saveHistoryAndConfig(false);
      notify('exit');
    });
    document.getElementById('boardsEndSet').addEventListener('click', function () {
      const text = config.mode === 'test' ? 'Submit this exam and reveal the answers?' : 'End this tutor set and return to the dashboard?';
      if (!confirm(text)) return;
      if (config.mode === 'test') submitTest(false);
      else {
        saveHistoryAndConfig(true);
        notify('exit');
      }
    });
    if (finishButton) {
      finishButton.addEventListener('click', function () {
        setTimeout(function () {
          saveHistoryAndConfig(true);
          updateNavigator();
        }, 80);
      });
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(qnav, { childList: true, subtree: true });
    const content = document.getElementById('content');
    if (content) observer.observe(content, { childList: true, subtree: true });

    updateNavigator();
    saveHistoryAndConfig(false);
    updateTimer();
    const timerInterval = setInterval(updateTimer, 250);
    window.addEventListener('beforeunload', function () {
      clearInterval(timerInterval);
      saveHistoryAndConfig(false);
    });
  }

  function init() {
    examFrame.addEventListener('load', function () {
      if (!examFrame.hasAttribute('srcdoc')) return;
      try {
        const doc = examFrame.contentDocument;
        const css = doc.createElement('link');
        css.rel = 'stylesheet';
        css.href = './boards-exam.css?v=3';
        doc.head.appendChild(css);
        const script = doc.createElement('script');
        script.textContent = '(' + examBootstrap.toString() + ')(window.BOARDS_RUNTIME_CONFIG);';
        doc.body.appendChild(script);
        examLoading.style.display = 'none';
      } catch (error) {
        examLoading.textContent = 'The practice set could not be opened. Please refresh the page.';
        console.error(error);
      }
    });

    window.addEventListener('message', function (event) {
      if (event.source !== examFrame.contentWindow) return;
      if (event.origin !== window.location.origin && event.origin !== 'null') return;
      const message = event.data || {};
      if (message.type !== 'ksBoardsV3') return;
      if (message.bankId && message.bankId !== C.activeBank.id) return;
      if (message.action === 'exit') showDashboard();
      if (message.action === 'status') C.syncActiveSetResults();
    });
  }

  window.BoardsExam = { init: init, launch: launch, showDashboard: showDashboard };
})();