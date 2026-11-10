<script lang="ts">
	import { goto } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context';

	let creating = $state(false);
	const { t } = useI18n();

	async function start() {
		creating = true;
		const res = await fetch('/api/rooms', { method: 'POST' });
		const { id, claimToken } = await res.json();
		const claim = await fetch(`/present/${id}/claim`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ claimToken })
		});
		if (!claim.ok) throw new Error(t('editor.presenter_failed'));
		// Presenter-Token wird erst vom /present/:id/claim Endpoint als httpOnly-Cookie gesetzt.
		goto(`/present/${id}`);
	}
</script>

<main>
	<div class="wrap">
		<div class="mono tag">{t('home.kicker')}</div>
		<h1>{t('home.title')}</h1>
		<p>{t('home.body')}</p>
		<div class="contrast">
			<span>{t('home.before')}</span>
			<strong>{t('home.after')}</strong>
		</div>
		<p class="proof">{t('home.proof')}</p>
		<div class="cta">
			<button onclick={start} disabled={creating}>
				{creating ? t('home.starting') : `${t('home.start')} →`}
			</button>
			<a class="secondary" href="/new">{t('home.prepare')}</a>
			<a class="secondary" href="/account">{t('common.my_decks')}</a>
		</div>
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--accent) 11%, transparent), transparent 36%), var(--bg);
	}
	.wrap {
		max-width: 460px;
		transform: translateY(-4dvh);
	}
	.tag {
		font-size: 12px;
		letter-spacing: 3px;
		color: var(--muted);
		margin-bottom: 20px;
	}
	h1 {
		font-size: clamp(34px, 9vw, 60px);
		line-height: 0.98;
		letter-spacing: -1.5px;
		font-weight: 800;
	}
	p {
		color: var(--muted);
		margin: 18px 0 12px;
		font-size: clamp(15px, 4vw, 18px);
		line-height: 1.5;
	}
	.proof {
		margin: 0 0 30px;
		font-size: 12px;
		font-weight: 760;
		letter-spacing: .2px;
		color: color-mix(in srgb, var(--muted) 82%, var(--fg));
	}
	.contrast {
		display: grid;
		gap: 6px;
		margin: 18px 0 18px;
		border: 1px solid var(--hair);
		border-radius: 22px;
		padding: 14px;
		background: color-mix(in srgb, var(--surface) 82%, transparent);
		box-shadow: var(--shadow-soft);
	}
	.contrast span, .contrast strong {
		display: block;
		font-size: 14px;
		line-height: 1.25;
	}
	.contrast span {
		color: var(--muted);
	}
	.contrast strong {
		color: var(--fg);
		font-size: 18px;
		letter-spacing: -.2px;
	}
	button {
		background: var(--accent);
		color: var(--accent-fg);
		border: 1px solid color-mix(in srgb, var(--accent) 88%, var(--fg));
		border-radius: 999px;
		padding: 16px 28px;
		min-height: 56px;
		font-weight: 700;
		font-size: 16px;
		box-shadow: var(--shadow-soft);
	}
	button:disabled {
		opacity: 0.5;
	}
	.cta {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
	}
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		color: var(--fg);
		font-weight: 760;
		font-size: 13px;
		text-decoration: none;
		border: 1px solid var(--hair);
		border-radius: 999px;
		padding: 0 18px;
		background: var(--surface);
	}
</style>
