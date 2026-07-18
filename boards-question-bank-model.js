(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  if (!Config || !Store || !C || !Config.questionVault) {
    throw new Error('Question bank model dependencies are unavailable.');
  }

  const Vault = Config.questionVault;
  const KEYS = Config.storage.keys;

  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + stableStringify(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function hashValue(value) {
    return hashString(stableStringify(value));
  }

  function cloneQuestion(question) {
    return {
      id: String(question.id),
      chapter: Number(question.chapter),
      chapterTitle: String(question.chapterTitle || ''),
      qnum: Number(question.qnum),
      question: String(question.question || ''),
      choices: Array.isArray(question.choices) ? question.choices.map(String) : [],
      choiceLetters: Array.isArray(question.choiceLetters) ? question.choiceLetters.map(String) : [],
      correctLetter: String(question.correctLetter || ''),
      answerText: String(question.answerText || ''),
      explanation: String(question.explanation || '')
    };
  }

  function buildMasterPackage() {
    const questions = C.fullBank.map(cloneQuestion);
    return {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      environment: 'production-mirror',
      generatedAt: Date.now(),
      source: {
        repository: Vault.repository,
        branch: 'main',
        file: 'data.js',
        build: Config.build,
        stagingBranch: Vault.stagingBranch
      },
      questionCount: questions.length,
      bankHash: hashValue(questions),
      questions: questions
    };
  }

  function emptyPerformance(question) {
    return {
      id: question.id,
      latestStatus: 'unused',
      flagged: false,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      omitted: 0,
      totalSeconds: 0,
      averageSeconds: 0,
      lastAttemptAt: null,
      lastSelectedLetter: null
    };
  }

  function buildPerformancePackage(master, previous) {
    const state = C.appState();
    const history = C.historyState();
    const config = C.activeConfig();
    const tests = Store.read(KEYS.tests, []);
    const prior = previous && previous.questions && typeof previous.questions === 'object' ? previous.questions : {};
    const processed = new Set(Array.isArray(previous && previous.processedTestIds) ? previous.processedTestIds : []);
    const byId = {};

    C.fullBank.forEach(function (question) {
      const item = emptyPerformance(question);
      const old = prior[question.id] || {};
      item.attempts = Math.max(0, Number(old.attempts) || 0);
      item.correct = Math.max(0, Number(old.correct) || 0);
      item.incorrect = Math.max(0, Number(old.incorrect) || 0);
      item.omitted = Math.max(0, Number(old.omitted) || 0);
      item.totalSeconds = Math.max(0, Number(old.totalSeconds) || 0);
      item.lastAttemptAt = Number(old.lastAttemptAt) || null;
      item.lastSelectedLetter = old.lastSelectedLetter || null;
      item.latestStatus = C.statusForQuestion(question, state, history, config);
      item.flagged = !!state.flagged[question.id];
      byId[question.id] = item;
    });

    if (Array.isArray(tests)) {
      tests.forEach(function (test) {
        const setId = String(test && test.setId || '');
        if (!setId || processed.has(setId)) return;
        Object.entries(test.results || {}).forEach(function (entry) {
          const id = entry[0];
          const result = entry[1] || {};
          const item = byId[id];
          if (!item || result.status === 'unused') return;
          item.attempts += 1;
          if (result.status === 'correct') item.correct += 1;
          else if (result.status === 'incorrect') item.incorrect += 1;
          else if (result.status === 'omitted') item.omitted += 1;
          item.totalSeconds += Math.max(0, Number(result.seconds) || 0);
          if (!item.lastAttemptAt || Number(test.completedAt) > item.lastAttemptAt) {
            item.lastAttemptAt = Number(test.completedAt) || null;
            item.lastSelectedLetter = result.selectedLetter || null;
          }
        });
        processed.add(setId);
      });
    }

    Object.values(byId).forEach(function (item) {
      item.averageSeconds = item.attempts ? Math.round((item.totalSeconds / item.attempts) * 10) / 10 : 0;
      item.totalSeconds = Math.round(item.totalSeconds * 10) / 10;
    });

    const sourceMaster = master || buildMasterPackage();
    const payload = {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      generatedAt: Date.now(),
      sourceBuild: Config.build,
      bankHash: sourceMaster.bankHash,
      savedTestCount: Array.isArray(tests) ? tests.length : 0,
      historicalTestCount: processed.size,
      processedTestIds: Array.from(processed).sort(),
      questions: byId
    };
    payload.performanceHash = hashValue({ questions: payload.questions, processedTestIds: payload.processedTestIds });
    return payload;
  }

  function buildCorrelatedPackage(master, performance) {
    const records = master.questions.map(function (question) {
      return Object.assign({}, question, {
        performance: performance.questions[question.id] || emptyPerformance(question)
      });
    });
    return {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      environment: 'ai-ready-export',
      generatedAt: Date.now(),
      sourceBuild: Config.build,
      bankHash: master.bankHash,
      performanceHash: performance.performanceHash,
      questionCount: records.length,
      exportHash: hashValue(records),
      questions: records
    };
  }

  function validatePackage(packageValue) {
    const questions = Array.isArray(packageValue) ? packageValue : packageValue && packageValue.questions;
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const chapterNumbers = new Set();

    if (!Array.isArray(questions) || !questions.length) {
      errors.push('No questions were found.');
      return { valid: false, errors: errors, warnings: warnings, questionCount: 0, bankHash: '' };
    }

    questions.forEach(function (question, index) {
      const label = question && question.id ? question.id : 'Question ' + (index + 1);
      if (!question || typeof question !== 'object') {
        errors.push(label + ' is not an object.');
        return;
      }
      if (typeof question.id !== 'string' || !question.id.trim()) errors.push(label + ' has no stable id.');
      else if (ids.has(question.id)) errors.push('Duplicate question id: ' + question.id);
      else ids.add(question.id);
      if (!Number.isFinite(Number(question.chapter))) errors.push(label + ' has an invalid chapter.');
      if (!Number.isFinite(Number(question.qnum))) errors.push(label + ' has an invalid question number.');
      const chapterKey = String(question.chapter) + '|' + String(question.qnum);
      if (chapterNumbers.has(chapterKey)) warnings.push('Duplicate chapter/question number: ' + chapterKey.replace('|', '.'));
      chapterNumbers.add(chapterKey);
      if (typeof question.question !== 'string' || !question.question.trim()) errors.push(label + ' has no question text.');
      if (!Array.isArray(question.choices) || question.choices.length < 2) errors.push(label + ' needs at least two choices.');
      if (!Array.isArray(question.choiceLetters) || question.choiceLetters.length !== (question.choices || []).length) {
        errors.push(label + ' has mismatched choices and choice letters.');
      }
      if (!Array.isArray(question.choiceLetters) || question.choiceLetters.indexOf(question.correctLetter) < 0) {
        errors.push(label + ' has a correct answer that is not one of its choices.');
      }
      if (typeof question.explanation !== 'string' || !question.explanation.trim()) warnings.push(label + ' has no explanation.');
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      questionCount: questions.length,
      bankHash: hashValue(questions.map(cloneQuestion))
    };
  }

  function diffPackages(previous, next) {
    const before = new Map((previous && previous.questions || []).map(function (question) { return [question.id, question]; }));
    const after = new Map((next && next.questions || []).map(function (question) { return [question.id, question]; }));
    const added = [];
    const removed = [];
    const changed = [];

    after.forEach(function (question, id) {
      if (!before.has(id)) {
        added.push(id);
        return;
      }
      const oldQuestion = before.get(id);
      const fields = Array.from(new Set(Object.keys(oldQuestion).concat(Object.keys(question)))).filter(function (field) {
        return stableStringify(oldQuestion[field]) !== stableStringify(question[field]);
      });
      if (fields.length) changed.push({ id: id, fields: fields });
    });
    before.forEach(function (_question, id) { if (!after.has(id)) removed.push(id); });

    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(function (a, b) { return a.id.localeCompare(b.id); })
    };
  }

  window.BoardsQuestionBankModel = Object.freeze({
    stableStringify: stableStringify,
    hashValue: hashValue,
    cloneQuestion: cloneQuestion,
    buildMasterPackage: buildMasterPackage,
    buildPerformancePackage: buildPerformancePackage,
    buildCorrelatedPackage: buildCorrelatedPackage,
    validatePackage: validatePackage,
    diffPackages: diffPackages
  });
})();