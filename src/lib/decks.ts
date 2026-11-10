// Slide-/Deck-Schema für eigen.beam.
// Content-First bleibt die Grundform; C3 ergänzt blockartige Präsentations-Typen,
// ohne in einen Freiform-WYSIWYG abzurutschen.
import { escapeBodyLines } from './deck-parse';

export type SlideKind = 'text' | 'number' | 'quote' | 'image' | 'compare' | 'timeline';

export type CompareBlock = {
	leftTitle: string;
	leftBody?: string;
	rightTitle: string;
	rightBody?: string;
};

export type TimelineItem = { label: string; text: string };

export type Slide = {
	eyebrow?: string;
	headline: string;
	body?: string;
	image?: string;
	kind?: SlideKind;
	metric?: string;
	quote?: string;
	attribution?: string;
	compare?: CompareBlock;
	timeline?: TimelineItem[];
	reveal?: string[];
	speakerNotes?: string;
};

export type PublicSlide = Omit<Slide, 'speakerNotes'>;

export function toPublicSlide(slide: Slide): PublicSlide {
	// Presenter notes are private authoring/presenter context. Viewer, recap,
	// replay and public deck APIs must never serialize them.
	const { speakerNotes: _speakerNotes, ...publicSlide } = slide;
	return publicSlide;
}

export function toPublicSlides(slides: Slide[]): PublicSlide[] {
	return slides.map(toPublicSlide);
}

export function publicSlidesToSource(slides: PublicSlide[]): string {
	return slides.map((slide) => {
		const lines: string[] = [];
		if (slide.kind && slide.kind !== 'text') lines.push(`type: ${slide.kind}`);
		else if (slide.image) lines.push('type: text');
		if (slide.eyebrow) lines.push(`eyebrow: ${slide.eyebrow}`);
		if (slide.metric) lines.push(`metric: ${slide.metric}`);
		if (slide.quote) lines.push(`quote: ${slide.quote}`);
		if (slide.attribution) lines.push(`attribution: ${slide.attribution}`);
		lines.push(`# ${slide.headline}`);
		if (slide.image) lines.push(`![](${slide.image})`);
		if (slide.body) lines.push(escapeBodyLines(slide.body));
		if (slide.compare) {
			lines.push(`left: ${slide.compare.leftTitle}${slide.compare.leftBody ? ` | ${slide.compare.leftBody}` : ''}`);
			lines.push(`right: ${slide.compare.rightTitle}${slide.compare.rightBody ? ` | ${slide.compare.rightBody}` : ''}`);
		}
		if (slide.timeline) for (const item of slide.timeline) lines.push(`- ${item.label}: ${item.text}`);
		if (slide.reveal) for (const item of slide.reveal) lines.push(`++ ${item}`);
		return lines.join('\n');
	}).join('\n\n---\n\n');
}

export type DeckVisibility = 'private' | 'link' | 'team';

export type Deck = {
	id: string;
	title: string;
	source: string;
	slides: Slide[];
	ownerId: string | null;
	visibility?: DeckVisibility;
	teamId?: string | null;
	cloneOf?: string;
	createdAt: number;
	updatedAt: number;
};

export const DEMO_DECK: Slide[] = [
	{ eyebrow: 'eigen.beam', headline: 'Live on every phone in the room.', body: 'No projector. You lead, everyone follows.' },
	{ eyebrow: 'The problem', headline: 'No screen, eight phones.', body: 'Before: talk now and send the PDF afterwards.' },
	{ eyebrow: 'The proof', headline: 'Retail media, finally measurable.', body: 'Every placement, every contact — one value.' },
	{ eyebrow: 'The difference', headline: 'A PDF cannot do this.', body: 'It cannot keep everyone on the same slide.' },
	{ eyebrow: 'Now', headline: 'Swipe back to reread.', body: 'Jump back to the live slide at any time.' }
];

export const DECK_TEMPLATE = `Eyebrow-Label
# Your first slide
One sentence that carries the idea.
++ First reveal
++ Second reveal

---

type: number
Core signal
# 8 Phones
One shared focus, without a projector.

---

type: quote
# “A PDF cannot do this.”
— eigen.beam principle

---

type: compare
# Before / after
left: PDF afterwards | No shared moment in the room.
right: Live sync | Everyone is on your slide.

---

type: timeline
# Flow
- 00:00: Open QR code
- 00:15: Everyone live
- 05:00: Share recap link

---

# Image slide
Add an image by upload or Markdown:

![](https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?w=900)
`;

export const TEMPLATES: Record<string, { label: string; source: string }> = {
	starterDe: {
		label: 'Deutsches Starterdeck',
		source: `Einstieg
# Deine erste Folie
Ein Satz, der die Idee trägt.

---

Beweis
# Was hängen bleiben soll
Ein konkreter Proof-Moment.

---

Nächster Schritt
# Was jetzt passiert
Eine klare Bitte.`
	},
	narrative: {
		label: 'Narrative Arc',
		source: `Hook
# The one thing people should remember
Why it matters now.

---

Problem
# What is not working
One concrete pain point, not a list.

---

Proof
# The proof
A number, example, or demo moment.

---

CTA
# What happens next
One clear next step.`
	},
	pitch: {
		label: 'Pitch',
		source: `Setup
# Why now?
The context in one sentence.

---

type: compare
# Old world / new world
left: Today | What slows you down.
right: With us | What becomes easier.

---

type: number
# 3× faster
The one measurable advantage.

---

Decision
# Decision
What we need today.`
	},
	update: {
		label: 'Update',
		source: `Status
# Where we are
Short, concrete, and direct.

---

type: timeline
# Progress
- Done: What is complete
- Now: What is happening
- Next: What comes next

---

Risk
# What needs attention
One real risk and how we handle it.

---

Ask
# What I need
One clear ask.`
	}
};
