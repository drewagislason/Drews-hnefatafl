# Hnefatafl Encoding Notation (HEN)

version 1.0

HEN (a play on FEN from chess), was invented by Drew Gislason, and is a compact plain text
representation of a Hnefatafl game or scenario. It includes both moves and board state.

For Hnefatafl rules, see https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf

HEN files contain 3 sections, each separate by a blank line:

1. The Board State
2. The List of Moves
3. The Text-Graphic Representation after applying List of Moves to the Board State

Optional HTML style comments can be added (but not in the middle of a section). For example:

<!-- comment -->

## Hnefatafl Board State

The Board State is the initial state before any moves are applied, which might be the start of a new
game, the middle of a game, an instructional scenario, or the end of a game. It is the only
required field in a HEN file. All others are optional.

The Initial Board State for a new 11x11 Hnefatafl game is always:

```
3vvvvv3 5v5 11 v4V4v v3VVV3v vv1VVKVV1vv v3VVV3v v4V4v 11 5v5 3vvvvv3
```

The numbers represent empty squares. The lowercase `v` means a black (invading) Viking piece. The
uppercase `V` means a white (defending) Viking. The `K` represents the white King. Each row is
separated by a space. The numbers are in base 10, so an empty row is 11 (eleven) spaces on an 11x11
board. The board size can be inferred by the number of spaces, so the scheme still works for a 7x7
or 9x9 board. If any row does not agree with the size of the board, it shall be flagged as an error
by any tool that can read HEN.

Normally Black begins the next move. But if this board state represents the middle of the game and it is White's turn to move, then a `,W` is placed after the last row. For example:

```
3vvvvv3 9v1 11 v4V4v v3VVV3v vv1VVKVV1vv v3VVV3v v4V4v 11 5v5 3vvvvv3,W
```

The Board State has a `!W` or a `!B` at the end to indicate a White win or Black win.

```
3vvv4K 1v8v 5V1v2v v8V1 v3V1V4 vv1VV1VV2V v3VVV3v 2v2V4v 11 5v3v1 3vvvvv3!W
```

## Hnefatafl List of Moves

The List of Moves is like a replay of a game from the initial Board State in compact form.

- Moves are recorded as pairs of coordinates
- The board is lettered from left to right: a,b,c,d,e,f,g,h,i,j,k
- The board is numbered from bottom to top: 1,2,3,4,5,6,7,8,9,X,L
  - Where X represents row 10 and L represents row 11
  - Or, if you know dozenal, X=dek, L=el
- A star `*` is added to move if it involves capture of one or more pieces, including the king
- For readability, moves may be split across multiple lines (say at 100 characters), but a move pair is never split across lines

Example set of opening moves (three turns, black moves from f2 to f3, then white moves from f4 to b4, etc...):

```
1.f2f3 f4b4 2.k4c4* f5f4 3.fXjX f4k4
```

If the Board State indicates it is White's turn to move next with the `,W`, the move will be abbreviated with only set of to/from coordinates, preceded by a dash `-` to indicate Black has already moved. The same example above, but with Black already having made the move from f2 to f3, is shown below:

```
1.- f4b4 2.k4c4* f5f4 3.fXjX f4k4
```

## Hnefatafl Final Board State

The optional Final Board State is a visual text depiction of a Hnefatafl board, making it easy for a
human to visually see how the game (or move sequence) ended.

Essentially, this visual state is Initial Board State after the List of Moves is applied.

It is the same information as a Board State, but in a more verbose, human readable form.

- Row/col numbers/letters are displayed along the left/bottom
- The layout of all pieces using `v`, `V` and `K` are displayed on the board
- The `.` period character is used for empty spaces to allow for counting
- The game state is displayed in English after the game board one of:
  - Black's Move
  - White's Move
  - Black Wins
  - White Wins

Initial Layout example (which is always Black's Move):

```
L ...vvvvv...
X .....v.....
9 ...........
8 v....V....v
7 v...VVV...v
6 vv.VVKVV.vv
5 v...VVV...v
4 v....V....v
3 ...........
2 .....v.....
1 ...vvvvv...
  abcdefghijk

Black's Move
```

White's Move example (about to capture 3 black Vikings with shieldwall maneuver):

```
L ...vvvvv...
X .....v.....
9 .v.........
8 .....V....v
7 v...VVV...v
6 ...VV....vv
5 v...VVV...v
4 v..K......v
3 ...........
2 ...VVV.....
1 ..Vvvv.....
  abcdefghijk

White's Move
```

## Complete HEN File Example

The example enclosed in triple ticks shows the complete HEN file with line breaks, moves, board
state, and board state in text graphics.

```
3vvvvv3 5v5 11 v4V4v v3VVV3v vv1VVKVV1vv v3VVV3v v4V4v 11 5v5 3vvvvv3

1.f2f3 f4b4 2.k4c4* f5f4 3.fXjX f4k4

L ...vvvvv...
X .........v.
9 ...........
8 v....V....v
7 v...VVV...v
6 vv.VVKVV.vv
5 v...V.V...v
4 v.v.......V
3 .....v.....
2 ...........
1 ...vvvvv...
  abcdefghijk

Black's Move
```
