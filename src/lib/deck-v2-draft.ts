import { publicSlidesToSource, type PublicSlide } from './decks';
import type { ReplaySnapshot } from './server/rooms';
import { buildSlideHeatmap } from './slide-heatmap';

export type DeckV2ChangeKind = 'keep' | 'strengthen' | 'clarify';

export type DeckV2Change = {
	kind: DeckV2ChangeKind;
	slide?: number;
	label: string;
	detail: string;
};

export type DeckV2Draft = {
	id: string;
	title: string;
	slides: PublicSlide[];
	source: string;
	changes: DeckV2Change[];
};

export function buildDeckV2Draft(replay: ReplaySnapshot): DeckV2Draft {
	const heatmap = buildSlideHeatmap(replay);
	const sourceSlides = replay.slides as PublicSlide[];
	const slides = sourceSlides.map((slide, index) => refineSlide(slide, index, heatmap.slides[index]?.classification ?? 'quiet'));
	const changes: DeckV2Change[] = sourceSlides.map((slide, index) => ({
		kind: heatmap.slides[index]?.classification === 'hot' ? 'strengthen' : 'keep',
		slide: index,
		label: `F${index + 1}`,
		detail: heatmap.slides[index]?.classification === 'hot'
			? `Starke Folie beibehalten und als Proof-Moment markieren.`
			: `Folie public-safe übernommen.`
	}));
	if (heatmap.confusing) {
		slides.splice(Math.min(heatmap.confusing.index + 1, slides.length), 0, clarifySlide(heatmap.confusing.label, heatmap.confusing.headline));
		changes.push({
			kind: 'clarify',
			slide: heatmap.confusing.index,
			label: heatmap.confusing.label,
			detail: `Neue Klarstellungsfolie nach ${heatmap.confusing.label}, weil dort Fragen gebündelt waren.`
		});
	}
	const source = publicSlidesToSource(slides);
	return { id: replay.id, title: `Session ${replay.id} — V2 Draft`, slides, source, changes };
}

function refineSlide(slide: PublicSlide, index: number, classification: string): PublicSlide {
	const copy: PublicSlide = { ...slide };
	if (classification === 'hot') {
		copy.eyebrow = copy.eyebrow ?? 'Proof-Moment';
		copy.body = copy.body ? `${copy.body}\n\nMerken: Diese Folie hatte sichtbare Resonanz.` : 'Merken: Diese Folie hatte sichtbare Resonanz.';
	}
	if (!copy.headline) copy.headline = `Folie ${index + 1}`;
	return copy;
}

function clarifySlide(label: string, headline: string): PublicSlide {
	return {
		eyebrow: 'Klarstellung',
		headline: 'Was wir früher klären sollten',
		body: `${label} „${headline}“ hat Fragen ausgelöst. In V2 kommt vor dem nächsten Proof ein kurzer Kontext: Begriff, Annahme und Konsequenz in je einem Satz.`
	};
}
