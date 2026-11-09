// Email-Versand — Provider-Abstraktion mit dev-verifizierbarer Outbox.
//
// ARCHITEKTUR (B4a/L3): Magic-Link + Follow-Confirm brauchen echten Mailversand. Ohne
// Provider-Credentials wird KEIN Fake-SMTP gebaut, sondern eine schlanke Abstraktion mit
// lokal prüfbarem Fallback — gleiche Mechanik wie assets/decks/events-repo:
//
//   getMailer() wählt den Provider per ENV (EB_MAIL_PROVIDER):
//     outbox  (Default) → schreibt jede Mail als JSON unter EB_DATA_DIR/outbox (+ console.info)
//     console           → loggt nur (kein Disk-Write; gut für CI)
//     resend            → HTTP an api.resend.com  (braucht EB_RESEND_API_KEY)
//     postmark          → HTTP an api.postmarkapp.com (braucht EB_POSTMARK_TOKEN)
//
// CREDENTIAL-BLOCKER: resend/postmark brauchen echte API-Keys + verifizierte Absender-Domain.
// Solange die fehlen, ist `outbox` der Default und macht den kompletten Flow lokal testbar.
import { mkdirSync } from 'node:fs';
import { mkdir, writeFile, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { nanoid } from 'nanoid';
import { isProductionRuntime } from '$lib/server/auth';

export type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export type SentEmail = {
	id: string;
	provider: string;
	to: string;
	subject: string;
};

export interface EmailProvider {
	send(msg: EmailMessage): Promise<SentEmail>;
}

function fromAddress(): string {
	return env.EB_MAIL_FROM ?? 'eigen.beam <no-reply@eigen.beam.local>';
}

// ── Console-Provider (kein Disk-Write) ──────────────────────────────────────
export class ConsoleEmailProvider implements EmailProvider {
	constructor(private makeId: () => string = () => nanoid(12)) {}

	async send(msg: EmailMessage): Promise<SentEmail> {
		const id = this.makeId();
		console.info(`[mail:console] → ${msg.to} · ${msg.subject}\n${msg.text}`);
		return { id, provider: 'console', to: msg.to, subject: msg.subject };
	}
}

// ── Outbox-Provider (dev-verifizierbar: jede Mail als JSON auf Disk) ─────────
export class OutboxEmailProvider implements EmailProvider {
	constructor(private dir: string, private makeId: () => string = () => nanoid(12)) {}

	async send(msg: EmailMessage): Promise<SentEmail> {
		const id = this.makeId();
		await mkdir(this.dir, { recursive: true });
		const record = { id, from: fromAddress(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, sentAt: Date.now() };
		const tmp = join(this.dir, `${id}.${nanoid(6)}.tmp`);
		await writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
		await rename(tmp, join(this.dir, `${id}.json`)); // atomarer Swap
		console.info(`[mail:outbox] → ${msg.to} · ${msg.subject} (.data/outbox/${id}.json)`);
		return { id, provider: 'outbox', to: msg.to, subject: msg.subject };
	}
}

// ── Resend-Provider (HTTP; braucht EB_RESEND_API_KEY) ───────────────────────
export class ResendEmailProvider implements EmailProvider {
	constructor(private apiKey: string, private fetchImpl: typeof fetch = fetch) {}

	async send(msg: EmailMessage): Promise<SentEmail> {
		const res = await this.fetchImpl('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({ from: fromAddress(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html })
		});
		if (!res.ok) throw new Error(`Resend ${res.status}: ${await safeBody(res)}`);
		const data = (await res.json().catch(() => ({}))) as { id?: string };
		return { id: data.id ?? nanoid(12), provider: 'resend', to: msg.to, subject: msg.subject };
	}
}

// ── Postmark-Provider (HTTP; braucht EB_POSTMARK_TOKEN) ─────────────────────
export class PostmarkEmailProvider implements EmailProvider {
	constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}

	async send(msg: EmailMessage): Promise<SentEmail> {
		const res = await this.fetchImpl('https://api.postmarkapp.com/email', {
			method: 'POST',
			headers: { 'X-Postmark-Server-Token': this.token, accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ From: fromAddress(), To: msg.to, Subject: msg.subject, TextBody: msg.text, HtmlBody: msg.html })
		});
		if (!res.ok) throw new Error(`Postmark ${res.status}: ${await safeBody(res)}`);
		const data = (await res.json().catch(() => ({}))) as { MessageID?: string };
		return { id: data.MessageID ?? nanoid(12), provider: 'postmark', to: msg.to, subject: msg.subject };
	}
}

let _mailer: EmailProvider | null = null;

export function getMailer(): EmailProvider {
	if (_mailer) return _mailer;
	const selected = getMailerForEnv(env);
	if (!selected) throw new Error('Production benötigt EB_MAIL_PROVIDER=resend|postmark plus Provider-Credentials.');
	_mailer = selected;
	return _mailer;
}

export function getMailerForEnv(source: Record<string, string | undefined>): EmailProvider | null {
	const mode = (source.EB_MAIL_PROVIDER ?? '').toLowerCase();

	if (mode === 'console') {
		return isProductionRuntime(source) ? null : new ConsoleEmailProvider();
	}
	if (mode === 'resend') {
		if (!source.EB_RESEND_API_KEY) throw new Error('EB_MAIL_PROVIDER=resend benötigt EB_RESEND_API_KEY.');
		return new ResendEmailProvider(source.EB_RESEND_API_KEY);
	}
	if (mode === 'postmark') {
		if (!source.EB_POSTMARK_TOKEN) throw new Error('EB_MAIL_PROVIDER=postmark benötigt EB_POSTMARK_TOKEN.');
		return new PostmarkEmailProvider(source.EB_POSTMARK_TOKEN);
	}
	if (isProductionRuntime(source)) return null;

	// Default: Outbox auf Disk, mit Console-Fallback bei nicht beschreibbarem Verzeichnis.
	const dir = outboxDir();
	try {
		mkdirSync(dir, { recursive: true });
		return new OutboxEmailProvider(dir);
	} catch (e) {
		console.warn(`[mail] Outbox unter "${dir}" nicht nutzbar → Console-Fallback.`, e);
		return new ConsoleEmailProvider();
	}
}

export function _resetMailer(): void {
	_mailer = null;
}

export function outboxDir(): string {
	return join(env.EB_DATA_DIR ?? '.data', 'outbox');
}

// Test-/Smoke-Helfer: Outbox-Mails (neueste zuerst) lesen, um Versand zu verifizieren.
export async function readOutbox(dir: string = outboxDir()): Promise<Array<{ id: string; to: string; subject: string; text: string; sentAt: number }>> {
	let files: string[];
	try {
		files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
	} catch {
		return [];
	}
	const out: Array<{ id: string; to: string; subject: string; text: string; sentAt: number }> = [];
	for (const f of files) {
		try {
			out.push(JSON.parse(await readFile(join(dir, f), 'utf8')));
		} catch {
			/* korrupte/teilgeschriebene Datei überspringen */
		}
	}
	return out.sort((a, b) => b.sentAt - a.sentAt);
}

async function safeBody(res: Response): Promise<string> {
	try {
		return (await res.text()).slice(0, 200);
	} catch {
		return '<no body>';
	}
}
