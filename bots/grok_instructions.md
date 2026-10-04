# GrokBot Instructions

This markdown file is to be used by a GrokBot or another AI agent to produce a Hnefatafl web game.

While these instructions should work with any agent, they have only been tested with GrokBot.

## Instructions for GrokBot (Hnefatafl, Copenhagen Rules)

Bot (aka agent), please follow this task list:

1. See game rules, in file Copenhagen_Hnefatafl_11x11.pdf
  - or see https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf
2. See game look and feel with Hnefatafl_Board.png
3. See HEN notation in hen.md
4. First read all sections below up to Stage 1 (e.g. Features, Board and Game Layout, etc)
5. Build and test Stage 1, described below, wait for my feedback before proceeding
6. Build and test Stage 2, described below, wait for my feedback before proceeding
7. Build and test Stage 3, described below, wait for my feedback before proceeding
8. Build and test Stage 4, game is complete

## Hnefatafl Web Game Features

- Mobile first (works equally well on phone, tablet, laptop)
- Browser game playable by two human players, human against ai, or ai against ai
- Game can be saved at any point in HEN notation
- Can be played with any combination of keyboard, mouse or trackpad
- Displays game move list live, for save and restore
- Supports common browsers: Chrome, Microsoft Edge, Safari, DuckDuckGo, Brave, Firefox, etc..

## Board and Game Layout

- Board is mobile first (looks equally well on phone, tablet, laptop)
  - It is OK for the HEN notation to be off-screen (below) for phone if there is not room
- For board setup and placement, see Copenhagen_Hnefatafl_11x11.pdf
- For colors (background, board, etc...), see Hnefatafl_board.png
- For HEN notation, see hen.md
- 11x11, drawn as a 13x13 table with where the outer table cells are the board edge (border)
- Border is black
- The inner 11x11 table squares are the playing board, or just board, and is white with cell edges in black
- The top border will have the word Hnefatafl spelled in runes (ᚺᚾᛖᚠᚨᛏᚨᚠᛚ)
- The left border is numbered from the bottom like a chess board: 123456789XL (X=Dec and L=El from dozenal for 10 and 11)
- The bottom border is lettered, like chess: abcdefghijk, so a1 is bottom left, kL is top right
- The right border as the name of Viking Runes, Futhark, spelled ᚠᚢᚦᚨᚱᚲ in runes, from top to bottom.
- The 4 corners of the board and the center cell will use the rune ᚷ (Gebo) for the king's squares
- The pieces are displayed as circles.
- The king is a white circle with containing the same rune ᚷ (Gebo)
- Buttons are on the row below the 11x11 game board
- Button names/functions 
  - Buttons do not need to be same size. Each must be long enough to accomodate the full text
  - New game button (key=N or n), sets up board for new game
    - Will ask are you sure if in the middle of a game
  - Save game button (key=S or s), saves current moves/layout in HEN format (see below)
    - Opens a file save dialog (default hen.txt downloads) so the user can chose the file name to save it under
    - Output file is called hen.txt by default, folder downloads
    - Remember the location/filename (in memory only) so the user can save various states of a game in the same place, slighly modifying the name easily
  - Restore game button (key=R or r), restores game from HEN format
    - Will ask are you sure if in the middle of a game
    - Opens a file picker so the user can chose when HEN file to restore
  - Who button (key=W or w) state toggle, 2 players, W player, B player, ai vs ai (4 state toggle)
    - 2 Humans (all moves are manual, like they would be with a physical board)
    - Black vs AI (Human playing black vs AI playing white)
    - White vs AI (Human playing white vs AI playing black)
    - AI vs AI
    - button text looks like "Who: 2 Humans" or "Who: Black vs AI", etc...
    - Make sure button is long enough to accomodate full text for longest text
  - Rules button (key=U or u)
    - Opens https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf in a new tab
- Game status, one of: Black's move, White's move, Black wins!, White wins!, invalid move, mirroring HEN last line in Final Board State
- Hidden keys '<' and '>' speed up and slow down the automated play by the ai
  - In seconds: 0.1 (min), 0.25, 0.33, 0.5, 1, 2, 3, 4, 5 (max)
  - Status will indicate speed
