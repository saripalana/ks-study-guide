(function () {
  const STORAGE_KEY = 'kaplanBoardPrepState';

  const chapterSelect = document.getElementById('chapterSelect');
  const scoreBadge = document.getElementById('scoreBadge');
  const progressText = document.getElementById('progressText');
  const content = document.getElementById('content');
  const qnav = document.getElementById('qnav');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishTestBtn = document.getElementById('finishTestBtn');
  const resetSectionBtn = document.getElementById('resetSectionBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  const flaggedCountEl = document.getElementById('flaggedCount');
  const incorrectCountEl = document.getElementById('incorrectCount');
  const landingScreen = document.getElementById('landingScreen');
  const studyScreen = document.getElementById('studyScreen');
  const homeBtn = document.getElementById('homeBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  const chapterMap = new Map();
  QUESTIONS.forEach(q => {
    if (!chapterMap.has(q.chapter)) chapterMap.set(q.chapter, { number: q.chapter, title: q.chapterTitle, count: 0 });
    chapterMap.get(q.chapter).count += 1;
  });
  const chapters = Array.from(chapterMap.values()).sort((a, b) => a.number - b.number);
  const questionById = new Map(QUESTIONS.map(q => [q.id, q]));

  const defaults = {
    chapter: 'all',
    view: 'study',
    mode: 'quiz',
    index: 0,
    answered: {},
    testAnswers: {},
    testSubmitted: {},
    flagged: {},
    missed: {},
    atSummary: false
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('none');
      return Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  let state = loadState();
  let currentScreen = 'landing';
  let searchTerm = '';
  let browseRevealed = false;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setKey() {
    return `${state.chapter}|${state.view}`;
  }

  function matchesSearch(q, term) {
    if (q.question.toLowerCase().includes(term)) return true;
    if (q.choices.some(c => c.toLowerCase().includes(term))) return true;
    if (q.explanation && q.explanation.toLowerCase().includes(term)) return true;
    return false;
  }

  function currentList() {
    if (searchTerm) return QUESTIONS.filter(q => matchesSearch(q, searchTerm));
    let list = state.chapter === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.chapter === state.chapter);
    if (state.view === 'flagged') list = list.filter(q => state.flagged[q.id]);
    if (state.view === 'incorrect') list = list.filter(q => state.missed[q.id]);
    return list;
  }

  function clearSearch() {
    searchTerm = '';
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
  }

  function chapterFlagCounts() {
    const list = state.chapter === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.chapter === state.chapter);
    let flagged = 0, missed = 0;
    list.forEach(q => {
      if (state.flagged[q.id]) flagged += 1;
      if (state.missed[q.id]) missed += 1;
    });
    return { flagged, missed };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function populateChapterSelect() {
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `All Chapters (${QUESTIONS.length} questions)`;
    chapterSelect.appendChild(allOpt);
    chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = String(ch.number);
      opt.textContent = `Ch ${ch.number} — ${ch.title} (${ch.count})`;
      chapterSelect.appendChild(opt);
    });
    chapterSelect.value = String(state.chapter);
  }

  function isCorrectAnswer(q, letter) {
    return letter === q.correctLetter;
  }

  function questionStatus(q) {
    const submitted = !!state.testSubmitted[setKey()];
    if (state.mode === 'test') {
      if (submitted) {
        const sel = state.testAnswers[q.id];
        if (!sel) return 'omitted';
        return isCorrectAnswer(q, sel) ? 'correct' : 'incorrect';
      }
      return state.testAnswers[q.id] ? 'answered' : 'unanswered';
    }
    const a = state.answered[q.id];
    if (!a) return 'unanswered';
    return a.correct ? 'correct' : 'incorrect';
  }

  function finishTest() {
    const list = currentList();
    list.forEach(q => {
      const sel = state.testAnswers[q.id];
      if (sel && !isCorrectAnswer(q, sel)) state.missed[q.id] = true;
    });
    state.testSubmitted[setKey()] = true;
  }

  function goNext() {
    const list = currentList();
    if (!list.length) return;
    if (state.atSummary) return;
    browseRevealed = false;
    if (state.index < list.length - 1) {
      state.index += 1;
    } else {
      if (state.mode === 'test' && !state.testSubmitted[setKey()]) finishTest();
      state.atSummary = true;
    }
    saveState();
    render();
  }

  function goPrev() {
    const list = currentList();
    if (!list.length) return;
    browseRevealed = false;
    if (state.atSummary) {
      state.atSummary = false;
      state.index = list.length - 1;
    } else {
      state.index = Math.max(0, state.index - 1);
    }
    saveState();
    render();
  }

  function jumpTo(i) {
    browseRevealed = false;
    state.atSummary = false;
    state.index = i;
    saveState();
    render();
  }

  function switchView(view) {
    clearSearch();
    browseRevealed = false;
    state.view = view;
    state.index = 0;
    state.atSummary = false;
    saveState();
    render();
  }

  function switchMode(mode) {
    browseRevealed = false;
    state.mode = mode;
    state.atSummary = false;
    saveState();
    render();
  }

  function renderQnav(list, currentId) {
    if (!list.length) { qnav.innerHTML = ''; return; }
    qnav.innerHTML = list.map((q, i) => {
      const status = questionStatus(q);
      let cls = 'qnav-pill';
      if (q.id === currentId && !state.atSummary) cls += ' current';
      if (status === 'correct') cls += ' q-correct';
      else if (status === 'incorrect') cls += ' q-incorrect';
      else if (status === 'answered') cls += ' q-answered';
      const flagDot = state.flagged[q.id] ? '<span class="flag-dot"></span>' : '';
      return `<button type="button" class="${cls}" data-index="${i}">${i + 1}${flagDot}</button>`;
    }).join('');
  }

  function scopedScore(list) {
    let correct = 0, attempted = 0;
    list.forEach(q => {
      const a = state.answered[q.id];
      if (!a) return;
      attempted += 1;
      if (a.correct) correct += 1;
    });
    return { correct, attempted };
  }

  function renderSummary(list) {
    let correct = 0, incorrect = 0, omitted = 0;
    const missedRefs = [];
    list.forEach(q => {
      const status = questionStatus(q);
      if (status === 'correct') correct += 1;
      else if (status === 'incorrect') { incorrect += 1; missedRefs.push(q); }
      else omitted += 1;
    });
    const attempted = correct + incorrect;
    const pct = attempted ? Math.round((correct / attempted) * 100) : 0;

    const chipsHtml = missedRefs.map(q =>
      `<button type="button" class="missed-chip" data-jump="${q.id}">${q.chapter}.${q.qnum}</button>`
    ).join('');

    content.innerHTML = `
      <div class="summary-panel">
        <h2>Set Complete</h2>
        <p>${list.length} question${list.length === 1 ? '' : 's'} in this set.</p>
        <div class="summary-stats">
          <div class="summary-stat correct"><div class="num">${correct}</div><div class="label">Correct</div></div>
          <div class="summary-stat incorrect"><div class="num">${incorrect}</div><div class="label">Incorrect</div></div>
          <div class="summary-stat omitted"><div class="num">${omitted}</div><div class="label">Omitted</div></div>
          <div class="summary-stat"><div class="num">${pct}%</div><div class="label">Score</div></div>
        </div>
        ${missedRefs.length ? `<p>Missed questions:</p><div class="missed-chips">${chipsHtml}</div>` : ''}
        <div class="summary-actions">
          <button class="btn-secondary" id="backToFirstBtn">Back to Question 1</button>
          <button class="btn-secondary" id="restartSetBtn">Restart This Set</button>
          <button class="btn-primary" id="goIncorrectBtn">Go to Incorrect List</button>
        </div>
      </div>
    `;

    document.getElementById('backToFirstBtn').addEventListener('click', () => {
      state.atSummary = false;
      state.index = 0;
      saveState();
      render();
    });
    document.getElementById('restartSetBtn').addEventListener('click', () => {
      list.forEach(q => {
        delete state.answered[q.id];
        delete state.testAnswers[q.id];
      });
      delete state.testSubmitted[setKey()];
      state.atSummary = false;
      state.index = 0;
      saveState();
      render();
    });
    document.getElementById('goIncorrectBtn').addEventListener('click', () => {
      switchView('incorrect');
    });
    content.querySelectorAll('.missed-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const qid = chip.getAttribute('data-jump');
        const idx = list.findIndex(q => q.id === qid);
        if (idx >= 0) jumpTo(idx);
      });
    });
  }

  function chapterStats(chapterNumber) {
    const list = chapterNumber === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.chapter === chapterNumber);
    let correct = 0, incorrect = 0;
    list.forEach(q => {
      const a = state.answered[q.id];
      if (a) { if (a.correct) correct += 1; else incorrect += 1; }
    });
    return { total: list.length, correct, incorrect, attempted: correct + incorrect };
  }

  function enterStudy(chapter, view) {
    clearSearch();
    browseRevealed = false;
    state.chapter = chapter;
    state.view = view;
    state.index = 0;
    state.atSummary = false;
    chapterSelect.value = String(chapter);
    saveState();
    showScreen('study');
  }

  function renderLanding() {
    const allStats = chapterStats('all');
    const flaggedN = Object.keys(state.flagged).length;
    const missedN = Object.keys(state.missed).length;
    const attemptedN = Object.keys(state.answered).length;
    const pctComplete = QUESTIONS.length ? Math.round((attemptedN / QUESTIONS.length) * 100) : 0;

    const chapterRowsHtml = chapters.map(ch => {
      const s = chapterStats(ch.number);
      const metaParts = [`${s.total} Qs`];
      if (s.attempted) {
        metaParts.push(`<span class="stat-correct">${s.correct}&check;</span>`);
        if (s.incorrect) metaParts.push(`<span class="stat-incorrect">${s.incorrect}&cross;</span>`);
      }
      return `<button type="button" class="landing-row" data-chapter="${ch.number}" title="${escapeHtml(ch.title)}">
        <span class="ch-num">${ch.number}.</span>
        <span class="ch-title">${escapeHtml(ch.title)}</span>
        <span class="ch-meta">${metaParts.join(' &middot; ')}</span>
      </button>`;
    }).join('');

    landingScreen.innerHTML = `
      <div class="landing-hero">
        <h1>K&amp;S Study Guide</h1>
        <p>Kaplan &amp; Sadock's Study Guide and Self-Examination Review — select a chapter to begin.</p>
      </div>
      <div class="landing-quick-links">
        <button type="button" class="landing-quick-card" id="landingAllBtn">All Chapters (${allStats.total})</button>
        <button type="button" class="landing-quick-card flag-card" id="landingFlaggedBtn">&#9873; Flagged (${flaggedN})</button>
        <button type="button" class="landing-quick-card incorrect-card" id="landingIncorrectBtn">&#10007; Incorrect (${missedN})</button>
      </div>
      <p class="landing-section-label">Chapters</p>
      <div class="landing-list-wrap"><div class="landing-list">${chapterRowsHtml}</div></div>
      <div class="landing-footer">
        <div class="landing-progress">
          <div class="landing-progress-bar"><div class="landing-progress-fill" style="width:${pctComplete}%"></div></div>
          <span class="landing-progress-text">${attemptedN} of ${QUESTIONS.length} questions attempted (${pctComplete}%)</span>
        </div>
        <button type="button" class="reset-link reset-link-danger" id="landingResetAllBtn">Reset entire QBank</button>
      </div>
    `;

    document.getElementById('landingAllBtn').addEventListener('click', () => enterStudy('all', 'study'));
    document.getElementById('landingFlaggedBtn').addEventListener('click', () => enterStudy('all', 'flagged'));
    document.getElementById('landingIncorrectBtn').addEventListener('click', () => enterStudy('all', 'incorrect'));
    landingScreen.querySelectorAll('.landing-row').forEach(row => {
      row.addEventListener('click', () => enterStudy(Number(row.getAttribute('data-chapter')), 'study'));
    });
    document.getElementById('landingResetAllBtn').addEventListener('click', resetEntireQBank);
  }

  function showScreen(screen) {
    currentScreen = screen;
    if (screen === 'landing') {
      landingScreen.style.display = '';
      studyScreen.style.display = 'none';
      renderLanding();
    } else {
      landingScreen.style.display = 'none';
      studyScreen.style.display = 'block';
      render();
    }
  }

  function render() {
    const list = currentList();

    document.querySelectorAll('.tab-group button').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === state.view));
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === state.mode));
    const counts = chapterFlagCounts();
    flaggedCountEl.textContent = counts.flagged;
    incorrectCountEl.textContent = counts.missed;
    clearSearchBtn.style.display = searchTerm ? '' : 'none';

    if (!list.length) {
      qnav.innerHTML = '';
      progressText.textContent = 'No questions';
      const msg = searchTerm
        ? `No questions match "${searchTerm}".`
        : state.view === 'flagged'
          ? "You haven't flagged any questions yet. Flag a question from Study mode to save it here."
          : state.view === 'incorrect'
            ? "No incorrect questions recorded yet — nice work, or you haven't taken a quiz/test yet."
            : 'No questions in this chapter.';
      content.innerHTML = `<div class="empty-state">${msg}</div>`;
      scoreBadge.textContent = '';
      finishTestBtn.style.display = 'none';
      return;
    }

    if (state.index >= list.length) state.index = list.length - 1;
    if (state.index < 0) state.index = 0;
    const q = list[state.index];

    const score = scopedScore(list);
    scoreBadge.textContent = score.attempted
      ? `Score (this set): ${score.correct} / ${score.attempted} (${Math.round((score.correct / score.attempted) * 100)}%)`
      : '';

    finishTestBtn.style.display = (state.mode === 'test' && !state.testSubmitted[setKey()] && !state.atSummary) ? '' : 'none';

    renderQnav(list, state.atSummary ? null : q.id);

    if (state.atSummary) {
      progressText.textContent = `Set complete — ${list.length} question${list.length === 1 ? '' : 's'}`;
      renderSummary(list);
      return;
    }

    progressText.textContent = searchTerm
      ? `Search "${searchTerm}": question ${state.index + 1} of ${list.length}`
      : `Question ${state.index + 1} of ${list.length}`;

    renderQuestion(q, list);
  }

  function renderQuestion(q, list) {
    const submitted = !!state.testSubmitted[setKey()];
    const answer = state.answered[q.id];
    const isRevealedBrowse = browseRevealed;
    const testSelected = state.testAnswers[q.id];

    let showAnswer = false;
    if (state.mode === 'browse') showAnswer = isRevealedBrowse;
    else if (state.mode === 'quiz') showAnswer = !!answer;
    else if (state.mode === 'test') showAnswer = submitted;

    const choicesHtml = q.choices.map((choiceText, i) => {
      const letter = q.choiceLetters[i];
      let cls = 'choice';
      if (state.mode === 'quiz' && !answer) cls += ' clickable';
      if (state.mode === 'test' && !submitted) cls += ' clickable';

      if (state.mode === 'test' && !submitted) {
        if (testSelected === letter) cls += ' selected-test';
      } else if (showAnswer) {
        if (letter === q.correctLetter) cls += ' correct';
        const selectedLetter = state.mode === 'test' ? testSelected : (answer ? answer.selectedLetter : null);
        if (selectedLetter === letter && letter !== q.correctLetter) cls += ' incorrect';
      }
      if ((state.mode === 'quiz' && answer) || (state.mode === 'test' && submitted)) cls += ' locked';

      return `<button type="button" class="${cls}" data-letter="${letter}">
        <span class="letter">${letter}</span><span>${escapeHtml(choiceText)}</span>
      </button>`;
    }).join('');

    let answerPanelHtml = '';
    if (showAnswer) {
      let resultLine = '';
      if (state.mode === 'quiz' && answer) {
        resultLine = answer.correct
          ? '<div class="result correct-result">Correct</div>'
          : `<div class="result incorrect-result">Incorrect — correct answer is ${q.correctLetter}</div>`;
      } else if (state.mode === 'test' && submitted) {
        if (!testSelected) {
          resultLine = `<div class="result incorrect-result">Omitted — correct answer is ${q.correctLetter}</div>`;
        } else {
          resultLine = isCorrectAnswer(q, testSelected)
            ? '<div class="result correct-result">Correct</div>'
            : `<div class="result incorrect-result">Incorrect — correct answer is ${q.correctLetter}</div>`;
        }
      }
      answerPanelHtml = `
        <div class="answer-panel">
          ${resultLine}
          <div class="explanation">${escapeHtml(q.explanation || '')}</div>
        </div>`;
    }

    let actionsHtml = '';
    if (state.mode === 'browse' && !isRevealedBrowse) {
      actionsHtml = `<div class="actions"><button class="btn-primary" id="revealBtn">Show Answer</button></div>`;
    } else if (state.mode === 'test' && !submitted) {
      actionsHtml = `<p class="test-hint">Select an answer, then use Next to continue. Your answer won't be scored until you click Finish Test.</p>`;
    }

    const isFlagged = !!state.flagged[q.id];
    const canRetry = state.mode === 'quiz' && !!answer && state.view === 'study';

    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="tag">Ch ${q.chapter} · Q${q.chapter}.${q.qnum}</span>
          <div class="card-header-actions">
            ${canRetry ? '<button type="button" class="icon-btn retry-btn" id="retryBtn">↻ Retry</button>' : ''}
            <button type="button" class="icon-btn ${isFlagged ? 'flagged' : ''}" id="flagBtn">${isFlagged ? '⚑ Flagged' : '⚐ Flag'}</button>
          </div>
        </div>
        <p class="question-text">${escapeHtml(q.question)}</p>
        <div class="choices">${choicesHtml}</div>
        ${actionsHtml}
        ${answerPanelHtml}
      </div>
    `;

    document.getElementById('flagBtn').addEventListener('click', () => {
      if (state.flagged[q.id]) delete state.flagged[q.id];
      else state.flagged[q.id] = true;
      saveState();
      render();
    });

    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        delete state.answered[q.id];
        saveState();
        render();
      });
    }

    if (state.mode === 'browse') {
      const revealBtn = document.getElementById('revealBtn');
      if (revealBtn) {
        revealBtn.addEventListener('click', () => {
          browseRevealed = true;
          render();
        });
      }
    }

    if (state.mode === 'quiz' && !answer) {
      content.querySelectorAll('.choice').forEach(btn => {
        btn.addEventListener('click', () => {
          if (state.answered[q.id]) return;
          const letter = btn.getAttribute('data-letter');
          const correct = letter === q.correctLetter;
          state.answered[q.id] = { selectedLetter: letter, correct };
          if (!correct) state.missed[q.id] = true;
          else delete state.missed[q.id];
          saveState();
          render();
        });
      });
    }

    if (state.mode === 'test' && !submitted) {
      content.querySelectorAll('.choice').forEach(btn => {
        btn.addEventListener('click', () => {
          const letter = btn.getAttribute('data-letter');
          state.testAnswers[q.id] = letter;
          saveState();
          render();
        });
      });
    }
  }

  chapterSelect.addEventListener('change', () => {
    clearSearch();
    browseRevealed = false;
    state.chapter = chapterSelect.value === 'all' ? 'all' : Number(chapterSelect.value);
    state.index = 0;
    state.atSummary = false;
    saveState();
    render();
  });

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    clearSearchBtn.style.display = searchTerm ? '' : 'none';
    browseRevealed = false;
    state.index = 0;
    state.atSummary = false;
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    clearSearch();
    browseRevealed = false;
    state.index = 0;
    render();
  });

  document.querySelectorAll('.tab-group button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });

  document.querySelectorAll('.mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.getAttribute('data-mode')));
  });

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  finishTestBtn.addEventListener('click', () => {
    finishTest();
    state.atSummary = true;
    saveState();
    render();
  });

  qnav.addEventListener('click', (e) => {
    const pill = e.target.closest('.qnav-pill');
    if (!pill) return;
    jumpTo(Number(pill.getAttribute('data-index')));
  });

  resetSectionBtn.addEventListener('click', () => {
    const list = currentList();
    if (!list.length) return;
    if (!confirm(`Clear quiz/test answers, flags, and incorrect records for the ${list.length} question${list.length === 1 ? '' : 's'} currently shown? This cannot be undone.`)) return;
    list.forEach(q => {
      delete state.answered[q.id];
      delete state.testAnswers[q.id];
      delete state.flagged[q.id];
      delete state.missed[q.id];
    });
    delete state.testSubmitted[setKey()];
    browseRevealed = false;
    state.atSummary = false;
    state.index = 0;
    saveState();
    render();
  });

  function resetEntireQBank() {
    if (!confirm(`Clear ALL quiz/test answers, flags, and the incorrect-question record for the entire ${QUESTIONS.length}-question bank? This cannot be undone.`)) return;
    if (!confirm('Are you sure?')) return;
    state.answered = {};
    state.testAnswers = {};
    state.testSubmitted = {};
    state.flagged = {};
    state.missed = {};
    browseRevealed = false;
    state.atSummary = false;
    state.view = 'study';
    state.index = 0;
    saveState();
    if (currentScreen === 'landing') renderLanding(); else render();
  }

  resetAllBtn.addEventListener('click', resetEntireQBank);

  homeBtn.addEventListener('click', () => showScreen('landing'));

  populateChapterSelect();
  showScreen('landing');
})();
