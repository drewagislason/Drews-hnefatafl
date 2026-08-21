/*
 * Hnefatafl (Copenhagen rules) - Game Model (engine)
 * Open source, Copyright Drew Gislason, MIT license
 * https://mit-license.org
 *
 * This file contains the pure game logic: board state, rules for movement,
 * capture (including shieldwalls), win conditions, HEN notation.
 * No DOM or UI code. View and Controller depend on this, not vice versa.
 *
 * Board coordinates (like a chess board, but with 11 rows/cols):
 *   x = 0..10  (files a..k)
 *   y = 0..10  (ranks L..1 from top to bottom; y=0 is rank L, y=10 is rank 1)
 *
 * Pieces: 'A' = attacker (black / Viking), 'D' = defender (white), 'K' = king
 * Empty: null
 *
 * Restricted squares (only king may occupy): corners (0,0),(0,10),(10,0),(10,10) and throne (5,5)
 */

'use strict';

const BOARD_SIZE = 11;
const THRONE = { x: 5, y: 5 };
const CORNERS = [
  { x: 0, y: 0 }, { x: 0, y: 10 },
  { x: 10, y: 0 }, { x: 10, y: 10 }
];

// Rank labels from top (y=0) to bottom (y=10): L X 9 8 7 6 5 4 3 2 1
const RANK_LABELS = ['L', 'X', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
// File labels a..k
const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];

/**
 * Create a new empty board (11x11 filled with null)
 */
function createEmptyBoard() {
  const board = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    board[y] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      board[y][x] = null;
    }
  }
  return board;
}

/**
 * Initial Copenhagen 11x11 setup.
 * Attackers (A) on the four sides, defenders (D) and king (K) in center.
 */
function createInitialBoard() {
  const board = createEmptyBoard();

  // Attackers - top side (y=0): c d e f g  (x=3..7)
  for (let x = 3; x <= 7; x++) board[0][x] = 'A';
  // Attackers - bottom side (y=10)
  for (let x = 3; x <= 7; x++) board[10][x] = 'A';
  // Attackers - left side (x=0): rows 3..7 (y=3..7)
  for (let y = 3; y <= 7; y++) board[y][0] = 'A';
  // Attackers - right side (x=10)
  for (let y = 3; y <= 7; y++) board[y][10] = 'A';
  // Extra attackers on the mid of each side arms
  board[1][5] = 'A';  // top mid
  board[9][5] = 'A';  // bottom mid
  board[5][1] = 'A';  // left mid
  board[5][9] = 'A';  // right mid

  // Defenders around king
  // Center cross
  board[5][5] = 'K';  // king on throne
  // Adjacent defenders
  board[3][5] = 'D';  // north of king
  board[4][4] = 'D'; board[4][5] = 'D'; board[4][6] = 'D';
  board[5][3] = 'D'; board[5][4] = 'D'; board[5][6] = 'D'; board[5][7] = 'D';
  board[6][4] = 'D'; board[6][5] = 'D'; board[6][6] = 'D';
  board[7][5] = 'D';  // south

  // Verify count: 24 A, 12 D + K  (standard)
  return board;
}

/**
 * Convert internal (x,y) to algebraic notation e.g. "f6"
 */
function toAlgebraic(x, y) {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return '?';
  return FILE_LABELS[x] + RANK_LABELS[y];
}

/**
 * Parse algebraic e.g. "f6" or "fX" -> {x,y} or null
 */
function fromAlgebraic(str) {
  if (!str || str.length < 2) return null;
  const file = str[0].toLowerCase();
  const rank = str.slice(1).toUpperCase();
  const x = FILE_LABELS.indexOf(file);
  const y = RANK_LABELS.indexOf(rank);
  if (x === -1 || y === -1) return null;
  return { x, y };
}

/**
 * Is the square a restricted square (corners or throne)?
 */
function isRestricted(x, y) {
  if (x === THRONE.x && y === THRONE.y) return true;
  for (const c of CORNERS) {
    if (c.x === x && c.y === y) return true;
  }
  return false;
}

/**
 * Is the square hostile for the purpose of capturing a piece of the given side?
 * side is the side of the piece that might be captured ('A' or 'D'/'K')
 * Hostile squares act as the second capturer.
 */
