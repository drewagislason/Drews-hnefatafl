/*
 * Hnefatafl (Copenhagen rules) - Computer player (AI)
 * Open source, Copyright Drew Gislason, MIT license
 * https://mit-license.org
 *
 * Separate from the game engine. The controller asks this module for a move
 * when it is a computer side's turn.
 *
 * Design (medium strength, no difficulty levels):
 *  - Every game (and occasionally mid-game) a mix of strategies is chosen
 *    at random: aggressive, defensive, piece-taking, blocking,
 *    encirclement, exit-fort, shieldwalls.
 *  - All legal moves are generated from the model.
 *  - Each candidate is played on a cloned board and scored with
 *    strategy-weighted heuristics plus a little 1-ply tactical look
 *    at the opponent's best capture / escape reply.
 *  - Instant wins are always taken. Instant losses are always avoided.
 *  - Noise and "play 2nd/3rd best" keep the play human-like rather than
 *    a perfect solver. A beginner should lose most games; a strong
 *    human should beat it most of the time.
 *
 * Delay between computer moves is window.HNEFATAFL_AI_DELAY_MS (default 1000).
 * The test harness can set that to 0 for fast self-play.
 */

'use strict';

const HnefataflAI = (function () {

  // Default pause between computer moves (ms). Tests may override.
  if (typeof window !== 'undefined' && typeof window.HNEFATAFL_AI_DELAY_MS !== 'number') {
    window.HNEFATAFL_AI_DELAY_MS = 1000;
  }

  const STRATEGIES = [
    'aggressive',
    'defensive',
    'pieceTaking',
    'blocking',
    'encirclement',
    'exitFort',
    'shieldwalls'
  ];

  // Per-game personality. Re-rolled on newGame() and sometimes mid-game.
  let personality = null;
  let movesSinceReroll = 0;

  function rand() {
    return Math.random();
  }

  function pick(arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  /**
   * Build a random mix of strategy weights that sum to roughly 1.
   * One primary strategy is emphasized; others still have a voice
   * so the AI is not a one-trick player.
   */
  function rollPersonality() {
    const primary = pick(STRATEGIES);
    const secondary = pick(STRATEGIES.filter(function (s) { return s !== primary; }));
    const weights = {};
    for (let i = 0; i < STRATEGIES.length; i++) {
      weights[STRATEGIES[i]] = 0.06 + rand() * 0.08;
    }
    weights[primary] += 0.45 + rand() * 0.20;
    weights[secondary] += 0.18 + rand() * 0.12;
    // Normalize
    let sum = 0;
    for (let i = 0; i < STRATEGIES.length; i++) sum += weights[STRATEGIES[i]];
    for (let i = 0; i < STRATEGIES.length; i++) weights[STRATEGIES[i]] /= sum;
    personality = {
      primary: primary,
      secondary: secondary,
      weights: weights
    };
    movesSinceReroll = 0;
    return personality;
  }

  function getPersonality() {
    if (!personality) rollPersonality();
    return personality;
  }

  /**
   * Call when a new game starts so the computer picks a fresh style.
   */
  function resetPersonality() {
    rollPersonality();
  }

  function isOnBoard(x, y) {
    return x >= 0 && x < 11 && y >= 0 && y < 11;
  }

  function pieceAt(board, x, y) {
    if (!isOnBoard(x, y)) return null;
    return board[y][x];
  }

  function findKingOn(board) {
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
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
    const d1 = Math.abs(x - 0) + Math.abs(y - 0);
    const d2 = Math.abs(x - 0) + Math.abs(y - 10);
    const d3 = Math.abs(x - 10) + Math.abs(y - 0);
    const d4 = Math.abs(x - 10) + Math.abs(y - 10);
    return Math.min(d1, d2, d3, d4);
  }

  /**
   * Is the orthogonal path from (x1,y1) to (x2,y2) empty (exclusive)?
   */
  function pathClear(board, x1, y1, x2, y2) {
    if (x1 !== x2 && y1 !== y2) return false;
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    let x = x1 + dx;
    let y = y1 + dy;
    while (x !== x2 || y !== y2) {
      if (pieceAt(board, x, y)) return false;
      x += dx;
      y += dy;
    }
    return true;
  }

  /**
   * How many corners the king could reach this instant (clear rook-path).
   */
  function kingClearCorners(board, king) {
    if (!king) return 0;
    let n = 0;
    const corners = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      if ((c.x === king.x || c.y === king.y) && pathClear(board, king.x, king.y, c.x, c.y)) {
        n++;
      }
    }
    return n;
  }

  /**
   * Count attackers orthogonally adjacent to the king.
   */
  function attackersBesideKing(board, king) {
    if (!king) return 4;
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const p = pieceAt(board, king.x + dirs[i][0], king.y + dirs[i][1]);
      if (p === 'A') n++;
    }
    return n;
  }

  /**
   * Flood from the edges through non-attacker squares.
   * Returns how many defenders (incl. king) can still reach an edge.
   * 0 means full encirclement.
   */
  function defendersReachingEdge(board) {
    const visited = [];
    for (let y = 0; y < 11; y++) {
      visited[y] = [];
      for (let x = 0; x < 11; x++) visited[y][x] = false;
    }
    const q = [];
    function tryStart(x, y) {
      if (board[y][x] === 'A') return;
      if (visited[y][x]) return;
      visited[y][x] = true;
      q.push({ x: x, y: y });
    }
    for (let i = 0; i < 11; i++) {
      tryStart(i, 0);
      tryStart(i, 10);
      tryStart(0, i);
      tryStart(10, i);
    }
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
      const s = q.pop();
      for (let i = 0; i < 4; i++) {
        const nx = s.x + dirs[i][0];
        const ny = s.y + dirs[i][1];
        if (!isOnBoard(nx, ny) || visited[ny][nx]) continue;
        if (board[ny][nx] === 'A') continue;
        visited[ny][nx] = true;
        q.push({ x: nx, y: ny });
      }
    }
    let reachable = 0;
    let total = 0;
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const p = board[y][x];
        if (p === 'D' || p === 'K') {
          total++;
          if (visited[y][x]) reachable++;
        }
      }
    }
    return { reachable: reachable, total: total };
  }

  /**
   * Count pieces sitting on the king's rank or file between the king
   * and a corner (blocking the escape ray).
   */
  function blockersOnKingRays(board, king, blockerType) {
    if (!king) return 0;
    let n = 0;
    for (let x = 0; x < 11; x++) {
      if (x === king.x) continue;
      if (board[king.y][x] === blockerType) n++;
    }
    for (let y = 0; y < 11; y++) {
      if (y === king.y) continue;
      if (board[y][king.x] === blockerType) n++;
    }
    return n;
  }

  /**
   * Approach squares next to corners. Occupying them is useful for attackers
   * (deny the last step) and dangerous if left empty when the king is near.
   */
  const APPROACH = [
    { x: 1, y: 0 }, { x: 0, y: 1 },
    { x: 9, y: 0 }, { x: 10, y: 1 },
    { x: 1, y: 10 }, { x: 0, y: 9 },
    { x: 9, y: 10 }, { x: 10, y: 9 }
  ];

  function countApproachControl(board, type) {
    let n = 0;
    for (let i = 0; i < APPROACH.length; i++) {
      if (board[APPROACH[i].y][APPROACH[i].x] === type) n++;
    }
    return n;
  }

  function material(board) {
    let a = 0;
    let d = 0;
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        if (board[y][x] === 'A') a++;
        else if (board[y][x] === 'D') d++;
      }
    }
    return { a: a, d: d };
  }

  /**
   * Static evaluation of a position from the attackers' (Black / 'A') point of view.
   * Positive = good for attackers. Negative = good for defenders.
   * Strategy weights tilt which terms matter most.
   */
  function evaluateBoard(board, weights, moverSideAfter) {
    const king = findKingOn(board);
    if (!king) {
      // King already off the board = attackers won
      return 50000;
    }
    if (isCorner(king.x, king.y)) {
      return -50000;
    }

    const w = weights || getPersonality().weights;
    const mat = material(board);
    const dist = manhattanToNearestCorner(king.x, king.y);
    const escapes = kingClearCorners(board, king);
    const beside = attackersBesideKing(board, king);
    const flood = defendersReachingEdge(board);
    const enclosed = flood.total - flood.reachable;
    const aOnRays = blockersOnKingRays(board, king, 'A');
    const dOnRays = blockersOnKingRays(board, king, 'D');
    const aApproach = countApproachControl(board, 'A');
    const dApproach = countApproachControl(board, 'D');
    const kingOnEdge = isEdge(king.x, king.y) ? 1 : 0;

    // Base material: defenders are more precious (12 vs 24)
    let score = (mat.a * 90) - (mat.d * 160);

    // King distance to corner: far is good for attackers
    score += dist * 55;

    // Immediate escape routes — urgent for both sides.
    // A single open corner-path is usually decisive, so this is priced high.
    score -= escapes * 2200;

    // Surround pressure
    score += beside * 140;

    // --- strategy tilts ---
    // aggressive: hunt the king, step toward corners, take pieces
    score += w.aggressive * (beside * 220 + (20 - dist) * -30 + (24 - mat.d) * 40);

    // defensive: for the side that just moved this is interpreted from
    // the attacker's POV, so "defensive" means keep own pieces safe and
    // deny cheap escapes / keep a wall. Attackers play it as corner-denial;
    // the same terms help White when we flip the chooseMove side.
    score += w.defensive * (aApproach * 80 + aOnRays * 25 - dApproach * 40);

    // piece taking: raw material already in base; amplify it
    score += w.pieceTaking * ((mat.a * 40) - (mat.d * 90));

    // blocking: sit on king's row/column, occupy approach squares
    score += w.blocking * (aOnRays * 55 + aApproach * 120 - escapes * 400);

    // encirclement: shrink the white camp
    score += w.encirclement * (enclosed * 180 + (11 - flood.reachable) * 30 + beside * 40);

    // exit fort: attackers want to STOP an edge fort; defenders want one.
    // King on edge with few attackers nearby is a White plus (negative here).
    score += w.exitFort * (kingOnEdge * -220 + beside * 80 - (kingOnEdge && beside === 0 ? 300 : 0));

    // shieldwalls: reward having own pieces on the edge (setup) slightly
    let aEdge = 0;
    let dEdge = 0;
    for (let i = 0; i < 11; i++) {
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

    // Small center control for attackers early
    if (mat.a >= 20) {
      const cx = king.x - 5;
      const cy = king.y - 5;
      score += (Math.abs(cx) + Math.abs(cy)) * 8;
    }

    return score;
  }

  /**
   * Extra score applied to the move itself (not just the resulting board).
   * Captures, approaching a corner, stepping onto an edge, etc.
   */
  function evaluateMoveShape(model, move, result, weights, side) {
    let s = 0;
    const captures = result.captures || 0;
    s += captures * (400 + weights.pieceTaking * 500 + weights.shieldwalls * 200);

    const toEdge = isEdge(move.tx, move.ty);
    const fromEdge = isEdge(move.fx, move.fy);
    if (toEdge && weights.shieldwalls > 0.12) s += 30;
    // Leaving the starting camp / developing the extra mid pieces
    if (side === 'A' && fromEdge && !toEdge) s += 15;

    // King moves: toward a corner is gold for White
    const piece = model.getPiece(move.fx, move.fy);
    if (piece === 'K') {
      const before = manhattanToNearestCorner(move.fx, move.fy);
      const after = manhattanToNearestCorner(move.tx, move.ty);
      s += (before - after) * 140;
      if (isCorner(move.tx, move.ty)) s += 20000;
      if (isEdge(move.tx, move.ty)) s += 80 + weights.exitFort * 200;
    }

    // Change in king escape routes after this move (computed by caller via result clone)
    if (typeof move._escapeDelta === 'number') {
      if (side === 'A') s += (-move._escapeDelta) * 1600;
      else s += move._escapeDelta * 1400;
    }

    // Attacker stepping next to the king
    if (side === 'A' && piece === 'A') {
      const k = model.findKing();
      if (k) {
        const beforeAdj = Math.abs(move.fx - k.x) + Math.abs(move.fy - k.y);
        const afterAdj = Math.abs(move.tx - k.x) + Math.abs(move.ty - k.y);
        if (afterAdj === 1) s += 90 + weights.aggressive * 120;
        if (afterAdj < beforeAdj) s += 20;
      }
    }

    return s;
  }

  /**
   * Look at the opponent's legal replies on the cloned position and
   * return the most damaging static reply (captures / escapes).
   * This is a cheap 1-ply tactical filter, not a full search.
   */
  function worstOpponentReply(clone, ourSide, weights) {
    if (clone.isGameOver()) return 0;
    const replies = clone.getAllLegalMoves();
    // Cap work: if many replies, sample / skip quiet ones later
    let worstForUs = 0;
    const limit = Math.min(replies.length, 80);
    for (let i = 0; i < limit; i++) {
      const r = replies[i];
      const g2 = clone.clone();
      const res = g2.tryMove(r.fx, r.fy, r.tx, r.ty);
      if (!res.ok) continue;
      if (g2.isGameOver()) {
        const w = g2.getWinner();
        if (w && w !== ourSide) return 8000; // they can win next
        if (w === ourSide) continue;
      }
      let threat = (res.captures || 0) * 350;
      const k = g2.findKing();
      if (k && isCorner(k.x, k.y) && ourSide === 'A') threat += 8000;
      if (k && kingClearCorners(g2.getBoard(), k) > 0 && ourSide === 'A') {
        threat += 600 * kingClearCorners(g2.getBoard(), k);
      }
      if (threat > worstForUs) worstForUs = threat;
    }
    return worstForUs;
  }

  /**
   * Choose a move for the side to move on `model`.
   * Returns { fx, fy, tx, ty, strategy, score } or null.
   */
  function chooseMove(model) {
    if (!model || model.isGameOver()) return null;
    const side = model.getTurn();
    const moves = model.getAllLegalMoves();
    if (!moves.length) return null;

    // Occasionally switch style so long games do not stay one-dimensional
    movesSinceReroll++;
    if (movesSinceReroll > 12 && rand() < 0.18) {
      rollPersonality();
    }
    const pers = getPersonality();
    const weights = pers.weights;

    const kingBefore = model.findKing();
    const escapesBefore = kingClearCorners(model.getBoard(), kingBefore);

    const scored = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const clone = model.clone();
      const res = clone.tryMove(m.fx, m.fy, m.tx, m.ty);
      if (!res.ok) continue;

      const kingAfter = clone.findKing();
      const escapesAfter = kingClearCorners(clone.getBoard(), kingAfter);
      m._escapeDelta = escapesAfter - escapesBefore;

      let score = 0;
      if (clone.isGameOver()) {
        const w = clone.getWinner();
        if (w === side) score = 100000 - i; // instant win, tiny jitter
        else if (w) score = -100000;
        else score = 0;
      } else {
        const boardScore = evaluateBoard(clone.getBoard(), weights);
        // evaluateBoard is from attacker's POV; flip if we are White
        score = (side === 'A') ? boardScore : -boardScore;
        score += evaluateMoveShape(model, m, res, weights, side);

        // Tactical 1-ply: don't hang a win / drop a piece cheaply
        const reply = worstOpponentReply(clone, side, weights);
        score -= reply * 0.85;
      }

      // Noise: medium player is imperfect
      score += (rand() - 0.5) * 70;

      scored.push({ move: m, score: score });
    }

    if (!scored.length) return null;

    scored.sort(function (a, b) { return b.score - a.score; });

    // Always take a forced win if we found one
    if (scored[0].score > 50000) {
      const best = scored[0].move;
      best.strategy = pers.primary;
      best.score = scored[0].score;
      return best;
    }

    // Medium: most of the time pick among the top few, not always #1
    let pool = 1;
    if (scored.length > 1 && scored[0].score - scored[1].score < 40) pool = 3;
    else if (rand() < 0.28) pool = 2;
    else if (rand() < 0.10) pool = 4;
    pool = Math.min(pool, scored.length);

    const chosen = scored[Math.floor(rand() * pool)];
    const out = chosen.move;
    out.strategy = pers.primary;
    out.score = chosen.score;
    return out;
  }

  return {
    chooseMove: chooseMove,
    resetPersonality: resetPersonality,
    getPersonality: getPersonality,
    STRATEGIES: STRATEGIES
  };
})();

if (typeof window !== 'undefined') {
  window.HnefataflAI = HnefataflAI;
}
