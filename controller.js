/*
 * Hnefatafl (Copenhagen rules) - Controller
 * Open source, Copyright Drew Gislason, MIT license
 * https://mit-license.org
 *
 * Handles user input and coordinates Model + View + AI.
 * Game type is a tri-state toggle: 2 humans, 1 player (human vs computer),
 * 2 computers. May be changed at any time, including mid-game.
 *
 * 1 player: you play Black (attackers, move first); the computer plays White.
 * 2 computers: each side moves after HNEFATAFL_AI_DELAY_MS (default 1 second).
 */

'use strict';

const Controller = (function () {
  let model = null;
  let keyBuffer = '';
  let keyTimeout = null;
  let aiTimer = null;

  // Tri-state: '2humans' | '1player' | '2computers'
  let gameType = '2humans';
  const GAME_TYPES = ['2humans', '1player', '2computers'];
  const TYPE_LABELS = {
    '2humans': '2 Humans',
    '1player': '1 Player',
    '2computers': '2 Computers'
  };

  function init(gameModel) {
    model = gameModel;
    View.init(model);
    bindEvents();
    updateTypeButton();
    View.render();
    scheduleAI();
  }

  function bindEvents() {
    const board = document.getElementById('board');
    board.addEventListener('click', onBoardClick);

    document.getElementById('btn-new').addEventListener('click', onNewGame);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-restore').addEventListener('click', onRestore);
    document.getElementById('btn-type').addEventListener('click', onGameType);
    document.getElementById('btn-quit').addEventListener('click', onQuit);

    document.addEventListener('keydown', onKeyDown);

    const moveInput = document.getElementById('move-input');
    if (moveInput) {
      moveInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          tryTypedMove(moveInput.value.trim());
          moveInput.value = '';
        }
      });
    }
  }

  function updateTypeButton() {
    const btn = document.getElementById('btn-type');
    if (btn) btn.textContent = TYPE_LABELS[gameType] || gameType;
    const sub = document.querySelector('.subtitle');
    if (sub) {
      if (gameType === '1player') {
        sub.textContent = 'Copenhagen rules 11×11 — You are Black (attackers); computer is White';
      } else if (gameType === '2computers') {
        sub.textContent = 'Copenhagen rules 11×11 — Computer vs Computer';
      } else {
        sub.textContent = 'Copenhagen rules 11×11 — Two Human Players';
      }
    }
  }

  /**
   * True when the side to move should be played by the AI.
   */
  function isComputerTurn() {
    if (!model || model.isGameOver()) return false;
    const t = model.getTurn();
    if (gameType === '2computers') return true;
    if (gameType === '1player') {
      // Computer plays White (defenders)
      return t === 'D';
    }
    return false;
  }

  function stopAI() {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  function aiDelayMs() {
    if (typeof window !== 'undefined' && typeof window.HNEFATAFL_AI_DELAY_MS === 'number') {
      return window.HNEFATAFL_AI_DELAY_MS;
    }
    return 1000;
  }

  function scheduleAI() {
    stopAI();
    if (!isComputerTurn()) return;
    const ms = aiDelayMs();
    aiTimer = setTimeout(playAIMove, ms);
  }

  function playAIMove() {
    aiTimer = null;
    if (!isComputerTurn() || !window.HnefataflAI) return;
    const move = window.HnefataflAI.chooseMove(model);
    if (move) {
      const res = model.tryMove(move.fx, move.fy, move.tx, move.ty);
      View.render();
      if (res && res.message && String(res.message).toLowerCase().indexOf('invalid') !== -1) {
        View.flashInvalid();
      }
      // Show which strategy the AI leaned on (useful when watching 2 computers)
      const statusEl = document.getElementById('status');
      if (statusEl && move.strategy && !model.isGameOver()) {
        statusEl.textContent = model.getStatus() + '  ·  AI: ' + move.strategy;
      }
    }
    scheduleAI();
  }

  function afterHumanAction() {
    View.render();
    scheduleAI();
  }

  function onBoardClick(e) {
    if (isComputerTurn()) return; // ignore clicks during a computer turn
    const td = e.target.closest('td.square');
    if (!td) return;
    const x = parseInt(td.dataset.x, 10);
    const y = parseInt(td.dataset.y, 10);
    if (isNaN(x) || isNaN(y)) return;

    const result = model.selectSquare(x, y);
    View.render();
    if (result.message && result.message.toLowerCase().includes('invalid')) {
      View.flashInvalid();
    }
    scheduleAI();
  }

  function onNewGame() {
    if (!confirm('Start a new game? Current progress will be lost.')) return;
    stopAI();
    model.newGame();
    keyBuffer = '';
    if (window.HnefataflAI && window.HnefataflAI.resetPersonality) {
      window.HnefataflAI.resetPersonality();
    }
    View.render();
    View.showHEN('');
    scheduleAI();
  }

  function onSave() {
    const hen = model.toHEN();
    View.showHEN(hen);
    try {
      const blob = new Blob([hen], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hnefatafl_game.hen.txt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Download failed, use the textarea', err);
    }
  }

  function onRestore() {
    const text = View.getHENInput();
    if (!text || !text.trim()) {
      alert('Paste a HEN game into the text area below, then click Restore.');
      return;
    }
    const ok = model.fromHEN(text);
    if (ok) {
      View.render();
      alert('Game restored from HEN.');
      scheduleAI();
    } else {
      alert('Could not parse HEN. Check the format (human board graphic preferred).');
    }
  }

  function onGameType() {
    // Cycle 2 humans → 1 player → 2 computers → 2 humans
    const idx = GAME_TYPES.indexOf(gameType);
    gameType = GAME_TYPES[(idx + 1) % GAME_TYPES.length];
    updateTypeButton();
    // Deselect any human selection when switching
    const sel = model.getSelected();
    if (sel) model.selectSquare(sel.x, sel.y);
    View.render();
    scheduleAI();
  }

  function onQuit() {
    stopAI();
    alert('To quit, simply close this browser tab or window.');
  }

  function onKeyDown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      return;
    }

    const key = e.key;
    const lower = key.toLowerCase();

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
    if (lower === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onGameType();
      return;
    }
    if (lower === 'q' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onQuit();
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      keyBuffer = '';
      const sel = model.getSelected();
      if (sel) model.selectSquare(sel.x, sel.y);
      View.render();
      return;
    }

    if (isComputerTurn()) return;

    if (/^[a-kA-K1-9xXlL]$/.test(key)) {
      e.preventDefault();
      keyBuffer += lower;
      if (keyBuffer.length >= 4) {
        tryTypedMove(keyBuffer);
        keyBuffer = '';
      } else {
        clearTimeout(keyTimeout);
        keyTimeout = setTimeout(function () { keyBuffer = ''; }, 2500);
      }
      return;
    }

    if (key === 'Enter' && keyBuffer.length >= 2) {
      e.preventDefault();
      tryTypedMove(keyBuffer);
      keyBuffer = '';
    }
  }

  function tryTypedMove(str) {
    if (isComputerTurn()) return;
    str = str.replace(/[\s\-]/g, '').toLowerCase();
    if (str.length < 2) return;

    if (str.length <= 3) {
      const pos = model.fromAlgebraic(str);
      if (pos) {
        const res = model.selectSquare(pos.x, pos.y);
        View.render();
        if (res.message && res.message.toLowerCase().includes('invalid')) {
          View.flashInvalid();
        }
        scheduleAI();
        return;
      }
    }

    for (let split = 2; split <= 3; split++) {
      if (str.length < split + 2) continue;
      const fromStr = str.slice(0, split);
      const toStr = str.slice(split);
      const from = model.fromAlgebraic(fromStr);
      const to = model.fromAlgebraic(toStr);
      if (from && to) {
        const res = model.tryMove(from.x, from.y, to.x, to.y);
        View.render();
        if (!res.ok) View.flashInvalid();
        scheduleAI();
        return;
      }
    }
    View.flashInvalid();
    View.render();
  }

  return {
    init: init,
    getGameType: function () { return gameType; },
    setGameType: function (t) {
      if (GAME_TYPES.indexOf(t) !== -1) {
        gameType = t;
        updateTypeButton();
        scheduleAI();
      }
    }
  };
})();

if (typeof window !== 'undefined') {
  window.HnefataflController = Controller;
}
