// Deck-Persistenz — env-fähige Repository-Abstraktion mit File- bzw. Memory-Backend.
//
// ARCHITEKTUR-ENTSCHEIDUNG (C1a): Ohne echte Railway-Env (kein DATABASE_URL, keine
// Bucket-Creds) wird KEINE Fake-Cloud gebaut. Stattdessen eine schlanke Abstraktion,
// die das spätere Postgres-/Bucket-Backend ohne Call-Site-Änderung anflanschen lässt:
//
//   getDeckRepo() wählt das Backend per ENV:
//     EB_DECK_STORE=memory   → flüchtig (Tests, CI, Wegwerf)
//     EB_DECK_STORE=file     → JSON-Dateien unter EB_DATA_DIR (Default, persistiert lokal)
//     EB_DECK_STORE=postgres → ANSCHLUSSSTELLE (noch nicht implementiert, s. unten)
//   Default ohne ENV: file (überlebt lokale Restarts → Demo wird ein nutzbares Tool),
//   mit hartem Fallback auf Memory, falls das Verzeichnis nicht beschreibbar ist.
//
// Type-only $lib-Import → diese Datei ist zur Laufzeit alias-frei und im bun-Skript ladbar.
import type { Deck, DeckVisibility, Slide } from '$lib/decks';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { nanoid } from 'nanoid';
import { Pool } from 'pg';
import { isProductionRuntime } from '$lib/server/auth';

export type DeckInput = { title: string; source: string; slides: Slide[] };
export type DeckSharingInput = { visibility: DeckVisibility; teamId?: string | null };

export interface DeckRepository {
	create(input: DeckInput, ownerId: string | null): Promise<Deck>;
	get(id: string): Promise<Deck | null>;
	/** Aktualisiert title/source/slides; ownerId wird ggf. geclaimt. claimerId null aktualisiert nur unowned Decks ohne Claim. */
	update(id: string, input: DeckInput, claimerId: string | null): Promise<Deck | null>;
	delete(id: string): Promise<boolean>;
	listByOwner(ownerId: string): Promise<Deck[]>;
	listByTeam(teamId: string, excludeOwnerId?: string | null): Promise<Deck[]>;
	setSharing(id: string, input: DeckSharingInput, ownerId: string): Promise<Deck | null>;
	claimOwner(fromOwnerId: string, toOwnerId: string): Promise<number>;
	/** Setzt den Owner eines unowned Decks atomar. null, wenn das Deck fehlt oder schon einen Owner hat. */
	claimUnowned(id: string, ownerId: string): Promise<Deck | null>;
}

export type SqlClient = {
	query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
};

const ID_LEN = 10;

function newDeck(id: string, input: DeckInput, ownerId: string | null, now: number): Deck {
	return {
		id,
		title: input.title,
		source: input.source,
		slides: input.slides,
		ownerId,
		visibility: 'private',
		teamId: null,
		createdAt: now,
		updatedAt: now
	};
}

function normalizeSharing(input: DeckSharingInput): { visibility: DeckVisibility; teamId: string | null } {
	if (input.visibility === 'team') return { visibility: 'team', teamId: input.teamId ?? null };
	if (input.visibility === 'link') return { visibility: 'link', teamId: null };
	return { visibility: 'private', teamId: null };
}

// nanoid erzeugt URL-sichere IDs ([A-Za-z0-9_-]); Validierung schützt FileRepo vor
// Path-Traversal über die :id-Route (kein `..`, kein `/`).
const ID_RE = /^[A-Za-z0-9_-]{6,24}$/;
export function isValidDeckId(id: string): boolean {
	return ID_RE.test(id);
}

// ── Memory-Backend ──────────────────────────────────────────────────────────
export class MemoryDeckRepository implements DeckRepository {
	private map = new Map<string, Deck>();

	async create(input: DeckInput, ownerId: string | null): Promise<Deck> {
		const id = nanoid(ID_LEN);
		const deck = newDeck(id, input, ownerId, nowMs());
		this.map.set(id, deck);
		return clone(deck);
	}

	async get(id: string): Promise<Deck | null> {
		const d = this.map.get(id);
		return d ? clone(d) : null;
	}

