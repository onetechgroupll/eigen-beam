<script lang="ts">
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	import { DECK_TEMPLATE } from '$lib/decks';
	import { useI18n } from '$lib/i18n/context';
	const { t } = useI18n();
</script>

<svelte:head><title>{t('common.new_deck')} — eigen.beam</title></svelte:head>

<DeckEditor mode="new" initialTitle="" initialSource={DECK_TEMPLATE} />
