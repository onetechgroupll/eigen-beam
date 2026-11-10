<script lang="ts">
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n/context';
	let { compact = false }: { compact?: boolean } = $props();
	const { locale, t } = useI18n();
</script>

<div class:compact class="locale-switcher" aria-label={t('locale.label')}>
	<span>{t('locale.label')}</span>
	{#each ['en', 'de'] as choice}
		<form method="POST" action="/api/locale">
			<input type="hidden" name="locale" value={choice} />
			<input type="hidden" name="redirectTo" value={page.url.pathname + page.url.search + page.url.hash} />
			<button type="submit" aria-current={locale === choice ? 'true' : undefined}>{t(`locale.${choice}` as 'locale.en' | 'locale.de')}</button>
		</form>
	{/each}
</div>

<style>
	.locale-switcher { display:flex; align-items:center; flex-wrap:wrap; gap:6px; color:var(--muted); font-size:12px; }
	form { margin:0; }
	button { min-height:44px; padding:0 12px; border:1px solid var(--hair); border-radius:999px; background:var(--surface); color:var(--fg); font:inherit; font-weight:760; }
	button[aria-current='true'] { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); }
	.compact > span { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
	.compact button { min-height:44px; padding:0 10px; font-size:11px; background:color-mix(in srgb,var(--bg) 88%,transparent); backdrop-filter:blur(14px); }
</style>