	async update(id: string, input: DeckInput, claimerId: string | null): Promise<Deck | null> {
		const d = this.map.get(id);
		if (!d) return null;
		d.title = input.title;
		d.source = input.source;
		d.slides = input.slides;
		d.ownerId = d.ownerId ?? claimerId;
		d.visibility ??= 'private';
		d.teamId ??= null;
		d.updatedAt = nowMs();
		return clone(d);
	}

	async delete(id: string): Promise<boolean> {
		return this.map.delete(id);
	}

	async listByOwner(ownerId: string): Promise<Deck[]> {
		return [...this.map.values()]
			.filter((d) => d.ownerId === ownerId)
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((d) => clone(hydrateDeck(d)));
	}

	async listByTeam(teamId: string, excludeOwnerId: string | null = null): Promise<Deck[]> {
		return [...this.map.values()]
			.filter((d) => d.visibility === 'team' && d.teamId === teamId && (!excludeOwnerId || d.ownerId !== excludeOwnerId))
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((d) => clone(hydrateDeck(d)));
	}

	async setSharing(id: string, input: DeckSharingInput, ownerId: string): Promise<Deck | null> {
		const d = this.map.get(id);
		if (!d || d.ownerId !== ownerId) return null;
		const sharing = normalizeSharing(input);
		d.visibility = sharing.visibility;
		d.teamId = sharing.teamId;
		d.updatedAt = nowMs();
		return clone(d);
	}

	async claimOwner(fromOwnerId: string, toOwnerId: string): Promise<number> {
		let count = 0;
		for (const d of this.map.values()) {
			if (d.ownerId !== fromOwnerId) continue;
			d.ownerId = toOwnerId;
			d.updatedAt = nowMs();
			count++;
		}
		return count;
	}

	async claimUnowned(id: string, ownerId: string): Promise<Deck | null> {
		const d = this.map.get(id);
		if (!d || d.ownerId) return null;
		d.ownerId = ownerId;
		d.visibility ??= 'private';
		d.teamId ??= null;
		d.updatedAt = nowMs();
		return clone(d);
	}
}

// ── File-Backend (JSON-Dateien, atomar via tmp+rename) ──────────────────────
export class FileDeckRepository implements DeckRepository {
	constructor(private dir: string) {}

	private async ensureDir(): Promise<void> {
		await mkdir(this.dir, { recursive: true });
	}
	private path(id: string): string {
		return join(this.dir, `${id}.json`);
	}

	private async write(deck: Deck): Promise<void> {
		await this.ensureDir();
		const tmp = this.path(`${deck.id}.${nanoid(6)}.tmp`);
		await writeFile(tmp, JSON.stringify(deck), 'utf8');
		await rename(tmp, this.path(deck.id)); // atomarer Swap statt halb geschriebener Datei
	}

	async create(input: DeckInput, ownerId: string | null): Promise<Deck> {
		const id = nanoid(ID_LEN);
		const deck = newDeck(id, input, ownerId, nowMs());
		await this.write(deck);
		return deck;
	}

	async get(id: string): Promise<Deck | null> {
		if (!isValidDeckId(id)) return null;
		try {
			const raw = await readFile(this.path(id), 'utf8');
			return hydrateDeck(JSON.parse(raw) as Deck);
		} catch {
			return null; // ENOENT o.ä. → nicht vorhanden
		}
	}

	async update(id: string, input: DeckInput, claimerId: string | null): Promise<Deck | null> {
		const existing = await this.get(id);
		if (!existing) return null;
		const deck: Deck = {
			...existing,
			title: input.title,
			source: input.source,
			slides: input.slides,
			ownerId: existing.ownerId ?? claimerId,
			visibility: existing.visibility ?? 'private',
			teamId: existing.teamId ?? null,
			updatedAt: nowMs()
		};
		await this.write(deck);
		return deck;
	}

