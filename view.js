/*
 * Hnefatafl (Copenhagen rules) - View
 * Open source, Copyright Drew Gislason, MIT license
 * https://mit-license.org
 *
 * Responsible for rendering the board, pieces, status, and controls feedback.
 * Reads from the model; does not mutate game state.
 */

'use strict';

const View = (function () {
  let model = null;
  let boardTable = null;
  let statusEl = null;
  let henTextarea = null;

  // Rune strings from instructions
  const HNEFATAFL_RUNES = 'ᚺᚾᛖᚠᚨᛏᚨᚠᛚ'; // 9 chars
  const FUTHARK_RUNES = 'ᚠᚢᚦᚨᚱᚲ'; // 6 chars

  function init(gameModel) {
    model = gameModel;
    boardTable = document.getElementById('board');
    statusEl = document.getElementById('status');
    henTextarea = document.getElementById('hen-output');
    buildBoardStructure();
    render();
  }

  /**
   * Build the static 13x13 table structure (borders + labels + squares)
   */
  function buildBoardStructure() {
    boardTable.innerHTML = '';
    const size = model.BOARD_SIZE; // 11
    // 13 rows, 13 cols
    for (let r = 0; r < size + 2; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < size + 2; c++) {
        const td = document.createElement('td');
        // Corners of the outer table
        if ((r === 0 || r === size + 1) && (c === 0 || c === size + 1)) {
          td.className = 'border corner';
          td.textContent = '';
        }
        // Top border row (r=0), inner cells: Hnefatafl runes
        else if (r === 0 && c >= 1 && c <= size) {
          td.className = 'border';
          // Center the 9 runes in the 11 cells (positions 2..10)
          if (c >= 2 && c <= 10) {
            td.textContent = HNEFATAFL_RUNES[c - 2] || '';
          } else {
            td.textContent = '';
          }
        }
        // Bottom border row (r=size+1): file letters a-k
        else if (r === size + 1 && c >= 1 && c <= size) {
          td.className = 'border';
          td.textContent = model.FILE_LABELS[c - 1];
        }
        // Left border col (c=0), board rows: rank labels L..1
        else if (c === 0 && r >= 1 && r <= size) {
          td.className = 'border';
          td.textContent = model.RANK_LABELS[r - 1];
        }
        // Right border col (c=size+1): Futhark runes top to bottom
        else if (c === size + 1 && r >= 1 && r <= size) {
          td.className = 'border';
          // Center 6 runes in 11 rows (around middle)
          if (r >= 3 && r <= 8) {
            td.textContent = FUTHARK_RUNES[r - 3] || '';
          } else {
            td.textContent = '';
          }
        }
        // Playing squares
        else if (r >= 1 && r <= size && c >= 1 && c <= size) {
          const x = c - 1;
          const y = r - 1;
          td.className = 'square';
          td.dataset.x = x;
          td.dataset.y = y;
          if (model.isRestricted(x, y)) {
            td.classList.add('restricted');
          }
        }
        // remaining outer edge bits (should not happen)
        else {
          td.className = 'border';
        }
        tr.appendChild(td);
      }
      boardTable.appendChild(tr);
    }
  }

  /**
   * Render current model state onto the board
   */
  function render() {
    if (!model || !boardTable) return;
    const board = model.getBoard();
    const selected = model.getSelected();
    const size = model.BOARD_SIZE;

    // Clear previous highlights
    const cells = boardTable.querySelectorAll('td.square');
    cells.forEach(td => {
      td.classList.remove('selected', 'legal-target');
      // clear piece content
      td.innerHTML = '';
    });

    // Draw pieces and restricted markers
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const td = boardTable.querySelector(`td.square[data-x="${x}"][data-y="${y}"]`);
        if (!td) continue;
        const piece = board[y][x];
        if (piece === 'A') {
          const span = document.createElement('span');
          span.className = 'piece attacker';
          span.title = 'Attacker (Black)';
          td.appendChild(span);
        } else if (piece === 'D') {
          const span = document.createElement('span');
          span.className = 'piece defender';
          span.title = 'Defender (White)';
          td.appendChild(span);
        } else if (piece === 'K') {
          const span = document.createElement('span');
          span.className = 'piece king';
          span.title = 'King';
          td.appendChild(span);
        } else if (model.isRestricted(x, y)) {
          // empty restricted: show Gebo
          const span = document.createElement('span');
          span.className = 'gebo';
          span.textContent = 'ᚷ';
          td.appendChild(span);
        }
      }
    }

    // Highlight selected
    if (selected) {
      const td = boardTable.querySelector(`td.square[data-x="${selected.x}"][data-y="${selected.y}"]`);
      if (td) td.classList.add('selected');
      // optional: show legal targets
      const legals = model.getLegalMoves(selected.x, selected.y);
      for (const m of legals) {
        const t = boardTable.querySelector(`td.square[data-x="${m.x}"][data-y="${m.y}"]`);
        if (t) t.classList.add('legal-target');
      }
    }

    // Status
    statusEl.textContent = model.getStatus();
    statusEl.classList.remove('invalid');
    if (model.getStatus().toLowerCase().includes('invalid')) {
      statusEl.classList.add('invalid');
    }
  }

  /**
   * Briefly flash invalid on status
   */
  function flashInvalid() {
    statusEl.classList.add('invalid');
    setTimeout(() => statusEl.classList.remove('invalid'), 800);
  }

  /**
   * Show HEN in the textarea
   */
  function showHEN(text) {
    if (henTextarea) {
      henTextarea.value = text;
    }
  }

  /**
   * Get current HEN from textarea (for restore)
   */
  function getHENInput() {
    return henTextarea ? henTextarea.value : '';
  }

  return {
    init,
    render,
    flashInvalid,
    showHEN,
    getHENInput
  };
})();

if (typeof window !== 'undefined') {
  window.HnefataflView = View;
}
