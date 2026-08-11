const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST"],
	}),
);

/*
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/

const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

/*
|--------------------------------------------------------------------------
| PORT
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 3001;

/*
|--------------------------------------------------------------------------
| GAME CONSTANTS
|--------------------------------------------------------------------------
*/

const SUITS = [
	{
		symbol: "♠",
		name: "Spades",
		color: "black",
	},
	{
		symbol: "♥",
		name: "Hearts",
		color: "red",
	},
	{
		symbol: "♦",
		name: "Diamonds",
		color: "red",
	},
	{
		symbol: "♣",
		name: "Clubs",
		color: "black",
	},
];

const RANKS = [
	{
		value: 1,
		label: "A",
	},
	{
		value: 2,
		label: "2",
	},
	{
		value: 3,
		label: "3",
	},
	{
		value: 4,
		label: "4",
	},
	{
		value: 5,
		label: "5",
	},
	{
		value: 6,
		label: "6",
	},
	{
		value: 7,
		label: "7",
	},
	{
		value: 8,
		label: "8",
	},
	{
		value: 9,
		label: "9",
	},
	{
		value: 10,
		label: "10",
	},
	{
		value: 11,
		label: "J",
	},
	{
		value: 12,
		label: "Q",
	},
	{
		value: 13,
		label: "K",
	},
];

/*
|--------------------------------------------------------------------------
| IN-MEMORY ROOMS
|--------------------------------------------------------------------------
|
| Rooms are intentionally stored only in memory.
|
*/

const rooms = new Map();

/*
|--------------------------------------------------------------------------
| ROOM CODE
|--------------------------------------------------------------------------
*/

function generateRoomCode() {
	let code;

	do {
		code = crypto
			.randomBytes(3)
			.toString("hex")
			.toUpperCase();
	} while (rooms.has(code));

	return code;
}

/*
|--------------------------------------------------------------------------
| CREATE DECK
|--------------------------------------------------------------------------
*/

function createDeck() {
	const cards = [];

	let id = 1;

	for (
		let suitIndex = 0;
		suitIndex < SUITS.length;
		suitIndex++
	) {
		const suit = SUITS[suitIndex];

		for (const rank of RANKS) {
			cards.push({
				id: id++,

				suit: suit.symbol,

				suitName: suit.name,

				suitIndex,

				rank: rank.label,

				rankValue: rank.value,
			});
		}
	}

	return cards;
}

/*
|--------------------------------------------------------------------------
| SHUFFLE
|--------------------------------------------------------------------------
*/

function shuffle(array) {
	const result = [...array];

	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));

		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}

/*
|--------------------------------------------------------------------------
| CARD VALUE
|--------------------------------------------------------------------------
|
| A = 1
| 2-9 = face value
| 10/J/Q/K = 10
|
*/

function cardValue(card) {
	if (!card) {
		return 0;
	}

	const value = Number(card.rankValue);

	if (!Number.isFinite(value)) {
		return 0;
	}

	if (value >= 10) {
		return 10;
	}

	return value;
}

/*
|--------------------------------------------------------------------------
| HAND VALUE
|--------------------------------------------------------------------------
*/

function handValue(hand) {
	if (!Array.isArray(hand)) {
		return 0;
	}

	return hand.reduce((total, card) => {
		return total + cardValue(card);
	}, 0);
}

/*
|--------------------------------------------------------------------------
| VALIDATE CARD
|--------------------------------------------------------------------------
*/

function isValidCard(card) {
	if (!card) {
		return false;
	}

	if (card.id === undefined || card.id === null) {
		return false;
	}

	if (!card.rank) {
		return false;
	}

	if (!card.suit) {
		return false;
	}

	const rankValue = Number(card.rankValue);

	if (!Number.isFinite(rankValue)) {
		return false;
	}

	return true;
}

/*
|--------------------------------------------------------------------------
| VALID SET
|--------------------------------------------------------------------------
|
| Example:
|
| 7♠ 7♥ 7♦
|
*/

