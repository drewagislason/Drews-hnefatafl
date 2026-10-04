/*
 * Open Source — Copyright Drew Gislason
 * MIT License — https://mit-license.org
 *
 * View — renders board (Stage 1 chrome), pieces, highlights, controls,
 * status bar, and live HEN panel. Does not mutate game state.
 */

'use strict';

(function (global) {
  var TITLE_LATIN = 'Hnefatafl by Gislason';
  var TITLE_RUNES = ['ᚺ', 'ᚾ', 'ᛖ', 'ᚠ', 'ᚨ', 'ᛏ', 'ᚨ', 'ᚠ', 'ᛚ'];
  var GEBO = 'ᚷ';

  var model = null;
  var rootEl = null;
  var boardEl = null;
  var controlsEl = null;
  var statusEl = null;
  var henTextarea = null;
  var gameTypeLabel = 'Who: 2 Humans';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function createPiece(code) {
    var piece = el('div', 'piece');
    if (code === 'A') {
      piece.classList.add('piece--attacker');
    } else if (code === 'D') {
      piece.classList.add('piece--defender');
    } else if (code === 'K') {
      piece.classList.add('piece--king');
      piece.appendChild(el('span', 'piece__gebo', GEBO));
    }
    return piece;
  }

  function runePlacement() {
    var size = model.BOARD_SIZE;
    var slots = [];
    for (var i = 0; i < size; i++) slots[i] = null;
    // Center 9 runes in 11 rows (model y=0 is top = L)
    var start = Math.floor((size - TITLE_RUNES.length) / 2);
    for (var r = 0; r < TITLE_RUNES.length; r++) {
      slots[start + r] = TITLE_RUNES[r];
    }
    return slots;
  }

  function labelHtml(text, underlineIndex) {
    if (underlineIndex == null || underlineIndex < 0 || underlineIndex >= text.length) {
      return text;
    }
    return (
      text.slice(0, underlineIndex) +
      '<u class="btn__hint">' + text.charAt(underlineIndex) + '</u>' +
      text.slice(underlineIndex + 1)
    );
  }

  /**
   * Build static app chrome into root once.
   */
  function mount(root, gameModel) {
    rootEl = root;
    model = gameModel;
    rootEl.innerHTML = '';

    var boardWrap = el('div', 'board-wrap');
    boardEl = el('div', 'board');
    boardEl.setAttribute('role', 'grid');
    boardEl.setAttribute('aria-label', 'Hnefatafl board, Copenhagen 11 by 11');
    boardWrap.appendChild(boardEl);
    rootEl.appendChild(boardWrap);

    controlsEl = el('div', 'controls');
    rootEl.appendChild(controlsEl);

    statusEl = el('div', 'status-bar');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.appendChild(el('span', 'status-bar__text', ''));
    rootEl.appendChild(statusEl);

    var henPanel = el('div', 'hen-panel');
    var label = el('label', 'hen-panel__label', 'HEN notation');
    label.htmlFor = 'hen-text';
    henTextarea = document.createElement('textarea');
    henTextarea.id = 'hen-text';
    henTextarea.className = 'hen-panel__text';
    henTextarea.spellcheck = false;
    // Editable so user can paste for Restore; live updates overwrite after moves
    henTextarea.readOnly = false;
    henPanel.appendChild(label);
    henPanel.appendChild(henTextarea);
    rootEl.appendChild(henPanel);

    var copy = el('p', 'copyright', 'Copyright (c) 2026 by Drew Gislason');
    rootEl.appendChild(copy);

    buildBoardStructure();
    renderButtons();
    render();
  }

  function buildBoardStructure() {
    boardEl.innerHTML = '';
    var size = model.BOARD_SIZE;
    var runes = runePlacement();

    boardEl.appendChild(el('div', 'chrome chrome--corner'));
    var topTitle = el('div', 'chrome chrome--top', TITLE_LATIN);
    topTitle.style.gridColumn = '2 / span 11';
    boardEl.appendChild(topTitle);
    boardEl.appendChild(el('div', 'chrome chrome--corner'));

    for (var y = 0; y < size; y++) {
      boardEl.appendChild(el('div', 'chrome chrome--rank', model.RANK_LABELS[y]));

      for (var x = 0; x < size; x++) {
        var cell = el('div', 'cell');
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.dataset.coord = model.toAlgebraic(x, y);
        cell.setAttribute('role', 'gridcell');
        if (model.isRestricted(x, y)) {
          cell.classList.add('cell--restricted', 'cell--throne');
        }
        boardEl.appendChild(cell);
      }

      var runeChar = runes[y];
      boardEl.appendChild(el('div', 'chrome chrome--rune', runeChar || ''));
    }

    boardEl.appendChild(el('div', 'chrome chrome--corner'));
    for (var c = 0; c < size; c++) {
      boardEl.appendChild(el('div', 'chrome chrome--file', model.FILE_LABELS[c]));
    }
    boardEl.appendChild(el('div', 'chrome chrome--corner'));
  }

  function renderButtons() {
    controlsEl.innerHTML = '';
    var labels = [
      { id: 'btn-new', text: 'New Game', hintAt: 0 },
      { id: 'btn-save', text: 'Save', hintAt: 0 },
      { id: 'btn-restore', text: 'Restore', hintAt: 0 },
      { id: 'btn-gametype', text: gameTypeLabel, hintAt: 0 },
      { id: 'btn-rules', text: 'Rules', hintAt: 1 }
    ];
    for (var i = 0; i < labels.length; i++) {
      var item = labels[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = item.id;
      btn.className = item.id === 'btn-gametype' ? 'btn btn--who' : 'btn';
      btn.innerHTML = labelHtml(item.text, item.hintAt);
      controlsEl.appendChild(btn);
    }
  }

  function setGameTypeLabel(label) {
    gameTypeLabel = label;
    var btn = document.getElementById('btn-gametype');
    if (btn) btn.innerHTML = labelHtml(label, 0);
  }

  function render() {
    if (!model || !boardEl) return;
    var board = model.getBoard();
    var selected = model.getSelected();
    var size = model.BOARD_SIZE;
    var cells = boardEl.querySelectorAll('.cell');
    var legalSet = {};
    if (selected) {
      var legals = model.getLegalMoves(selected.x, selected.y);
      for (var i = 0; i < legals.length; i++) {
        legalSet[legals[i].x + ',' + legals[i].y] = true;
      }
    }

    for (var ci = 0; ci < cells.length; ci++) {
      var cell = cells[ci];
      var x = parseInt(cell.dataset.x, 10);
      var y = parseInt(cell.dataset.y, 10);
      cell.classList.remove('cell--selected', 'cell--legal');
      cell.innerHTML = '';

      var piece = board[y][x];
      if (model.isRestricted(x, y) && !piece) {
        cell.appendChild(el('span', 'cell__gebo', GEBO));
      }
      if (piece) cell.appendChild(createPiece(piece));

      if (selected && selected.x === x && selected.y === y) {
        cell.classList.add('cell--selected');
      }
      if (legalSet[x + ',' + y]) {
        cell.classList.add('cell--legal');
      }
    }

    var statusText = statusEl.querySelector('.status-bar__text');
    if (statusText) statusText.textContent = model.getStatus();
    statusEl.classList.toggle('status-bar--invalid',
      /invalid/i.test(model.getStatus()));

    // Live HEN (unless user is focused in the textarea for paste)
    if (henTextarea && document.activeElement !== henTextarea) {
      henTextarea.value = global.HnefataflHEN.serialize(model);
    }
  }

  function flashInvalid(msg) {
    var statusText = statusEl.querySelector('.status-bar__text');
    if (statusText) statusText.textContent = msg || 'Invalid move';
    statusEl.classList.add('status-bar--invalid');
    setTimeout(function () {
      statusEl.classList.remove('status-bar--invalid');
      if (statusText) statusText.textContent = model.getStatus();
    }, 900);
  }

  function showHEN(text) {
    if (henTextarea) henTextarea.value = text;
  }

  function getHENInput() {
    return henTextarea ? henTextarea.value : '';
  }

  function setStatusMessage(msg) {
    var statusText = statusEl.querySelector('.status-bar__text');
    if (statusText) statusText.textContent = msg;
  }

  global.HnefataflView = {
    mount: mount,
    render: render,
    renderButtons: renderButtons,
    setGameTypeLabel: setGameTypeLabel,
    flashInvalid: flashInvalid,
    showHEN: showHEN,
    getHENInput: getHENInput,
    setStatusMessage: setStatusMessage,
    getBoardElement: function () { return boardEl; },
    getHenTextarea: function () { return henTextarea; }
  };
})(typeof window !== 'undefined' ? window : this);
