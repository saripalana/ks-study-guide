(function () {
  'use strict';

  const VERSION = 'v4';
  const LEGACY_VERSION = 'v3';
  const KEY = {
    config: 'ksBoardsActiveSet' + VERSION,
    history: 'ksBoardsHistory' + VERSION,
    settings: 'ksBoardsSettings' + VERSION,
    tests: 'ksBoardsTests' + VERSION,
    app: 'kaplanBoardPrepState'
  };
  const LEGACY_KEY = {
    config: 'ksBoardsActiveSet' + LEGACY_VERSION,
    history: 'ksBoardsHistory' + LEGACY_VERSION,
    settings: 'ksBoards