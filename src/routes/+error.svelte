<script lang="ts">
	import { page } from '$app/stores';
	import { useI18n } from '$lib/i18n/context';
	const { t } = useI18n();
</script>

<main>
	<div class="mono tag">EIGEN.BEAM</div>
	<h1>{$page.status === 410 ? t('error.ended_title') : t('error.not_found_title')}</h1>
	<p>{$page.error?.message ?? t('error.unreachable')}</p>
	<div class="actions">
		<a href="/new">{t('home.prepare')}</a>
		<a class="secondary" href="/account">{t('common.my_decks')}</a>
	</div>
</main>

<style>
	main {
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
	}
	p {
		color: var(--muted);
		max-width: 360px;
		line-height: 1.45;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		margin-top: 12px;
	}
	a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0 18px;
		background: var(--accent);
		color: var(--accent-fg);
		font-weight: 800;
		text-decoration: none;
	}
	a.secondary {
		background: var(--surface);
		color: var(--fg);
		border: 1px solid var(--hair);
	}
</style>
