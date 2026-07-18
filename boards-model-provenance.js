(function () {
  'use strict';

  const Base = window.BoardsQuestionBankModel;
  const C = window.BoardsCore;
  const Config = window.BoardsConfig;
  if (!Base || !C || !Config) return;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function cloneQuestion(question) {
    const copy = Base.cloneQuestion(question);
    copy.collectionId = String(question.collectionId || 'original-bank');
    copy.provenance = clone(question.provenance || {
      class: 'original-bank',
      studySource: 'original',
      originalBankMaterial: true,
      aiCreated: false,
      aiRevised: false
    });
    if (question.originalContent) copy.originalContent = clone(question.originalContent);
    return copy;
  }

  function buildMasterPackage() {
    const base = Base.buildMasterPackage();
    const questions = C.fullBank.map(cloneQuestion);
    const report = window.BOARDS_CONTENT_PROVENANCE || {};
    return Object.assign({}, base, {
      schemaVersion: Math.max(Number(base.schemaVersion) || 1, 2),
      questions: questions,
      questionCount: questions.length,
      bankHash: Base.hashValue(questions),
      provenanceSummary: {
        originalCount: Number(report.originalCount) || questions.filter(function (question) { return question.provenance.class === 'original-bank'; }).length,
        unchangedOriginalCount: Number(report.unchangedOriginalCount) || questions.filter(function (question) { return question.provenance.studySource === 'original'; }).length,
        revisedOriginalCount: Number(report.revisedOriginalCount) || questions.filter(function (question) { return question.provenance.studySource === 'ai-revised'; }).length,
        aiCreatedCount: Number(report.aiCreatedCount) || questions.filter(function (question) { return question.provenance.studySource === 'ai-created'; }).length,
        userCreatedCount: Number(report.userCreatedCount) || questions.filter(function (question) { return question.provenance.studySource === 'user-created'; }).length,
        originalSourceFile: 'data.js',
        originalSourceImmutable: true,
        overlaysOverwriteOriginalSource: false
      }
    });
  }

  window.BoardsQuestionBankModel = Object.freeze(Object.assign({}, Base, {
    cloneQuestion: cloneQuestion,
    buildMasterPackage: buildMasterPackage
  }));
})();