- Live HEN scrollable text box is below the buttons
  - User can't edit the HEN, but can scroll to see past moves and the current board layout in HEN
  - On a phone, it might be below the screen.
- Selected Colors must match the color palette found in Hnefatafl_Board.png 

Note: keys are not separate input from mouse clicks,they work together. Poll the keyboard so moves or buttons can be selected/pressed or the same actions can be caused by mouse clicks. For example, a human could type b2 to select the piece in that square, then click on square b9 to move there

## AI

Despite the assymetric nature of the game (24 attackers, 12 defenders), the game rules make it pretty balanced (king escape vs captured king). The AI should reflec that.

- The AI should randomly try different stategies (aggressive, defensive, piece taking, blocking, encirclement, exit fort, shieldwalls)
- No AI levels for now. The AI should attempt to be a "medium" player, not too hard, not to easy
- If the AI is playing itself should work out to approximately even game wins by each side on average (approx 50 black, 50 white)

The AI allows a human to play against AI, or for AI to play against itself for testing purposes.

The AI (for now) will not have any settings. It should try various strategies over time, attempting to be surprising, playing defensively, agressively and try the various ways to win the game. Over a series of 20+ games it should try each of the capture/win types mentioned in the Hnefatafl Copenhagen rules. It will internally keep a list in memory (no need to learn over time or store the learning anywhere). The AI will learn as it plays you, until you quit the game.

Perhaps a future version will have levels and will store what it learned when playing against a signed-in human.

When AI plays against itself, it should win/lose about 50% of the games whether playing black or white. Until this happens, the AI needs more work.

So a human can see it move in game play6, the AI move speed can vary speed from 1/10th of a second to 5 seconds per move (already specified). When running the test suite, the AI shall operate at maximum speed (no delay).

## File Organization

Use standard web src file organization

```
src       contains index.html, subfolders as needed for resources
test      contains test suite
testruns  contains test reports from running test suite
```

## Code Organization

- Project folders are bots/ docs/ src/ test/
  - bots/ contains instructions or files for the 

- Separate U/I into model/view/controller, in different files, so the view/controller can change without affecting the game engine
  - Later this will be tested by using NodeJS with a command-line UI operating in ZSH or Bash
  - Separate AI model from game board/setup/rules model, so they can be tested and debugged independently
- All files in a single folder tree with an index.html that can be loaded locally or from the web
- All files include a header comment that the code is open source, Copyright Drew Gislason, MIT license with URL https://mit-license.org
- All source files/functions are commented so a human can read/fix the code. Emphasize clarity over compactness or speed
- Use standard HTML, CSS, Javascript only
- In the Model, separate AI model from game-play setup and rules
  - The AI will use the same game rules, as would a human vs human mode.

## User Interface

- Only legal moves are allowed
  - Visually show legal moves with highlighted squares
- Player can click on a piece, then click where it goes.
- Rather than click, a player can alternately type in the "from" coordinate (e.g. b4 or kx) then the "to" coordinate (e.g b8 or x1) or any combination of clicks and coordinates
- There is no "mode" between keyboard and mouse clicks.
- The user can tell what they typed (or clicked) for a move because it is shown real-time in the HEN view
  - For example, the the user selects a piece at b4 with a click, then that is shown in HEN. Then, if the user changes their mind and chooses a piece at f9, whether with a click or pressing `f9`, then the b4 is removed from HEN replaced by f9 from position
- The player can hit `esc` or click in an empty square to start the turn over, or simply select a different "from" piece
- A player could type b2 to select the piece, then click on square b3 to move it there
- Selected piece should be visibly selected
- At any time a user can click on any of the main buttons (Save game, Restore game, etc...)
- Game type can be toggled at any time, even during the game
- If game type is computer on computer, make each color's move one per second, so someone can watch the game unfold between the two computers, unless running in the test harness which doesn't need to wait

## Test Suite

