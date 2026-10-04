/*
 * Open Source — Copyright Drew Gislason
 * MIT License — https://mit-license.org
 *
 * AI — medium-strength computer player for Copenhagen Hnefatafl 11×11.
 * Separate from the rules model: only asks for legal moves and scores them.
 *
 * Design:
 *  - Each game (and occasionally mid-game) rolls a random personality that
 *    mixes strategies: aggressive, defensive, pieceTaking, blocking,
 *    encirclement, exitFort, shieldwalls.
 *  - Candidates are scored with strategy-weighted heuristics + a cheap
 *    1-ply tactical look at the opponent's most damaging reply.
 *  - Instant wins preferred; instant losses avoided.
 *  - Noise and "pick among top few" keep play medium, not perfect.
 *
 * Delay: adjustSpeed / getDelayMs with ladder 0.1…5s.
 * Tests set window.HNEFATAFL_AI_DELAY_MS = 0 for max speed.
 */

'use strict';

(function (global) {
  /** Delay ladder (ms). Index 0 = fastest. */
  var SPEED_MS = [100, 250, 333, 500, 1000, 2000, 3000, 4000, 5000];
  var speedIndex = 4; // 1 second default

  var STRATEGIES = [
    'aggressive',
    'defensive',
    'pieceTaking',
    'blocking',
    'encirclement',
    'exitFort',
    'shieldwalls'
  ];

  /** Per-game personality; re-rolled on newGame / occasionally mid-game. */
  var personality = null;
  var movesSinceReroll = 0;
  /** Strategies used this page session (for tests / report). */
  var strategiesUsed = {};

  function rand() {
    return Math.random();
  }

  function pick(arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  /**
   * Random mix of strategy weights. One primary + one secondary emphasized.
   */
  function rollPersonality() {
    var primary = pick(STRATEGIES);
    var secondary = pick(STRATEGIES.filter(function (s) { return s !== primary; }));
    var weights = {};
    var i;
    for (i = 0; i < STRATEGIES.length; i++) {
      weights[STRATEGIES[i]] = 0.06 + rand() * 0.08;
    }
    weights[primary] += 0.45 + rand() * 0.20;
    weights[secondary] += 0.18 + rand() * 0.12;
    var sum = 0;
    for (i = 0; i < STRATEGIES.length; i++) sum += weights[STRATEGIES[i]];
    for (i = 0; i < STRATEGIES.length; i++) weights[STRATEGIES[i]] /= sum;
    personality = { primary: primary, secondary: secondary, weights: weights };
    movesSinceReroll = 0;
    strategiesUsed[primary] = (strategiesUsed[primary] || 0) + 1;
    strategiesUsed[secondary] = (strategiesUsed[secondary] || 0) + 1;
    return personality;
  }

  function getPersonality() {
    if (!personality) rollPersonality();
    return personality;
  }

  function resetPersonality() {
    rollPersonality();
  }

  function getStrategiesUsed() {
    var out = {};
    for (var k in strategiesUsed) {
      if (strategiesUsed.hasOwnProperty(k)) out[k] = strategiesUsed[k];
    }
    return out;
  }

  function clearStrategiesUsed() {
    strategiesUsed = {};
  }

  function isOnBoard(x, y) {
    return x >= 0 && x < 11 && y >= 0 && y < 11;
  }

  function pieceAt(board, x, y) {
    if (!isOnBoard(x, y)) return null;
    return board[y][x];
  }

  function findKingOn(board) {
    for (var y = 0; y < 11; y++) {
      for (var x = 0; x < 11; x++) {
        if (board[y][x] === 'K') return { x: x, y: y };
      }
    }
    return null;
  }

  function isCorner(x, y) {
    return (x === 0 || x === 10) && (y === 0 || y === 10);
  }

  function isEdge(x, y) {
    return x === 0 || x === 10 || y === 0 || y === 10;
  }

  function manhattanToNearestCorner(x, y) {
    var d1 = Math.abs(x - 0) + Math.abs(y - 0);
    var d2 = Math.abs(x - 0) + Math.abs(y - 10);
    var d3 = Math.abs(x - 10) + Math.abs(y - 0);
    var d4 = Math.abs(x - 10) + Math.abs(y - 10);
    return Math.min(d1, d2, d3, d4);
  }

  function sgn(n) {
    return n > 0 ? 1 : (n < 0 ? -1 : 0);
  }

  function pathClear(board, x1, y1, x2, y2) {
    if (x1 !== x2 && y1 !== y2) return false;
    var dx = sgn(x2 - x1);
    var dy = sgn(y2 - y1);
    var x = x1 + dx;
    var y = y1 + dy;
    while (x !== x2 || y !== y2) {
      if (pieceAt(board, x, y)) return false;
      x += dx;
      y += dy;
    }
    return true;
  }

  function kingClearCorners(board, king) {
    if (!king) return 0;
    var n = 0;
    var corners = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      if ((c.x === king.x || c.y === king.y) && pathClear(board, king.x, king.y, c.x, c.y)) {
        n++;
      }
    }
    return n;
  }

  function attackersBesideKing(board, king) {
    if (!king) return 4;
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (pieceAt(board, king.x + dirs[i][0], king.y + dirs[i][1]) === 'A') n++;
    }
    return n;
  }

  /**
   * Flood from edges through non-attacker squares.
   * Returns how many defenders (incl. king) can still reach an edge.
   */
  function defendersReachingEdge(board) {
    var visited = [];
    var y, x;
    for (y = 0; y < 11; y++) {
      visited[y] = [];
      for (x = 0; x < 11; x++) visited[y][x] = false;
    }
    var q = [];
    function tryStart(sx, sy) {
      if (board[sy][sx] === 'A') return;
      if (visited[sy][sx]) return;
      visited[sy][sx] = true;
      q.push({ x: sx, y: sy });
    }
    for (var i = 0; i < 11; i++) {
      tryStart(i, 0);
      tryStart(i, 10);
      tryStart(0, i);
      tryStart(10, i);
    }
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
      var s = q.pop();
      for (i = 0; i < 4; i++) {
        var nx = s.x + dirs[i][0];
        var ny = s.y + dirs[i][1];
        if (!isOnBoard(nx, ny) || visited[ny][nx]) continue;
        if (board[ny][nx] === 'A') continue;
        visited[ny][nx] = true;
        q.push({ x: nx, y: ny });
      }
    }
    var reachable = 0;
    var total = 0;
    for (y = 0; y < 11; y++) {
      for (x = 0; x < 11; x++) {
        var p = board[y][x];
        if (p === 'D' || p === 'K') {
          total++;
          if (visited[y][x]) reachable++;
        }
      }
    }
    return { reachable: reachable, total: total };
  }

  function blockersOnKingRays(board, king, blockerType) {
    if (!king) return 0;
    var n = 0;
    for (var x = 0; x < 11; x++) {
      if (x === king.x) continue;
      if (board[king.y][x] === blockerType) n++;
    }
    for (var y = 0; y < 11; y++) {
      if (y === king.y) continue;
      if (board[y][king.x] === blockerType) n++;
    }
    return n;
  }

  var APPROACH = [
    { x: 1, y: 0 }, { x: 0, y: 1 },
    { x: 9, y: 0 }, { x: 10, y: 1 },
    { x: 1, y: 10 }, { x: 0, y: 9 },
    { x: 9, y: 10 }, { x: 10, y: 9 }
  ];

  function countApproachControl(board, type) {
    var n = 0;
    for (var i = 0; i < APPROACH.length; i++) {
      if (board[APPROACH[i].y][APPROACH[i].x] === type) n++;
    }
    return n;
  }

  function material(board) {
    var a = 0;
    var d = 0;
    for (var y = 0; y < 11; y++) {
      for (var x = 0; x < 11; x++) {
        if (board[y][x] === 'A') a++;
        else if (board[y][x] === 'D') d++;
      }
    }
    return { a: a, d: d };
  }

  /**
   * Static eval from attackers' (Black / 'A') POV. Positive = good for Black.
   */
  function evaluateBoard(board, weights) {
    var king = findKingOn(board);
    if (!king) return 50000;
    if (isCorner(king.x, king.y)) return -50000;

    var w = weights || getPersonality().weights;
    var mat = material(board);
    var dist = manhattanToNearestCorner(king.x, king.y);
    var escapes = kingClearCorners(board, king);
    var beside = attackersBesideKing(board, king);
    var aOnRays = blockersOnKingRays(board, king, 'A');
    var aApproach = countApproachControl(board, 'A');
    var dApproach = countApproachControl(board, 'D');
    var kingOnEdge = isEdge(king.x, king.y) ? 1 : 0;

    // Base material: defenders are more precious (12 vs 24)
    var score = (mat.a * 90) - (mat.d * 160);
    score += dist * 70;
    // Open corner-paths are decisive — price them very high for attackers
    score -= escapes * 3800;
    score += beside * 160;

    score += w.aggressive * (beside * 220 + (20 - dist) * -30 + (24 - mat.d) * 40);
    score += w.defensive * (aApproach * 120 + aOnRays * 35 - dApproach * 50);
    score += w.pieceTaking * ((mat.a * 40) - (mat.d * 90));
    score += w.blocking * (aOnRays * 70 + aApproach * 180 - escapes * 700);
    // Encirclement flood is relatively expensive — only when that strategy weighs in
    if (w.encirclement > 0.12) {
      var flood = defendersReachingEdge(board);
      var enclosed = flood.total - flood.reachable;
      score += w.encirclement * (enclosed * 180 + (11 - flood.reachable) * 30 + beside * 40);
    } else {
      score += w.encirclement * (beside * 40);
    }
    score += w.exitFort * (kingOnEdge * -220 + beside * 80 - (kingOnEdge && beside === 0 ? 300 : 0));

    var aEdge = 0;
    var dEdge = 0;
    for (var i = 0; i < 11; i++) {
      if (board[0][i] === 'A') aEdge++;
      if (board[10][i] === 'A') aEdge++;
      if (board[i][0] === 'A') aEdge++;
      if (board[i][10] === 'A') aEdge++;
      if (board[0][i] === 'D') dEdge++;
      if (board[10][i] === 'D') dEdge++;
      if (board[i][0] === 'D') dEdge++;
      if (board[i][10] === 'D') dEdge++;
    }
    score += w.shieldwalls * (aEdge * 12 - dEdge * 18);

    if (mat.a >= 20) {
      score += (Math.abs(king.x - 5) + Math.abs(king.y - 5)) * 8;
    }

    // Slight attacker tilt: 24 vs 12 is compensated by escape threat, but
    // self-play was White-heavy — nudge Black development / pressure.
    score += (24 - mat.a) * -8; // keep attackers on board valued
    score += aApproach * 40;

    return score;
  }

  function evaluateMoveShape(model, move, result, weights, side) {
    var s = 0;
    var captures = result.captures || 0;
    s += captures * (400 + weights.pieceTaking * 500 + weights.shieldwalls * 200);

    var toEdge = isEdge(move.tx, move.ty);
    var fromEdge = isEdge(move.fx, move.fy);
    if (toEdge && weights.shieldwalls > 0.12) s += 30;
    if (side === 'A' && fromEdge && !toEdge) s += 35;
    // Early-game Black: step toward the throne / king
    // Early-game Black: reward stepping toward the throne/king
    if (side === 'A' && fromEdge &&
        Math.abs(move.tx - 5) + Math.abs(move.ty - 5) <
        Math.abs(move.fx - 5) + Math.abs(move.fy - 5)) {
      s += 45;
    }

    var piece = model.getPiece(move.fx, move.fy);
    if (piece === 'K') {
      var before = manhattanToNearestCorner(move.fx, move.fy);
      var after = manhattanToNearestCorner(move.tx, move.ty);
      // King dash is valuable but not free — keep medium White from over-committing
      s += (before - after) * 100;
      if (isCorner(move.tx, move.ty)) s += 20000;
      if (isEdge(move.tx, move.ty)) s += 50 + weights.exitFort * 150;
    }

    if (typeof move._escapeDelta === 'number') {
      // Closing an escape is urgent for Black; opening one is good for White but not free
      if (side === 'A') s += (-move._escapeDelta) * 2800;
      else s += move._escapeDelta * 1100;
    }

    if (side === 'A' && piece === 'A') {
      var k = model.findKing();
      if (k) {
        var beforeAdj = Math.abs(move.fx - k.x) + Math.abs(move.fy - k.y);
        var afterAdj = Math.abs(move.tx - k.x) + Math.abs(move.ty - k.y);
        if (afterAdj === 1) s += 140 + weights.aggressive * 160;
        if (afterAdj < beforeAdj) s += 35;
      }
    }

    return s;
  }

  /**
   * Cheap 1-ply: most damaging opponent reply (win / capture / escape threat).
   * Caps work so the browser stays responsive.
   */
  /**
   * Cheap tactical glance: sample opponent replies for instant wins / big captures.
   * Uses a small reply cap so self-play and the browser stay responsive.
   */
  function worstOpponentReply(clone, ourSide) {
    if (clone.isGameOver()) return 0;
    var replies = clone.getAllLegalMoves();
    var worstForUs = 0;
    var limit = Math.min(replies.length, 20);
    // Prefer king moves and captures by sampling from the front after a light shuffle of a window
    for (var i = 0; i < limit; i++) {
      var r = replies[i];
      var g2 = clone.clone();
      var res = g2.tryMove(r.fx, r.fy, r.tx, r.ty);
      if (!res.ok) continue;
      if (g2.isGameOver()) {
        var w = g2.getWinner();
        if (w && w !== ourSide) return 8000;
        if (w === ourSide) continue;
      }
      var threat = (res.captures || 0) * 350;
      var k = g2.findKing();
      if (k && isCorner(k.x, k.y) && ourSide === 'A') threat += 8000;
      if (k && ourSide === 'A') {
        var esc = kingClearCorners(g2.getBoard(), k);
        if (esc > 0) threat += 600 * esc;
      }
      // White also fears king capture next
      if (ourSide === 'D' && g2.isKingCaptured && g2.isKingCaptured()) threat += 8000;
      if (threat > worstForUs) worstForUs = threat;
    }
    return worstForUs;
  }

  /**
   * Choose a move for the side to move. Returns { fx, fy, tx, ty, strategy, score }
   * or null if none.
   */
  function chooseMove(model) {
    if (!model || model.isGameOver()) return null;
    var side = model.getTurn();
    var moves = model.getAllLegalMoves();
    if (!moves.length) return null;

    movesSinceReroll++;
    if (movesSinceReroll > 12 && rand() < 0.18) {
      rollPersonality();
    }
    var pers = getPersonality();
    var weights = pers.weights;

    var kingBefore = model.findKing();
    var boardBefore = model.getBoard();
    var escapesBefore = kingClearCorners(boardBefore, kingBefore);

    // Cap branching: always keep king moves, sample the rest
    var moveList = moves;
    var i;
    if (moves.length > 72) {
      var preferred = [];
      var others = [];
      for (i = 0; i < moves.length; i++) {
        if (model.getPiece(moves[i].fx, moves[i].fy) === 'K') preferred.push(moves[i]);
        else others.push(moves[i]);
      }
      for (i = others.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = others[i];
        others[i] = others[j];
        others[j] = tmp;
      }
      moveList = preferred.concat(others.slice(0, 64));
    }

    // Pass 1: static score + escape delta (no deep 1-ply yet)
    var scored = [];
    for (i = 0; i < moveList.length; i++) {
      var m = moveList[i];
      var clone = model.clone();
      var res = clone.tryMove(m.fx, m.fy, m.tx, m.ty);
      if (!res.ok) continue;

      var kingAfter = clone.findKing();
      var escapesAfter = kingClearCorners(clone.getBoard(), kingAfter);
      m._escapeDelta = escapesAfter - escapesBefore;

      var score = 0;
      if (clone.isGameOver()) {
        var winner = clone.getWinner();
        if (winner === side) score = 100000 - i;
        else if (winner) score = -100000;
        else score = 0;
      } else {
        var boardScore = evaluateBoard(clone.getBoard(), weights);
        score = (side === 'A') ? boardScore : -boardScore;
        score += evaluateMoveShape(model, m, res, weights, side);

        // Hard urgency: if we leave the king a clear corner path as Black, punish
        if (side === 'A' && escapesAfter > 0) {
          score -= 5000 * escapesAfter;
        }
        // As White, opening a path is great but we already score escape delta
        if (side === 'A' && m._escapeDelta < 0) {
          score += (-m._escapeDelta) * 2000;
        }
      }

      // Medium noise — White gets a bit more so Black stays competitive in self-play
      var noise = (side === 'D') ? 110 : 55;
      score += (rand() - 0.5) * noise;
      scored.push({ move: m, score: score, clone: clone, escapesAfter: escapesAfter });
    }

    if (!scored.length) return null;
    scored.sort(function (a, b) { return b.score - a.score; });

    // Ensure best escape-denying Black moves enter the tactical shortlist
    if (side === 'A') {
      var byEscape = scored.slice().sort(function (a, b) {
        if (a.escapesAfter !== b.escapesAfter) return a.escapesAfter - b.escapesAfter;
        return b.score - a.score;
      });
      var inject = [];
      for (i = 0; i < Math.min(4, byEscape.length); i++) {
        if (byEscape[i].escapesAfter < escapesBefore || byEscape[i].escapesAfter === 0) {
          inject.push(byEscape[i]);
        }
      }
      // Rebuild shortlist: inject + top static
      var seen = {};
      var shortlist = [];
      function add(item) {
        var key = item.move.fx + ',' + item.move.fy + ',' + item.move.tx + ',' + item.move.ty;
        if (seen[key]) return;
        seen[key] = true;
        shortlist.push(item);
      }
      for (i = 0; i < inject.length; i++) add(inject[i]);
      for (i = 0; i < scored.length && shortlist.length < 10; i++) add(scored[i]);
      // Tactical filter on shortlist
      for (i = 0; i < shortlist.length; i++) {
        if (shortlist[i].score > 50000 || shortlist[i].score < -50000) continue;
        if (!shortlist[i].clone.isGameOver()) {
          shortlist[i].score -= worstOpponentReply(shortlist[i].clone, side) * 1.0;
          // Extra: if opponent can walk king to corner next, dump this move
          if (opponentCanEscapeToCorner(shortlist[i].clone)) {
            shortlist[i].score -= 20000;
          }
        }
      }
      shortlist.sort(function (a, b) { return b.score - a.score; });
      scored = shortlist.concat(scored.filter(function (s) {
        var key = s.move.fx + ',' + s.move.fy + ',' + s.move.tx + ',' + s.move.ty;
        return !seen[key];
      }));
    } else {
      // White: lighter tactical pass on top 6
      var topN = Math.min(6, scored.length);
      for (i = 0; i < topN; i++) {
        if (scored[i].score > 50000 || scored[i].score < -50000) continue;
        if (!scored[i].clone.isGameOver()) {
          scored[i].score -= worstOpponentReply(scored[i].clone, side) * 0.7;
        }
      }
      scored.sort(function (a, b) { return b.score - a.score; });
    }

    if (scored[0].score > 50000) {
      var best = scored[0].move;
      best.strategy = pers.primary;
      best.score = scored[0].score;
      return best;
    }

    // Side-tempered selection keeps AI-vs-AI near even:
    // Black plays sharp (escape denial); White is medium-noisy.
    var pool;
    if (side === 'A') {
      // Prefer the lowest-escape move among top scores when threatened
      if (escapesBefore > 0 || (scored[0].escapesAfter !== undefined && scored[0].escapesAfter > 0)) {
        var minEsc = scored[0].escapesAfter;
        for (i = 1; i < Math.min(8, scored.length); i++) {
          if (scored[i].escapesAfter < minEsc) minEsc = scored[i].escapesAfter;
        }
        var escapePool = [];
        for (i = 0; i < Math.min(8, scored.length); i++) {
          if (scored[i].escapesAfter === minEsc) escapePool.push(scored[i]);
        }
        if (escapePool.length) {
          var pickEsc = escapePool[Math.floor(rand() * Math.min(2, escapePool.length))];
          pickEsc.move.strategy = pers.primary;
          pickEsc.move.score = pickEsc.score;
          return pickEsc.move;
        }
      }
      pool = 1;
      if (rand() < 0.18) pool = 2;
    } else {
      // White medium: take forced wins, otherwise often play from a wide pool
      // so AI-vs-AI stays near even (Black's defense is harder to score).
      if (scored[0].score > 50000) {
        pool = 1;
      } else if (rand() < 0.42) {
        // Soft blunder: pick among top ~12–20, not the tip
        pool = Math.min(scored.length, 12 + Math.floor(rand() * 10));
        var weak = scored[Math.floor(pool / 2 + rand() * (pool / 2))];
        weak.move.strategy = pers.primary;
        weak.move.score = weak.score;
        return weak.move;
      } else {
        pool = 4;
        if (rand() < 0.35) pool = 7;
      }
    }
    pool = Math.min(pool, scored.length);

    var chosen = scored[Math.floor(rand() * pool)];
    var out = chosen.move;
    out.strategy = pers.primary;
    out.score = chosen.score;
    return out;
  }

  /** True if the side to move (White) can put the king on a corner this turn. */
  function opponentCanEscapeToCorner(clone) {
    if (clone.isGameOver()) return false;
    if (clone.getTurn() !== 'D') return false;
    var k = clone.findKing();
    if (!k) return false;
    var corners = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      if ((c.x === k.x || c.y === k.y) && pathClear(clone.getBoard(), k.x, k.y, c.x, c.y)) {
        // King moves like a rook onto empty corner — pathClear exclusive, corner empty?
        if (!pieceAt(clone.getBoard(), c.x, c.y)) return true;
      }
    }
    return false;
  }

  function adjustSpeed(faster) {
    if (faster) {
      if (speedIndex > 0) speedIndex--;
    } else {
      if (speedIndex < SPEED_MS.length - 1) speedIndex++;
    }
    return SPEED_MS[speedIndex];
  }

  function getDelayMs() {
    if (typeof global.HNEFATAFL_AI_DELAY_MS === 'number') {
      return global.HNEFATAFL_AI_DELAY_MS;
    }
    return SPEED_MS[speedIndex];
  }

  function getSpeedIndex() {
    return speedIndex;
  }

  function isOperational() {
    return true;
  }

  global.HnefataflAI = {
    chooseMove: chooseMove,
    adjustSpeed: adjustSpeed,
    getDelayMs: getDelayMs,
    getSpeedIndex: getSpeedIndex,
    isOperational: isOperational,
    resetPersonality: resetPersonality,
    getPersonality: getPersonality,
    getStrategiesUsed: getStrategiesUsed,
    clearStrategiesUsed: clearStrategiesUsed,
    STRATEGIES: STRATEGIES,
    SPEED_MS: SPEED_MS,
    STAGE: 3
  };
})(typeof window !== 'undefined' ? window : this);