function isValidSet(cards) {
	if (!Array.isArray(cards)) {
		return false;
	}

	if (cards.length < 3 || cards.length > 4) {
		return false;
	}

	if (!cards.every(isValidCard)) {
		return false;
	}

	const rank = Number(cards[0].rankValue);

	const suits = new Set(
		cards.map((card) => card.suit),
	);

	const sameRank = cards.every(
		(card) => Number(card.rankValue) === rank,
	);

	const differentSuits =
		suits.size === cards.length;

	return sameRank && differentSuits;
}

/*
|--------------------------------------------------------------------------
| VALID RUN
|--------------------------------------------------------------------------
|
| Example:
|
| 5♥ 6♥ 7♥
|
*/

function isValidRun(cards) {
	if (!Array.isArray(cards)) {
		return false;
	}

	if (cards.length < 3) {
		return false;
	}

	if (!cards.every(isValidCard)) {
		return false;
	}

	const suit = cards[0].suit;

	const sameSuit = cards.every(
		(card) => card.suit === suit,
	);

	if (!sameSuit) {
		return false;
	}

	const values = cards
		.map((card) => Number(card.rankValue))
		.sort((a, b) => a - b);

	const uniqueValues = [...new Set(values)];

	if (uniqueValues.length !== cards.length) {
		return false;
	}

	for (let i = 1; i < uniqueValues.length; i++) {
		if (
			uniqueValues[i] !==
			uniqueValues[i - 1] + 1
		) {
			return false;
		}
	}

	return true;
}

/*
|--------------------------------------------------------------------------
| VALID MELD
|--------------------------------------------------------------------------
*/

function isValidMeld(cards) {
	if (!Array.isArray(cards)) {
		return false;
	}

	if (cards.length < 3) {
		return false;
	}

	return isValidSet(cards) || isValidRun(cards);
}

/*
|--------------------------------------------------------------------------
| CHECK IF CARD CAN BE ADDED TO MELD
|--------------------------------------------------------------------------
*/

function canAddCardToMeld(card, meld) {
	if (!isValidCard(card)) {
		return false;
	}

	if (!Array.isArray(meld) || meld.length === 0) {
		return false;
	}

	/*
	|--------------------------------------------------------------------------
	| SET
	|--------------------------------------------------------------------------
	*/

	const isSet = meld.every(
		(existing) =>
			Number(existing.rankValue) ===
			Number(meld[0].rankValue),
	);

	if (isSet) {
		if (meld.length >= 4) {
			return false;
		}

		if (
			Number(card.rankValue) !==
			Number(meld[0].rankValue)
		) {
			return false;
		}

		const alreadyExists = meld.some(
			(existing) => existing.suit === card.suit,
		);

		return !alreadyExists;
	}

	/*
	|--------------------------------------------------------------------------
	| RUN
	|--------------------------------------------------------------------------
	*/

	const sameSuit = meld.every(
		(existing) => existing.suit === meld[0].suit,
	);

	if (!sameSuit) {
		return false;
	}

	if (card.suit !== meld[0].suit) {
		return false;
	}

	const values = meld
		.map((existing) => Number(existing.rankValue))
		.concat(Number(card.rankValue))
		.sort((a, b) => a - b);

	const uniqueValues = [...new Set(values)];

	if (uniqueValues.length !== values.length) {
		return false;
	}

	for (let i = 1; i < uniqueValues.length; i++) {
		if (
			uniqueValues[i] !==
			uniqueValues[i - 1] + 1
		) {
			return false;
		}
	}

	return true;
}

/*
|--------------------------------------------------------------------------
| REMOVE CARDS FROM HAND
|--------------------------------------------------------------------------
*/

function removeCards(hand, ids) {
	const idSet = new Set(
		Array.isArray(ids) ? ids : [],
	);

	return hand.filter(
		(card) => !idSet.has(card.id),
	);
}

/*
|--------------------------------------------------------------------------
| GET CURRENT PLAYER
|--------------------------------------------------------------------------
*/

function getCurrentPlayer(room) {
	if (!room || !Array.isArray(room.players)) {
		return null;
	}

	return (
		room.players[room.currentPlayerIndex] || null
	);
}

/*
|--------------------------------------------------------------------------
| GET PLAYER BY SOCKET
|--------------------------------------------------------------------------
*/

function getPlayer(room, socketId) {
	if (!room || !Array.isArray(room.players)) {
		return null;
	}

	return room.players.find(
		(player) => player.socketId === socketId,
	);
}

