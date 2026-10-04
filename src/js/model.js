/*
 * Open Source — Copyright Drew Gislason
 * MIT License — https://mit-license.org
 *
 * Hnefatafl game model (Copenhagen 11×11 rules).
 * Pure logic: board, movement, captures (custodian + shieldwall),
 * win conditions. No draws/ties (Copenhagen §7 draw line is treated as error).
 * No DOM. View/Controller/HEN depend on this, not vice versa.
 *
 * Coordinates:
 *   x = 0..10  (files a..k)
 *   y = 0..10  (ranks L,X,9..1 from top to bottom; y=0 is L, y=10 is 1)
 *
 * Pieces: 'A' attacker (black), 'D' defender (white), 'K' king, null empty.
 *
 * Restricted squares (king only): corners + throne (5,5).
 *
 * Repetition: threefold occurrence of the same (board + side-to-move)
 * is treated as perpetual repetition → White loses.
 *
 * Exit fort: conservative heuristic (see isExitFort docs). May miss some
 * theoretical forts; prefers false-negative over false-positive.
 */

'use strict';

(function (global) {
  var BOARD_SIZE = 11;
  var THRONE = { x: 5, y: 5 };
  var CORNERS = [
    { x: 0, y: 0 }, { x: 0, y: 10 },
    { x: 10, y: 0 }, { x: 10, y: 10 }
  ];
  var RANK_LABELS = ['L', 'X', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
  var FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];

  function createEmptyBoard() {
    var board = [];
    for (var y = 0; y < BOARD_SIZE; y++) {
      board[y] = [];
      for (var x = 0; x < BOARD_SIZE; x++) {
        board[y][x] = null;
      }
    }
    return board;
  }

  /** Copenhagen 11×11 initial setup: 24 attackers, 12 defenders, 1 king. */
  function createInitialBoard() {
    var board = createEmptyBoard();
    var x, y;

    for (x = 3; x <= 7; x++) board[0][x] = 'A';
    for (x = 3; x <= 7; x++) board[10][x] = 'A';
    for (y = 3; y <= 7; y++) board[y][0] = 'A';
    for (y = 3; y <= 7; y++) board[y][10] = 'A';
    board[1][5] = 'A';
    board[9][5] = 'A';
    board[5][1] = 'A';
    board[5][9] = 'A';

    board[5][5] = 'K';
    board[3][5] = 'D';
    board[4][4] = 'D'; board[4][5] = 'D'; board[4][6] = 'D';
    board[5][3] = 'D'; board[5][4] = 'D'; board[5][6] = 'D'; board[5][7] = 'D';
    board[6][4] = 'D'; board[6][5] = 'D'; board[6][6] = 'D';
    board[7][5] = 'D';

    return board;
  }

  function toAlgebraic(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return '?';
    return FILE_LABELS[x] + RANK_LABELS[y];
  }

  /**
   * Parse algebraic coordinate. Lenient: accepts x/X for rank 10, l/L for 11.
   * @returns {{x:number,y:number}|null}
   */
  function fromAlgebraic(str) {
    if (!str || str.length < 2) return null;
    var file = str.charAt(0).toLowerCase();
    var rankRaw = str.slice(1);
    var rank = rankRaw.toUpperCase();
    // Lenient: lowercase x/l already uppercased above for single letters
    if (rank === 'X' || rank === 'L' || /^[1-9]$/.test(rank)) {
      /* ok */
    } else {
      return null;
    }
    var x = FILE_LABELS.indexOf(file);
    var y = RANK_LABELS.indexOf(rank);
    if (x === -1 || y === -1) return null;
    return { x: x, y: y };
  }

  function isRestricted(x, y) {
    if (x === THRONE.x && y === THRONE.y) return true;
    for (var i = 0; i < CORNERS.length; i++) {
      if (CORNERS[i].x === x && CORNERS[i].y === y) return true;
    }
    return false;
  }

  function isCorner(x, y) {
    for (var i = 0; i < CORNERS.length; i++) {
      if (CORNERS[i].x === x && CORNERS[i].y === y) return true;
    }
    return false;
  }

  /**
   * Restricted squares are hostile for custodian capture.
   * Throne: always hostile to attackers; hostile to defenders only when empty
   * (emptiness is enforced by the caller checking beyond is empty).
   * Corners: always hostile.
   * Board edge is NOT hostile.
   */
  function isHostileSquare(x, y, capturedSide) {
    if (!isRestricted(x, y)) return false;
    if (isCorner(x, y)) return true;
    if (x === THRONE.x && y === THRONE.y) {
      if (capturedSide === 'A') return true;
      // Defenders: hostile only when empty — caller already requires empty beyond
      return true;
    }
    return false;
  }

  function isOnEdge(x, y) {
    return x === 0 || x === BOARD_SIZE - 1 || y === 0 || y === BOARD_SIZE - 1;
  }

  function sideOf(piece) {
    if (piece === 'A') return 'A';
    if (piece === 'D' || piece === 'K') return 'D';
    return null;
  }

  function createGame(options) {
    options = options || {};
    var board = createInitialBoard();
    var turn = 'A';
    var selected = null;
    var moveList = []; // strings like "f2f3" or "k4c4*"
    var positionHistory = [];
    var status = "Black's Move";
    var gameOver = false;
    var winner = null; // 'A' | 'D' | null  — never 'draw'
    var lastMoveWasCapture = false;
    /** Starting board snapshot for HEN section 1 (before moves applied). */
    var startBoard = createInitialBoard();
    var startTurn = 'A';
    var startWinner = null;

    function boardKey() {
      var s = turn;
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          s += board[y][x] || '.';
        }
      }
      return s;
    }

    function recordPosition() {
      positionHistory.push(boardKey());
    }

    recordPosition();

    function getPiece(x, y) {
      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
      return board[y][x];
    }

    function setPiece(x, y, piece) {
      board[y][x] = piece;
    }

    function findKing() {
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          if (board[y][x] === 'K') return { x: x, y: y };
        }
      }
      return null;
    }

    function isPathClear(fx, fy, tx, ty) {
      if (fx !== tx && fy !== ty) return false;
      if (fx === tx && fy === ty) return false;
      var dx = Math.sign(tx - fx);
      var dy = Math.sign(ty - fy);
      var x = fx + dx;
      var y = fy + dy;
      while (x !== tx || y !== ty) {
        if (getPiece(x, y) !== null) return false;
        x += dx;
        y += dy;
      }
      return true;
    }

    /**
     * Legal destinations for piece at (x,y).
     * Non-king may pass through empty throne but not land on restricted.
     * King may land on restricted and continue past empty restricted.
     */
    function getLegalMoves(x, y) {
      var moves = [];
      var piece = getPiece(x, y);
      if (!piece) return moves;
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var d = 0; d < dirs.length; d++) {
        var dx = dirs[d][0];
        var dy = dirs[d][1];
        var nx = x + dx;
        var ny = y + dy;
        while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
          var occ = getPiece(nx, ny);
          if (occ !== null) break;
          if (isRestricted(nx, ny)) {
            if (piece === 'K') {
              moves.push({ x: nx, y: ny });
            } else {
              // Pass through empty throne only; corners block non-king
              if (!(nx === THRONE.x && ny === THRONE.y)) break;
            }
          } else {
            moves.push({ x: nx, y: ny });
          }
          nx += dx;
          ny += dy;
        }
      }
      return moves;
    }

    function isLegalMove(fx, fy, tx, ty) {
      if (gameOver) return false;
      var piece = getPiece(fx, fy);
      if (!piece) return false;
      if (turn === 'A' && piece !== 'A') return false;
      if (turn === 'D' && piece !== 'D' && piece !== 'K') return false;
      var legal = getLegalMoves(fx, fy);
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].x === tx && legal[i].y === ty) return true;
      }
      return false;
    }

    function performNormalCaptures(x, y, moverSide) {
      var captured = [];
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var d = 0; d < dirs.length; d++) {
        var dx = dirs[d][0];
        var dy = dirs[d][1];
        var mx = x + dx;
        var my = y + dy;
        var bx = x + 2 * dx;
        var by = y + 2 * dy;
        if (mx < 0 || mx >= BOARD_SIZE || my < 0 || my >= BOARD_SIZE) continue;
        var midPiece = getPiece(mx, my);
        if (!midPiece || midPiece === 'K') continue;
        var midSide = sideOf(midPiece);
        if (midSide === moverSide) continue;
        var beyondOk = false;
        if (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE) {
          var beyondPiece = getPiece(bx, by);
          if (beyondPiece) {
            if (sideOf(beyondPiece) === moverSide) beyondOk = true;
          } else if (isHostileSquare(bx, by, midSide)) {
            beyondOk = true;
          }
        }
        if (beyondOk) captured.push({ x: mx, y: my });
      }
      for (var i = 0; i < captured.length; i++) {
        setPiece(captured[i].x, captured[i].y, null);
      }
      return captured;
    }

    /**
     * Shieldwall: 2+ consecutive enemy edge pieces bracketed at both ends
     * (friendly piece or corner), each with a friendly piece directly inward.
     * Capturing move must be a flanking move (land as a bracket).
     * King is never captured by shieldwall (excluded from enemy groups).
     */
    function performShieldwallCaptures(landX, landY, moverSide) {
      var captured = [];
      if (!isOnEdge(landX, landY)) return captured;

      function checkEdge(isHorizontal, fixed) {
        var enemies = [];
        for (var i = 0; i < BOARD_SIZE; i++) {
          var px = isHorizontal ? i : fixed;
          var py = isHorizontal ? fixed : i;
          var p = getPiece(px, py);
          if (p && p !== 'K' && sideOf(p) !== moverSide) {
            enemies.push({ x: px, y: py, idx: i });
          }
        }
        var ei = 0;
        while (ei < enemies.length) {
          var ej = ei;
          while (ej + 1 < enemies.length && enemies[ej + 1].idx === enemies[ej].idx + 1) {
            ej++;
          }
          var groupLen = ej - ei + 1;
          if (groupLen >= 2) {
            var group = enemies.slice(ei, ej + 1);
            var firstIdx = group[0].idx;
            var lastIdx = group[groupLen - 1].idx;

            function isBracket(idx) {
              if (idx < 0 || idx >= BOARD_SIZE) return true; // off-end → corner acts as bracket
              var bx = isHorizontal ? idx : fixed;
              var by = isHorizontal ? fixed : idx;
              var bp = getPiece(bx, by);
              if (bp) return sideOf(bp) === moverSide;
              return isRestricted(bx, by);
            }

            if (isBracket(firstIdx - 1) && isBracket(lastIdx + 1)) {
              var allFronted = true;
              for (var g = 0; g < group.length; g++) {
                var gx = group[g].x;
                var gy = group[g].y;
                var fx, fy;
                if (isHorizontal) {
                  fx = gx;
                  fy = (fixed === 0) ? 1 : 9;
                } else {
                  fy = gy;
                  fx = (fixed === 0) ? 1 : 9;
                }
                var front = getPiece(fx, fy);
                if (!front || sideOf(front) !== moverSide) {
                  allFronted = false;
                  break;
                }
              }
              if (allFronted) {
                var landIdx = isHorizontal ? landX : landY;
                var onThisEdge = (isHorizontal && landY === fixed) || (!isHorizontal && landX === fixed);
                var isFlanking = onThisEdge && (landIdx === firstIdx - 1 || landIdx === lastIdx + 1);
                if (isFlanking) {
                  for (var c = 0; c < group.length; c++) {
                    captured.push({ x: group[c].x, y: group[c].y });
                  }
                }
              }
            }
          }
          ei = ej + 1;
        }
      }

      checkEdge(true, 0);
      checkEdge(true, 10);
      checkEdge(false, 0);
      checkEdge(false, 10);

      for (var i = 0; i < captured.length; i++) {
        if (getPiece(captured[i].x, captured[i].y)) {
          setPiece(captured[i].x, captured[i].y, null);
        }
      }
      return captured;
    }

    /**
     * King captured when surrounded on all 4 cardinals by attackers,
     * or 3 attackers + throne when beside the throne.
     * King cannot be captured on the board edge.
     */
    function isKingCaptured() {
      var king = findKing();
      if (!king) return true;
      var x = king.x;
      var y = king.y;
      if (isOnEdge(x, y)) return false;

      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      var surroundedCount = 0;
      var throneAdjacent = false;
      for (var d = 0; d < dirs.length; d++) {
        var nx = x + dirs[d][0];
        var ny = y + dirs[d][1];
        if (nx === THRONE.x && ny === THRONE.y) {
          throneAdjacent = true;
          surroundedCount++;
          continue;
        }
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
        if (getPiece(nx, ny) === 'A') surroundedCount++;
      }
      if (throneAdjacent) return surroundedCount >= 4;
      return surroundedCount >= 4;
    }

    /**
     * Exit fort heuristic (documented limitation):
     * White wins if king is on the edge (not a corner), has ≥1 legal move,
     * attackers cannot flood-fill through empty squares to any square
     * orthogonally adjacent to the king, AND no single Black move can
     * capture any defender in the king's connected fort group.
     * This is conservative and may miss some complex forts.
     */
    function connectedFort(king) {
      var set = {};
      var key = function (x, y) { return x + ',' + y; };
      var q = [{ x: king.x, y: king.y }];
      set[key(king.x, king.y)] = true;
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      while (q.length) {
        var cur = q.shift();
        for (var d = 0; d < dirs.length; d++) {
          var nx = cur.x + dirs[d][0];
          var ny = cur.y + dirs[d][1];
          if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
          var k = key(nx, ny);
          if (set[k]) continue;
          var p = getPiece(nx, ny);
          if (p === 'D' || p === 'K') {
            set[k] = true;
            q.push({ x: nx, y: ny });
          }
        }
      }
      return set;
    }

    function attackerCanReachKingAdjacent(king) {
      var visited = [];
      for (var y = 0; y < BOARD_SIZE; y++) {
        visited[y] = [];
        for (var x = 0; x < BOARD_SIZE; x++) visited[y][x] = false;
      }
      var q = [];
      for (var yy = 0; yy < BOARD_SIZE; yy++) {
        for (var xx = 0; xx < BOARD_SIZE; xx++) {
          if (getPiece(xx, yy) === 'A') {
            q.push({ x: xx, y: yy });
            visited[yy][xx] = true;
          }
        }
      }
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      while (q.length) {
        var cur = q.shift();
        for (var d = 0; d < dirs.length; d++) {
          var nx = cur.x + dirs[d][0];
          var ny = cur.y + dirs[d][1];
          if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
          if (visited[ny][nx]) continue;
          // Cannot pass through defenders/king; empty only
          var p = getPiece(nx, ny);
          if (p === 'D' || p === 'K') continue;
          if (p === 'A') {
            visited[ny][nx] = true;
            q.push({ x: nx, y: ny });
            continue;
          }
          // empty
          visited[ny][nx] = true;
          q.push({ x: nx, y: ny });
        }
      }
      for (var d2 = 0; d2 < dirs.length; d2++) {
        var ax = king.x + dirs[d2][0];
        var ay = king.y + dirs[d2][1];
        if (ax < 0 || ax >= BOARD_SIZE || ay < 0 || ay >= BOARD_SIZE) continue;
        if (visited[ay][ax] && getPiece(ax, ay) === null) return true;
        // Also: an attacker already adjacent counts as approach
        if (getPiece(ax, ay) === 'A') return true;
      }
      return false;
    }

    function fortPieceCapturableByBlack(fortSet) {
      // Simulate: for each legal black move, see if any fort defender is captured
      // Lightweight: check if any fort D is currently sandwiched or can be
      // flanked by an existing black piece landing — use actual move gen.
      var savedTurn = turn;
      var savedOver = gameOver;
      turn = 'A';
      gameOver = false;
      var capturable = false;
      outer:
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          if (getPiece(x, y) !== 'A') continue;
          var dests = getLegalMoves(x, y);
          for (var i = 0; i < dests.length; i++) {
            var tx = dests[i].x;
            var ty = dests[i].y;
            // Snapshot board
            var snap = board.map(function (row) { return row.slice(); });
            setPiece(x, y, null);
            setPiece(tx, ty, 'A');
            var cap = performNormalCaptures(tx, ty, 'A');
            var sw = performShieldwallCaptures(tx, ty, 'A');
            var all = cap.concat(sw);
            for (var c = 0; c < all.length; c++) {
              var ck = all[c].x + ',' + all[c].y;
              if (fortSet[ck]) {
                capturable = true;
              }
            }
            // restore
            board = snap;
            if (capturable) break outer;
          }
        }
      }
      turn = savedTurn;
      gameOver = savedOver;
      return capturable;
    }

    function isExitFort() {
      var king = findKing();
      if (!king || !isOnEdge(king.x, king.y)) return false;
      if (isCorner(king.x, king.y)) return false;
      if (getLegalMoves(king.x, king.y).length === 0) return false;

      var fort = connectedFort(king);
      // Fort should include at least one defender (lone king on edge is not a fort)
      var hasDefender = false;
      for (var k in fort) {
        if (fort.hasOwnProperty(k)) {
          var parts = k.split(',');
          var p = getPiece(parseInt(parts[0], 10), parseInt(parts[1], 10));
          if (p === 'D') { hasDefender = true; break; }
        }
      }
      if (!hasDefender) return false;

      if (attackerCanReachKingAdjacent(king)) return false;
      if (fortPieceCapturableByBlack(fort)) return false;
      return true;
    }

    /**
     * Encirclement: attackers surround king AND all remaining defenders
     * with an unbroken ring — no path from any D/K to the edge without
     * crossing an attacker (flood from edges through non-A).
     */
    function isEncirclement() {
      var visited = [];
      for (var y = 0; y < BOARD_SIZE; y++) {
        visited[y] = [];
        for (var x = 0; x < BOARD_SIZE; x++) visited[y][x] = false;
      }
      var queue = [];
      for (var i = 0; i < BOARD_SIZE; i++) {
        var yy;
        for (var ti = 0; ti < 2; ti++) {
          yy = ti === 0 ? 0 : BOARD_SIZE - 1;
          if (getPiece(i, yy) !== 'A' && !visited[yy][i]) {
            queue.push({ x: i, y: yy });
            visited[yy][i] = true;
          }
        }
        var xx;
        for (var ti2 = 0; ti2 < 2; ti2++) {
          xx = ti2 === 0 ? 0 : BOARD_SIZE - 1;
          if (getPiece(xx, i) !== 'A' && !visited[i][xx]) {
            queue.push({ x: xx, y: i });
            visited[i][xx] = true;
          }
        }
      }
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      while (queue.length > 0) {
        var cur = queue.shift();
        for (var d = 0; d < dirs.length; d++) {
          var nx = cur.x + dirs[d][0];
          var ny = cur.y + dirs[d][1];
          if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
          if (visited[ny][nx]) continue;
          if (getPiece(nx, ny) === 'A') continue;
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny });
        }
      }
      var hasDefender = false;
      var allEnclosed = true;
      for (var y2 = 0; y2 < BOARD_SIZE; y2++) {
        for (var x2 = 0; x2 < BOARD_SIZE; x2++) {
          var p = getPiece(x2, y2);
          if (p === 'D' || p === 'K') {
            hasDefender = true;
            if (visited[y2][x2]) allEnclosed = false;
          }
        }
      }
      return hasDefender && allEnclosed;
    }

    function hasAnyLegalMove(side) {
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          var p = getPiece(x, y);
          if (!p) continue;
          if (side === 'A' && p !== 'A') continue;
          if (side === 'D' && p !== 'D' && p !== 'K') continue;
          if (getLegalMoves(x, y).length > 0) return true;
        }
      }
      return false;
    }

    function statusForOngoing() {
      return turn === 'A' ? "Black's Move" : "White's Move";
    }

    function checkEndConditions() {
      // King captured → Black wins
      if (isKingCaptured()) {
        // Keep the king on the board (shown surrounded); do not remove it.
        gameOver = true;
        winner = 'A';
        status = 'Black Wins!';
        return;
      }
      // King in corner → White wins
      var king = findKing();
      if (king && isCorner(king.x, king.y)) {
        gameOver = true;
        winner = 'D';
        status = 'White Wins!';
        return;
      }
      // Exit fort → White wins
      if (isExitFort()) {
        gameOver = true;
        winner = 'D';
        status = 'White Wins!';
        return;
      }
      // Encirclement → Black wins
      if (isEncirclement()) {
        gameOver = true;
        winner = 'A';
        status = 'Black Wins!';
        return;
      }
      // No legal move for side to play → that side loses
      if (!hasAnyLegalMove(turn)) {
        gameOver = true;
        winner = turn === 'A' ? 'D' : 'A';
        status = winner === 'A' ? 'Black Wins!' : 'White Wins!';
        return;
      }
      // Threefold repetition → White loses (perpetual)
      var key = boardKey();
      var count = 0;
      for (var i = 0; i < positionHistory.length; i++) {
        if (positionHistory[i] === key) count++;
      }
      if (count >= 3) {
        gameOver = true;
        winner = 'A';
        status = 'Black Wins!';
        return;
      }
      // NO draw outcome — ever
      status = statusForOngoing();
    }

    function tryMove(fx, fy, tx, ty) {
      if (gameOver) {
        return { ok: false, message: 'Game is over', captures: 0 };
      }
      if (!isLegalMove(fx, fy, tx, ty)) {
        return { ok: false, message: 'Invalid move', captures: 0 };
      }
      var piece = getPiece(fx, fy);
      setPiece(fx, fy, null);
      setPiece(tx, ty, piece);

      var allCaptured = performNormalCaptures(tx, ty, turn);
      var sw = performShieldwallCaptures(tx, ty, turn);
      allCaptured = allCaptured.concat(sw);
      lastMoveWasCapture = allCaptured.length > 0;

      var moveStr = toAlgebraic(fx, fy) + toAlgebraic(tx, ty);
      if (lastMoveWasCapture) moveStr += '*';
      moveList.push(moveStr);

      turn = turn === 'A' ? 'D' : 'A';
      recordPosition();
      checkEndConditions();
      selected = null;

      return { ok: true, message: status, captures: allCaptured.length };
    }

    function clearSelection() {
      selected = null;
    }

    function selectSquare(x, y) {
      if (gameOver) return { selected: false, message: status, moved: false };
      var piece = getPiece(x, y);

      // Clicking empty with no selection: clear (no-op)
      // Clicking empty with selection: try move
      if (selected) {
        if (selected.x === x && selected.y === y) {
          selected = null;
          return { selected: false, message: status, moved: false };
        }
        // Reselect own piece
        if (piece) {
          if ((turn === 'A' && piece === 'A') ||
              (turn === 'D' && (piece === 'D' || piece === 'K'))) {
            selected = { x: x, y: y };
            return { selected: true, message: 'Selected ' + toAlgebraic(x, y), moved: false };
          }
        }
        // Try move to this square
        var res = tryMove(selected.x, selected.y, x, y);
        return {
          selected: false,
          message: res.message,
          moved: res.ok,
          ok: res.ok
        };
      }

      // No selection yet
      if (piece) {
        if ((turn === 'A' && piece === 'A') ||
            (turn === 'D' && (piece === 'D' || piece === 'K'))) {
          selected = { x: x, y: y };
          return { selected: true, message: 'Selected ' + toAlgebraic(x, y), moved: false };
        }
      }
      return { selected: false, message: status, moved: false };
    }

    function getAllLegalMoves() {
      var moves = [];
      if (gameOver) return moves;
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          var p = getPiece(x, y);
          if (!p) continue;
          if (turn === 'A' && p !== 'A') continue;
          if (turn === 'D' && p !== 'D' && p !== 'K') continue;
          var dests = getLegalMoves(x, y);
          for (var i = 0; i < dests.length; i++) {
            moves.push({ fx: x, fy: y, tx: dests[i].x, ty: dests[i].y });
          }
        }
      }
      return moves;
    }

    function copyBoard(src) {
      return src.map(function (row) { return row.slice(); });
    }

    function loadSnapshot(snap) {
      board = copyBoard(snap.board);
      turn = snap.turn;
      selected = null;
      moveList = snap.moveList ? snap.moveList.slice() : [];
      positionHistory = snap.positionHistory ? snap.positionHistory.slice() : [];
      status = snap.status || statusForOngoing();
      gameOver = !!snap.gameOver;
      winner = snap.winner || null;
      lastMoveWasCapture = !!snap.lastMoveWasCapture;
      if (snap.startBoard) startBoard = copyBoard(snap.startBoard);
      if (snap.startTurn) startTurn = snap.startTurn;
      if (snap.startWinner !== undefined) startWinner = snap.startWinner;
    }

    function clone() {
      var g = createGame();
      g.loadSnapshot({
        board: board,
        turn: turn,
        moveList: moveList,
        positionHistory: positionHistory,
        status: status,
        gameOver: gameOver,
        winner: winner,
        lastMoveWasCapture: lastMoveWasCapture,
        startBoard: startBoard,
        startTurn: startTurn,
        startWinner: startWinner
      });
      return g;
    }

    function newGame() {
      board = createInitialBoard();
      turn = 'A';
      selected = null;
      moveList = [];
      positionHistory = [];
      status = "Black's Move";
      gameOver = false;
      winner = null;
      lastMoveWasCapture = false;
      startBoard = createInitialBoard();
      startTurn = 'A';
      startWinner = null;
      recordPosition();
    }

    /**
     * Replace live board with an arbitrary position (for HEN load / tests).
     * Resets move list and history unless opts.keepMoves.
     */
    function setPosition(newBoard, newTurn, opts) {
      opts = opts || {};
      board = copyBoard(newBoard);
      turn = newTurn || 'A';
      selected = null;
      if (!opts.keepMoves) {
        moveList = [];
        startBoard = copyBoard(newBoard);
        startTurn = turn;
        startWinner = opts.winner || null;
      }
      positionHistory = [];
      gameOver = !!opts.gameOver;
      winner = opts.winner || null;
      if (gameOver && winner === 'A') status = 'Black Wins!';
      else if (gameOver && winner === 'D') status = 'White Wins!';
      else status = statusForOngoing();
      lastMoveWasCapture = false;
      if (!gameOver) recordPosition();
    }

    function isMidGame() {
      if (moveList.length > 0) return true;
      // Also mid-game if board differs from initial or not black to move
      if (turn !== 'A') return true;
      var init = createInitialBoard();
      for (var y = 0; y < BOARD_SIZE; y++) {
        for (var x = 0; x < BOARD_SIZE; x++) {
          if (board[y][x] !== init[y][x]) return true;
        }
      }
      return false;
    }

    return {
      getBoard: function () { return copyBoard(board); },
      getStartBoard: function () { return copyBoard(startBoard); },
      getStartTurn: function () { return startTurn; },
      getStartWinner: function () { return startWinner; },
      getTurn: function () { return turn; },
      getSelected: function () { return selected ? { x: selected.x, y: selected.y } : null; },
      getStatus: function () { return status; },
      isGameOver: function () { return gameOver; },
      getWinner: function () { return winner; },
      getMoveList: function () { return moveList.slice(); },
      setMoveList: function (list) { moveList = list.slice(); },
      newGame: newGame,
      selectSquare: selectSquare,
      clearSelection: clearSelection,
      tryMove: tryMove,
      getLegalMoves: getLegalMoves,
      getAllLegalMoves: getAllLegalMoves,
      isLegalMove: isLegalMove,
      clone: clone,
      loadSnapshot: loadSnapshot,
      setPosition: setPosition,
      isMidGame: isMidGame,
      toAlgebraic: toAlgebraic,
      fromAlgebraic: fromAlgebraic,
      getPiece: getPiece,
      isRestricted: isRestricted,
      isCorner: isCorner,
      isOnEdge: isOnEdge,
      findKing: findKing,
      isKingCaptured: isKingCaptured,
      isEncirclement: isEncirclement,
      isExitFort: isExitFort,
      hasAnyLegalMove: hasAnyLegalMove,
      checkEndConditions: checkEndConditions,
      BOARD_SIZE: BOARD_SIZE,
      RANK_LABELS: RANK_LABELS,
      FILE_LABELS: FILE_LABELS,
      THRONE: THRONE
    };
  }

  global.HnefataflModel = {
    createGame: createGame,
    createInitialBoard: createInitialBoard,
    createEmptyBoard: createEmptyBoard,
    toAlgebraic: toAlgebraic,
    fromAlgebraic: fromAlgebraic,
    isRestricted: isRestricted,
    isCorner: isCorner,
    BOARD_SIZE: BOARD_SIZE,
    RANK_LABELS: RANK_LABELS,
    FILE_LABELS: FILE_LABELS,
    THRONE: THRONE,
    CORNERS: CORNERS
  };
})(typeof window !== 'undefined' ? window : this);
