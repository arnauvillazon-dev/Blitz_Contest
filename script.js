/**
 * Blitz Contest - Main Game Script
 */

// --- Constants & Config ---
const BOARD_SIZE = 8;
const TILE_SIZE = 100; // 800px / 8
const PLAYERS = [
    { id: 0, name: 'P1', color: '#00f3ff', type: 'human' }, // Bottom (Blue)
    { id: 1, name: 'P2', color: '#ff0055', type: 'bot' },   // Left (Red)
    { id: 2, name: 'P3', color: '#00ff66', type: 'bot' },   // Top (Green)
    { id: 3, name: 'P4', color: '#ffcc00', type: 'bot' }    // Right (Yellow)
];

const PIECE_TYPES = {
    ROOK: 'Rook',
    BISHOP: 'Bishop',
    QUEEN: 'Queen',
    PAWN: 'Pawn' // Neutral obstacles
};

// --- Sound Manager ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playTone(freq, type, duration, startTime = 0) {
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playTick() {
        // High pitched blip
        this.playTone(800, 'square', 0.1);
    }

    playMove() {
        // Swoosh/Clack
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playCapture() {
        // Crunch/Low pitch
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playWin() {
        // Major Arpeggio Fanfare (C Major: C, E, G, C)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            this.playTone(freq, 'triangle', 0.3, i * 0.15);
        });
    }

    playSlotTick() {
        // Mechanical click/blip
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }
}