	async listByOwner(ownerId: string): Promise<Deck[]> {
		await this.ensureDir();
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch {
			return [];
		}
		const decks: Deck[] = [];
		for (const f of files) {
			if (!f.endsWith('.json')) continue;
			try {
				const raw = await readFile(join(this.dir, f), 'utf8');
				const d = hydrateDeck(JSON.parse(raw) as Deck);
				if (d.ownerId === ownerId) decks.push(d);
			} catch {
				/* korrupte/teilgeschriebene Datei überspringen */
			}
		}
		return decks.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async listByTeam(teamId: string, excludeOwnerId: string | null = null): Promise<Deck[]> {
		await this.ensureDir();
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch {
			return [];
		}
		const decks: Deck[] = [];
		for (const f of files) {
			if (!f.endsWith('.json')) continue;
			try {
				const raw = await readFile(join(this.dir, f), 'utf8');
				const d = hydrateDeck(JSON.parse(raw) as Deck);
				if (d.visibility === 'team' && d.teamId === teamId && (!excludeOwnerId || d.ownerId !== excludeOwnerId)) decks.push(d);
			} catch {
				/* korrupte/teilgeschriebene Datei überspringen */
			}
		}
		return decks.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async setSharing(id: string, input: DeckSharingInput, ownerId: string): Promise<Deck | null> {
		const existing = await this.get(id);
		if (!existing || existing.ownerId !== ownerId) return null;
		const sharing = normalizeSharing(input);
		const deck: Deck = { ...existing, visibility: sharing.visibility, teamId: sharing.teamId, updatedAt: nowMs() };
		await this.write(deck);
		return deck;
	}

	async claimOwner(fromOwnerId: string, toOwnerId: string): Promise<number> {
		const decks = await this.listByOwner(fromOwnerId);
		for (const d of decks) {
			d.ownerId = toOwnerId;
			d.updatedAt = nowMs();
			await this.write(d);
		}
		return decks.length;
	}

	async claimUnowned(id: string, ownerId: string): Promise<Deck | null> {
		const existing = await this.get(id);
		if (!existing || existing.ownerId) return null;
		const deck: Deck = { ...existing, ownerId, updatedAt: nowMs() };
		await this.write(deck);
		return deck;
	}

	async delete(id: string): Promise<boolean> {
		if (!isValidDeckId(id)) return false;
		try {
			await unlink(this.path(id));
			return true;
		} catch {
			return false;
		}
	}
}

// ── Postgres-Backend (Railway-ready, gleiche Call-Sites wie File/Memory) ──────
export class PostgresDeckRepository implements DeckRepository {
	constructor(
		private db: SqlClient,
		private makeId: () => string = () => nanoid(ID_LEN),
		private clock: () => number = nowMs
	) {}

	async create(input: DeckInput, ownerId: string | null): Promise<Deck> {
		const id = this.makeId();
		const now = this.clock();
		const result = await this.db.query(
			`INSERT INTO decks (id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5::jsonb, 'private', NULL, $6, $7)
			 RETURNING id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at`,
			[id, ownerId, input.title, input.source, JSON.stringify(input.slides), now, now]
		);
		return rowToDeck(result.rows[0]);
	}

	async get(id: string): Promise<Deck | null> {
		if (!isValidDeckId(id)) return null;
		const result = await this.db.query(
			`SELECT id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at
			 FROM decks WHERE id = $1`,
			[id]
		);
		return result.rows[0] ? rowToDeck(result.rows[0]) : null;
	}

	async update(id: string, input: DeckInput, claimerId: string | null): Promise<Deck | null> {
		if (!isValidDeckId(id)) return null;
		const now = this.clock();
		const result = await this.db.query(
			`UPDATE decks
			 SET title = $1,
			     source = $2,
			     slides = $3::jsonb,
			     owner_id = COALESCE(owner_id, $4),
			     visibility = COALESCE(visibility, 'private'),
			     team_id = CASE WHEN visibility = 'team' THEN team_id ELSE NULL END,
			     updated_at = $5
			 WHERE id = $6
			   AND (($4::text IS NULL AND owner_id IS NULL) OR ($4::text IS NOT NULL AND (owner_id IS NULL OR owner_id = $4)))
			 RETURNING id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at`,
			[input.title, input.source, JSON.stringify(input.slides), claimerId, now, id]
		);
		return result.rows[0] ? rowToDeck(result.rows[0]) : null;
	}

	async delete(id: string): Promise<boolean> {
		if (!isValidDeckId(id)) return false;
		const result = await this.db.query(`DELETE FROM decks WHERE id = $1 RETURNING id`, [id]);
		return result.rows.length > 0;
	}

	async listByOwner(ownerId: string): Promise<Deck[]> {
		const result = await this.db.query(
			`SELECT id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at
			 FROM decks
			 WHERE owner_id = $1
			 ORDER BY updated_at DESC`,
			[ownerId]
		);
		return result.rows.map(rowToDeck);
	}

	async listByTeam(teamId: string, excludeOwnerId: string | null = null): Promise<Deck[]> {
		const result = await this.db.query(
			`SELECT id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at
			 FROM decks
			 WHERE visibility = 'team'
			   AND team_id = $1
			   AND ($2::text IS NULL OR owner_id IS DISTINCT FROM $2)
			 ORDER BY updated_at DESC`,
			[teamId, excludeOwnerId]
		);
		return result.rows.map(rowToDeck);
	}

	async setSharing(id: string, input: DeckSharingInput, ownerId: string): Promise<Deck | null> {
		if (!isValidDeckId(id)) return null;
		const now = this.clock();
		const sharing = normalizeSharing(input);
		const result = await this.db.query(
			`UPDATE decks
			 SET visibility = $1,
			     team_id = $2,
			     updated_at = $3
			 WHERE id = $4 AND owner_id = $5
			 RETURNING id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at`,
			[sharing.visibility, sharing.teamId, now, id, ownerId]
		);
		return result.rows[0] ? rowToDeck(result.rows[0]) : null;
	}

	async claimOwner(fromOwnerId: string, toOwnerId: string): Promise<number> {
		const result = await this.db.query(
			`UPDATE decks
			 SET owner_id = $1,
			     updated_at = $2
			 WHERE owner_id = $3
			 RETURNING id`,
			[toOwnerId, this.clock(), fromOwnerId]
		);
		return result.rows.length;
	}

	async claimUnowned(id: string, ownerId: string): Promise<Deck | null> {
		if (!isValidDeckId(id)) return null;
		const result = await this.db.query(
			`UPDATE decks
			 SET owner_id = $1,
			     visibility = COALESCE(visibility, 'private'),
			     updated_at = $2
			 WHERE id = $3 AND owner_id IS NULL
			 RETURNING id, owner_id, title, source, slides, visibility, team_id, created_at, updated_at`,
			[ownerId, this.clock(), id]
		);
		return result.rows[0] ? rowToDeck(result.rows[0]) : null;
	}
}

let _repo: DeckRepository | null = null;

export function getDeckRepo(): DeckRepository {
	if (_repo) return _repo;
	const mode = (env.EB_DECK_STORE ?? '').toLowerCase();
	if (isProductionRuntime() && mode !== 'postgres') throw new Error('Production benötigt EB_DECK_STORE=postgres.');

	if (mode === 'memory') {
		_repo = new MemoryDeckRepository();
		return _repo;
	}
	if (mode === 'postgres') {
		if (!env.DATABASE_URL) throw new Error('EB_DECK_STORE=postgres benötigt DATABASE_URL.');
		_repo = new PostgresDeckRepository(new Pool({ connectionString: env.DATABASE_URL }));
		return _repo;
	}
	// Default: file, mit hartem Memory-Fallback bei nicht beschreibbarem Verzeichnis.
	const dir = env.EB_DATA_DIR ?? '.data/decks';
	try {
		mkdirSync(dir, { recursive: true });
		_repo = new FileDeckRepository(dir);
	} catch (e) {
		console.warn(`[decks] File-Store unter "${dir}" nicht nutzbar → Memory-Fallback.`, e);
		_repo = new MemoryDeckRepository();
	}
	return _repo;
}

// Date.now() gekapselt: erlaubt dem Verifikations-Skript deterministische Zeit, falls nötig.
function nowMs(): number {
	return Date.now();
}

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

type DeckRow = {
	id: unknown;
	owner_id: unknown;
	title: unknown;
	source: unknown;
	slides: unknown;
	visibility?: unknown;
	team_id?: unknown;
	created_at: unknown;
	updated_at: unknown;
};

function hydrateDeck(deck: Deck): Deck {
	return {
		...deck,
		visibility: deck.visibility ?? 'private',
		teamId: deck.teamId ?? null
	};
}

function rowToDeck(row: unknown): Deck {
	const r = row as DeckRow;
	const slides = typeof r.slides === 'string' ? JSON.parse(r.slides) : r.slides;
	return hydrateDeck({
		id: String(r.id),
		title: String(r.title ?? ''),
		source: String(r.source ?? ''),
		slides: clone(slides ?? []),
		ownerId: r.owner_id == null ? null : String(r.owner_id),
		visibility: r.visibility === 'link' || r.visibility === 'team' ? r.visibility : 'private',
		teamId: r.team_id == null ? null : String(r.team_id),
		createdAt: Number(r.created_at),
		updatedAt: Number(r.updated_at)
	});
}
