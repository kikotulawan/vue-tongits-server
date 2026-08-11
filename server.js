const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST"],
	}),
);

const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

const PORT = process.env.PORT || 3001;

/*
|--------------------------------------------------------------------------
| GAME CONSTANTS
|--------------------------------------------------------------------------
*/

const SUITS = [
	{ symbol: "♠", name: "Spades", color: "black" },
	{ symbol: "♥", name: "Hearts", color: "red" },
	{ symbol: "♦", name: "Diamonds", color: "red" },
	{ symbol: "♣", name: "Clubs", color: "black" },
];

const RANKS = [
	{ value: 1, label: "A" },
	{ value: 2, label: "2" },
	{ value: 3, label: "3" },
	{ value: 4, label: "4" },
	{ value: 5, label: "5" },
	{ value: 6, label: "6" },
	{ value: 7, label: "7" },
	{ value: 8, label: "8" },
	{ value: 9, label: "9" },
	{ value: 10, label: "10" },
	{ value: 11, label: "J" },
	{ value: 12, label: "Q" },
	{ value: 13, label: "K" },
];

/*
|--------------------------------------------------------------------------
| IN-MEMORY ROOMS
|--------------------------------------------------------------------------
*/

const rooms = new Map();

/*
|--------------------------------------------------------------------------
| HELPERS
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

function createDeck() {
	const cards = [];
	let id = 1;

	SUITS.forEach((suit, suitIndex) => {
		RANKS.forEach((rank) => {
			cards.push({
				id: id++,
				suit: suit.symbol,
				suitName: suit.name,
				suitIndex,
				rank: rank.label,
				rankValue: rank.value,
			});
		});
	});

	return cards;
}

function shuffle(array) {
	const result = [...array];

	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));

		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}

function cardValue(card) {
	if (!card) {
		return 0;
	}

	const value = Number(card.rankValue);

	if (!Number.isFinite(value)) {
		return 0;
	}

	return value >= 10 ? 10 : value;
}

function handValue(hand) {
	if (!Array.isArray(hand)) {
		return 0;
	}

	return hand.reduce(
		(total, card) => total + cardValue(card),
		0,
	);
}

function isValidCard(card) {
	if (!card) {
		return false;
	}

	if (card.id == null) {
		return false;
	}

	if (!card.rank) {
		return false;
	}

	if (!card.suit) {
		return false;
	}

	const rankValue = Number(card.rankValue);

	return Number.isFinite(rankValue);
}

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

	const rank = cards[0].rankValue;

	const suits = new Set(
		cards.map((card) => card.suit),
	);

	return (
		cards.every(
			(card) => card.rankValue === rank,
		) && suits.size === cards.length
	);
}

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

	if (!cards.every((card) => card.suit === suit)) {
		return false;
	}

	const values = cards
		.map((card) => Number(card.rankValue))
		.sort((a, b) => a - b);

	const unique = [...new Set(values)];

	if (unique.length !== cards.length) {
		return false;
	}

	for (let i = 1; i < unique.length; i++) {
		if (unique[i] !== unique[i - 1] + 1) {
			return false;
		}
	}

	return true;
}

function isValidMeld(cards) {
	if (!Array.isArray(cards)) {
		return false;
	}

	if (cards.length < 3) {
		return false;
	}

	return isValidSet(cards) || isValidRun(cards);
}

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

	if (
		meld.length < 4 &&
		meld.every(
			(existing) =>
				existing.rankValue === meld[0].rankValue,
		) &&
		card.rankValue === meld[0].rankValue
	) {
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

	if (
		meld.every(
			(existing) => existing.suit === meld[0].suit,
		) &&
		card.suit === meld[0].suit
	) {
		const values = meld
			.map((existing) => Number(existing.rankValue))
			.concat(Number(card.rankValue))
			.sort((a, b) => a - b);

		const unique = [...new Set(values)];

		if (unique.length !== values.length) {
			return false;
		}

		for (let i = 1; i < unique.length; i++) {
			if (unique[i] !== unique[i - 1] + 1) {
				return false;
			}
		}

		return true;
	}

	return false;
}

function removeCards(hand, ids) {
	const idSet = new Set(
		Array.isArray(ids) ? ids : [],
	);

	return hand.filter(
		(card) => !idSet.has(card.id),
	);
}

function getCurrentPlayer(room) {
	if (!room || !Array.isArray(room.players)) {
		return null;
	}

	return (
		room.players[room.currentPlayerIndex] || null
	);
}

function getPlayer(room, socketId) {
	if (!room || !Array.isArray(room.players)) {
		return null;
	}

	return room.players.find(
		(player) => player.socketId === socketId,
	);
}

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

	room.lastTakenDiscardId = null;
}

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

			points: handValue(player.hand),

			connected: player.connected,
		})),

		winner: room.winner,
		winReason: room.winReason,

		lastTakenDiscardId:
			room.lastTakenDiscardId ?? null,
	};
}

function broadcastRoom(room) {
	if (!room) {
		return;
	}

	io
		.to(room.roomCode)
		.emit("game:state", serializeRoom(room));
}

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

	room.turnPhase = "discard";

	room.winner = null;

	room.winReason = "";

	room.lastTakenDiscardId = null;

	room.players.forEach((player) => {
		player.hand = [];
		player.melds = [];
	});

	/*
	|--------------------------------------------------------------------------
	| Randomize first player
	|--------------------------------------------------------------------------
	*/

	room.currentPlayerIndex = Math.floor(
		Math.random() * room.players.length,
	);

	/*
	|--------------------------------------------------------------------------
	| Deal 12 cards to each player
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
	| First player gets the 13th card
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
			`Room ${roomCode} created by ${playerName}`,
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
			text: `${playerName} joined the game.`,
		});

		startOnlineGame(room);

		console.log(
			`${playerName} joined room ${roomCode}`,
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

		/*
			|--------------------------------------------------------------------------
			| Never allow an invalid card
			|--------------------------------------------------------------------------
			*/

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

		player.hand.push(card);

		room.turnPhase = "discard";

		room.lastTakenDiscardId = null;

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",
			text: `${player.name} drew a card.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| DRAW FROM DISCARD
	|--------------------------------------------------------------------------
	|
	| IMPORTANT FIX:
	| This action happens during the DRAW phase.
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

		/*
			|--------------------------------------------------------------------------
			| CORRECT CHECK
			|--------------------------------------------------------------------------
			|
			| The old backend checked:
			|
			| turnPhase !== "discard"
			| AND
			| turnPhase !== "draw"
			|
			| which made the operation impossible.
			|
			*/

		if (
			room.status !== "playing" ||
			room.turnPhase !== "draw"
		) {
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
			| The discard can only be taken
			| when it can immediately participate
			| in a meld.
			|--------------------------------------------------------------------------
			*/

		let canTake = false;

		/*
			|--------------------------------------------------------------------------
			| Check existing melds
			|--------------------------------------------------------------------------
			*/

		for (const meld of player.melds) {
			if (canAddCardToMeld(card, meld)) {
				canTake = true;
				break;
			}
		}

		/*
			|--------------------------------------------------------------------------
			| Check whether the card can form
			| a new meld with two cards in hand.
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
			| Remove from discard pile
			|--------------------------------------------------------------------------
			*/

		room.discardPile.pop();

		/*
			|--------------------------------------------------------------------------
			| Add the actual card object to
			| the server-side player's hand.
			|--------------------------------------------------------------------------
			*/

		player.hand.push(card);

		room.lastTakenDiscardId = card.id;

		/*
			|--------------------------------------------------------------------------
			| Player must now meld before discarding.
			|--------------------------------------------------------------------------
			*/

		room.turnPhase = "discard";

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",
			text: `${player.name} took the discarded card.`,
		});
	});

	/*
	|--------------------------------------------------------------------------
	| UNDO DISCARD TAKE
	|--------------------------------------------------------------------------
	*/

	socket.on("game:undo-discard", () => {
		const room = rooms.get(socket.data.roomCode);

		if (!room) {
			return;
		}

		const player = getCurrentPlayer(room);

		if (!player || player.socketId !== socket.id) {
			return;
		}

		if (room.lastTakenDiscardId === null) {
			return;
		}

		const index = player.hand.findIndex(
			(card) => card.id === room.lastTakenDiscardId,
		);

		if (index === -1) {
			return;
		}

		const [card] = player.hand.splice(index, 1);

		room.discardPile.push(card);

		room.lastTakenDiscardId = null;

		room.turnPhase = "draw";

		broadcastRoom(room);
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
			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Prevent duplicate IDs
			|--------------------------------------------------------------------------
			*/

		const uniqueIds = [...new Set(cardIds)];

		if (uniqueIds.length !== cardIds.length) {
			return;
		}

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

		if (!isValidMeld(cards)) {
			sendError(
				socket,
				"Selected cards do not form a valid meld.",
			);

			return;
		}

		player.hand = removeCards(player.hand, cardIds);

		player.melds.push(cards);

		/*
			|--------------------------------------------------------------------------
			| If the player melded the discard
			| they took, they can now discard.
			|--------------------------------------------------------------------------
			*/

		if (
			room.lastTakenDiscardId !== null &&
			cardIds.includes(room.lastTakenDiscardId)
		) {
			room.lastTakenDiscardId = null;
		}

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		broadcastRoom(room);
	});

	/*
	|--------------------------------------------------------------------------
	| ADD CARD TO MELD
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

		const card = player.hand.find(
			(item) => item.id === cardId,
		);

		if (!card) {
			return;
		}

		const targetPlayer = room.players.find(
			(item) => item.id === targetPlayerId,
		);

		if (!targetPlayer) {
			return;
		}

		const meld = targetPlayer.melds?.[meldIndex];

		if (!meld) {
			return;
		}

		if (!canAddCardToMeld(card, meld)) {
			sendError(
				socket,
				"That card cannot be added to this meld.",
			);

			return;
		}

		meld.push(card);

		player.hand = removeCards(player.hand, [
			cardId,
		]);

		if (room.lastTakenDiscardId === cardId) {
			room.lastTakenDiscardId = null;
		}

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		broadcastRoom(room);
	});

	/*
	|--------------------------------------------------------------------------
	| DISCARD
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
			| A player who took the discard
			| must meld it first.
			|--------------------------------------------------------------------------
			*/

		if (room.lastTakenDiscardId !== null) {
			sendError(
				socket,
				"You must meld the taken discard before discarding.",
			);

			return;
		}

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

		player.hand = removeCards(player.hand, [
			cardId,
		]);

		room.discardPile.push(card);

		if (player.hand.length === 0) {
			finishGame(room, player, "Tong-its");

			return;
		}

		/*
			|--------------------------------------------------------------------------
			| Advance to next player.
			|--------------------------------------------------------------------------
			*/

		nextPlayer(room);

		broadcastRoom(room);

		io.to(room.roomCode).emit("game:message", {
			type: "info",
			text: `${player.name} discarded ${card.rank}${card.suit}.`,
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
			| Remove waiting room when creator leaves
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
| FINISH GAME
|--------------------------------------------------------------------------
*/

function finishGame(room, player, reason) {
	room.status = "finished";

	room.winner = {
		id: player.id,
		name: player.name,
	};

	room.winReason = `${player.name} successfully got rid of all cards.`;

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
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
	res.json({
		status: "online",
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
