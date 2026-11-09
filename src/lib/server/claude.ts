// Shared Claude call for the clarity pass and the import re-layout.
// Both ask for a deck as JSON {"title", "source"} and fall back to a local,
// deterministic layout when the call cannot produce one. The result says why,
// so the UI can tell "no key configured" apart from "the provider failed".
import Anthropic from '@anthropic-ai/sdk';

/** Default model; override with EB_CLAUDE_MODEL. Check it at every release. */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export type AiFallbackReason = 'no_key' | 'provider_error' | 'refusal' | 'invalid_output';
export type AiDeckResult =
	| { ok: true; title?: string; source: string; model: string }
	| { ok: false; reason: AiFallbackReason };

type AiDeckRequest = {
	system: string;
	user: string;
	maxTokens: number;
	timeoutMs: number;
	label: string;
};

export function claudeModel(source: Record<string, string | undefined> = process.env): string {
	return source.EB_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

export async function requestDeckJson(request: AiDeckRequest, client?: Anthropic): Promise<AiDeckResult> {
	if (!client && !process.env.ANTHROPIC_API_KEY) return { ok: false, reason: 'no_key' };
	const anthropic = client ?? new Anthropic({ timeout: request.timeoutMs, maxRetries: 1 });
	const model = claudeModel();
	let response: Anthropic.Beta.BetaMessage;
	try {
		response = await anthropic.beta.messages.create({
			model,
			max_tokens: request.maxTokens,
			// Short rewrite tasks: low effort keeps latency down.
			output_config: { effort: 'low' },
			// On a policy refusal the API retries on a fallback model in the same call.
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: request.system,
			messages: [{ role: 'user', content: request.user }]
		});
	} catch (error) {
		const status = error instanceof Anthropic.APIError ? error.status : undefined;
		console.error(`[claude] ${request.label} failed (model ${model}, status ${status ?? 'network'}):`, (error as Error).message);
		return { ok: false, reason: 'provider_error' };
	}
	if (response.stop_reason === 'refusal') {
		console.warn(`[claude] ${request.label} refused (category ${response.stop_details?.category ?? 'unknown'})`);
		return { ok: false, reason: 'refusal' };
	}
	const text = response.content
		.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
		.map((block) => block.text)
		.join('')
		.trim();
	const parsed = parseDeckJson(text);
	if (!parsed) {
		console.warn(`[claude] ${request.label} returned no usable JSON (stop_reason ${response.stop_reason})`);
		return { ok: false, reason: 'invalid_output' };
	}
	return { ok: true, ...parsed, model: response.model };
}

/** Accepts plain JSON or JSON wrapped in a Markdown code fence. */
export function parseDeckJson(text: string): { title?: string; source: string } | null {
	const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
	try {
		const parsed = JSON.parse(unfenced) as { title?: unknown; source?: unknown };
		if (typeof parsed.source !== 'string' || !parsed.source.trim()) return null;
		return { title: typeof parsed.title === 'string' ? parsed.title : undefined, source: parsed.source };
	} catch {
		return null;
	}
}
