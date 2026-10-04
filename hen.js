/*
 * Open Source — Copyright Drew Gislason
 * MIT License — https://mit-license.org
 *
 * HEN (Hnefatafl Encoding Notation) v1.0 — parse and serialize.
 * Spec: docs/HEN.md
 *
 * Sections (blank-line separated):
 *   1. Board state (required) — compact rows L→1, optional ,W / !W / !B
 *   2. Move list (optional)
 *   3. ASCII graphic + English status (optional)
 *
 * No draw/tie outcomes.
 */

'use strict';

(function (global) {
  var M = global.HnefataflModel;
  var BOARD_SIZE = M.BOARD_SIZE;
  var RANK_LABELS = M.RANK_LABELS;
  var FILE_LABELS = M.FILE_LABELS;

  var INITIAL_COMPACT =
    '3vvvvv3 5v5 11 v4V4v v3VVV3v vv1VVKVV1vv v3VVV3v v4V4v 11 5v5 3vvvvv3';

  /** Strip HTML comments and trim. */
  function stripComments(text) {
    return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
  }

  /**
   * Split HEN into up to 3 sections on blank lines.
   * @returns {string[]}
   */
  function splitSections(text) {
    var cleaned = stripComments(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!cleaned) return [];
    var parts = cleaned.split(/\n\s*\n/);
    var sections = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (s) sections.push(s);
    }
    return sections;
  }

  /**
   * Encode one board row (y) to compact HEN token.
   */
  function compactRow(board, y) {
    var s = '';
    var empty = 0;
    for (var x = 0; x < BOARD_SIZE; x++) {
      var p = board[y][x];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          s += String(empty);
          empty = 0;
        }
        if (p === 'A') s += 'v';
        else if (p === 'D') s += 'V';
        else if (p === 'K') s += 'K';
      }
    }
    if (empty > 0) s += String(empty);
    if (s === '') s = '11';
    return s;
  }

  /**
   * Compact board string for a full board (rows L→1).
   * @param {string[][]} board
   * @param {string} turn 'A'|'D'
   * @param {boolean} gameOver
   * @param {string|null} winner 'A'|'D'|null
   */
  function boardToCompact(board, turn, gameOver, winner) {
    var parts = [];
    for (var y = 0; y < BOARD_SIZE; y++) {
      parts.push(compactRow(board, y));
    }
    var s = parts.join(' ');
    if (gameOver && winner === 'A') s += '!B';
    else if (gameOver && winner === 'D') s += '!W';
    else if (turn === 'D') s += ',W';
    return s;
  }

  /**
   * Parse a compact board token string into a board + flags.
   * @returns {{board:any, turn:string, gameOver:boolean, winner:string|null}|{error:string}}
   */
  function parseCompactBoard(raw) {
    var text = String(raw || '').trim();
    // Pull trailing flag
    var turn = 'A';
    var gameOver = false;
    var winner = null;
    var flagMatch = text.match(/(!W|!B|,W)\s*$/);
    if (flagMatch) {
      var flag = flagMatch[1];
      text = text.slice(0, flagMatch.index).trim();
      if (flag === ',W') turn = 'D';
      else if (flag === '!W') { gameOver = true; winner = 'D'; turn = 'D'; }
      else if (flag === '!B') { gameOver = true; winner = 'A'; turn = 'A'; }
    }

    var tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length !== BOARD_SIZE) {
      return { error: 'Board state must have ' + BOARD_SIZE + ' row tokens (got ' + tokens.length + ')' };
    }

    var board = M.createEmptyBoard();
    for (var y = 0; y < BOARD_SIZE; y++) {
      var row = tokens[y];
      var x = 0;
      var i = 0;
      while (i < row.length) {
        var ch = row.charAt(i);
        if (ch >= '0' && ch <= '9') {
          var num = 0;
          while (i < row.length && row.charAt(i) >= '0' && row.charAt(i) <= '9') {
            num = num * 10 + (row.charAt(i).charCodeAt(0) - 48);
            i++;
          }
          if (num <= 0) return { error: 'Invalid empty run in row ' + RANK_LABELS[y] };
          x += num;
        } else if (ch === 'v') {
          if (x >= BOARD_SIZE) return { error: 'Row ' + RANK_LABELS[y] + ' too long' };
          board[y][x] = 'A';
          x++;
          i++;
        } else if (ch === 'V') {
          if (x >= BOARD_SIZE) return { error: 'Row ' + RANK_LABELS[y] + ' too long' };
          board[y][x] = 'D';
          x++;
          i++;
        } else if (ch === 'K') {
          if (x >= BOARD_SIZE) return { error: 'Row ' + RANK_LABELS[y] + ' too long' };
          board[y][x] = 'K';
          x++;
          i++;
        } else {
          return { error: 'Invalid character "' + ch + '" in board row ' + RANK_LABELS[y] };
        }
      }
      if (x !== BOARD_SIZE) {
        return { error: 'Row ' + RANK_LABELS[y] + ' has length ' + x + ' (expected ' + BOARD_SIZE + ')' };
      }
    }
    return { board: board, turn: turn, gameOver: gameOver, winner: winner };
  }

  /**
   * Format move list for HEN section 2.
   * @param {string[]} moveList algebraic moves
   * @param {string} startTurn 'A'|'D' — if 'D', first ply is "1.- whiteMove"
   */
  function formatMoveList(moveList, startTurn) {
    if (!moveList || moveList.length === 0) return '';
    var tokens = [];
    var i = 0;
    var moveNum = 1;

    if (startTurn === 'D') {
      // Black already "moved" before this list; first entry is White
      tokens.push(moveNum + '.-');
      if (moveList.length > 0) {
        tokens.push(moveList[0]);
        i = 1;
        moveNum = 2;
      }
    }

    while (i < moveList.length) {
      var black = moveList[i];
      tokens.push(moveNum + '.' + black);
      i++;
      if (i < moveList.length) {
        tokens.push(moveList[i]);
        i++;
      }
      moveNum++;
    }

    // Wrap ~100 chars, never split a token
    var lines = [];
    var line = '';
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      var next = line ? line + ' ' + tok : tok;
      if (next.length > 100 && line) {
        lines.push(line);
        line = tok;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }

  /**
   * Parse move list section. Lenient: x/X, l/L, missing period after number.
   * @returns {{moves:string[], error?:string, startsWithWhite?:boolean}}
   */
  function parseMoveList(text) {
    if (!text || !String(text).trim()) return { moves: [], startsWithWhite: false };
    var raw = String(text).replace(/\n/g, ' ').trim();
    // Tokenize
    var parts = raw.split(/\s+/).filter(Boolean);
    var moves = [];
    var startsWithWhite = false;
    var expectWhite = false;
    var sawNumber = false;

    for (var i = 0; i < parts.length; i++) {
      var tok = parts[i];

      // "1.-" or "1.-" combined, or "1." alone then "-" 
      var dashOnly = /^(\d+)[.]?-$/.test(tok) || tok === '-';
      if (tok === '-' || /^(\d+)\.-$/.test(tok) || /^(\d+)-$/.test(tok)) {
        startsWithWhite = true;
        expectWhite = true;
        sawNumber = true;
        continue;
      }

      // Move number prefix: "1.f2f3" or "1." or "1" (lenient missing period)
      var numMove = tok.match(/^(\d+)\.(.*)$/);
      var numOnly = tok.match(/^(\d+)$/);
      if (numMove) {
        sawNumber = true;
        expectWhite = false;
        var rest = numMove[2];
        if (rest === '-' || rest === '') {
          if (rest === '-') {
            startsWithWhite = moves.length === 0;
            expectWhite = true;
          }
          continue;
        }
        var parsed = parseOneMove(rest);
        if (!parsed) return { moves: [], error: 'Invalid move token: ' + rest };
        moves.push(parsed);
        expectWhite = true;
        continue;
      }
      if (numOnly && i + 1 < parts.length) {
        // Lenient: "1 f2f3" missing period — treat number as move number, next as move
        sawNumber = true;
        expectWhite = false;
        continue;
      }

      var m = parseOneMove(tok);
      if (!m) return { moves: [], error: 'Invalid move token: ' + tok };
      moves.push(m);
      expectWhite = !expectWhite;
    }

    return { moves: moves, startsWithWhite: startsWithWhite };
  }

  /**
   * Parse a single move like f2f3 or k4c4* (lenient x/l).
   * Returns normalized string with uppercase X/L in coords, optional trailing *.
   */
  function parseOneMove(tok) {
    var star = false;
    var s = tok;
    if (/\*$/.test(s) || /\(\*\)$/.test(s)) {
      star = true;
      s = s.replace(/\(\*\)$/, '').replace(/\*$/, '');
    }
    // Try split into from+to (each 2 or 3 chars)
    s = s.toLowerCase();
    for (var split = 2; split <= 3; split++) {
      if (s.length < split + 2 || s.length > split + 3) continue;
      var fromStr = s.slice(0, split);
      var toStr = s.slice(split);
      var from = M.fromAlgebraic(normalizeCoord(fromStr));
      var to = M.fromAlgebraic(normalizeCoord(toStr));
      if (from && to) {
        var out = M.toAlgebraic(from.x, from.y) + M.toAlgebraic(to.x, to.y);
        if (star) out += '*';
        return out;
      }
    }
    return null;
  }

  function normalizeCoord(c) {
    // fromAlgebraic lowercases file and uppercases rank; pass as-is
    return c;
  }

  /** ASCII graphic section. */
  function boardToAscii(board, statusText) {
    var lines = [];
    for (var y = 0; y < BOARD_SIZE; y++) {
      var row = RANK_LABELS[y] + ' ';
      for (var x = 0; x < BOARD_SIZE; x++) {
        var p = board[y][x];
        if (!p) row += '.';
        else if (p === 'A') row += 'v';
        else if (p === 'D') row += 'V';
        else row += 'K';
      }
      lines.push(row);
    }
    lines.push('  abcdefghijk');
    lines.push('');
    lines.push(statusText || "Black's Move");
    return lines.join('\n');
  }

  /**
   * English status for HEN footer / UI.
   */
  function englishStatus(game) {
    if (game.isGameOver()) {
      if (game.getWinner() === 'A') return 'Black Wins!';
      if (game.getWinner() === 'D') return 'White Wins!';
    }
    return game.getTurn() === 'A' ? "Black's Move" : "White's Move";
  }

  /**
   * Serialize a live game to full HEN.
   * Section 1 = starting board (before moves); section 2 = moves;
   * section 3 = current board graphic.
   * @param {object} game model instance
   * @param {object} [opts]
   * @param {string} [opts.partialSelection] algebraic from-square being selected (live UI)
   */
  function serialize(game, opts) {
    opts = opts || {};
    var startBoard = game.getStartBoard();
    var startTurn = game.getStartTurn();
    var startWinner = game.getStartWinner();
    // If we have moves, section 1 is the pre-move position (not terminal usually)
    var sec1 = boardToCompact(
      startBoard,
      startTurn,
      !!(startWinner && game.getMoveList().length === 0 && game.isGameOver()),
      startWinner
    );
    // If game loaded as terminal with no moves, reflect !W/!B on section 1
    if (game.getMoveList().length === 0 && game.isGameOver()) {
      sec1 = boardToCompact(game.getBoard(), game.getTurn(), true, game.getWinner());
    }

    var moves = game.getMoveList().slice();
    // Live selection: show partial from-square at end of move list area
    var partial = opts.partialSelection || null;
    var sel = game.getSelected();
    if (!partial && sel) {
      partial = game.toAlgebraic(sel.x, sel.y);
    }

    var sec2 = formatMoveList(moves, startTurn);
    if (partial) {
      sec2 = sec2 ? (sec2 + ' ' + partial) : partial;
    }

    var sec3 = boardToAscii(game.getBoard(), englishStatus(game));
    return sec1 + '\n\n' + (sec2 ? sec2 + '\n\n' : '') + sec3 + '\n';
  }

  /**
   * Apply a list of normalized moves onto a fresh game started from board.
   */
  function applyMoves(game, moves) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i].replace(/\*$/, '');
      var parsed = null;
      for (var split = 2; split <= 3; split++) {
        if (m.length < split + 2 || m.length > split + 3) continue;
        var from = M.fromAlgebraic(m.slice(0, split));
        var to = M.fromAlgebraic(m.slice(split));
        if (from && to) { parsed = { from: from, to: to }; break; }
      }
      if (!parsed) return { ok: false, error: 'Cannot parse move: ' + moves[i] };
      var res = game.tryMove(parsed.from.x, parsed.from.y, parsed.to.x, parsed.to.y);
      if (!res.ok) {
        return { ok: false, error: 'Illegal move in HEN: ' + moves[i] + ' (' + res.message + ')' };
      }
    }
    return { ok: true };
  }

  /**
   * Parse HEN text and load into game (mutates game).
   * @returns {{ok:boolean, error?:string}}
   */
  function parse(text, game) {
    var sections = splitSections(text);
    if (sections.length === 0) {
      return { ok: false, error: 'Empty HEN input' };
    }

    // Find board state section: first section that looks like compact board
    var boardSection = null;
    var moveSection = null;
    var graphicSection = null;

    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (!boardSection && looksLikeCompact(sec)) {
        boardSection = sec;
        continue;
      }
      if (boardSection && !moveSection && looksLikeMoves(sec)) {
        moveSection = sec;
        continue;
      }
      if (boardSection && looksLikeGraphic(sec)) {
        graphicSection = sec;
        continue;
      }
      // If first section isn't compact, reject
      if (!boardSection) {
        return { ok: false, error: 'HEN must begin with a board state section' };
      }
    }

    if (!boardSection) {
      return { ok: false, error: 'Missing board state section' };
    }

    // Compact may be multi-line? Spec is one line; allow joining
    var compactLine = boardSection.split('\n')[0].trim();
    var parsedBoard = parseCompactBoard(compactLine);
    if (parsedBoard.error) return { ok: false, error: parsedBoard.error };

    var moveInfo = { moves: [], startsWithWhite: false };
    if (moveSection) {
      moveInfo = parseMoveList(moveSection);
      if (moveInfo.error) return { ok: false, error: moveInfo.error };
    }

    // Consistency: ,W means white to move from start; "1.-" also means white first in list
    var startTurn = parsedBoard.turn;
    if (moveInfo.startsWithWhite) startTurn = 'D';

    // Load starting position
    game.newGame();
    game.setPosition(parsedBoard.board, startTurn, {
      gameOver: parsedBoard.gameOver && moveInfo.moves.length === 0,
      winner: parsedBoard.gameOver && moveInfo.moves.length === 0 ? parsedBoard.winner : null
    });

    if (moveInfo.moves.length > 0) {
      // Ensure start flags don't mark game over before moves
      game.setPosition(parsedBoard.board, startTurn, {});
      var applied = applyMoves(game, moveInfo.moves);
      if (!applied.ok) return applied;
    }

    // If board had !W/!B and no moves, already set. If moves played to a win, model handles it.
    // Optional: verify graphic status agrees — ignore mismatches softly.

    return { ok: true };
  }

  function looksLikeCompact(sec) {
    var line = sec.split('\n')[0].trim();
    // Must have mostly v/V/K/digits/spaces and optionally ,W !W !B
    if (!/^[0-9vVK\s,!WB]+$/i.test(line)) return false;
    var core = line.replace(/(!W|!B|,W)\s*$/i, '').trim();
    var tokens = core.split(/\s+/);
    return tokens.length === BOARD_SIZE;
  }

  function looksLikeMoves(sec) {
    // Has move-like tokens or move numbers
    return /\d+\./.test(sec) || /\d+-/.test(sec) || /[a-k][1-9xlXL][a-k][1-9xlXL]/i.test(sec);
  }

  function looksLikeGraphic(sec) {
    return /^[LX1-9]\s+[.vVK]{7,}/m.test(sec) || /Black's Move|White's Move|Black Wins!?|White Wins!?/i.test(sec);
  }

  /**
   * Validate round-trip helpers for tests.
   */
  function getInitialCompact() {
    return INITIAL_COMPACT;
  }

  global.HnefataflHEN = {
    serialize: serialize,
    parse: parse,
    parseCompactBoard: parseCompactBoard,
    boardToCompact: boardToCompact,
    boardToAscii: boardToAscii,
    formatMoveList: formatMoveList,
    parseMoveList: parseMoveList,
    parseOneMove: parseOneMove,
    englishStatus: englishStatus,
    splitSections: splitSections,
    getInitialCompact: getInitialCompact,
    INITIAL_COMPACT: INITIAL_COMPACT
  };
})(typeof window !== 'undefined' ? window : this);