/*
|--------------------------------------------------------------------------
| NEXT PLAYER
|--------------------------------------------------------------------------
*/

function nextPlayer(room) {
	if (
		!room ||
		!Array.isArray(room.players) ||
		room.players.length === 0
	) {
		return;
	}

	room.currentPlayerIndex =
		(room.currentPlayerIndex + 1) %
		room.players.length;

	room.turnPhase = "draw";

	/*
	|--------------------------------------------------------------------------
	| Clear pending taken-discard state.
	|--------------------------------------------------------------------------
	*/

	room.lastTakenDiscardId = null;
}

/*
|--------------------------------------------------------------------------
| SERIALIZE ROOM
|--------------------------------------------------------------------------
*/

function serializeRoom(room) {
	const currentPlayer = getCurrentPlayer(room);

	return {
		roomCode: room.roomCode,

		status: room.status,

		turnPhase: room.turnPhase,

		currentPlayerIndex: room.currentPlayerIndex,

		currentPlayerId: currentPlayer?.id ?? null,

		deckCount: Array.isArray(room.deck)
			? room.deck.length
			: 0,

		/*
		|--------------------------------------------------------------------------
		| ALL DISCARDED CARDS ARE SENT
		|--------------------------------------------------------------------------
		*/

		discardPile: Array.isArray(room.discardPile)
			? room.discardPile
			: [],

		players: room.players.map((player) => ({
			id: player.id,

			name: player.name,

			socketId: player.socketId,

			hand: Array.isArray(player.hand)
				? player.hand
				: [],

			melds: Array.isArray(player.melds)
				? player.melds
				: [],

			/*
				|--------------------------------------------------------------------------
				| POINTS ARE ALWAYS NUMERIC
				|--------------------------------------------------------------------------
				*/

			points: handValue(player.hand),

			connected: player.connected,
		})),

		winner: room.winner,

		winReason: room.winReason,

		/*
		|--------------------------------------------------------------------------
		| IMPORTANT:
		| Frontend uses this to display UNDO.
		|--------------------------------------------------------------------------
		*/

		lastTakenDiscardId:
			room.lastTakenDiscardId ?? null,

		lastTakenDiscardPlayerId:
			room.lastTakenDiscardPlayerId ?? null,
	};
}

/*
|--------------------------------------------------------------------------
| BROADCAST GAME STATE
|--------------------------------------------------------------------------
*/

function broadcastRoom(room) {
	if (!room) {
		return;
	}

	io
		.to(room.roomCode)
		.emit("game:state", serializeRoom(room));
}

/*
|--------------------------------------------------------------------------
| SEND ERROR
|--------------------------------------------------------------------------
*/

function sendError(socket, message) {
	socket.emit("game:error", {
		message,
	});
}

/*
|--------------------------------------------------------------------------
| START ONLINE GAME
|--------------------------------------------------------------------------
*/

function startOnlineGame(room) {
	room.deck = shuffle(createDeck());

	room.discardPile = [];

	room.status = "playing";

	/*
	|--------------------------------------------------------------------------
	| The randomized first player receives
	| 13 cards and must discard first.
	|--------------------------------------------------------------------------
	*/

	room.turnPhase = "discard";

	room.winner = null;

	room.winReason = "";

	room.lastTakenDiscardId = null;

	/*
	|--------------------------------------------------------------------------
	| Reset players
	|--------------------------------------------------------------------------
	*/

	room.players.forEach((player) => {
		player.hand = [];
		player.melds = [];
	});

	/*
	|--------------------------------------------------------------------------
	| RANDOM FIRST PLAYER
	|--------------------------------------------------------------------------
	*/

	room.currentPlayerIndex = Math.floor(
		Math.random() * room.players.length,
	);

	/*
	|--------------------------------------------------------------------------
	| DEAL 12 CARDS EACH
	|--------------------------------------------------------------------------
	*/

	for (let round = 0; round < 12; round++) {
		for (let i = 0; i < room.players.length; i++) {
			const card = room.deck.pop();

			if (card) {
				room.players[i].hand.push(card);
			}
		}
	}

	/*
	|--------------------------------------------------------------------------
	| FIRST PLAYER GETS 13TH CARD
	|--------------------------------------------------------------------------
	*/

	const starter =
		room.players[room.currentPlayerIndex];

	const extraCard = room.deck.pop();

	if (extraCard) {
		starter.hand.push(extraCard);
	}

	broadcastRoom(room);

	io.to(room.roomCode).emit("game:message", {
		type: "success",

		text:
			`🎲 ${starter.name} ` +
			`starts and must discard first.`,
	});
}

