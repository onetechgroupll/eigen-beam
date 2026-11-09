<script lang="ts">
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	import { DECK_TEMPLATE } from '$lib/decks';
</script>

<svelte:head><title>Neues Deck — eigen.beam</title></svelte:head>

<DeckEditor mode="new" initialTitle="" initialSource={DECK_TEMPLATE} />
