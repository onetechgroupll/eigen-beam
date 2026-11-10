<script lang="ts">
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	import { useI18n } from '$lib/i18n/context';
	let { data } = $props();
	const { t } = useI18n();
</script>

<svelte:head>
	<title>{data.title} — eigen.beam</title>
	{#if data.claim}<meta name="referrer" content="no-referrer" />{/if}
</svelte:head>

{#if data.claim}
	<main class="claim">
		<div class="mono tag">{t('claim.kicker')}</div>
		<h1>{data.title}</h1>
		<p>{t('claim.body', { count: data.slideCount, slides: data.slideCount === 1 ? t('common.slide') : t('common.slides') })}</p>
		<form method="POST" action="?/claim">
			<input type="hidden" name="claim" value={data.token} />
			<button type="submit">{t('claim.action')}</button>
		</form>
	</main>
{:else}
	<DeckEditor mode="edit" id={data.id} initialTitle={data.title} initialSource={data.source} />
{/if}

<style>
	.claim {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
		gap: 10px;
	}
	.tag {
		font-size: 11px;
		letter-spacing: 3px;
		color: var(--muted);
		margin-bottom: 8px;
	}
	h1 {
		font-size: clamp(28px, 7vw, 44px);
		letter-spacing: -1px;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	p {
		color: var(--muted);
		max-width: 380px;
		line-height: 1.45;
	}
	form {
		margin-top: 12px;
	}
	button {
		min-height: 44px;
		border-radius: 999px;
		padding: 0 22px;
		background: var(--accent);
		color: var(--accent-fg);
		font-weight: 800;
	}
</style>
