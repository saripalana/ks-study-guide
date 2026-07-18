(function () {
  'use strict';

  if (typeof QUESTIONS === 'undefined' || !Array.isArray(QUESTIONS)) {
    throw new Error('The immutable original question source is unavailable.');
  }

  const Config = window.BoardsConfig || {};
  const generated = window.BOARDS_GENERATED_CONTENT || {
    schemaVersion: 1,
    bankId: Config.platform && Config.platform.bankId || 'ks-psychiatry-core',
    collections: { aiCreated: [], userCreated: [], revisions: [] }
  };
  const bankId = generated.bankId || Config.platform && Config.platform.bankId || 'ks-psychiatry-core';
  const contentFields = [
    'chapter', 'chapterTitle', 'qnum', 'question', 'choices', 'choiceLetters', 'correctLetter',
    'answerText', 'explanation', 'categories', 'tags', 'difficulty', 'learningObjectives',
    'references', 'source', 'cardType', 'status', 'contentVersion'
  ];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

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

  function contentSnapshot(question) {
    const snapshot = { id: String(question.id) };
    contentFields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(question, field)) snapshot[field] = clone(question[field]);
    });
    return snapshot;
  }

  function contentHash(question) {
    return hashString(stableStringify(contentSnapshot(question)));
  }

  function originalQuestion(question) {
    const copy = clone(question);
    const hash = contentHash(copy);
    copy.collectionId = 'original-bank';
    copy.provenance = {
      class: 'original-bank',
      studySource: 'original',
      displayLabel: 'ORIGINAL BANK',
      bankId: bankId,
      sourceQuestionId: String(copy.id),
      sourceFile: 'data.js',
      originalBankMaterial: true,
      immutableSource: true,
      aiCreated: false,
      aiRevised: false,
      originalContentHash: hash,
      effectiveContentHash: hash,
      modifiedFields: [],
      fieldOrigins: Object.fromEntries(contentFields.map(function (field) { return [field, 'original-bank']; }))
    };
    return copy;
  }

  const originalQuestions = QUESTIONS.map(originalQuestion);
  const byId = new Map(originalQuestions.map(function (question) { return [String(question.id), question]; }));
  const effective = originalQuestions.map(clone);
  const effectiveById = new Map(effective.map(function (question) { return [String(question.id), question]; }));
  const appliedRevisions = [];
  const revisionTargets = new Set();

  (generated.collections && generated.collections.revisions || []).forEach(function (revision) {
    const targetId = String(revision.targetQuestionId || '');
    if (!targetId || !byId.has(targetId)) throw new Error('Revision targets missing original question: ' + targetId);
    if (revisionTargets.has(targetId)) throw new Error('Only one active revision overlay is allowed per original question: ' + targetId);
    if (!revision.provenance || revision.provenance.originalBankMaterialPreserved !== true || revision.provenance.overwritesOriginalSource !== false) {
      throw new Error('Revision ' + revision.revisionId + ' must preserve original material and set overwritesOriginalSource to false.');
    }
    revisionTargets.add(targetId);

    const original = byId.get(targetId);
    const expectedHash = original.provenance.originalContentHash;
    if (revision.baseContentHash !== expectedHash) {
      throw new Error('Revision ' + revision.revisionId + ' is stale. Expected original hash ' + expectedHash + '.');
    }

    const target = effectiveById.get(targetId);
    const changedFields = Array.from(new Set((revision.changedFields || []).map(String))).sort();
    const originalSnapshot = contentSnapshot(original);
    changedFields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(revision.changes || {}, field)) {
        throw new Error('Revision ' + revision.revisionId + ' is missing declared field ' + field + '.');
      }
      target[field] = clone(revision.changes[field]);
    });
    target.originalContent = originalSnapshot;
    target.collectionId = 'ai-revisions';
    target.provenance = Object.assign({}, target.provenance, {
      class: 'ai-revised-original',
      studySource: 'ai-revised',
      displayLabel: 'ORIGINAL BANK · AI-REVISED ' + changedFields.join(', ').toUpperCase(),
      aiRevised: true,
      modifiedFields: changedFields,
      revisionId: revision.revisionId,
      revisionRationale: revision.rationale || '',
      revisionRequestId: revision.provenance && revision.provenance.requestId || '',
      revisionCreator: revision.provenance && revision.provenance.creator || 'OpenAI ChatGPT',
      revisionReviewStatus: revision.provenance && revision.provenance.reviewStatus || revision.status,
      effectiveContentHash: contentHash(target),
      fieldOrigins: Object.assign({}, target.provenance.fieldOrigins)
    });
    changedFields.forEach(function (field) { target.provenance.fieldOrigins[field] = 'ai-revision'; });
    appliedRevisions.push({ revisionId: revision.revisionId, targetQuestionId: targetId, changedFields: changedFields });
  });

  function supplementalQuestion(card, sourceClass, studySource, label) {
    const copy = clone(card);
    const id = String(copy.id || '');
    if (!id) throw new Error('Supplemental card has no stable id.');
    if (effectiveById.has(id)) throw new Error('Supplemental card id conflicts with an existing card: ' + id);
    const hash = contentHash(copy);
    copy.collectionId = card.collectionId;
    copy.provenance = Object.assign({}, card.provenance || {}, {
      class: sourceClass,
      studySource: studySource,
      displayLabel: label,
      bankId: bankId,
      sourceQuestionId: id,
      originalBankMaterial: false,
      immutableSource: false,
      aiCreated: sourceClass === 'ai-created',
      aiRevised: false,
      originalContentHash: null,
      effectiveContentHash: hash,
      modifiedFields: [],
      fieldOrigins: Object.fromEntries(contentFields.map(function (field) { return [field, sourceClass]; }))
    });
    effectiveById.set(id, copy);
    effective.push(copy);
  }

  (generated.collections && generated.collections.aiCreated || []).forEach(function (card) {
    supplementalQuestion(card, 'ai-created', 'ai-created', 'AI-CREATED · PERSONAL SUPPLEMENT');
  });
  (generated.collections && generated.collections.userCreated || []).forEach(function (card) {
    supplementalQuestion(card, 'user-created', 'user-created', 'USER-CREATED · PERSONAL SUPPLEMENT');
  });

  const report = {
    schemaVersion: 1,
    bankId: bankId,
    originalCount: originalQuestions.length,
    effectiveCount: effective.length,
    unchangedOriginalCount: originalQuestions.length - appliedRevisions.length,
    revisedOriginalCount: appliedRevisions.length,
    aiCreatedCount: (generated.collections && generated.collections.aiCreated || []).length,
    userCreatedCount: (generated.collections && generated.collections.userCreated || []).length,
    appliedRevisions: appliedRevisions
  };

  window.BOARDS_ORIGINAL_QUESTIONS = Object.freeze(originalQuestions.map(function (question) { return Object.freeze(question); }));
  window.BOARDS_CONTENT_PROVENANCE = Object.freeze(report);
  window.BOARDS_CONTENT_HASH = contentHash;

  QUESTIONS.splice(0, QUESTIONS.length);
  effective.forEach(function (question) { QUESTIONS.push(question); });
  window.QUESTIONS = QUESTIONS;
})();
