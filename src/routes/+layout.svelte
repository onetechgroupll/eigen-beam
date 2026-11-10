<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';
	import { setI18nContext } from '$lib/i18n/context';
	let { data, children } = $props();
	const initial = <T>(read: () => T): T => read();
	setI18nContext(initial(() => data.locale));
	let immersive = $derived(/^\/(?:present|replay|v)\//.test(page.url.pathname));
</script>

{@render children()}

{#if !immersive}
	<footer class="global-locale"><LocaleSwitcher compact /></footer>
{/if}

<style>
	.global-locale { position:fixed; left:max(8px,env(safe-area-inset-left)); bottom:max(6px,env(safe-area-inset-bottom)); z-index:90; }
</style>