// --- Game State Management ---
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.state = 'MENU'; // MENU, PLAYING, GAMEOVER
        this.mode = 'USER'; // USER, AGENTS
        this.turnPhase = 'SLOT'; // SLOT, COUNTDOWN, RESOLUTION

        this.board = []; // 8x8 grid
        this.pieces = []; // List of all active pieces
        this.players = []; // Player objects

        this.activePlayers = []; // [pIndex1, pIndex2]
        this.activePieceType = null;

        this.countdownValue = 5;
        this.countdownTimer = null;

        this.pendingMoves = {}; // { playerId: { piece, targetX, targetY } }
        this.selectedPiece = null;

        this.soundManager = new SoundManager();

        this.initEventListeners();
        this.loop();
    }

    initEventListeners() {
        console.log('Initializing Event Listeners');
        const btnUser = document.getElementById('btn-user-game');
        const btnAgents = document.getElementById('btn-agents-game');

        if (btnUser) {
            btnUser.addEventListener('click', () => {
                console.log('User Game Button Clicked');
                this.startGame('USER');
            });
        } else {
            console.error('btn-user-game not found');
        }

        if (btnAgents) {
            btnAgents.addEventListener('click', () => {
                console.log('Agents Game Button Clicked');
                this.startGame('AGENTS');
            });
        } else {
            console.error('btn-agents-game not found');
        }

        const btnRules = document.getElementById('btn-rules');
        const btnRulesBack = document.getElementById('btn-rules-back');

        if (btnRules) {
            btnRules.addEventListener('click', () => {
                document.getElementById('rules-overlay').classList.remove('hidden');
            });
        }

        if (btnRulesBack) {
            btnRulesBack.addEventListener('click', () => {
                document.getElementById('rules-overlay').classList.add('hidden');
            });
        }

        document.getElementById('btn-restart').addEventListener('click', () => this.showMenu());
        document.getElementById('btn-return-menu').addEventListener('click', () => this.showMenu());
        document.getElementById('btn-play-again').addEventListener('click', () => {
            console.log('Play Again Button Clicked');
            this.startGame(this.mode);
        });

        this.canvas.addEventListener('mousedown', (e) => this.handleInput(e));

        const muteBtn = document.getElementById('btn-mute');
        muteBtn.addEventListener('click', () => {
            const isMuted = this.soundManager.toggleMute();
            muteBtn.innerText = isMuted ? '🔇' : '🔊';
        });
    }

    showMenu() {
        this.state = 'MENU';
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-log').classList.add('hidden');
        document.getElementById('slot-machine').classList.add('hidden');
        document.getElementById('slot-machine').classList.add('hidden');
        document.getElementById('slot-overlay').classList.add('hidden');
        document.body.classList.remove('p1-active-glow');
    }

    startGame(mode) {
        console.log('startGame called with mode:', mode);
        // Initialize Audio Context on user interaction
        this.soundManager.init();
        if (this.soundManager.ctx && this.soundManager.ctx.state === 'suspended') {
            this.soundManager.ctx.resume();
        }

        this.mode = mode;
        this.state = 'PLAYING';
        this.turnPhase = 'SLOT';

        // Update Player Types based on mode
        this.players = PLAYERS.map(p => ({
            ...p,
            type: (mode === 'USER' && p.id === 0) ? 'human' : 'bot',
            alive: true,
            queens: 2
        }));

        this.initBoard();

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-log').classList.remove('hidden');
        document.getElementById('slot-machine').classList.remove('hidden');
        document.getElementById('game-log').innerHTML = ''; // Clear log

        console.log('Calling startTurn from startGame');
        this.startTurn();
    }

    initBoard() {
        // Initialize 8x8 board
        this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.pieces = [];

        // Place Neutral Pawns
        this.addPiece(new Piece(-1, PIECE_TYPES.PAWN, 3, 3));
        this.addPiece(new Piece(-1, PIECE_TYPES.PAWN, 3, 4));
        this.addPiece(new Piece(-1, PIECE_TYPES.PAWN, 4, 3));
        this.addPiece(new Piece(-1, PIECE_TYPES.PAWN, 4, 4));

        // Helper to place set: Rook, Bishop, Queen, Queen, Bishop, Rook
        const setOrder = [PIECE_TYPES.ROOK, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN, PIECE_TYPES.QUEEN, PIECE_TYPES.BISHOP, PIECE_TYPES.ROOK];

        // P1 (Bottom)
        setOrder.forEach((type, i) => this.addPiece(new Piece(0, type, i + 1, 7)));

        // P3 (Top)
        setOrder.forEach((type, i) => this.addPiece(new Piece(2, type, i + 1, 0)));

        // P2 (Left)
        setOrder.forEach((type, i) => this.addPiece(new Piece(1, type, 0, i + 1)));

        // P4 (Right)
        setOrder.forEach((type, i) => this.addPiece(new Piece(3, type, 7, i + 1)));
    }

    addPiece(piece) {
        this.pieces.push(piece);
        this.board[piece.y][piece.x] = piece;
    }

    startTurn() {
        console.log('startTurn called');
        // Phase A: The Spin (2.0 Seconds)
        this.turnPhase = 'SLOT';
        this.selectedPiece = null;

        // Hide Board, Show Overlay
        this.canvas.style.display = 'none';
        const overlay = document.getElementById('slot-overlay');
        if (!overlay) console.error('slot-overlay not found!');
        overlay.classList.remove('hidden');
        console.log('Overlay shown');

        // Ensure game over elements are hidden
        document.getElementById('game-over-message').classList.add('hidden');
        document.getElementById('btn-return-menu').classList.add('hidden');
        document.getElementById('btn-play-again').classList.add('hidden');
        document.getElementById('slot-container').classList.remove('hidden');

        // Slot Elements
        const slotP1 = document.getElementById('slot-p1');
        const slotP2 = document.getElementById('slot-p2');
        const slotPiece = document.getElementById('slot-piece-type');

        let spinTime = 0;
        const spinDuration = 2000; // 2 seconds
        const spinInterval = 100; // 100ms

        const spinTimer = setInterval(() => {
            spinTime += spinInterval;

            // Randomize Visuals
            const pIndices = [0, 1, 2, 3].filter(i => this.players[i].alive);
            const r1 = pIndices[Math.floor(Math.random() * pIndices.length)];
            const r2 = pIndices[Math.floor(Math.random() * pIndices.length)];
            const types = [PIECE_TYPES.ROOK, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN];
            const rType = types[Math.floor(Math.random() * types.length)];

            slotP1.innerText = this.players[r1].name;
            slotP1.style.color = this.players[r1].color;
            slotP1.style.borderColor = this.players[r1].color;

            slotP2.innerText = this.players[r2].name;
            slotP2.style.color = this.players[r2].color;
            slotP2.style.borderColor = this.players[r2].color;

            slotPiece.innerText = rType;

            // Play Tick
            this.soundManager.playSlotTick();

            if (spinTime >= spinDuration) {
                clearInterval(spinTimer);
                this.finalizeSlotSelection(overlay);
            }
        }, spinInterval);
    }
    finalizeSlotSelection(overlay) {
        // Logic to pick actual players
        let pIndices = [0, 1, 2, 3].filter(i => this.players[i].alive);
        if (pIndices.length < 2) {
            this.showGameEndScreen(null);
            return;
        }

        // Shuffle and pick 2
        pIndices.sort(() => Math.random() - 0.5);
        this.activePlayers = [pIndices[0], pIndices[1]];

        // 1. Get all pieces belonging to the two active players
        const relevantPieces = this.pieces.filter(p => this.activePlayers.includes(p.playerId));

        // 2. Extract unique types from these pieces (e.g., if they only have Queens left, only pick Queen)
        const availableTypes = [...new Set(relevantPieces.map(p => p.type))];

        // 3. Pick from the available types
        if (availableTypes.length > 0) {
            this.activePieceType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        } else {
            // Fallback: Should not happen if players are alive, but prevents crash
            this.activePieceType = PIECE_TYPES.QUEEN;
        }

        // Update Overlay with Final Values
        const p1 = this.players[this.activePlayers[0]];
        const p2 = this.players[this.activePlayers[1]];

        const slotP1 = document.getElementById('slot-p1');
        const slotP2 = document.getElementById('slot-p2');
        const slotPiece = document.getElementById('slot-piece-type');

        slotP1.innerText = p1.name;
        slotP1.style.color = p1.color;
        slotP1.style.borderColor = p1.color;

        slotP2.innerText = p2.name;
        slotP2.style.color = p2.color;
        slotP2.style.borderColor = p2.color;

        slotPiece.innerText = this.activePieceType;

        // Update HUD for in-game reference
        console.log('Calling updateHUD');
        try {
            this.updateHUD();
        } catch (e) {
            console.error('Error in updateHUD:', e);
        }
        console.log('updateHUD finished');

        // Phase B: Reveal & Countdown
        setTimeout(() => {
            console.log('FinalizeSlotSelection: Hiding overlay, showing canvas');
            overlay.classList.add('hidden');
            this.canvas.style.display = 'block';

            // Ensure HUD is visible
            document.getElementById('hud').classList.remove('hidden');

            console.log('Canvas display style:', this.canvas.style.display);
            this.startCountdown();
        }, 500); // Short pause to see result
    }

    updateHUD() {
        if (!this.activePlayers || this.activePlayers.length < 2) return;
        const p1 = this.players[this.activePlayers[0]];
        const p2 = this.players[this.activePlayers[1]];
        const slotPlayers = document.getElementById('slot-players');
        if (!slotPlayers) {
            console.error('slot-players element not found!');
            return;
        }
        slotPlayers.innerHTML = `<span style="color:${p1.color}">${p1.name}</span> ⚔️ <span style="color:${p2.color}">${p2.name}</span>`;

        const slotPiece = document.getElementById('slot-piece');
        if (slotPiece) {
            let icon = '';
            switch (this.activePieceType) {
                case PIECE_TYPES.ROOK: icon = '♜'; break;
                case PIECE_TYPES.BISHOP: icon = '♝'; break;
                case PIECE_TYPES.QUEEN: icon = '♛'; break;
                default: icon = '';
            }
            slotPiece.innerText = `${icon} ${this.activePieceType}`;
        }
    }

    startCountdown() {
        console.log('Starting Countdown');
        this.turnPhase = 'COUNTDOWN';
        this.countdownValue = 5;
        this.pendingMoves = {};

        const overlay = document.getElementById('countdown-overlay');
        const text = document.getElementById('countdown-text');

        if (overlay) overlay.classList.remove('hidden');
        if (text) text.innerText = this.countdownValue;

        this.soundManager.playTick(); // Initial tick

        this.countdownTimer = setInterval(() => {
            this.countdownValue--;
            if (this.countdownValue > 0) {
                text.innerText = this.countdownValue;
                this.soundManager.playTick();
            } else {
                clearInterval(this.countdownTimer);
                overlay.classList.add('hidden');
                this.resolveTurn();
            }
        }, 1000);

        // Add Glow if P1 is active and Human
        if (this.mode === 'USER' && this.activePlayers.includes(0)) {
            document.body.classList.add('p1-active-glow');
        }

        // Trigger Bot Logic immediately
        this.activePlayers.forEach(pIndex => {
            if (this.players[pIndex].type === 'bot') {
                const move = this.getBotMove(pIndex, this.activePieceType);
                if (move) {
                    this.pendingMoves[pIndex] = move;
                }
            }
        });
    }

    handleInput(e) {
        if (this.state !== 'PLAYING' || this.turnPhase !== 'COUNTDOWN') return;

        // Only handle P1 input if P1 is active and human
        if (!this.activePlayers.includes(0) || this.players[0].type !== 'human') return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
        const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

        // Check if clicked on own piece
        const clickedPiece = this.board[y][x];
        if (clickedPiece && clickedPiece.playerId === 0 && clickedPiece.type === this.activePieceType) {
            this.selectedPiece = clickedPiece;
            // Clear any pending move if re-selecting
            delete this.pendingMoves[0];
            return;
        }

        // If piece selected, check if clicked on valid move
        if (this.selectedPiece) {
            const validMoves = this.getValidMoves(this.selectedPiece);
            const move = validMoves.find(m => m.x === x && m.y === y);

            if (move) {
                // Register Move
                this.pendingMoves[0] = {
                    piece: this.selectedPiece,
                    targetX: x,
                    targetY: y
                };
                this.selectedPiece = null; // Deselect after move
                console.log('P1 Move Registered:', this.pendingMoves[0]);
            } else {
                // Clicked invalid square, deselect
                this.selectedPiece = null;
            }
        }
    }

    // --- Movement Logic ---
    isValidPos(x, y) {
        // Check bounds
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false;
        // Check invalid corners
        if ((x === 0 && y === 0) || (x === 7 && y === 0) ||
            (x === 0 && y === 7) || (x === 7 && y === 7)) return false;
        return true;
    }

    getValidMoves(piece) {
        const moves = [];
        const directions = [];

        if (piece.type === PIECE_TYPES.ROOK || piece.type === PIECE_TYPES.QUEEN) {
            directions.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        }
        if (piece.type === PIECE_TYPES.BISHOP || piece.type === PIECE_TYPES.QUEEN) {
            directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        }

        for (const [dx, dy] of directions) {
            let x = piece.x + dx;
            let y = piece.y + dy;

            while (this.isValidPos(x, y)) {
                const targetPiece = this.board[y][x];

                if (!targetPiece) {
                    // Empty square, valid move
                    moves.push({ x, y });
                } else {
                    // Occupied
                    if (targetPiece.playerId !== piece.playerId) {
                        // Enemy or Neutral, capture valid
                        moves.push({ x, y, capture: targetPiece });
                    }
                    // Blocked by any piece (friend or foe), stop scanning this direction
                    break;
                }

                x += dx;
                y += dy;
            }
        }

        return moves;
    }

    // --- Bot Logic ---
    getPieceValue(type) {
        switch (type) {
            case PIECE_TYPES.QUEEN: return 50;
            case PIECE_TYPES.ROOK: return 10;
            case PIECE_TYPES.BISHOP: return 10;
            case PIECE_TYPES.PAWN: return 5;
            default: return 0;
        }
    }

    countQueens(playerId) {
        return this.pieces.filter(p => p.playerId === playerId && p.type === PIECE_TYPES.QUEEN).length;
    }

    isSquareThreatened(targetX, targetY, myPlayerId) {
        for (const piece of this.pieces) {
            if (piece.playerId === myPlayerId || piece.playerId === -1) continue; // Skip friends and neutral pawns

            // Simplified check: Get valid moves for this enemy
            // Note: This checks if the enemy *could* move there next turn.
            const moves = this.getValidMoves(piece);
            if (moves.some(m => m.x === targetX && m.y === targetY)) {
                return true;
            }
        }
        return false;
    }

    getBotMove(playerIndex, pieceType) {
        const playerPieces = this.pieces.filter(p => p.playerId === playerIndex && p.type === pieceType);
        if (playerPieces.length === 0) return null;

        let bestMove = null;
        let maxScore = -Infinity;

        const myQueens = this.countQueens(playerIndex);

        for (const piece of playerPieces) {
            const moves = this.getValidMoves(piece);
            const isCurrentlyThreatened = this.isSquareThreatened(piece.x, piece.y, playerIndex);

            for (const move of moves) {
                let score = 0;

                // 1. Capture Bonus
                if (move.capture) {
                    score += this.getPieceValue(move.capture.type) * 10;
                }

                // 2. Risk Penalty
                const isTargetThreatened = this.isSquareThreatened(move.x, move.y, playerIndex);
                if (isTargetThreatened) {
                    score -= this.getPieceValue(piece.type) * 10;
                }

                // 3. Last Queen Safety Lock
                if (piece.type === PIECE_TYPES.QUEEN && myQueens === 1 && isTargetThreatened) {
                    score -= 5000; // Forbid suicide
                }

                // 4. Danger Escape Bonus
                if (isCurrentlyThreatened && !isTargetThreatened) {
                    score += 50;
                }

                // 5. Center Bias (0-5 points)
                // Distance from center (3.5, 3.5)
                const dist = Math.abs(move.x - 3.5) + Math.abs(move.y - 3.5);
                score += (8 - dist) * 0.5;

                // 6. Randomness
                score += Math.random() * 2;

                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { piece, targetX: move.x, targetY: move.y };
                }
            }
        }

        return bestMove;
    }

    resolveTurn() {
        this.turnPhase = 'RESOLUTION';
        document.body.classList.remove('p1-active-glow');
        const moves = Object.values(this.pendingMoves);
        const log = document.getElementById('game-log');

        // 1. Move pieces to temp locations to check for collisions
        // We need to handle:
        // - Collision: Two pieces moving to same square -> Both destroyed
        // - Duel: Swap -> Both destroyed
        // - Capture: Land on occupied -> Victim destroyed (unless attacking back)

        const destMap = new Map(); // "x,y" -> [move1, move2]

        moves.forEach(move => {
            const key = `${move.targetX},${move.targetY}`;
            if (!destMap.has(key)) destMap.set(key, []);
            destMap.get(key).push(move);
        });

        const piecesToRemove = new Set();
        let captureHappened = false;

        // Check Collisions (Same Destination)
        destMap.forEach((moveList, key) => {
            if (moveList.length > 1) {
                // Collision! All pieces moving here are destroyed
                moveList.forEach(m => {
                    piecesToRemove.add(m.piece);
                    this.log(`Collision at ${key}! ${m.piece.type} destroyed.`);
                });
                captureHappened = true;
            }
        });

        // Check Duels (Swaps)
        // If A moves to B's pos, and B moves to A's pos.
        for (let i = 0; i < moves.length; i++) {
            for (let j = i + 1; j < moves.length; j++) {
                const m1 = moves[i];
                const m2 = moves[j];

                if (m1.targetX === m2.piece.x && m1.targetY === m2.piece.y &&
                    m2.targetX === m1.piece.x && m2.targetY === m1.piece.y) {
                    // Duel!
                    piecesToRemove.add(m1.piece);
                    piecesToRemove.add(m2.piece);
                    this.log(`Duel! ${m1.piece.type} and ${m2.piece.type} destroyed.`);
                    captureHappened = true;
                }
            }
        }

        // Execute Moves (if not destroyed)
        moves.forEach(move => {
            if (piecesToRemove.has(move.piece)) return; // Already dead

            // Check if landing on someone (who didn't move or moved elsewhere)
            // Note: If target moved, the square is empty (unless someone else moved there, handled by collision)
            // But we need to check the board state *before* updates?
            // Actually, simultaneous means we look at initial state for targets?
            // No, if target moves away, it's not captured.

            // Let's process valid moves.
            // Remove piece from old pos
            this.board[move.piece.y][move.piece.x] = null;
        });

        // Now place pieces in new pos, handling captures of stationary pieces
        moves.forEach(move => {
            if (piecesToRemove.has(move.piece)) {
                // Remove from board completely
                this.board[move.piece.y][move.piece.x] = null;
                return;
            }

            const target = this.board[move.targetY][move.targetX];

            // If target exists and is NOT one of the moving pieces (already cleared their old pos), it's a capture
            // Wait, if A moves to B, and B moves to C.
            // A clears old. B clears old.
            // A placed at B's old pos. B placed at C's old pos.
            // So A does NOT capture B. Correct.

            if (target) {
                // Capture!
                piecesToRemove.add(target);
                this.log(`${move.piece.type} captured ${target.type}!`);
                captureHappened = true;
            }

            move.piece.x = move.targetX;
            move.piece.y = move.targetY;
            this.board[move.targetY][move.targetX] = move.piece;
        });

        // Play Sounds
        if (captureHappened) {
            this.soundManager.playCapture();
        } else if (moves.length > 0) {
            this.soundManager.playMove();
        }

        // Remove dead pieces from array
        this.pieces = this.pieces.filter(p => !piecesToRemove.has(p));

        // Check Win Condition
        this.checkWinCondition();

        // Next Turn
        if (this.state === 'PLAYING') {
            setTimeout(() => this.startTurn(), 1000);
        }
    }

    log(msg) {
        const log = document.getElementById('game-log');
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerText = msg;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    checkWinCondition() {
        // Check for eliminated players (0 Queens)
        this.players.forEach(p => {
            if (!p.alive) return; // Already dead
            const queens = this.pieces.filter(piece => piece.playerId === p.id && piece.type === PIECE_TYPES.QUEEN);
            if (queens.length === 0) {
                p.alive = false;
                this.log(`${p.name} ELIMINATED!`);
                // Remove all their pieces
                this.pieces = this.pieces.filter(piece => piece.playerId !== p.id);
                // Rebuild board to clear removed pieces
                this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
                this.pieces.forEach(piece => this.board[piece.y][piece.x] = piece);
            }
        });

        const survivors = this.players.filter(p => p.alive && p.id !== -1); // Exclude neutral
        if (survivors.length <= 1) {
            this.showGameEndScreen(survivors.length === 1 ? survivors[0] : null);
        }
    }

    showGameEndScreen(winner) {
        this.state = 'GAMEOVER';

        // Hide Game UI
        this.canvas.style.display = 'none';
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('game-log').classList.add('hidden');
        document.getElementById('slot-machine').classList.add('hidden');

        // Show Overlay
        const overlay = document.getElementById('slot-overlay');
        overlay.classList.remove('hidden');

        // Hide Slot Elements
        document.getElementById('slot-container').classList.add('hidden');

        // Show Game Over Message
        const msgDiv = document.getElementById('game-over-message');
        msgDiv.classList.remove('hidden');

        if (winner) {
            msgDiv.innerText = `${winner.name} WINS!`;
            msgDiv.className = 'win-message';
        } else {
            msgDiv.innerText = 'DRAW!';
            msgDiv.className = 'draw-message';
        }

        // Show Main Menu Button
        document.getElementById('btn-return-menu').classList.remove('hidden');
        document.getElementById('btn-play-again').classList.remove('hidden');

        this.soundManager.playWin();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        // Animations, etc.
    }

    draw() {
        // Clear background
        this.ctx.fillStyle = '#0a0a12'; // --bg-color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Grid
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                // Checkerboard pattern
                if ((x + y) % 2 === 1) {
                    this.ctx.fillStyle = '#1a1a2e'; // --grid-color
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }

                // Draw Invalid Corners
                if ((x === 0 && y === 0) || (x === 7 && y === 0) ||
                    (x === 0 && y === 7) || (x === 7 && y === 7)) {
                    this.ctx.fillStyle = '#000'; // Void
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    // X mark
                    this.ctx.strokeStyle = '#333';
                    this.ctx.beginPath();
                    this.ctx.moveTo(x * TILE_SIZE, y * TILE_SIZE);
                    this.ctx.lineTo((x + 1) * TILE_SIZE, (y + 1) * TILE_SIZE);
                    this.ctx.moveTo((x + 1) * TILE_SIZE, y * TILE_SIZE);
                    this.ctx.lineTo(x * TILE_SIZE, (y + 1) * TILE_SIZE);
                    this.ctx.stroke();
                }
            }
        }

        // Highlight Valid Moves for Human
        if (this.selectedPiece && this.turnPhase === 'COUNTDOWN') {
            const moves = this.getValidMoves(this.selectedPiece);
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            moves.forEach(m => {
                this.ctx.fillRect(m.x * TILE_SIZE, m.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                // Highlight capture
                if (m.capture) {
                    this.ctx.strokeStyle = 'red';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(m.x * TILE_SIZE + 5, m.y * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
                }
            });
        }

        // Draw Pieces
        this.pieces.forEach(p => {
            this.drawPiece(p);
        });
    }

    drawPiece(piece) {
        const cx = piece.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = piece.y * TILE_SIZE + TILE_SIZE / 2;

        this.ctx.fillStyle = piece.playerId === -1 ? '#888' : PLAYERS[piece.playerId].color;
        this.ctx.beginPath();

        if (piece.type === PIECE_TYPES.PAWN) {
            this.ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        } else if (piece.type === PIECE_TYPES.ROOK) {
            this.ctx.fillRect(cx - 20, cy - 20, 40, 40);
        } else if (piece.type === PIECE_TYPES.BISHOP) {
            this.ctx.moveTo(cx, cy - 25);
            this.ctx.lineTo(cx + 20, cy + 20);
            this.ctx.lineTo(cx - 20, cy + 20);
            this.ctx.closePath();
        } else if (piece.type === PIECE_TYPES.QUEEN) {
            this.ctx.arc(cx, cy, 25, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        this.ctx.fill();

        // Label
        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(piece.type[0], cx, cy);
    }
}

class Piece {
    constructor(playerId, type, x, y) {
        this.playerId = playerId;
        this.type = type;
        this.x = x;
        this.y = y;
    }
}

// Start the game
window.onload = () => {
    const game = new Game();
};
