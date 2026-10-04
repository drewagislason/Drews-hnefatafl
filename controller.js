/*
 * Open Source — Copyright Drew Gislason
 * MIT License — https://mit-license.org
 *
 * Controller — user input (click + keyboard), New/Save/Restore/Type,
 * wires Model + View + AI. No Quit button.
 *
 * Game type (key T) cycles:
 *   2 Humans → Black vs AI → White vs AI → AI vs AI → …
 *   Black vs AI  = human Black, AI White
 *   White vs AI  = human White, AI Black
 *   AI vs AI     = both sides by computer (uses AI delay ladder)
 *
 * Keys < / > (and , / .) adjust AI delay via HnefataflAI.adjustSpeed.
 */

'use strict';

(function (global) {
  var model = null;
  var keyBuffer = '';
  var keyTimeout = null;
  var aiTimer = null;

  var GAME_TYPES = ['2humans', 'black-ai', 'white-ai', 'ai-ai'];
  var TYPE_LABELS = {
    '2humans': 'Who: 2 Humans',
    'black-ai': 'Who: Black vs AI',
    'white-ai': 'Who: White vs AI',
    'ai-ai': 'Who: AI vs AI'
  };
  var gameType = '2humans';

  function init(gameModel) {
    model = gameModel;
    var root = document.getElementById('app');
    global.HnefataflView.mount(root, model);
    bindEvents();
    global.HnefataflView.setGameTypeLabel(TYPE_LABELS[gameType]);
    global.HnefataflView.render();
    scheduleAI();
  }

  function bindEvents() {
    var board = global.HnefataflView.getBoardElement();
    board.addEventListener('click', onBoardClick);

    document.getElementById('btn-new').addEventListener('click', onNewGame);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-restore').addEventListener('click', onRestore);
    document.getElementById('btn-rules').addEventListener('click', onRules);
    document.getElementById('btn-gametype').addEventListener('click', onGameType);

    document.addEventListener('keydown', onKeyDown);
  }

  /** True when the side to move should be played by the AI. */
  function isComputerTurn() {
    if (!model || model.isGameOver()) return false;
    if (!global.HnefataflAI || !global.HnefataflAI.isOperational()) return false;
    var t = model.getTurn();
    if (gameType === 'ai-ai') return true;
    if (gameType === 'black-ai') return t === 'D'; // human Black, AI White
    if (gameType === 'white-ai') return t === 'A'; // human White, AI Black
    return false;
  }

  function stopAI() {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  function scheduleAI() {
    stopAI();
    if (!isComputerTurn()) return;
    var ms = 0;
    if (global.HnefataflAI && global.HnefataflAI.getDelayMs) {
      ms = global.HnefataflAI.getDelayMs();
    }
    aiTimer = setTimeout(playAIMove, ms);
  }

  function playAIMove() {
    aiTimer = null;
    if (!isComputerTurn() || !global.HnefataflAI) return;
    var move = global.HnefataflAI.chooseMove(model);
    if (move) {
      var res = model.tryMove(move.fx, move.fy, move.tx, move.ty);
      global.HnefataflView.render();
      if (res && res.ok === false) {
        global.HnefataflView.flashInvalid(res.message || 'Invalid move');
      } else if (move.strategy && !model.isGameOver()) {
        global.HnefataflView.setStatusMessage(
          model.getStatus() + '  ·  AI: ' + move.strategy
        );
      }
    }
    scheduleAI();
  }

  function onBoardClick(e) {
    if (isComputerTurn()) return; // ignore clicks during a computer turn
    var cell = e.target.closest('.cell');
    if (!cell) return;
    var x = parseInt(cell.dataset.x, 10);
    var y = parseInt(cell.dataset.y, 10);
    if (isNaN(x) || isNaN(y)) return;

    var selected = model.getSelected();
    var piece = model.getPiece(x, y);
    if (selected && !piece) {
      if (!model.isLegalMove(selected.x, selected.y, x, y)) {
        model.clearSelection();
        global.HnefataflView.render();
        return;
      }
    }

    var result = model.selectSquare(x, y);
    global.HnefataflView.render();
    if (result.ok === false || (result.message && /invalid/i.test(result.message))) {
      global.HnefataflView.flashInvalid(result.message);
    }
    scheduleAI();
  }

  function onNewGame() {
    if (model.isMidGame()) {
      if (!confirm('Start a new game? Current progress will be lost.')) return;
    }
    stopAI();
    model.newGame();
    keyBuffer = '';
    if (global.HnefataflAI && global.HnefataflAI.resetPersonality) {
      global.HnefataflAI.resetPersonality();
    }
    global.HnefataflView.render();
    scheduleAI();
  }

  /** Last filename chosen in the save dialog. Default hen.txt. */
  var lastSaveName = 'hen.txt';

  function onSave() {
    var hen = global.HnefataflHEN.serialize(model);
    global.HnefataflView.showHEN(hen);
    saveHenFile(hen);
  }

  function noteSaved(name) {
    global.HnefataflView.setStatusMessage('Saved ' + name);
    setTimeout(function () { global.HnefataflView.render(); }, 800);
  }

  function downloadHen(hen, name) {
    var blob = new Blob([hen], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    noteSaved(name);
  }

  function saveHenFile(hen) {
    if (typeof window.showSaveFilePicker === 'function') {
      window.showSaveFilePicker({
        suggestedName: lastSaveName,
        startIn: 'downloads',
        types: [{
          description: 'HEN text',
          accept: { 'text/plain': ['.txt', '.hen'] }
        }]
      }).then(function (handle) {
        lastSaveName = handle.name || lastSaveName;
        return handle.createWritable().then(function (writable) {
          return writable.write(hen).then(function () {
            return writable.close();
          });
        }).then(function () {
          noteSaved(lastSaveName);
        });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        downloadHen(hen, lastSaveName);
      });
      return;
    }
    var typed = window.prompt('Save as', lastSaveName);
    if (typed == null) return;
    typed = String(typed).trim();
    if (!typed) return;
    lastSaveName = typed;
    downloadHen(hen, lastSaveName);
  }

  var restoreInput = document.createElement('input');
  restoreInput.type = 'file';
  restoreInput.accept = '.hen,.txt,text/plain';
  restoreInput.style.display = 'none';
  document.body.appendChild(restoreInput);
  restoreInput.addEventListener('change', onRestoreFile);

  function onRestore() {
    restoreInput.value = '';
    restoreInput.click();
  }

  function onRestoreFile() {
    var file = restoreInput.files && restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      applyHenText(String(reader.result || ''), file.name);
    };
    reader.onerror = function () {
      alert('Could not read that file.');
    };
    reader.readAsText(file);
  }

  function applyHenText(text, fileName) {
    if (!text || !text.trim()) {
      alert('That file is empty.');
      return;
    }
    if (model.isMidGame()) {
      if (!confirm('Restore this game? Current progress will be lost.')) return;
    }
    stopAI();
    var result = global.HnefataflHEN.parse(text, model);
    if (result.ok) {
      if (global.HnefataflAI && global.HnefataflAI.resetPersonality) {
        global.HnefataflAI.resetPersonality();
      }
      global.HnefataflView.showHEN(text);
      global.HnefataflView.render();
      global.HnefataflView.setStatusMessage(model.getStatus());
      scheduleAI();
    } else {
      alert('Could not parse HEN' + (fileName ? ' (' + fileName + ')' : '') + ': ' + (result.error || 'unknown error'));
    }
  }


  var RULES_URL = 'https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf';

  function onRules() {
    window.open(RULES_URL, '_blank', 'noopener,noreferrer');
  }

  function onGameType() {
    var idx = GAME_TYPES.indexOf(gameType);
    gameType = GAME_TYPES[(idx + 1) % GAME_TYPES.length];
    global.HnefataflView.setGameTypeLabel(TYPE_LABELS[gameType]);
    model.clearSelection();
    global.HnefataflView.render();
    scheduleAI();
  }

  function onKeyDown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      return;
    }

    var key = e.key;
    var lower = key.toLowerCase();

    if (lower === 'n' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onNewGame();
      return;
    }
    if (lower === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onSave();
      return;
    }
    if (lower === 'r' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onRestore();
      return;
    }
    if (lower === 'u' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onRules();
      return;
    }
    if (lower === 'w' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onGameType();
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      keyBuffer = '';
      model.clearSelection();
      global.HnefataflView.render();
      return;
    }

    // AI speed: > / . faster, < / , slower
    if (key === '<' || key === '>' || key === ',' || key === '.') {
      if (global.HnefataflAI && global.HnefataflAI.adjustSpeed) {
        var ms = global.HnefataflAI.adjustSpeed(key === '>' || key === '.');
        global.HnefataflView.setStatusMessage('AI delay: ' + (ms / 1000) + 's');
      }
      return;
    }

    if (isComputerTurn()) return; // ignore typed moves during AI turn

    if (/^[a-kA-K1-9xXlL]$/.test(key)) {
      e.preventDefault();
      keyBuffer += lower;
      if (keyBuffer.length >= 2) {
        maybeFlushKeyBuffer();
      }
      clearTimeout(keyTimeout);
      keyTimeout = setTimeout(function () {
        if (keyBuffer.length >= 2) tryTypedInput(keyBuffer);
        keyBuffer = '';
      }, 1200);
      return;
    }

    if (key === 'Enter' && keyBuffer.length >= 2) {
      e.preventDefault();
      tryTypedInput(keyBuffer);
      keyBuffer = '';
    }
  }

  function maybeFlushKeyBuffer() {
    if (keyBuffer.length >= 4) {
      tryTypedInput(keyBuffer);
      keyBuffer = '';
      clearTimeout(keyTimeout);
    }
  }

  function tryTypedInput(str) {
    str = str.replace(/[\s\-]/g, '').toLowerCase();
    if (str.length < 2) return;

    if (str.length <= 3) {
      var pos = model.fromAlgebraic(str);
      if (pos) {
        var res = model.selectSquare(pos.x, pos.y);
        global.HnefataflView.render();
        if (res.ok === false || (res.message && /invalid/i.test(res.message))) {
          global.HnefataflView.flashInvalid(res.message);
        }
        scheduleAI();
        return;
      }
    }

    for (var split = 2; split <= 3; split++) {
      if (str.length < split + 2) continue;
      var fromStr = str.slice(0, split);
      var toStr = str.slice(split);
      var from = model.fromAlgebraic(fromStr);
      var to = model.fromAlgebraic(toStr);
      if (from && to) {
        var moveRes = model.tryMove(from.x, from.y, to.x, to.y);
        global.HnefataflView.render();
        if (!moveRes.ok) global.HnefataflView.flashInvalid(moveRes.message);
        scheduleAI();
        return;
      }
    }
    global.HnefataflView.flashInvalid('Invalid move');
    global.HnefataflView.render();
  }

  global.HnefataflController = {
    init: init,
    getGameType: function () { return gameType; },
    setGameType: function (t) {
      if (GAME_TYPES.indexOf(t) >= 0) {
        gameType = t;
        if (global.HnefataflView) {
          global.HnefataflView.setGameTypeLabel(TYPE_LABELS[gameType]);
        }
        scheduleAI();
      }
    },
    isComputerTurn: isComputerTurn,
    scheduleAI: scheduleAI,
    stopAI: stopAI,
    TYPE_LABELS: TYPE_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
