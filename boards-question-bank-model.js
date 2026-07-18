(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const Registry = window.BoardsBankRegistry;
  if (!Config || !Store || !C || !Registry || !Config.questionVault) {
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

  function stringArray(value) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  function cloneQuestion(question) {
    const categories = Registry.categoriesForQuestion(question);
    const id = String(question.id);
    return {
      bankId: Config.platform.bankId,
      id: id,
      compositeId: Registry.compositeId(id),
      contentVersion: Math.max(1, Number(question.contentVersion) || 1),
      status: String(question.status || 'active'),
      cardType: String(question.cardType || 'single-best-answer'),
      chapter: Number(question.chapter),
      chapterTitle: String(question.chapterTitle || ''),
      qnum: Number(question.qnum),
      question: String(question.question || ''),
      choices: stringArray(question.choices),
      choiceLetters: stringArray(question.choiceLetters),
      correctLetter: String(question.correctLetter || ''),
      answerText: String(question.answerText || ''),
      explanation: String(question.explanation || ''),
      categories: categories,
      categoryIds: categories.map(function (category) { return category.id; }),
      tags: stringArray(question.tags),
      difficulty: question.difficulty == null ? null : String(question.difficulty),
      learningObjectives: stringArray(question.learningObjectives),
      source: question.source && typeof question.source === 'object' ? Object.assign({}, question.source) : null,
      references: Array.isArray(question.references) ? question.references.slice() : [],
      createdAt: question.createdAt || null,
      updatedAt: question.updatedAt || null
    };
  }

  function bankMetadata() {
    const bank = Registry.activeBank;
    return {
      bankId: bank.id,
      title: bank.title,
      shortTitle: bank.shortTitle,
      description: bank.description,
      boardExam: bank.boardExam,
      personalUseOnly: bank.personalUseOnly,
      sourceFile: bank.sourceFile,
      stagingBranch: bank.stagingBranch
    };
  }

  function buildMasterPackage() {
    const questions = C.fullBank.map(cloneQuestion);
    const categories = Registry.categoryCatalog(C.fullBank);
    return {
      schemaVersion: Vault.schemaVersion,
      platformId: Config.platformId,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      bankId: Config.platform.bankId,
      bank: bankMetadata(),
      environment: 'production-mirror',
      generatedAt: Date.now(),
      source: {
        repository: Vault.repository,
        branch: 'main',
        file: Registry.activeBank.sourceFile,
        build: Config.build,
        stagingBranch: Vault.stagingBranch
      },
      capacity: {
        questionCount: questions.length,
        bankLimit: Config.limits.maxCardsPerBank,
        platformLimit: Config.platform.maxTotalCards
      },
      questionCount: questions.length,
      categoryCount: categories.length,
      categories: categories,
      bankHash: hashValue(questions),
      questions: questions
    };
  }

  function emptyTimingBands() {
    const bands = {};
    Vault.timingBands.forEach(function (band) { bands[band.id] = 0; });
    return bands;
  }

  function emptyPerformance(question) {
    const id = String(question.id);
    return {
      bankId: Config.platform.bankId,
      id: id,
      compositeId: Registry.compositeId(id),
      latestStatus: 'unused',
      flagged: false,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      omitted: 0,
      accuracyPct: 0,
      totalSeconds: 0,
      averageSeconds: 0,
      fastestSeconds: null,
      slowestSeconds: null,
      timingBands: emptyTimingBands(),
      selectedLetterCounts: {},
      recentAttempts: [],
      lastAttemptAt: null,
      lastSelectedLetter: null
    };
  }

  function normalizePerformance(question, previous) {
    const item = emptyPerformance(question);
    const old = previous && typeof previous === 'object' ? previous : {};
    ['attempts', 'correct', 'incorrect', 'omitted', 'totalSeconds'].forEach(function (field) {
      item[field] = Math.max(0, Number(old[field]) || 0);
    });
    item.fastestSeconds = Number.isFinite(Number(old.fastestSeconds)) ? Math.max(0, Number(old.fastestSeconds)) : null;
    item.slowestSeconds = Number.isFinite(Number(old.slowestSeconds)) ? Math.max(0, Number(old.slowestSeconds)) : null;
    item.lastAttemptAt = Number(old.lastAttemptAt) || null;
    item.lastSelectedLetter = old.lastSelectedLetter || null;
    item.timingBands = Object.assign(emptyTimingBands(), old.timingBands || {});
    item.selectedLetterCounts = Object.assign({}, old.selectedLetterCounts || {});
    item.recentAttempts = Array.isArray(old.recentAttempts) ? old.recentAttempts.slice(0, Vault.recentAttemptsPerQuestion) : [];
    return item;
  }

  function timingBandId(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const match = Vault.timingBands.find(function (band) {
      return value >= band.minSeconds && (band.maxSeconds == null || value <= band.maxSeconds);
    });
    return match ? match.id : Vault.timingBands[Vault.timingBands.length - 1].id;
  }

  function recordAttempt(item, result, test) {
    if (!item || !result || result.status === 'unused') return;
    const seconds = Math.max(0, Number(result.seconds) || 0);
    const completedAt = Number(test && test.completedAt) || Date.now();
    item.attempts += 1;
    if (result.status === 'correct') item.correct += 1;
    else if (result.status === 'incorrect') item.incorrect += 1;
    else if (result.status === 'omitted') item.omitted += 1;
    item.totalSeconds += seconds;
    item.fastestSeconds = item.fastestSeconds == null ? seconds : Math.min(item.fastestSeconds, seconds);
    item.slowestSeconds = item.slowestSeconds == null ? seconds : Math.max(item.slowestSeconds, seconds);
    item.timingBands[timingBandId(seconds)] = (Number(item.timingBands[timingBandId(seconds)]) || 0) + 1;
    const selected = result.selectedLetter || null;
    const selectedKey = selected || 'OMITTED';
    item.selectedLetterCounts[selectedKey] = (Number(item.selectedLetterCounts[selectedKey]) || 0) + 1;
    item.recentAttempts.unshift({
      setId: String(test && test.setId || ''),
      completedAt: completedAt,
      status: result.status,
      selectedLetter: selected,
      seconds: Math.round(seconds * 10) / 10
    });
    item.recentAttempts = item.recentAttempts.slice(0, Vault.recentAttemptsPerQuestion);
    if (!item.lastAttemptAt || completedAt >= item.lastAttemptAt) {
      item.lastAttemptAt = completedAt;
      item.lastSelectedLetter = selected;
    }
  }

  function finalizePerformance(item) {
    const scored = item.correct + item.incorrect + item.omitted;
    item.accuracyPct = scored ? Math.round((item.correct / scored) * 1000) / 10 : 0;
    item.averageSeconds = item.attempts ? Math.round((item.totalSeconds / item.attempts) * 10) / 10 : 0;
    item.totalSeconds = Math.round(item.totalSeconds * 10) / 10;
    if (item.fastestSeconds != null) item.fastestSeconds = Math.round(item.fastestSeconds * 10) / 10;
    if (item.slowestSeconds != null) item.slowestSeconds = Math.round(item.slowestSeconds * 10) / 10;
    return item;
  }

  function buildCategoryPerformance(master, byId) {
    const categories = {};
    (master.categories || []).forEach(function (category) {
      categories[category.id] = {
        id: category.id,
        label: category.label,
        type: category.type,
        questionCount: 0,
        attemptedQuestionCount: 0,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        omitted: 0,
        accuracyPct: 0,
        totalSeconds: 0,
        averageSeconds: 0,
        timingBands: emptyTimingBands()
      };
    });

    master.questions.forEach(function (question) {
      const item = byId[question.id] || emptyPerformance(question);
      (question.categoryIds || []).forEach(function (categoryId) {
        const category = categories[categoryId];
        if (!category) return;
        category.questionCount += 1;
        if (item.attempts > 0) category.attemptedQuestionCount += 1;
        category.attempts += item.attempts;
        category.correct += item.correct;
        category.incorrect += item.incorrect;
        category.omitted += item.omitted;
        category.totalSeconds += item.totalSeconds;
        Object.keys(category.timingBands).forEach(function (bandId) {
          category.timingBands[bandId] += Number(item.timingBands[bandId]) || 0;
        });
      });
    });

    return Object.values(categories).map(function (category) {
      const scored = category.correct + category.incorrect + category.omitted;
      category.accuracyPct = scored ? Math.round((category.correct / scored) * 1000) / 10 : 0;
      category.averageSeconds = category.attempts ? Math.round((category.totalSeconds / category.attempts) * 10) / 10 : 0;
      category.totalSeconds = Math.round(category.totalSeconds * 10) / 10;
      return category;
    }).sort(function (a, b) {
      return a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
    });
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
      const item = normalizePerformance(question, prior[question.id]);
      item.latestStatus = C.statusForQuestion(question, state, history, config);
      item.flagged = !!state.flagged[question.id];
      byId[question.id] = item;
    });

    if (Array.isArray(tests)) {
      tests.forEach(function (test) {
        const setId = String(test && test.setId || '');
        const testBankId = String(test && test.bankId || Config.platform.bankId);
        if (!setId || testBankId !== Config.platform.bankId || processed.has(setId)) return;
        Object.entries(test.results || {}).forEach(function (entry) {
          recordAttempt(byId[entry[0]], entry[1] || {}, test);
        });
        processed.add(setId);
      });
    }

    Object.values(byId).forEach(finalizePerformance);
    const sourceMaster = master || buildMasterPackage();
    const categoryPerformance = buildCategoryPerformance(sourceMaster, byId);
    const summary = Object.values(byId).reduce(function (result, item) {
      result.attempts += item.attempts;
      result.correct += item.correct;
      result.incorrect += item.incorrect;
      result.omitted += item.omitted;
      result.totalSeconds += item.totalSeconds;
      if (item.attempts > 0) result.attemptedQuestions += 1;
      return result;
    }, { attemptedQuestions: 0, attempts: 0, correct: 0, incorrect: 0, omitted: 0, totalSeconds: 0 });
    const scored = summary.correct + summary.incorrect + summary.omitted;
    summary.accuracyPct = scored ? Math.round((summary.correct / scored) * 1000) / 10 : 0;
    summary.averageSeconds = summary.attempts ? Math.round((summary.totalSeconds / summary.attempts) * 10) / 10 : 0;
    summary.totalSeconds = Math.round(summary.totalSeconds * 10) / 10;

    const payload = {
      schemaVersion: Vault.schemaVersion,
      platformId: Config.platformId,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      bankId: Config.platform.bankId,
      bank: bankMetadata(),
      generatedAt: Date.now(),
      sourceBuild: Config.build,
      bankHash: sourceMaster.bankHash,
      savedTestCount: Array.isArray(tests) ? tests.length : 0,
      historicalTestCount: processed.size,
      processedTestIds: Array.from(processed).sort(),
      timingBands: Vault.timingBands,
      summary: summary,
      categories: categoryPerformance,
      questions: byId
    };
    payload.performanceHash = hashValue({
      questions: payload.questions,
      categories: payload.categories,
      processedTestIds: payload.processedTestIds
    });
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
      platformId: Config.platformId,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      bankId: Config.platform.bankId,
      bank: master.bank,
      environment: 'ai-ready-export',
      generatedAt: Date.now(),
      sourceBuild: Config.build,
      bankHash: master.bankHash,
      performanceHash: performance.performanceHash,
      questionCount: records.length,
      timingBands: Vault.timingBands,
      performanceSummary: performance.summary,
      categoryPerformance: performance.categories,
      analysisHints: {
        safeToEditProduction: false,
        stableIdentityField: 'compositeId',
        editableEnvironment: 'draft',
        usefulPrioritizationFields: [
          'performance.accuracyPct',
          'performance.averageSeconds',
          'performance.timingBands',
          'performance.selectedLetterCounts',
          'performance.recentAttempts',
          'categoryPerformance'
        ]
      },
      exportHash: hashValue(records),
      questions: records
    };
  }

  function validatePackage(packageValue) {
    const questions = Array.isArray(packageValue) ? packageValue : packageValue && packageValue.questions;
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const compositeIds = new Set();
    const chapterNumbers = new Set();

    if (!Array.isArray(questions) || !questions.length) {
      errors.push('No questions were found.');
      return { valid: false, errors: errors, warnings: warnings, questionCount: 0, bankHash: '' };
    }
    if (questions.length > Config.limits.maxCardsPerBank) {
      errors.push('The bank contains ' + questions.length + ' cards, exceeding the ' + Config.limits.maxCardsPerBank + '-card ceiling.');
    }

    questions.forEach(function (question, index) {
      const label = question && question.id ? question.id : 'Question ' + (index + 1);
      if (!question || typeof question !== 'object') {
        errors.push(label + ' is not an object.');
        return;
      }
      if (question.bankId && question.bankId !== Config.platform.bankId) errors.push(label + ' belongs to a different bank.');
      if (typeof question.id !== 'string' || !question.id.trim()) errors.push(label + ' has no stable id.');
      else if (ids.has(question.id)) errors.push('Duplicate question id: ' + question.id);
      else ids.add(question.id);
      const compositeId = question.compositeId || (question.id ? Registry.compositeId(question.id) : '');
      if (compositeId && compositeIds.has(compositeId)) errors.push('Duplicate composite id: ' + compositeId);
      else if (compositeId) compositeIds.add(compositeId);
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
      bankId: Config.platform.bankId,
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
    diffPackages: diffPackages,
    timingBandId: timingBandId
  });
})();
