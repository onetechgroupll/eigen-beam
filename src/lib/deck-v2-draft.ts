import { publicSlidesToSource, type PublicSlide } from './decks';
import type { ReplaySnapshot } from './server/rooms';
import { buildSlideHeatmap } from './slide-heatmap';
import { detectContentLocale, type Locale } from './i18n';

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
	const locale = detectContentLocale(replay.slides);
	const de = locale === 'de';
	const heatmap = buildSlideHeatmap(replay);
	const sourceSlides = replay.slides as PublicSlide[];
	const slides = sourceSlides.map((slide, index) => refineSlide(slide, index, heatmap.slides[index]?.classification ?? 'quiet', locale));
	const changes: DeckV2Change[] = sourceSlides.map((slide, index) => ({
		kind: heatmap.slides[index]?.classification === 'hot' ? 'strengthen' : 'keep',
		slide: index,
		label: `F${index + 1}`,
		detail: heatmap.slides[index]?.classification === 'hot'
			? (de ? 'Starke Folie beibehalten und als Proof-Moment markieren.' : 'Keep the strong slide and mark it as a proof moment.')
			: (de ? 'Folie public-safe übernommen.' : 'Slide retained in a public-safe form.')
	}));
	if (heatmap.confusing) {
		slides.splice(Math.min(heatmap.confusing.index + 1, slides.length), 0, clarifySlide(heatmap.confusing.label, heatmap.confusing.headline, locale));
		changes.push({
			kind: 'clarify',
			slide: heatmap.confusing.index,
			label: heatmap.confusing.label,
			detail: de ? `Neue Klarstellungsfolie nach ${heatmap.confusing.label}, weil dort Fragen gebündelt waren.` : `Added a clarification slide after ${heatmap.confusing.label}, where questions clustered.`
		});
	}
	const source = publicSlidesToSource(slides);
	return { id: replay.id, title: `Session ${replay.id} — V2 Draft`, slides, source, changes };
}

function refineSlide(slide: PublicSlide, index: number, classification: string, locale: Locale): PublicSlide {
	const de = locale === 'de';
	const copy: PublicSlide = { ...slide };
	if (classification === 'hot') {
		copy.eyebrow = copy.eyebrow ?? (de ? 'Proof-Moment' : 'Proof moment');
		const note = de ? 'Merken: Diese Folie hatte sichtbare Resonanz.' : 'Remember: this slide received a visible response.';
		copy.body = copy.body ? `${copy.body}\n\n${note}` : note;
	}
	if (!copy.headline) copy.headline = `${de ? 'Folie' : 'Slide'} ${index + 1}`;
	return copy;
}

function clarifySlide(label: string, headline: string, locale: Locale): PublicSlide {
	const de = locale === 'de';
	return {
		eyebrow: de ? 'Klarstellung' : 'Clarification',
		headline: de ? 'Was wir früher klären sollten' : 'What to clarify earlier',
		body: de ? `${label} „${headline}“ hat Fragen ausgelöst. In V2 kommt vor dem nächsten Proof ein kurzer Kontext: Begriff, Annahme und Konsequenz in je einem Satz.` : `${label} “${headline}” prompted questions. V2 adds brief context before the next proof: term, assumption, and consequence in one sentence each.`
	};
}
