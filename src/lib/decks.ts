// Slide-/Deck-Schema für eigen.beam.
// Content-First bleibt die Grundform; C3 ergänzt blockartige Präsentations-Typen,
// ohne in einen Freiform-WYSIWYG abzurutschen.
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
		if (slide.eyebrow) lines.push(slide.eyebrow);
		lines.push(`# ${slide.headline}`);
		if (slide.body) lines.push(slide.body);
		if (slide.metric) lines.push(slide.metric);
		if (slide.quote) lines.push(`“${slide.quote}”`);
		if (slide.attribution) lines.push(`— ${slide.attribution}`);
		if (slide.compare) {
			lines.push(`left: ${slide.compare.leftTitle}${slide.compare.leftBody ? ` | ${slide.compare.leftBody}` : ''}`);
			lines.push(`right: ${slide.compare.rightTitle}${slide.compare.rightBody ? ` | ${slide.compare.rightBody}` : ''}`);
		}
		if (slide.timeline) for (const item of slide.timeline) lines.push(`- ${item.label}: ${item.text}`);
		if (slide.reveal) for (const item of slide.reveal) lines.push(`++ ${item}`);
		if (slide.image) lines.push(`![](${slide.image})`);
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
	{ eyebrow: 'eigen.beam', headline: 'Live auf jedem Phone im Raum.', body: 'Kein Beamer. Du führst, alle folgen.' },
	{ eyebrow: 'Das Problem', headline: 'Kein Screen, acht Phones.', body: 'Bisher: reden und das PDF danach schicken.' },
	{ eyebrow: 'Der Beweis', headline: 'Retail Media, endlich messbar.', body: 'Jede Ausspielung, jeder Kontakt — ein Wert.' },
	{ eyebrow: 'Der Unterschied', headline: 'Ein PDF kann das nicht.', body: 'Es erzwingt nicht, dass alle auf deiner Folie sind.' },
	{ eyebrow: 'Jetzt', headline: 'Swipe zurück zum Nachlesen.', body: 'Du springst jederzeit zur Live-Folie zurück.' }
];

export const DECK_TEMPLATE = `Eyebrow-Label
# Deine erste Folie
Ein Satz, der die Idee trägt.
++ Reveal-Punkt eins
++ Reveal-Punkt zwei

---

type: number
Kernsignal
# 8 Phones
Ein gemeinsamer Fokus, ohne Beamer.

---

type: quote
# „Ein PDF kann das nicht."
— eigen.beam Prinzip

---

type: compare
# Vorher / Nachher
left: PDF danach | Kein gemeinsamer Moment im Raum.
right: Live-Sync | Alle sind auf deiner Folie.

---

type: timeline
# Ablauf
- 00:00: QR öffnen
- 00:15: Alle live
- 05:00: Recap-Link teilen

---

# Bild-Folie
Bild per Upload oder Markdown einbetten:

![](https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?w=900)
`;

export const TEMPLATES: Record<string, { label: string; source: string }> = {
	narrative: {
		label: 'Narrative Arc',
		source: `Hook
# Die eine Sache, die hängen bleiben soll
Warum das jetzt relevant ist.

---

Problem
# Was gerade nicht funktioniert
Ein konkreter Schmerz, keine Liste.

---

Proof
# Der Beweis
Zahl, Beispiel oder Demo-Moment.

---

CTA
# Was als Nächstes passiert
Ein klarer nächster Schritt.`
	},
	pitch: {
		label: 'Pitch',
		source: `Setup
# Warum jetzt?
Der Kontext in einem Satz.

---

type: compare
# Alte Welt / Neue Welt
left: Heute | Was bremst.
right: Mit uns | Was einfacher wird.

---

type: number
# 3× schneller
Der eine messbare Vorteil.

---

Decision
# Entscheidung
Was wir heute brauchen.`
	},
	update: {
		label: 'Update',
		source: `Status
# Wo wir stehen
Kurz, konkret, nicht defensiv.

---

type: timeline
# Fortschritt
- Done: Was fertig ist
- Now: Was gerade passiert
- Next: Was als Nächstes kommt

---

Risiko
# Worauf wir achten müssen
Ein echtes Risiko + Umgang.

---

Ask
# Was ich brauche
Eine klare Bitte.`
	}
};
