/*
 * Hnefatafl (Copenhagen rules) - Controller
 * Open source, Copyright Drew Gislason, MIT license
 * https://mit-license.org
 *
 * Handles all user input (mouse clicks, keyboard, buttons) and coordinates
 * Model + View. Game type is fixed to 2-human for this initial version.
 */

'use strict';

const Controller = (function () {
  let model = null;
  let keyBuffer = ''; // for typed coordinates e.g. "b2b3"
  let keyTimeout = null;

  function init(gameModel) {
    model = gameModel;
    View.init(model);
    bindEvents();
    View.render();
  }

  function bindEvents() {
    // Board clicks
    const board = document.getElementById('board');
    board.addEventListener('click', onBoardClick);

    // Buttons
    document.getElementById('btn-new').addEventListener('click', onNewGame);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-restore').addEventListener('click', onRestore);
    document.getElementById('btn-type').addEventListener('click', onGameType);
    document.getElementById('btn-quit').addEventListener('click', onQuit);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Move input field (optional typed move)
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

  function onBoardClick(e) {
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
    // if move succeeded and status updated, ok
  }

  function onNewGame() {
    if (confirm('Start a new game? Current progress will be lost.')) {
      model.newGame();
      keyBuffer = '';
      View.render();
      View.showHEN('');
    }
  }

  function onSave() {
    const hen = model.toHEN();
    View.showHEN(hen);
    // Also offer download
    try {
      const blob = new Blob([hen], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hnefatafl_game.hen.txt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // fallback already showed in textarea
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
    } else {
      alert('Could not parse HEN. Check the format (human board graphic preferred).');
    }
  }

  function onGameType() {
    // Initial version: only 2 humans supported
    alert('This initial version supports 2 Human players only.\nAI (1 player / 2 computers) will be added after testing.');
  }

  function onQuit() {
    alert('To quit, simply close this browser tab or window.');
    // window.close() only works if opened by script
  }

  /**
   * Keyboard handling:
   * - N new, S save, R restore, T type, Q quit
   * - Letters/numbers build algebraic move (e.g. type b2 then b3 or b2b3)
   * - Enter confirms a full move from buffer
   * - Escape clears selection / buffer
   */
  function onKeyDown(e) {
    // Ignore if typing in textarea or input
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      return;
    }

    const key = e.key;
    const lower = key.toLowerCase();

    // Global shortcuts
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
      // deselect
      const sel = model.getSelected();
      if (sel) {
        model.selectSquare(sel.x, sel.y); // toggle off
      }
      View.render();
      return;
    }

    // Coordinate entry: a-k, 1-9, x, l  (and maybe digits)
    if (/^[a-kA-K1-9xXlL]$/.test(key)) {
      e.preventDefault();
      keyBuffer += lower;
      // Auto try when buffer looks complete (4+ chars like b2b3 or f2f3)
      if (keyBuffer.length >= 4) {
        // try parse as from+to
        tryTypedMove(keyBuffer);
        keyBuffer = '';
      } else {
        // timeout clear
        clearTimeout(keyTimeout);
        keyTimeout = setTimeout(() => { keyBuffer = ''; }, 2500);
      }
      return;
    }

    if (key === 'Enter' && keyBuffer.length >= 2) {
      e.preventDefault();
      tryTypedMove(keyBuffer);
      keyBuffer = '';
    }
  }

  /**
   * Try to interpret a string as a move: "b2b3", "b2-b3", "b2 b3", or just "b2" to select
   */
  function tryTypedMove(str) {
    str = str.replace(/[\s\-]/g, '').toLowerCase();
    if (str.length < 2) return;

    // If exactly one square: select it
    if (str.length <= 3) { // e.g. "b2", "fX", "a10" no, max 3
      const pos = model.fromAlgebraic(str);
      if (pos) {
        const res = model.selectSquare(pos.x, pos.y);
        View.render();
        if (res.message && res.message.toLowerCase().includes('invalid')) {
          View.flashInvalid();
        }
        return;
      }
    }

    // Full move: first 2-3 chars from, rest to
    // Try common lengths: 2+2, 2+3, 3+2, 3+3
    for (let split = 2; split <= 3; split++) {
      if (str.length < split + 2) continue;
      const fromStr = str.slice(0, split);
      const toStr = str.slice(split);
      const from = model.fromAlgebraic(fromStr);
      const to = model.fromAlgebraic(toStr);
      if (from && to) {
        // Prefer direct tryMove if nothing selected, or use select flow
        const res = model.tryMove(from.x, from.y, to.x, to.y);
        View.render();
        if (!res.ok) {
          View.flashInvalid();
        }
        return;
      }
    }
    // failed
    View.flashInvalid();
    model; // keep status
    View.render();
  }

  return {
    init
  };
})();

if (typeof window !== 'undefined') {
  window.HnefataflController = Controller;
}
