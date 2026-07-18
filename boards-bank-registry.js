(function () {
  'use strict';

  const Config = window.BoardsConfig;
  if (!Config || !Config.platform) throw new Error('Multi-bank platform configuration is unavailable.');

  const activeDefinition = Config.platform.activeBank;
  const activeQuestions = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
  const catalog = new Map();

  function cleanId(value, label) {
    const id = String(value || '').trim();
    if (!id) throw new Error((label || 'Identifier') + ' is required.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
      throw new Error((label || 'Identifier') + ' contains unsupported characters: ' + id);
    }
    return id;
  }

  function normalizeDefinition(definition) {
    const value = Object.assign({}, definition || {});
    value.id = cleanId(value.id, 'Bank id').toLowerCase();
    value.title = String(value.title || value.id);
    value.shortTitle = String(value.shortTitle || value.title);
    value.description = String(value.description || '');
    value.boardExam = String(value.boardExam || 'ABPN Psychiatry Certification');
    value.sourceFile = String(value.sourceFile || '');
    value.sourceType = String(value.sourceType || 'static');
    value.driveFolder = String(value.driveFolder || value.id);
    value.stagingBranch = String(value.stagingBranch || 'question-bank-staging');
    value.status = String(value.status || 'active');
    value.personalUseOnly = value.personalUseOnly !== false;
    return Object.freeze(value);
  }

  function registerDefinition(definition) {
    const normalized = normalizeDefinition(definition);
    const existing = catalog.get(normalized.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new Error('Conflicting definitions were supplied for bank ' + normalized.id + '.');
    }
    catalog.set(normalized.id, normalized);
    return normalized;
  }

  registerDefinition(activeDefinition);
  (Array.isArray(window.BOARDS_BANK_CATALOG) ? window.BOARDS_BANK_CATALOG : []).forEach(registerDefinition);

  function validateQuestions(questions, bankId) {
    const errors = [];
    const ids = new Set();
    if (!Array.isArray(questions) || !questions.length) errors.push('The active bank contains no questions.');
    if (Array.isArray(questions) && questions.length > Config.limits.maxCardsPerBank) {
      errors.push('The active bank exceeds the ' + Config.limits.maxCardsPerBank + '-card platform ceiling.');
    }
    (questions || []).forEach(function (question, index) {
      const id = question && question.id != null ? String(question.id).trim() : '';
      if (!id) errors.push('Question ' + (index + 1) + ' has no stable id.');
      else if (ids.has(id)) errors.push('Duplicate question id in ' + bankId + ': ' + id);
      else ids.add(id);
    });
    return errors;
  }

  const activeBank = catalog.get(Config.platform.bankId);
  if (!activeBank) throw new Error('The configured active bank is not registered.');
  const validationErrors = validateQuestions(activeQuestions, activeBank.id);
  if (validationErrors.length) throw new Error(validationErrors.slice(0, 3).join(' '));

  function compositeId(questionId, bankId) {
    return cleanId(bankId || activeBank.id, 'Bank id').toLowerCase() + '::' + cleanId(questionId, 'Question id');
  }

  function categoryId(type, value) {
    return String(type || 'category').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + ':' +
      String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  }

  function categoriesForQuestion(question) {
    const categories = [];
    const seen = new Set();
    function add(id, label, type) {
      const normalizedId = String(id || '').trim();
      if (!normalizedId || seen.has(normalizedId)) return;
      seen.add(normalizedId);
      categories.push({ id: normalizedId, label: String(label || normalizedId), type: String(type || 'category') });
    }

    if (question && Number.isFinite(Number(question.chapter))) {
      add(categoryId('chapter', question.chapter), question.chapterTitle || ('Chapter ' + question.chapter), 'chapter');
    }
    (Array.isArray(question && question.categories) ? question.categories : []).forEach(function (category) {
      if (typeof category === 'string') add(categoryId('category', category), category, 'category');
      else if (category && typeof category === 'object') add(category.id || categoryId(category.type, category.label), category.label, category.type);
    });
    (Array.isArray(question && question.tags) ? question.tags : []).forEach(function (tag) {
      add(categoryId('tag', tag), tag, 'tag');
    });
    return categories;
  }

  function categoryCatalog(questions) {
    const byId = new Map();
    (questions || activeQuestions).forEach(function (question) {
      categoriesForQuestion(question).forEach(function (category) {
        if (!byId.has(category.id)) byId.set(category.id, category);
      });
    });
    return Array.from(byId.values()).sort(function (a, b) {
      return a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
    });
  }

  function registryEntry(definition, questionCount, bankHash) {
    return {
      bankId: definition.id,
      title: definition.title,
      shortTitle: definition.shortTitle,
      description: definition.description,
      boardExam: definition.boardExam,
      status: definition.status,
      personalUseOnly: definition.personalUseOnly,
      driveFolder: definition.driveFolder,
      source: {
        repository: Config.questionVault.repository,
        sourceFile: definition.sourceFile,
        sourceType: definition.sourceType,
        productionBranch: 'main',
        stagingBranch: definition.stagingBranch
      },
      questionCount: Math.max(0, Number(questionCount) || 0),
      bankHash: String(bankHash || ''),
      schemaVersion: Config.questionVault.schemaVersion,
      updatedAt: Date.now()
    };
  }

  function platformRegistry(existingEntries, currentEntry) {
    const entries = new Map();
    (Array.isArray(existingEntries) ? existingEntries : []).forEach(function (entry) {
      if (entry && entry.bankId) entries.set(String(entry.bankId), entry);
    });
    if (currentEntry && currentEntry.bankId) entries.set(String(currentEntry.bankId), currentEntry);
    const banks = Array.from(entries.values()).sort(function (a, b) {
      return String(a.title || a.bankId).localeCompare(String(b.title || b.bankId));
    });
    const totalCards = banks.reduce(function (sum, bank) { return sum + Math.max(0, Number(bank.questionCount) || 0); }, 0);
    if (totalCards > Config.platform.maxTotalCards) {
      throw new Error('Registered banks contain ' + totalCards + ' cards, exceeding the ' + Config.platform.maxTotalCards + '-card personal platform ceiling.');
    }
    return {
      schemaVersion: Config.platform.registrySchemaVersion,
      platformId: Config.platformId,
      projectId: Config.projectId,
      purpose: Config.platform.purpose,
      personalUseOnly: true,
      maxTotalCards: Config.platform.maxTotalCards,
      totalCards: totalCards,
      bankCount: banks.length,
      activeBankId: activeBank.id,
      updatedAt: Date.now(),
      banks: banks
    };
  }

  window.BoardsBankRegistry = Object.freeze({
    activeBank: activeBank,
    activeQuestions: function () { return activeQuestions.slice(); },
    listDefinitions: function () { return Array.from(catalog.values()); },
    getDefinition: function (id) { return catalog.get(String(id || '').toLowerCase()) || null; },
    compositeId: compositeId,
    categoriesForQuestion: categoriesForQuestion,
    categoryCatalog: categoryCatalog,
    registryEntry: registryEntry,
    platformRegistry: platformRegistry,
    capacity: Object.freeze({
      currentCards: activeQuestions.length,
      expectedTotalCards: Config.platform.expectedTotalCards,
      maxTotalCards: Config.platform.maxTotalCards
    })
  });
})();