function isHostile(x, y, capturedSide) {
  if (!isRestricted(x, y)) return false;
  // Corners are always hostile
  for (const c of CORNERS) {
    if (c.x === x && c.y === y) return true;
  }
  // Throne: always hostile to attackers; hostile to defenders only when empty
  if (x === THRONE.x && y === THRONE.y) {
    if (capturedSide === 'A') return true;
    // for defender/king: only if empty (caller must check emptiness separately or we assume)
    // Actually when checking sandwich, the throne square itself is the "beyond", so if we are
    // checking isHostile for the beyond square, and it is empty or occupied by king? 
    // Per rules: throne hostile to defenders when empty.
    // Since beyond must be empty for the sandwich? No, the beyond is the hostile square,
    // which is unoccupied (restricted empty) or the corner is empty.
    // In practice, hostile square is used when the square is empty (or is corner).
    return true; // we treat throne as potentially hostile; emptiness checked by path
  }
  return false;
}

/**
 * Is (x,y) on the board edge?
 */
function isOnEdge(x, y) {
  return x === 0 || x === BOARD_SIZE - 1 || y === 0 || y === BOARD_SIZE - 1;
}

/**
 * Game Model constructor / factory
 */
function createGame() {
  let board = createInitialBoard();
  let turn = 'A'; // attackers (black) move first
  let selected = null; // {x, y} or null
  let moveList = []; // list of algebraic move strings e.g. "f2f3" or "k4c4(*)"
  let positionHistory = []; // for simple 3-fold detection (fen-like)
  let status = "Black's move"; // Black = attackers, White = defenders
  let gameOver = false;
  let winner = null; // 'A' | 'D' | 'draw' | null
  let lastMoveWasCapture = false;

  // Snapshot of board as string for history
  function boardKey() {
    let s = turn;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        s += board[y][x] || '.';
      }
    }
    return s;
  }

  function recordPosition() {
    positionHistory.push(boardKey());
  }

  // Initial
  recordPosition();

  /**
   * Get piece at (x,y) or null
   */
  function getPiece(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
    return board[y][x];
  }

  /**
   * Set piece (internal)
   */
  function setPiece(x, y, piece) {
    board[y][x] = piece;
  }

  /**
   * Count pieces of a type
   */
  function countPieces(type) {
    let n = 0;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === type) n++;
      }
    }
    return n;
  }

  /**
   * Find the king position
   */
  function findKing() {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === 'K') return { x, y };
      }
    }
    return null;
  }

  /**
   * Check if path from (fx,fy) to (tx,ty) is clear (orthogonal, no pieces in between).
   * Does not check destination occupancy or restricted landing.
   */
  function isPathClear(fx, fy, tx, ty) {
    if (fx !== tx && fy !== ty) return false; // must be orthogonal
    if (fx === tx && fy === ty) return false;
    const dx = Math.sign(tx - fx);
    const dy = Math.sign(ty - fy);
    let x = fx + dx;
    let y = fy + dy;
    while (x !== tx || y !== ty) {
      if (getPiece(x, y) !== null) return false;
      x += dx;
      y += dy;
    }
    return true;
  }

  /**
   * Can the piece at (fx,fy) legally land on (tx,ty)?
   * - Path clear
   * - Destination empty (or for king? always empty for landing)
   * - Only king may land on restricted
   * - Not the same square
   */
  function isLegalLanding(fx, fy, tx, ty) {
    const piece = getPiece(fx, fy);
    if (!piece) return false;
    if (fx === tx && fy === ty) return false;
    if (!isPathClear(fx, fy, tx, ty)) return false;
    if (getPiece(tx, ty) !== null) return false; // must be empty
    if (isRestricted(tx, ty) && piece !== 'K') return false;
    return true;
  }

  /**
   * Generate all legal destination squares for the piece at (x,y)
   * Non-king pieces may pass through the empty throne but may not land on it or on corners.
   * King may land on any empty restricted square and continue past empty ones.
   */
  function getLegalMoves(x, y) {
    const moves = [];
    const piece = getPiece(x, y);
    if (!piece) return moves;
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        const occ = getPiece(nx, ny);
        if (occ !== null) break; // occupied, stop
        // empty square
        if (isRestricted(nx, ny)) {
          if (piece === 'K') {
            // king can land on restricted
            moves.push({ x: nx, y: ny });
            // and may continue past it
          } else {
            // non-king: may only pass through the empty throne; cannot land or pass corners
            if (nx === THRONE.x && ny === THRONE.y) {
              // pass through without adding as a legal landing
            } else {
              // corner: blocked for non-king
              break;
            }
          }
        } else {
          // ordinary empty square: legal landing
          moves.push({ x: nx, y: ny });
        }
        nx += dx;
        ny += dy;
      }
    }
    return moves;
  }

  /**
   * Is the given move legal for current turn?
   */
  function isLegalMove(fx, fy, tx, ty) {
    if (gameOver) return false;
    const piece = getPiece(fx, fy);
    if (!piece) return false;
    // Must be current player's piece
    if (turn === 'A' && piece !== 'A') return false;
    if (turn === 'D' && piece !== 'D' && piece !== 'K') return false;
    const legal = getLegalMoves(fx, fy);
    return legal.some(m => m.x === tx && m.y === ty);
  }

  /**
   * Perform normal custodian captures after a piece has landed at (x,y).
   * Returns list of captured positions {x,y}
   * Note: king is never removed by this (only by surround check).
   */
  function performNormalCaptures(x, y, moverSide) {
    const captured = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const mx = x + dx; // middle (potential captured)
      const my = y + dy;
      const bx = x + 2 * dx; // beyond
      const by = y + 2 * dy;
      if (mx < 0 || mx >= BOARD_SIZE || my < 0 || my >= BOARD_SIZE) continue;
      const midPiece = getPiece(mx, my);
      if (!midPiece || midPiece === 'K') continue; // no capture king this way, or empty
      // mid must be enemy
      const midSide = (midPiece === 'A') ? 'A' : 'D';
      if (midSide === moverSide) continue;
      // beyond must be friendly or hostile square
      let beyondOk = false;
      if (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE) {
        const beyondPiece = getPiece(bx, by);
        if (beyondPiece) {
          const beyondSide = (beyondPiece === 'A') ? 'A' : 'D';
          if (beyondSide === moverSide) beyondOk = true;
          // note: king can help capture (moverSide friendly includes if king is defender and mover D)
        } else if (isRestricted(bx, by)) {
          // empty restricted: check hostility
          if (isHostile(bx, by, midSide)) beyondOk = true;
        }
      } else {
        // off board? no, edge is not hostile
      }
      if (beyondOk) {
        // capture
        captured.push({ x: mx, y: my });
      }
    }
    // Remove them
    for (const p of captured) {
      setPiece(p.x, p.y, null);
    }
    return captured;
  }

  /**
   * Check and perform shieldwall captures on the four edges.
   * Called after a move that may have closed a flank.
   * Only if the move landed on an edge and is a flanking move.
   * Returns list of additional captured positions.
   */
  function performShieldwallCaptures(landX, landY, moverSide) {
    const captured = [];
    if (!isOnEdge(landX, landY)) return captured;

    // Check each of the 4 edges for possible shieldwall groups
    // Edge is a full rank or file of 11, but groups of 2+ consecutive enemy pieces.

    function checkEdge(isHorizontal, fixed, startVar, endVar) {
      // Collect segments of consecutive enemy pieces on the edge
      // For horizontal edge (top/bottom): y=fixed, x from 0 to 10
      // For vertical: x=fixed, y from 0 to 10
      const enemies = [];
      for (let i = 0; i < BOARD_SIZE; i++) {
        const px = isHorizontal ? i : fixed;
        const py = isHorizontal ? fixed : i;
        const p = getPiece(px, py);
        if (p && p !== 'K' && ((p === 'A') ? 'A' : 'D') !== moverSide) {
          enemies.push({ x: px, y: py, idx: i });
        }
      }
      // Find consecutive groups of length >=2
      let i = 0;
      while (i < enemies.length) {
        let j = i;
        while (j + 1 < enemies.length && enemies[j + 1].idx === enemies[j].idx + 1) {
          j++;
        }
        const groupLen = j - i + 1;
        if (groupLen >= 2) {
          // Check if this group is fully bracketed and each has enemy in front
          const group = enemies.slice(i, j + 1);
          const firstIdx = group[0].idx;
          const lastIdx = group[groupLen - 1].idx;
          // Brackets: left/above of first, right/below of last: must be friendly piece or corner (restricted)
          function isBracket(idx) {
            if (idx < 0 || idx >= BOARD_SIZE) {
              // off end: only if the edge end is a corner, which it is for the extreme
              // corners act as bracket
              return true; // the four corners of board act as possible brackets
            }
            const bx = isHorizontal ? idx : fixed;
            const by = isHorizontal ? fixed : idx;
            const bp = getPiece(bx, by);
            if (bp) {
              const bs = (bp === 'A') ? 'A' : 'D';
              return bs === moverSide; // friendly (including king if D)
            }
            // empty: if restricted (corner) yes
            return isRestricted(bx, by);
          }
          const leftBracket = isBracket(firstIdx - 1);
          const rightBracket = isBracket(lastIdx + 1);
          if (leftBracket && rightBracket) {
            // Check every member has enemy "directly in front" (inward)
            // Inward direction: for top edge (y=0) inward is +y (down), bottom y=10 inward -y
            // left x=0 inward +x, right x=10 inward -x
            let allFronted = true;
            for (const g of group) {
              let fx, fy;
              if (isHorizontal) {
                // top or bottom
                if (fixed === 0) { // top
                  fx = g.x; fy = 1;
                } else { // bottom
                  fx = g.x; fy = 9;
                }
              } else {
                if (fixed === 0) { // left
                  fx = 1; fy = g.y;
                } else {
                  fx = 9; fy = g.y;
                }
              }
              const front = getPiece(fx, fy);
              if (!front) {
                allFronted = false;
                break;
              }
              const fs = (front === 'A') ? 'A' : 'D';
              if (fs !== moverSide) {
                allFronted = false;
                break;
              }
            }
            if (allFronted) {
              // Also: the capturing move must be a flanking move, i.e. the landed piece is one of the brackets
              // Check if land position is adjacent to the group as a bracket
              const landIdx = isHorizontal ? landX : landY;
              const isFlanking = (landIdx === firstIdx - 1 || landIdx === lastIdx + 1) &&
                                ((isHorizontal && landY === fixed) || (!isHorizontal && landX === fixed));
              // Or if the move closed it somehow; rules say "the move used to capture them is a flanking move"
              // We require the landed piece is at a bracket position of this group.
              if (isFlanking || (isRestricted(landX, landY) && (landIdx === firstIdx - 1 || landIdx === lastIdx + 1))) {
                // Capture the whole group (except if king is in it -- but king not in enemies since we skipped K)
                // Note: if king + defenders, king not captured, but we already excluded K from enemies
                for (const g of group) {
                  captured.push({ x: g.x, y: g.y });
                }
              }
            }
          }
        }
        i = j + 1;
      }
    }

    // Top edge y=0 horizontal
    checkEdge(true, 0);
    // Bottom y=10
    checkEdge(true, 10);
    // Left x=0 vertical
    checkEdge(false, 0);
    // Right x=10
    checkEdge(false, 10);

    // Remove
    for (const p of captured) {
      if (getPiece(p.x, p.y)) { // still there
        setPiece(p.x, p.y, null);
      }
    }
    return captured;
  }

  /**
   * Check if the king is captured (surrounded).
   * Returns true if king should be considered captured.
   */
  function isKingCaptured() {
    const king = findKing();
    if (!king) return true; // already gone
    const { x, y } = king;
    // King cannot be captured on the board edge
    if (isOnEdge(x, y)) return false;

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    let surroundedCount = 0;
    let throneAdjacent = false;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx === THRONE.x && ny === THRONE.y) {
        throneAdjacent = true;
        // throne counts as surrounding for attackers if we are checking attacker surround
        surroundedCount++; // throne acts as wall
        continue;
      }
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) {
        // off board doesn't help (edge already excluded)
        continue;
      }
      const p = getPiece(nx, ny);
      if (p === 'A') {
        surroundedCount++;
      } else if (isRestricted(nx, ny) && isHostile(nx, ny, 'D')) {
        // empty hostile (corner) can help surround king?
        // Per rules, for king capture it's pieces or the throne specially. Corners not typically for king surround unless.
        // Standard: only the 4 cardinal, using attackers or throne.
        // Corners are far, so if king next to corner? rare.
      }
    }
    // If next to throne, need only 3 attackers (throne counts as 4th)
    if (throneAdjacent) {
      // count only the attacker sides; we already added 1 for throne, so need total 4 meaning 3 attackers
      return surroundedCount >= 4;
    }
    // Normal: all 4 must be attackers
    return surroundedCount >= 4;
  }

  /**
   * Very basic check for exit fort: king on edge, has at least one legal move,
   * and the local group looks closed (simple heuristic: no adjacent empty to attackers easily).
   * Full "impossible to break" is complex (requires search); this is a placeholder that
   * triggers only on clear small forts. Returns true if defenders win by fort.
   * TODO: improve with proper impregnability check.
   */
  function isExitFort() {
    const king = findKing();
    if (!king || !isOnEdge(king.x, king.y)) return false;
    // King must be able to move
    const kingMoves = getLegalMoves(king.x, king.y);
    if (kingMoves.length === 0) return false;
    // Simple heuristic: count nearby defenders and see if the edge segment is occupied by D/K
    // and no immediate capture possible on them by current attackers. For now, conservative:
    // only return true if king has 2+ adjacent defenders on the edge forming a block.
    // This is incomplete; real exit fort detection needs graph connectivity of safe zone.
    // For initial version we leave most cases to human judgment / later AI tests.
    return false; // disabled until better implementation; rely on corner escapes mainly
  }

  /**
   * Basic encirclement: if all remaining D and K are inside an unbroken ring of A
   * (no path from any D/K to the edge without crossing A).
   * Uses flood fill from edges, seeing if any defender is reachable without crossing attackers.
   */
  function isEncirclement() {
    // Flood fill from all edge empty or non-A squares inward; if any D or K not reached, and they exist, then encircled?
    // Actually: if the attackers form a closed ring such that no defender can reach edge.
    // I.e. flood from edges through non-A squares; if a D/K is not flooded to, then yes encircled.
    const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const queue = [];
    // Start from all edge squares that are not A
    for (let i = 0; i < BOARD_SIZE; i++) {
      // top bottom
      for (const yy of [0, BOARD_SIZE - 1]) {
        if (getPiece(i, yy) !== 'A') {
          queue.push({ x: i, y: yy });
          visited[yy][i] = true;
        }
      }
      // left right (avoid double corners)
      for (const xx of [0, BOARD_SIZE - 1]) {
        if (getPiece(xx, i) !== 'A' && !visited[i][xx]) {
          queue.push({ x: xx, y: i });
          visited[i][xx] = true;
        }
      }
    }
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (queue.length > 0) {
      const { x, y } = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
        if (visited[ny][nx]) continue;
        if (getPiece(nx, ny) === 'A') continue; // cannot cross attackers
        visited[ny][nx] = true;
        queue.push({ x: nx, y: ny });
      }
    }
    // Now, if any D or K is not visited, they are enclosed
    let hasDefender = false;
    let allEnclosed = true;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = getPiece(x, y);
        if (p === 'D' || p === 'K') {
          hasDefender = true;
          if (visited[y][x]) {
            allEnclosed = false;
          }
        }
      }
    }
    return hasDefender && allEnclosed;
  }

  /**
   * Check if current player has any legal move
   */
  function hasAnyLegalMove(side) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = getPiece(x, y);
        if (!p) continue;
        if (side === 'A' && p !== 'A') continue;
        if (side === 'D' && p !== 'D' && p !== 'K') continue;
        if (getLegalMoves(x, y).length > 0) return true;
      }
    }
    return false;
  }

  /**
   * After a successful move, check all win conditions and update status.
   */
  function checkEndConditions() {
    // 1. King captured?
    if (isKingCaptured()) {
      // remove king for cleanliness
      const k = findKing();
      if (k) setPiece(k.x, k.y, null);
      gameOver = true;
      winner = 'A';
      status = "Black wins!";
      return;
    }
    // 2. King reached a corner?
    const king = findKing();
    if (king && isRestricted(king.x, king.y) && (king.x !== THRONE.x || king.y !== THRONE.y)) {
      // is a corner
      gameOver = true;
      winner = 'D';
      status = "White wins!";
      return;
    }
    // 3. Exit fort?
    if (isExitFort()) {
      gameOver = true;
      winner = 'D';
      status = "White wins! (exit fort)";
      return;
    }
    // 4. Encirclement?
    if (isEncirclement()) {
      gameOver = true;
      winner = 'A';
      status = "Black wins! (encirclement)";
      return;
    }
    // 5. No moves for the side about to play?
    // (we switch turn after move, so check the new turn)
    // called after turn switch
    if (!hasAnyLegalMove(turn)) {
      gameOver = true;
      winner = (turn === 'A') ? 'D' : 'A';
      status = (turn === 'A') ? "White wins! (Black has no moves)" : "Black wins! (White has no moves)";
      return;
    }
    // 6. Simple 3-fold repetition -> white loses (per rules perpetual loss for white)
    const key = boardKey();
    const count = positionHistory.filter(k => k === key).length;
    if (count >= 3) {
      gameOver = true;
      winner = 'A'; // white loses
      status = "Black wins! (perpetual repetition)";
      return;
    }
    // else continue
    status = (turn === 'A') ? "Black's move" : "White's move";
  }

  /**
   * Attempt to make a move from (fx,fy) to (tx,ty).
   * Returns { ok: boolean, message: string, captures: number }
   */
  function tryMove(fx, fy, tx, ty) {
    if (gameOver) {
      return { ok: false, message: "Game is over", captures: 0 };
    }
    if (!isLegalMove(fx, fy, tx, ty)) {
      return { ok: false, message: "Invalid move", captures: 0 };
    }
    // Execute
    const piece = getPiece(fx, fy);
    setPiece(fx, fy, null);
    setPiece(tx, ty, piece);

    // Captures
    let allCaptured = performNormalCaptures(tx, ty, turn);
    const sw = performShieldwallCaptures(tx, ty, turn);
    allCaptured = allCaptured.concat(sw);

    lastMoveWasCapture = allCaptured.length > 0;

    // Record move in algebraic
    let moveStr = toAlgebraic(fx, fy) + toAlgebraic(tx, ty);
    if (lastMoveWasCapture) moveStr += '(*)';
    moveList.push(moveStr);

    // Switch turn
    turn = (turn === 'A') ? 'D' : 'A';

    // Record position after switch
    recordPosition();

    // Check ends
    checkEndConditions();

    selected = null;

    return {
      ok: true,
      message: status,
      captures: allCaptured.length
    };
  }

  /**
   * Select a square (for UI). Returns whether selection changed or piece selected.
   */
  function selectSquare(x, y) {
    if (gameOver) return { selected: false, message: status };
    const piece = getPiece(x, y);
    if (selected && selected.x === x && selected.y === y) {
      // deselect
      selected = null;
      return { selected: false, message: status };
    }
    if (piece) {
      // only select own pieces
      if ((turn === 'A' && piece === 'A') || (turn === 'D' && (piece === 'D' || piece === 'K'))) {
        selected = { x, y };
        return { selected: true, message: "Selected " + toAlgebraic(x, y) };
      }
    }
    // if selected already, try move
    if (selected) {
      const res = tryMove(selected.x, selected.y, x, y);
      return { selected: false, message: res.message, ok: res.ok };
    }
    return { selected: false, message: status };
  }

  /**
   * New game
   */
  function newGame() {
    board = createInitialBoard();
    turn = 'A';
    selected = null;
    moveList = [];
    positionHistory = [];
    status = "Black's move";
    gameOver = false;
    winner = null;
    lastMoveWasCapture = false;
    recordPosition();
  }

  /**
   * Generate HEN notation string
   */
  function toHEN() {
    // 1. Moves, wrapped ~80 cols, complete moves
    let movesStr = '';
    let line = '';
    for (let i = 0; i < moveList.length; i++) {
      const m = moveList[i];
      // number every two moves (black white)
      let prefix = '';
      if (i % 2 === 0) {
        const num = Math.floor(i / 2) + 1;
        prefix = num + '.';
      }
      const token = prefix + m + ' ';
      if ((line + token).length > 80) {
        movesStr += line.trim() + '\n';
        line = token;
      } else {
        line += token;
      }
    }
    if (line.trim()) movesStr += line.trim() + '\n';

    // 2. Compact board state: numbers for runs of empty, v/V/K
    function compactRow(y) {
      let s = '';
      let empty = 0;
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = board[y][x];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) {
            s += empty;
            empty = 0;
          }
          if (p === 'A') s += 'v';
          else if (p === 'D') s += 'V';
          else if (p === 'K') s += 'K';
        }
      }
      if (empty > 0) s += empty;
      if (s === '') s = '11';
      return s;
    }
    const compact = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      compact.push(compactRow(y));
    }
    const compactStr = compact.join(' ');

    // 3. Human readable board
    let human = '';
    for (let y = 0; y < BOARD_SIZE; y++) {
      human += '    ' + RANK_LABELS[y] + ' ';
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = board[y][x];
        if (!p) human += '.';
        else if (p === 'A') human += 'v';
        else if (p === 'D') human += 'V';
        else human += 'K';
      }
      human += '  \n';
    }
    human += '      abcdefghijk  \n';

    // 4. Final state
    let final = 'Incomplete Game';
    if (gameOver) {
      if (winner === 'A') final = 'Black Wins!';
      else if (winner === 'D') final = 'White Wins!';
      else final = 'Stalemate';
    }

    return movesStr + '\n' + compactStr + '\n\n' + human + '\n' + final + '\n';
  }

  /**
   * Parse and load from HEN (basic support for board state + moves optional)
   * For initial version, primarily restore board state from the compact or human part.
   * Full move replay left for later enhancement.
   */
  function fromHEN(text) {
    // Simple: look for the compact line or the human board
    // For robustness, try to parse the human graphic board
    const lines = text.split(/\r?\n/);
    let boardLines = [];
    for (const line of lines) {
      const m = line.match(/^\s*([LX1-9])\s+([.vVK]{11})/);
      if (m) {
        boardLines.push({ rank: m[1], content: m[2] });
      }
    }
    if (boardLines.length === 11) {
      // rebuild
      board = createEmptyBoard();
      for (const bl of boardLines) {
        const y = RANK_LABELS.indexOf(bl.rank);
        if (y === -1) continue;
        for (let x = 0; x < 11; x++) {
          const ch = bl.content[x];
          if (ch === 'v') board[y][x] = 'A';
          else if (ch === 'V') board[y][x] = 'D';
          else if (ch === 'K') board[y][x] = 'K';
        }
      }
      // also try to set turn from final or assume
      turn = 'A';
      // check if "White's move" or similar, but for now reset history
      moveList = [];
      positionHistory = [];
      gameOver = false;
      winner = null;
      status = "Black's move";
      selected = null;
      // detect if finished from last line
      const last = lines[lines.length - 1] || '';
      if (last.includes('Black Wins')) {
        gameOver = true; winner = 'A'; status = 'Black wins!';
      } else if (last.includes('White Wins')) {
        gameOver = true; winner = 'D'; status = 'White wins!';
      }
      recordPosition();
      return true;
    }
    // fallback: try compact
    // e.g. 3vvvvv3 6v6 ...
    for (const line of lines) {
      if (line.match(/^[0-9vVK ]+$/) && (line.includes('v') || line.includes('V') || line.includes('K'))) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 11) {
          board = createEmptyBoard();
          for (let y = 0; y < 11; y++) {
            let x = 0;
            const row = parts[y];
            let i = 0;
            while (i < row.length && x < 11) {
              if (row[i] >= '0' && row[i] <= '9') {
                // number may be multi digit? but for 11 max single or 11
                let num = 0;
                while (i < row.length && row[i] >= '0' && row[i] <= '9') {
                  num = num * 10 + parseInt(row[i], 10);
                  i++;
                }
                x += num;
              } else {
                const ch = row[i];
                if (ch === 'v') board[y][x] = 'A';
                else if (ch === 'V') board[y][x] = 'D';
                else if (ch === 'K') board[y][x] = 'K';
                x++;
                i++;
              }
            }
          }
          turn = 'A';
          moveList = [];
          positionHistory = [];
          gameOver = false;
          winner = null;
          status = "Black's move";
          selected = null;
          recordPosition();
          return true;
        }
      }
    }
    return false;
  }

  // Public API
  return {
    // state accessors
    getBoard: () => board.map(row => row.slice()),
    getTurn: () => turn,
    getSelected: () => selected ? { ...selected } : null,
    getStatus: () => status,
    isGameOver: () => gameOver,
    getWinner: () => winner,
    getMoveList: () => moveList.slice(),
    // actions
    newGame,
    selectSquare,
    tryMove,
    getLegalMoves,
    isLegalMove,
    toAlgebraic,
    fromAlgebraic,
    toHEN,
    fromHEN,
    getPiece,
    isRestricted,
    // for tests later
    findKing,
    isKingCaptured,
    isEncirclement,
    hasAnyLegalMove,
    BOARD_SIZE,
    RANK_LABELS,
    FILE_LABELS
  };
}

// Export for browser (global) and potential modules
if (typeof window !== 'undefined') {
  window.HnefataflModel = { createGame, createInitialBoard, toAlgebraic, fromAlgebraic, isRestricted, BOARD_SIZE, RANK_LABELS, FILE_LABELS };
}