You have some freedom on the test suite. Goal is to verify ALL rules are correct. That AI can play well (and correctly) with humans and itself. That HEN is written correctly, restored correctly, and bad inputs rejected properly.

- Use test driven design. Implement test cases first, then the game engine will fail
- Test Rules separately from AI, separately from UI
- Individual tests must be able to be run manually by human or bot for debugging purposes
- I don't yet have NodeJS installed, so test suite must run in browser
- Tests come in 4 high-level categoies
  - test_rules.html
  - test_ai.html
  - test_hen.html
  - test_ui.html
- Test suite includes code organization documnentation and test run reports

All tests run produce a report showing what tests were run and the results. Prepare for automatated testing, so any new code check-in can run the test suite and reject the pull request if the code doesn't pass the test suite.

### Rules Tests

- Tests rule model
- Test suite must test all rules/moves in Copenhagen_Hnefatafl_11x11.pdf. Make a list. Check it off
- Can use two HEN files per test. Starting condition, expected ending condition.
  - Verify move is proper
  - Verify proper pieces are moved from board if captured
  - Verify game ended/tied properly if the move should result in one of those
- Verify illegal moves are rejected
- Verify all legal moves
  - All piece capturing moves, verify proper piece(s) are taken
  - Test shield walls
  - Valididate all various possible game endings and who properly wins
  - Look for any game hang conditions or never ending conditions.
- Provide a way to run each tests individually so code can be debugged
- Make up a creative number of tests of your own not specically listed in Copenhagen Rules. Explain why you made those tests

### AI Tests

- Verify AI makes logical moves
- Look on the web to find any information you can about how to play Hnefatafl well
  - Incorporate the good ideas
- Verify AI wins approximately 50/50 while playing itself over 100 game test runs
- Verify AI doesn't hang or make illegal moves (builds on rules test suite)

### HEN Tests

- Verify initial setup HEN file saves and loads
- A move is usually black then white, but could be black only if saved before white has moved or if white loses. Verify this
- Test invalid HEN input (completely wrong, not a text file, subtly wrong)
- HEN saving follows strict specification
- HEN loading allows mistakes that aren't ambiguos in meaning, e.g.
  - using x instead of X for row 10 coordinate, or l instead of L for row 11
  - e.g. missing period after move #

### UI Tests

- If possible, compare visual output to game model. Does everything look right for board, buttons, HEN text display?
- If this is too difficult with just Javascript, it can be postponed until some better tools are in place.
- Recommend tools for UI Testing

## Stage 1 - Layout and Interface

- This version tests the visual layout on phone, tablet and laptop
- It does not need any input. This is for visual representation only

Output: Hnefatafl_Stage1.zip contains set of files/folders. Can be loadable locally in a browser once unzipped

## Stage 2 - Manual Game

- Game is fully playable by two humans
- HEN is fully support and can be saved/restored at any point in the game, including after either black or white wins
- This version provides stubbed AI
  - If a player presses the game mode button, a message will indicate AI is not yet operational
- All other features are present
- Includes automated HEN test suite
- Includes automated rules test suite
- Humans can also manually test to find mistakes
- Tests include human readable list of individual tests
- All code human readable
- Automated test run results included (e.g. testrun_09_30_2026.md) and shows passing all tests
  - Test run includes timestamp in the usual internet UTC time/date format

Output: Hnefatafl_Stage2.zip contains set of files/folders. Can be loadable locally in a browser once unzipped

## Stage 3 - Basic AI Game

- Builds on Stage 2
- AI is functional, and tested against itself in over 100 games
- Strategies should vary between game, and are noted in test suite
- AI test suite complete
- Wins/loses about 50% against itself
- Includes test run report

Output: Hnefatafl_Stage3.zip contains set of files/folders. Can be loadable locally in a browser once unzipped

## Stage 4 - Game Complete and Deployable

- Builds on Stage 3
- Fixes discovered by bots or humans from Stage 3
- Full automated test suite
- Game fully playable
- Considered 1st "commercial" release, v1.0

Output: Hnefatafl_Final.zip contains set of files/folders. Can be loadable locally in a browser once unzipped
