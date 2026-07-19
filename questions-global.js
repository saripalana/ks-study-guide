window.QUESTIONS = QUESTIONS;
if (typeof window.BoardsBootstrapQuestionBanks !== 'function') throw new Error('Question-bank bootstrap is unavailable.');
window.BoardsBootstrapQuestionBanks(window.QUESTIONS);