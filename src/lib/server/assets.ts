import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { env } from 'node:process';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp',
	'image/gif': '.gif'
};

type StoredAsset = { key: string; url: string; mime: string };
type ReadAsset = { bytes: Uint8Array; mime: string };

export interface AssetStore {
	store(file: File): Promise<StoredAsset>;
	read(key: string): Promise<ReadAsset | null>;
}

export type S3LikeClient = { send(command: object): Promise<unknown> };

function assetDir(): string { return env.EB_ASSET_DIR ?? '.data/assets'; }
export function isValidAssetKey(key: string): boolean { return /^[A-Za-z0-9_-]{12,40}\.(png|jpg|jpeg|webp|gif)$/.test(key); }

export function sniffImage(bytes: Uint8Array): string | null {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (bytes.length >= 12 && text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 12) === 'WEBP') return 'image/webp';
	if (bytes.length >= 6 && (text(bytes, 0, 6) === 'GIF87a' || text(bytes, 0, 6) === 'GIF89a')) return 'image/gif';
	return null;
}

export class LocalAssetStore implements AssetStore {
	constructor(private dir: string = assetDir(), private makeId: () => string = () => nanoid(18)) {}

	async store(file: File): Promise<StoredAsset> {
		const { bytes, mime, ext } = await readValidatedImage(file);
		await mkdir(this.dir, { recursive: true });
		const key = `${this.makeId()}${ext}`;
		await writeFile(join(this.dir, key), bytes);
		return { key, url: `/assets/${key}`, mime };
	}

	async read(key: string): Promise<ReadAsset | null> {
		if (!isValidAssetKey(key)) return null;
		try {
			const bytes = await readFile(join(this.dir, key));
			const mime = sniffImage(bytes);
			if (!mime) return null;
			return { bytes, mime };
		} catch {
			return null;
		}
	}
}

export class S3AssetStore implements AssetStore {
	constructor(
		private client: S3LikeClient,
		private opts: { bucket: string; publicBaseUrl?: string },
		private makeId: () => string = () => nanoid(18)
	) {}

	async store(file: File): Promise<StoredAsset> {
		const { bytes, mime, ext } = await readValidatedImage(file);
		const key = `${this.makeId()}${ext}`;
		await this.client.send(new PutObjectCommand({
			Bucket: this.opts.bucket,
			Key: key,
			Body: bytes,
			ContentType: mime,
			CacheControl: 'public, max-age=31536000, immutable'
		}));
		return { key, url: this.publicUrl(key), mime };
	}

	async read(key: string): Promise<ReadAsset | null> {
		if (!isValidAssetKey(key)) return null;
		const result = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key })) as { Body?: unknown; ContentType?: string };
		if (!result.Body) return null;
		const bytes = await bodyToBytes(result.Body);
		const mime = sniffImage(bytes);
		if (!mime) return null;
		return { bytes, mime: result.ContentType || mime };
	}

	private publicUrl(key: string): string {
		const base = this.opts.publicBaseUrl?.replace(/\/$/, '');
		return base ? `${base}/${key}` : `/assets/${key}`;
	}
}

let _assetStore: AssetStore | null = null;
export function getAssetStore(): AssetStore {
	if (_assetStore) return _assetStore;
	const mode = (env.EB_ASSET_STORE ?? '').toLowerCase();
	if (mode === 's3') {
		if (!env.EB_BUCKET_NAME) throw new Error('EB_ASSET_STORE=s3 benötigt EB_BUCKET_NAME.');
		_assetStore = new S3AssetStore(new S3Client({
			region: env.EB_BUCKET_REGION ?? 'auto',
			endpoint: env.EB_BUCKET_ENDPOINT,
			forcePathStyle: env.EB_BUCKET_FORCE_PATH_STYLE !== 'false',
			credentials: env.EB_BUCKET_ACCESS_KEY && env.EB_BUCKET_SECRET_KEY ? {
				accessKeyId: env.EB_BUCKET_ACCESS_KEY,
				secretAccessKey: env.EB_BUCKET_SECRET_KEY
			} : undefined
		}), { bucket: env.EB_BUCKET_NAME, publicBaseUrl: env.EB_BUCKET_PUBLIC_URL });
		return _assetStore;
	}
	_assetStore = new LocalAssetStore();
	return _assetStore;
}

export async function storeAsset(file: File): Promise<StoredAsset> {
	return getAssetStore().store(file);
}

export async function readAsset(key: string): Promise<ReadAsset | null> {
	return getAssetStore().read(key);
}

async function readValidatedImage(file: File): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
	if (file.size > MAX_ASSET_BYTES) throw Object.assign(new Error('Bild zu groß (max. 5 MB).'), { status: 413 });
	const bytes = new Uint8Array(await file.arrayBuffer());
	const mime = sniffImage(bytes);
	if (!mime) throw Object.assign(new Error('Nur PNG, JPEG, WebP oder GIF.'), { status: 415 });
	return { bytes, mime, ext: MIME_EXT[mime] ?? extname(file.name).toLowerCase() ?? '.bin' };
}

async function bodyToBytes(body: unknown): Promise<Uint8Array> {
	if (body instanceof Uint8Array) return body;
	if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
		return (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
	}
	if (body && typeof (body as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
		return new Uint8Array(await (body as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer());
	}
	throw new Error('Unsupported S3 body type');
}

function text(bytes: Uint8Array, start: number, end: number): string {
	return new TextDecoder().decode(bytes.slice(start, end));
}
