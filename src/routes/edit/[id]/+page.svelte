<script lang="ts">
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.title} — eigen.beam</title></svelte:head>

<DeckEditor mode="edit" id={data.id} initialTitle={data.title} initialSource={data.source} />