/*
|--------------------------------------------------------------------------
| FINISH GAME
|--------------------------------------------------------------------------
*/

function finishGame(
	room,
	player,
	reason = "Tong-its",
) {
	room.status = "finished";

	room.winner = {
		id: player.id,
		name: player.name,
	};

	room.winReason =
		`${player.name} successfully ` +
		`got rid of all cards.`;

	broadcastRoom(room);

	io.to(room.roomCode).emit("game:message", {
		type: "success",

		text:
			reason === "Tong-its"
				? `🏆 ${player.name} wins by Tong-its!`
				: `${player.name} wins!`,
	});
}

/*
|--------------------------------------------------------------------------
| SOCKET CONNECTION
|--------------------------------------------------------------------------
*/

io.on("connection", (socket) => {
	console.log("Connected:", socket.id);

	/*
	|--------------------------------------------------------------------------
	| CREATE ROOM
	|--------------------------------------------------------------------------
	*/

	socket.on("room:create", (payload = {}) => {
		let { playerName } = payload;

		playerName = String(playerName || "").trim();

		if (!playerName) {
			sendError(socket, "Player name is required.");

			return;
		}

		const roomCode = generateRoomCode();

		const room = {
			roomCode,

			status: "waiting",

			deck: [],

			discardPile: [],

			players: [
				{
					id: 1,

					socketId: socket.id,

					name: playerName,

					hand: [],

					melds: [],

					connected: true,
				},
			],

			currentPlayerIndex: 0,

			turnPhase: "waiting",

			winner: null,

			winReason: "",
			lastTakenDiscardId: null,
			lastTakenDiscardPlayerId: null,
		};

		rooms.set(roomCode, room);

		socket.join(roomCode);

		socket.data.roomCode = roomCode;

		socket.data.playerId = 1;

		socket.emit("room:created", {
			roomCode,

			playerId: 1,
		});

		broadcastRoom(room);

		console.log(
			`Room ${roomCode} ` +
				`created by ${playerName}`,
		);
	});

	/*
	|--------------------------------------------------------------------------
	| JOIN ROOM
	|--------------------------------------------------------------------------
	*/

	socket.on("room:join", (payload = {}) => {
		let { roomCode, playerName } = payload;

		roomCode = String(roomCode || "")
			.trim()
			.toUpperCase();

		playerName = String(playerName || "").trim();

		if (!playerName) {
			sendError(socket, "Player name is required.");

			return;
		}

		if (!roomCode) {
			sendError(socket, "Room code is required.");

			return;
		}

		const room = rooms.get(roomCode);

		if (!room) {
			sendError(socket, "Room not found.");

			return;
		}

		if (room.players.length >= 2) {
			sendError(
				socket,
				"This room is already full.",
			);

			return;
		}

		if (room.status !== "waiting") {
			sendError(
				socket,
				"This game has already started.",
			);

			return;
		}

		const player = {
			id: 2,

			socketId: socket.id,

			name: playerName,

			hand: [],

			melds: [],

			connected: true,
		};

		room.players.push(player);

		socket.join(roomCode);

		socket.data.roomCode = roomCode;

		socket.data.playerId = 2;

		socket.emit("room:joined", {
			roomCode,

			playerId: 2,
		});

		io.to(roomCode).emit("game:message", {
			type: "success",

			text: `${playerName} ` + `joined the game.`,
		});

		/*
			|--------------------------------------------------------------------------
			| Start once second player joins.
			|--------------------------------------------------------------------------
			*/

		startOnlineGame(room);

		console.log(
			`${playerName} joined ` + `room ${roomCode}`,
		);
	});

	/*
	|--------------------------------------------------------------------------
	| DRAW FROM DECK
	|--------------------------------------------------------------------------
	*/

	socket.on("game:draw-deck", () => {
		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (
			room.status !== "playing" ||
			room.turnPhase !== "draw"
		) {
			return;
		}

		if (
			!Array.isArray(room.deck) ||
			room.deck.length === 0
		) {
			sendError(socket, "The draw pile is empty.");

			return;
		}

		const card = room.deck.pop();

		if (!isValidCard(card)) {
			if (card) {
				room.deck.push(card);
			}

			sendError(
				socket,
				"Invalid card drawn from the deck.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Add the ACTUAL card object.
			| This prevents empty-card / NaN problems.
			|--------------------------------------------------------------------------
			*/

		player.hand.push(card);

		room.turnPhase = "discard";

		room.lastTakenDiscardId = null;

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",

			text: `${player.name} ` + `drew a card.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| DRAW FROM DISCARD
	|--------------------------------------------------------------------------
	|
	| IMPORTANT:
	| This must happen during the DRAW phase.
	|
	*/

	socket.on("game:draw-discard", () => {
		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (
			room.status !== "playing" ||
			room.turnPhase !== "draw"
		) {
			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Cannot take another discard
			| while one is already pending.
			|--------------------------------------------------------------------------
			*/

		if (room.lastTakenDiscardId !== null) {
			sendError(
				socket,
				"You already took a discard. Meld it or undo the take first.",
			);

			return;
		}

		if (
			!Array.isArray(room.discardPile) ||
			room.discardPile.length === 0
		) {
			sendError(
				socket,
				"There is no discarded card to take.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| ALWAYS TAKE THE TOP CARD
			|--------------------------------------------------------------------------
			*/

		const card =
			room.discardPile[room.discardPile.length - 1];

		if (!isValidCard(card)) {
			sendError(
				socket,
				"The discarded card is invalid.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Check whether the card can
			| be added to an existing meld.
			|--------------------------------------------------------------------------
			*/

		let canTake = false;

		for (const meld of player.melds) {
			if (canAddCardToMeld(card, meld)) {
				canTake = true;

				break;
			}
		}

		/*
			|--------------------------------------------------------------------------
			| Check whether the card can
			| form a new meld using two
			| cards from the player's hand.
			|--------------------------------------------------------------------------
			*/

		if (!canTake) {
			for (let i = 0; i < player.hand.length; i++) {
				for (
					let j = i + 1;
					j < player.hand.length;
					j++
				) {
					const candidate = [
						card,
						player.hand[i],
						player.hand[j],
					];

					if (isValidMeld(candidate)) {
						canTake = true;

						break;
					}
				}

				if (canTake) {
					break;
				}
			}
		}

		if (!canTake) {
			sendError(
				socket,
				"You can only take the discard if you can use it in a meld.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Remove the actual card from
			| the discard pile.
			|--------------------------------------------------------------------------
			*/

		room.discardPile.pop();

		/*
			|--------------------------------------------------------------------------
			| Add exact card to player's hand.
			|--------------------------------------------------------------------------
			*/

		player.hand.push(card);

		/*
			|--------------------------------------------------------------------------
			| IMPORTANT:
			| Remember which card was taken.
			|
			| Frontend uses this value to
			| show the UNDO button.
			|--------------------------------------------------------------------------
			*/

		room.lastTakenDiscardId = card.id;
		room.lastTakenDiscardPlayerId = player.id;

		room.turnPhase = "discard";

		/*
			|--------------------------------------------------------------------------
			| Player remains in discard phase.
			|
			| They must either:
			|
			| 1. Meld the taken card
			| 2. Undo the take
			|--------------------------------------------------------------------------
			*/

		room.turnPhase = "discard";

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",

			text:
				`${player.name} ` +
				`took the discarded card.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| UNDO TAKEN DISCARD
	|--------------------------------------------------------------------------
	|
	| This is the important fix.
	|
	| Player can return the exact card they
	| just took from the discard pile.
	|
	*/

	socket.on("game:undo-discard", () => {
		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			sendError(socket, "Room not found.");
			return;
		}

		const player = room.players.find(
			(p) => p.socketId === socket.id,
		);

		if (!player) {
			sendError(socket, "Player not found.");
			return;
		}

		// Only the player who took the discard can undo it.
		if (
			room.lastTakenDiscardPlayerId !== player.id
		) {
			sendError(
				socket,
				"You do not have a taken discarded card to undo.",
			);
			return;
		}

		if (room.status !== "playing") {
			sendError(
				socket,
				"The game is not currently playing.",
			);
			return;
		}

		if (room.turnPhase !== "discard") {
			sendError(
				socket,
				"UNDO is only available after taking a discarded card.",
			);
			return;
		}

		if (room.lastTakenDiscardId === null) {
			sendError(
				socket,
				"There is no discarded card to undo.",
			);
			return;
		}

		// Find the exact card in this player's hand.
		const index = player.hand.findIndex(
			(card) =>
				card && card.id === room.lastTakenDiscardId,
		);

		if (index === -1) {
			sendError(
				socket,
				"The taken discarded card could not be found in your hand.",
			);
			return;
		}

		// Remove it from the player's hand.
		const [takenCard] = player.hand.splice(
			index,
			1,
		);

		if (!takenCard) {
			sendError(
				socket,
				"Unable to return the taken discarded card.",
			);
			return;
		}

		// Return the EXACT same card to the discard pile.
		room.discardPile.push(takenCard);

		// Clear pending UNDO state.
		room.lastTakenDiscardId = null;
		room.lastTakenDiscardPlayerId = null;

		// Player can draw again.
		room.turnPhase = "draw";

		// Clear any selected card state if your room uses it.
		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",
			text: `${player.name} returned the taken discard.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| CREATE MELD
	|--------------------------------------------------------------------------
	*/

	socket.on("game:create-meld", (payload = {}) => {
		const { cardIds } = payload;

		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (
			room.status !== "playing" ||
			room.turnPhase !== "discard"
		) {
			return;
		}

		if (
			!Array.isArray(cardIds) ||
			cardIds.length < 3
		) {
			sendError(
				socket,
				"A meld requires at least 3 cards.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Prevent duplicate card IDs.
			|--------------------------------------------------------------------------
			*/

		const uniqueIds = [...new Set(cardIds)];

		if (uniqueIds.length !== cardIds.length) {
			sendError(
				socket,
				"Duplicate cards were selected.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Find selected cards in hand.
			|--------------------------------------------------------------------------
			*/

		const cards = player.hand.filter((card) =>
			cardIds.includes(card.id),
		);

		if (cards.length !== cardIds.length) {
			sendError(
				socket,
				"One or more selected cards are not in your hand.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Validate meld.
			|--------------------------------------------------------------------------
			*/

		if (!isValidMeld(cards)) {
			sendError(
				socket,
				"Selected cards do not form a valid meld.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Remove cards from hand.
			|--------------------------------------------------------------------------
			*/

		player.hand = removeCards(player.hand, cardIds);

		/*
			|--------------------------------------------------------------------------
			| Add meld.
			|--------------------------------------------------------------------------
			*/

		player.melds.push(cards);

		/*
			|--------------------------------------------------------------------------
			| If the meld contains the
			| taken discard, clear the
			| pending UNDO state.
			|--------------------------------------------------------------------------
			*/

		if (
			room.lastTakenDiscardId !== null &&
			cardIds.includes(room.lastTakenDiscardId)
		) {
			room.lastTakenDiscardId = null;
			room.lastTakenDiscardPlayerId = null;
		}

		/*
			|--------------------------------------------------------------------------
			| Tong-its
			|--------------------------------------------------------------------------
			*/

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		broadcastRoom(room);
	});

	/*
	|--------------------------------------------------------------------------
	| ADD CARD TO EXISTING MELD
	|--------------------------------------------------------------------------
	*/

	socket.on("game:add-to-meld", (payload = {}) => {
		const { cardId, targetPlayerId, meldIndex } =
			payload;

		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (
			room.status !== "playing" ||
			room.turnPhase !== "discard"
		) {
			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Find card in current player's hand.
			|--------------------------------------------------------------------------
			*/

		const card = player.hand.find(
			(item) => item.id === cardId,
		);

		if (!card) {
			sendError(
				socket,
				"Card not found in your hand.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Find target player.
			|--------------------------------------------------------------------------
			*/

		const targetPlayer = room.players.find(
			(item) => item.id === targetPlayerId,
		);

		if (!targetPlayer) {
			sendError(socket, "Target player not found.");

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Find target meld.
			|--------------------------------------------------------------------------
			*/

		const meld = targetPlayer.melds?.[meldIndex];

		if (!meld) {
			sendError(socket, "Meld not found.");

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Validate card.
			|--------------------------------------------------------------------------
			*/

		if (!canAddCardToMeld(card, meld)) {
			sendError(
				socket,
				"That card cannot be added to this meld.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Add card.
			|--------------------------------------------------------------------------
			*/

		meld.push(card);

		/*
			|--------------------------------------------------------------------------
			| Remove from player's hand.
			|--------------------------------------------------------------------------
			*/

		player.hand = removeCards(player.hand, [
			cardId,
		]);

		/*
			|--------------------------------------------------------------------------
			| If this was the taken discard,
			| clear UNDO.
			|--------------------------------------------------------------------------
			*/

		if (room.lastTakenDiscardId === cardId) {
			room.lastTakenDiscardId = null;
			room.lastTakenDiscardPlayerId = null;
		}
		/*
			|--------------------------------------------------------------------------
			| Tong-its
			|--------------------------------------------------------------------------
			*/

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		broadcastRoom(room);
	});

	/*
	|--------------------------------------------------------------------------
	| DISCARD CARD
	|--------------------------------------------------------------------------
	*/

	socket.on("game:discard", (payload = {}) => {
		const { cardId } = payload;

		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (
			room.status !== "playing" ||
			room.turnPhase !== "discard"
		) {
			return;
		}

		/*
			|--------------------------------------------------------------------------
			| If player took a discard,
			| they must either:
			|
			| 1. Meld it
			| 2. Undo it
			|
			| They cannot discard it.
			|--------------------------------------------------------------------------
			*/

		if (room.lastTakenDiscardId !== null) {
			sendError(
				socket,
				"You must meld the taken discard or undo the take before discarding.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Find card.
			|--------------------------------------------------------------------------
			*/

		const card = player.hand.find(
			(item) => item.id === cardId,
		);

		if (!card) {
			sendError(
				socket,
				"That card is not in your hand.",
			);

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Remove from hand.
			|--------------------------------------------------------------------------
			*/

		player.hand = removeCards(player.hand, [
			cardId,
		]);

		/*
			|--------------------------------------------------------------------------
			| Add to discard pile.
			|--------------------------------------------------------------------------
			*/

		room.discardPile.push(card);

		/*
			|--------------------------------------------------------------------------
			| Tong-its.
			|--------------------------------------------------------------------------
			*/

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Move to next player.
			|--------------------------------------------------------------------------
			*/

		nextPlayer(room);

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",

			text:
				`${player.name} ` +
				`discarded ` +
				`${card.rank}${card.suit}.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| DISCONNECT
	|--------------------------------------------------------------------------
	*/

	socket.on("disconnect", () => {
		console.log("Disconnected:", socket.id);

		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getPlayer(room, socket.id);

		if (player) {
			player.connected = false;
		}

		io
			.to(room.roomCode)
			.emit("player:disconnected", {
				playerId: player?.id,

				playerName: player?.name,
			});

		broadcastRoom(room);

		/*
			|--------------------------------------------------------------------------
			| Remove waiting room if creator
			| disconnects before second
			| player joins.
			|--------------------------------------------------------------------------
			*/

		if (
			room.status === "waiting" &&
			room.players.length === 1
		) {
			rooms.delete(room.roomCode);

			console.log(`Room ${room.roomCode} removed.`);
		}
	});
});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
	res.json({
		status: "online",

		service: "Tong-its Socket.IO Server",

		rooms: rooms.size,

		timestamp: new Date().toISOString(),
	});
});

/*
|--------------------------------------------------------------------------
| OPTIONAL HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
	res.json({
		ok: true,

		service: "Tong-its Socket.IO Server",

		rooms: rooms.size,
	});
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

server.listen(PORT, "0.0.0.0", () => {
	console.log(
		`Tong-its server running on port ${PORT}`,
	);
});
