#!/usr/bin/env python3
"""Generate the animated README graphics (light + dark).

Run:  python3 tools/readme/build.py   -> writes docs/assets/readme/*.svg

The visual language follows the maintainer's GitHub profile: warm neutral
palette, Geist for text, Space Mono for labels/data, 12px cards with a 1px
border. Fonts (SIL OFL, see tools/readme/fonts/OFL-*.txt) are embedded as
data URIs because an SVG rendered via <img> cannot load external fonts.
eigen.beam's own signature accent (lime, see docs/design-system.md) marks
the LIVE state.
"""
import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONTS = HERE / "fonts"
OUT = HERE.parent.parent / "docs" / "assets" / "readme"

THEMES = {
    "light": dict(page="#f9f8f6", card="#ffffff", section="#f5f4f1", border="#e8e5e0",
                  text="#1a1a1a", secondary="#5e5b56", muted="#6f6a64",
                  primary="#1d48c0", link="#1d48c0", primary_light="#f0f3fb",
                  success="#16a34a", idle="#d9d6d0", grid_op="0.55",
                  lime="#c8f250", lime_ink="#1a1a1a"),
    "dark": dict(page="#161514", card="#1e1d1b", section="#252422", border="#333130",
                 text="#edebe8", secondary="#a8a49e", muted="#98938c",
                 primary="#4d6fd0", link="#7e97e3", primary_light="#1e2a44",
                 success="#16a34a", idle="#3d3a36", grid_op="0.7",
                 lime="#c8f250", lime_ink="#161514"),
}

MONO_ADV = 0.612  # Space Mono advance width / em


def b64(name):
    return base64.b64encode((FONTS / name).read_bytes()).decode()


def font_css(geist=True, mono=True, mono_bold=False):
    css = []
    if geist:
        css.append("@font-face{font-family:'Geist';font-weight:100 900;"
                   f"src:url(data:font/woff2;base64,{b64('geist-latin-variable.woff2')}) format('woff2');}}")
    if mono:
        css.append("@font-face{font-family:'Space Mono';font-weight:400;"
                   f"src:url(data:font/woff2;base64,{b64('space-mono-latin-400.woff2')}) format('woff2');}}")
    if mono_bold:
        css.append("@font-face{font-family:'Space Mono';font-weight:700;"
                   f"src:url(data:font/woff2;base64,{b64('space-mono-latin-700.woff2')}) format('woff2');}}")
    return "\n".join(css)


BASE_CSS = """
.sans{font-family:'Geist',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}
.mono{font-family:'Space Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:.25}}
.live{animation:blink 1.6s steps(1) infinite}
@media (prefers-reduced-motion: reduce){*{animation:none!important}
.in,.w0,.pfx{opacity:1!important;transform:none!important}.cur{visibility:visible!important}}
"""


def svg(w, h, title, style, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{title}"><title>{title}</title>'
            f'<style>{style}</style>{body}</svg>\n')


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def window(a, b):
    """values/keyTimes that show an element only during [a, b) of a discrete cycle."""
    if a <= 0:
        return "1;0", f"0;{b:.3f}"
    return "0;1;0", f"0;{a:.3f};{b:.3f}"


def slide_frames(t, x, y, w, slides, dur, begin=0.0, scale=1.0):
    """A phone screen whose content block changes per slide, discretely."""
    out = []
    for s in range(slides):
        vals, keys = window(s / slides, (s + 1) / slides)
        op = "1" if s == 0 else "0"
        h1 = (10 + s * 6) * scale
        out.append(f'<g opacity="{op}"><animate attributeName="opacity" values="{vals}" keyTimes="{keys}" '
                   f'begin="{begin:.2f}s" dur="{dur}s" repeatCount="indefinite" calcMode="discrete"/>'
                   f'<rect x="{x}" y="{y}" width="{w*0.62:.1f}" height="{4*scale:.1f}" rx="1" fill="{t["muted"]}" opacity=".6"/>'
                   f'<rect x="{x}" y="{y+8*scale:.1f}" width="{w:.1f}" height="{h1:.1f}" rx="{2*scale:.1f}" fill="{t["primary"]}" opacity=".88"/>'
                   f'<rect x="{x}" y="{y+12*scale+h1:.1f}" width="{w*0.8:.1f}" height="{3*scale:.1f}" rx="1" fill="{t["idle"]}"/>'
                   f'<rect x="{x}" y="{y+18*scale+h1:.1f}" width="{w*0.55:.1f}" height="{3*scale:.1f}" rx="1" fill="{t["idle"]}"/>'
                   f'</g>')
    return "".join(out)


# ---------------------------------------------------------------- header
def header(t):
    W, H = 1200, 340
    words = ["client pitches.", "offsites.", "standing meetings.", "rooms without a screen."]
    n = len(words)
    slot = 3.2
    cycle = slot * n
    word_css = []
    for i, _ in enumerate(words):
        a = i / n * 100
        b = (i + 1) / n * 100
        word_css.append(
            f"@keyframes w{i}{{0%,{max(a-0.01,0):.2f}%{{opacity:0;transform:translateY(10px)}}"
            f"{a+1.5:.2f}%,{b-2:.2f}%{{opacity:1;transform:translateY(0)}}"
            f"{b-0.5:.2f}%,100%{{opacity:0;transform:translateY(-10px)}}}}"
            f".w{i}{{opacity:0;animation:w{i} {cycle}s infinite}}")
    style = font_css(mono_bold=True) + BASE_CSS + "".join(word_css) + """
@keyframes ring{0%{r:30;opacity:.5}100%{r:120;opacity:0}}
.ring{animation:ring 2.4s ease-out infinite}
.ring2{animation-delay:1.2s}
@keyframes dash{to{stroke-dashoffset:-24}}
.flow{stroke-dasharray:3 9;animation:dash 1.2s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.in{opacity:0;animation:rise .7s ease-out forwards}
.d1{animation-delay:.1s}.d2{animation-delay:.3s}.d3{animation-delay:.5s}
"""
    g = [f'<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">'
         f'<circle cx="2" cy="2" r="1.1" fill="{t["border"]}"/></pattern>'
         f'<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="{t["page"]}" stop-opacity="1"/>'
         f'<stop offset=".55" stop-color="{t["page"]}" stop-opacity=".2"/>'
         f'<stop offset="1" stop-color="{t["page"]}" stop-opacity="0"/></linearGradient></defs>',
         f'<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="12" fill="{t["page"]}" stroke="{t["border"]}"/>',
         f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="12" fill="url(#dots)" opacity="{t["grid_op"]}"/>',
         f'<rect x="1" y="1" width="720" height="{H-2}" rx="12" fill="url(#fade)"/>']

    slides, dur = 4, 8
    # presenter phone
    px, py, pw, ph = 860, 70, 92, 176
    cx, cy = px + pw / 2, py + ph / 2
    g.append(f'<circle class="ring" cx="{cx}" cy="{cy}" r="30" fill="none" stroke="{t["primary"]}" stroke-width="1.5"/>')
    g.append(f'<circle class="ring ring2" cx="{cx}" cy="{cy}" r="30" fill="none" stroke="{t["primary"]}" stroke-width="1.5"/>')
    # audience phones
    aud = [(724, 78), (748, 200), (1030, 70), (1062, 178), (984, 240)]
    for k, (ax, ay) in enumerate(aud):
        path = f"M{cx},{cy} L{ax+22},{ay+40}"
        g.append(f'<path d="{path}" stroke="{t["border"]}" stroke-width="1.5"/>')
        g.append(f'<path class="flow" d="{path}" stroke="{t["primary"]}" stroke-width="1.5" opacity=".5"/>')
    for k, (ax, ay) in enumerate(aud):
        g.append(f'<rect x="{ax}" y="{ay}" width="44" height="80" rx="8" fill="{t["card"]}" stroke="{t["border"]}"/>')
        g.append(slide_frames(t, ax + 7, ay + 12, 30, slides, dur, begin=0.12 + k * 0.05, scale=0.8))
        g.append(f'<circle cx="{ax+22}" cy="{ay+71}" r="2.2" fill="{t["success"]}"/>')
    g.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="14" fill="{t["card"]}" stroke="{t["primary"]}" stroke-width="2"/>')
    g.append(slide_frames(t, px + 12, py + 26, pw - 24, slides, dur, scale=1.5))
    for s in range(slides):
        vals, keys = window(s / slides, (s + 1) / slides)
        op = "1" if s == 0 else "0"
        g.append(f'<text class="mono" x="{cx}" y="{py+ph-16}" text-anchor="middle" font-size="11" fill="{t["muted"]}" opacity="{op}">'
                 f'<animate attributeName="opacity" values="{vals}" keyTimes="{keys}" dur="{dur}s" '
                 f'repeatCount="indefinite" calcMode="discrete"/>{s+1} / {slides}</text>')
    # LIVE pill
    g.append(f'<rect x="{px+8}" y="{py-30}" width="76" height="22" rx="11" fill="{t["card"]}" stroke="{t["border"]}"/>'
             f'<circle class="live" cx="{px+22}" cy="{py-19}" r="4" fill="{t["lime"]}" stroke="{t["lime_ink"]}" stroke-opacity=".25"/>'
             f'<text class="mono" x="{px+32}" y="{py-15}" font-size="10.5" letter-spacing="1.2" fill="{t["text"]}">LIVE</text>')
    g.append(f'<text class="mono" x="{cx}" y="{py+ph+52}" text-anchor="middle" font-size="10" letter-spacing="1.5" fill="{t["muted"]}">SSE · &lt;80ms</text>')

    x0 = 64
    g.append(f'<text class="mono in d1" x="{x0}" y="112" font-size="13" letter-spacing="2.2" fill="{t["link"]}">'
             f'OPEN SOURCE · MIT · MOBILE-FIRST</text>')
    g.append(f'<g class="in d2"><text class="sans" x="{x0-3}" y="184" font-size="68" font-weight="640" letter-spacing="-2.2" '
             f'fill="{t["text"]}">eigen<tspan fill="{t["link"]}">.</tspan>beam</text></g>')
    g.append(f'<g class="in d3"><text class="sans" x="{x0}" y="234" font-size="25" fill="{t["secondary"]}">Your slides on every phone, for</text>')
    for i, w in enumerate(words):
        g.append(f'<text class="mono w{i}" style="transform-box:fill-box" x="{x0}" y="272" font-size="23" '
                 f'font-weight="700" fill="{t["link"]}">{w}</text>')
    g.append('</g>')
    return svg(W, H, "eigen.beam: present from your phone, the audience follows live on theirs", style, "".join(g))


# ---------------------------------------------------------------- feature cards
def features(t):
    W, H = 1200, 330
    cw, gap, ch = 282, 24, 328
    style = font_css() + BASE_CSS + """
@keyframes float{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-70px);opacity:0}}
.fl{animation:float 3s ease-out infinite}
@keyframes type{from{width:0}to{width:var(--w)}}
"""
    cards = [
        ("01", "Live sync", "Every phone on your slide,", "pushed over SSE.", ["SSE", "LOCKSTEP"]),
        ("02", "Mobile authoring", "Markdown, PDF or PPTX in,", "9:16 slides out.", ["MARKDOWN", "IMPORT"]),
        ("03", "Audience signals", "Reactions and questions", "flow back to you.", ["REACTIONS", "Q&amp;A"]),
        ("04", "Replay + follow-up", "Heatmap, summary and", "a sharper deck v2.", ["REPLAY", "MCP"]),
    ]
    stages = [stage_sync, stage_authoring, stage_signals, stage_replay]
    g = []
    for i, (num, title, l1, l2, tags) in enumerate(cards):
        x = i * (cw + gap)
        g.append(f'<g transform="translate({x},1)">')
        g.append(f'<rect x=".5" y=".5" width="{cw-1}" height="{ch-3}" rx="12" fill="{t["card"]}" stroke="{t["border"]}"/>')
        g.append(f'<text class="mono" x="22" y="36" font-size="11" letter-spacing="1.6" fill="{t["muted"]}">{num} /</text>')
        g.append(f'<circle class="live" cx="{cw-30}" cy="32" r="2.5" fill="{t["success"]}"/>')
        g.append(f'<rect x="22" y="54" width="{cw-44}" height="120" rx="8" fill="{t["section"]}"/>')
        g.append(f'<g transform="translate(22,54)">{stages[i](t, cw-44)}</g>')
        g.append(f'<text class="sans" x="22" y="218" font-size="21" font-weight="620" letter-spacing="-.4" fill="{t["text"]}">{title}</text>')
        g.append(f'<text class="sans" x="22" y="250" font-size="14" fill="{t["secondary"]}">{l1}</text>')
        g.append(f'<text class="sans" x="22" y="270" font-size="14" fill="{t["secondary"]}">{l2}</text>')
        tx = 22
        for tag in tags:
            w = len(tag.replace("&amp;", "&")) * 10 * MONO_ADV + 16
            g.append(f'<rect x="{tx:.0f}" y="288" width="{w:.0f}" height="20" rx="4" fill="{t["primary_light"]}"/>')
            g.append(f'<text class="mono" x="{tx+8:.0f}" y="302" font-size="10" fill="{t["link"]}">{tag}</text>')
            tx += w + 6
        g.append('</g>')
    return svg(W, H, "Features: live sync, mobile authoring, audience signals, replay and follow-up", style, "".join(g))


def stage_sync(t, w):
    out = []
    px, py = 30, 14
    slides, dur = 4, 8
    out.append(f'<rect x="{px}" y="{py}" width="50" height="92" rx="8" fill="{t["card"]}" stroke="{t["primary"]}" stroke-width="1.5"/>')
    out.append(slide_frames(t, px + 7, py + 12, 36, slides, dur))
    for k in range(2):
        out.append(f'<circle cx="{px+50}" cy="{py+46}" r="6" fill="none" stroke="{t["primary"]}" stroke-width="1.2" opacity="0">'
                   f'<animate attributeName="r" values="6;48" dur="2s" begin="{k}s" repeatCount="indefinite"/>'
                   f'<animate attributeName="opacity" values=".6;0" dur="2s" begin="{k}s" repeatCount="indefinite"/></circle>')
    for j in range(3):
        ax, ay = 118 + j * 34, 28 + (j % 2) * 10
        out.append(f'<rect x="{ax}" y="{ay}" width="26" height="48" rx="5" fill="{t["card"]}" stroke="{t["border"]}"/>')
        out.append(slide_frames(t, ax + 4, ay + 6, 18, slides, dur, begin=0.15 + j * 0.07, scale=0.55))
        out.append(f'<circle cx="{ax+13}" cy="{ay+42}" r="2" fill="{t["success"]}"/>')
    out.append(f'<text class="mono" x="{w-14}" y="108" text-anchor="end" font-size="10" fill="{t["link"]}">&lt;80ms</text>')
    return "".join(out)


def stage_authoring(t, w):
    out = []
    # markdown source on the left, typed line by line
    src = ["# Q3 pitch", "---", "## Why now", "- 3 reasons", "---", "![chart]"]
    dur = 6
    for k, line in enumerate(src):
        y = 22 + k * 15
        a = k / (len(src) + 2)
        col = t["link"] if line.startswith("#") else (t["muted"] if line == "---" else t["secondary"])
        out.append(f'<text class="mono" x="14" y="{y}" font-size="10" fill="{col}" opacity="0">{esc(line)}'
                   f'<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;{a:.3f};{a+0.02:.3f};.92;1" '
                   f'dur="{dur}s" repeatCount="indefinite"/></text>')
    # arrow
    out.append(f'<path d="M104,60 h26 m-6,-5 l6,5 l-6,5" fill="none" stroke="{t["border"]}" stroke-width="1.5"/>')
    # phone with rendered slide
    fx = 150
    out.append(f'<rect x="{fx}" y="12" width="52" height="96" rx="8" fill="{t["card"]}" stroke="{t["border"]}"/>')
    out.append(f'<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.55;.62;.92;1" dur="{dur}s" repeatCount="indefinite"/>'
               f'<rect x="{fx+8}" y="30" width="26" height="4" rx="1" fill="{t["muted"]}" opacity=".6"/>'
               f'<rect x="{fx+8}" y="40" width="36" height="20" rx="2" fill="{t["primary"]}" opacity=".88"/>'
               f'<rect x="{fx+8}" y="66" width="30" height="3" rx="1" fill="{t["idle"]}"/>'
               f'<rect x="{fx+8}" y="73" width="22" height="3" rx="1" fill="{t["idle"]}"/></g>')
    out.append(f'<text class="mono" x="{w-14}" y="108" text-anchor="end" font-size="10" fill="{t["link"]}">9:16</text>')
    return "".join(out)


def stage_signals(t, w):
    out = []
    # presenter phone with a feed, reactions floating up from the audience
    fx = w / 2 - 26
    out.append(f'<rect x="{fx}" y="18" width="52" height="88" rx="8" fill="{t["card"]}" stroke="{t["primary"]}" stroke-width="1.5"/>')
    for k in range(3):
        y = 36 + k * 16
        out.append(f'<rect x="{fx+8}" y="{y}" width="{36 - k*6}" height="8" rx="2" fill="{t["primary_light"]}"/>')
    glyphs = [("+1", t["success"]), ("?", t["link"]), ("♥", t["primary"]), ("+1", t["success"]), ("!", t["link"])]
    for k, (gl, col) in enumerate(glyphs):
        x = 26 + k * ((w - 52) / (len(glyphs) - 1))
        if abs(x - w / 2) < 34:
            x += 40 if x > w / 2 else -40
        out.append(f'<g class="fl" style="animation-delay:{k*0.6:.1f}s;transform-box:fill-box">'
                   f'<circle cx="{x:.0f}" cy="100" r="9" fill="{t["card"]}" stroke="{t["border"]}"/>'
                   f'<text class="mono" x="{x:.0f}" y="104" text-anchor="middle" font-size="10" fill="{col}">{gl}</text></g>')
    out.append(f'<text class="mono" x="14" y="18" font-size="10" fill="{t["muted"]}">12 live</text>')
    return "".join(out)


def stage_replay(t, w):
    out = []
    vals = [0.9, 0.75, 1.0, 0.55, 0.4, 0.7, 0.35, 0.6]
    n = len(vals)
    bw = (w - 28 - (n - 1) * 6) / n
    base = 92
    for k, v in enumerate(vals):
        x = 14 + k * (bw + 6)
        h = 64 * v
        col = t["primary"] if v >= 0.9 else t["idle"]
        out.append(f'<rect x="{x:.1f}" y="{base-h:.1f}" width="{bw:.1f}" height="{h:.1f}" rx="3" fill="{col}">'
                   f'<animate attributeName="height" values="0;{h:.1f};{h:.1f}" keyTimes="0;.3;1" dur="5s" begin="{k*0.08:.2f}s" repeatCount="indefinite"/>'
                   f'<animate attributeName="y" values="{base};{base-h:.1f};{base-h:.1f}" keyTimes="0;.3;1" dur="5s" begin="{k*0.08:.2f}s" repeatCount="indefinite"/></rect>')
    out.append(f'<line x1="14" x2="{w-14}" y1="{base+.5}" y2="{base+.5}" stroke="{t["border"]}"/>')
    out.append(f'<text class="mono" x="14" y="108" font-size="10" fill="{t["muted"]}">attention / slide</text>')
    out.append(f'<text class="mono" x="{w-14}" y="18" text-anchor="end" font-size="10" fill="{t["link"]}">v2 draft</text>')
    return "".join(out)


# ---------------------------------------------------------------- terminal
def terminal(t):
    W = 1200
    fs = 15
    adv = fs * MONO_ADV
    lh = 26
    lines = [
        ("$", "git clone https://github.com/onetechgroupll/eigen-beam && cd eigen-beam"),
        ("$", "bun install && bun run dev"),
        (">", "ready on http://localhost:5173 — no database, no keys needed"),
        ("$", "open http://localhost:5173  # tap \"Live-Sync testen\""),
        (">", "presenter remote ready · viewer link + QR shown"),
        (">", "3 phones joined · slide 4 / 12 · all in sync"),
    ]
    H = 70 + lh * len(lines) + 36
    css = [font_css(geist=False, mono_bold=True), BASE_CSS]
    t0 = 0.4
    g = [f'<clipPath id="win"><rect x="0" y="0" width="{W}" height="{H}" rx="12"/></clipPath>',
         f'<g clip-path="url(#win)"><rect width="{W}" height="{H}" fill="{t["card"]}"/>'
         f'<rect width="{W}" height="40" fill="{t["section"]}"/></g>',
         f'<path d="M0,40.5 H{W}" stroke="{t["border"]}"/>',
         f'<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="12" fill="none" stroke="{t["border"]}"/>']
    for k in range(3):
        g.append(f'<circle cx="{24+k*18}" cy="20.5" r="5.5" fill="{t["idle"]}"/>')
    g.append(f'<text class="mono" x="{W/2}" y="25" text-anchor="middle" font-size="12" fill="{t["muted"]}">quickstart — ~/eigen-beam</text>')
    g.append('<defs>')
    for i, (p, txt) in enumerate(lines):
        y = 76 + i * lh
        x = 32 + 2 * adv
        width = len(txt) * adv + 16
        steps = len(txt)
        dur = 0.03 * steps if p == "$" else 0.35
        css.append(f"@keyframes p{i}{{to{{opacity:1}}}}.p{i}{{opacity:0;animation:p{i} .01s {t0:.2f}s forwards}}")
        if p == "$":
            vals = ";".join(f"{min(k * adv, width):.1f}" for k in range(steps + 1)) + f";{width:.1f}"
            anim = (f'<animate attributeName="width" values="{vals}" begin="{t0:.2f}s" dur="{dur:.2f}s" '
                    f'calcMode="discrete" fill="freeze"/>')
        else:
            anim = (f'<animate attributeName="width" values="0;{width:.1f}" begin="{t0:.2f}s" dur="{dur:.2f}s" '
                    f'calcMode="spline" keySplines=".2 .7 .3 1" keyTimes="0;1" fill="freeze"/>')
        g.append(f'<clipPath id="cl{i}"><rect x="{x}" y="{y-fs-2}" width="0" height="{lh}">{anim}</rect></clipPath>')
        t0 += dur + (0.25 if p == "$" else 0.55)
    g.append('</defs>')
    for i, (p, txt) in enumerate(lines):
        y = 76 + i * lh
        pc = t["success"] if p == "$" else t["muted"]
        tc = t["text"] if p == "$" else (t["link"] if i == len(lines) - 1 else t["secondary"])
        fw = ' font-weight="700"' if p == "$" else ""
        g.append(f'<text class="mono pfx p{i}" x="32" y="{y}" font-size="{fs}" fill="{pc}">{p}</text>')
        g.append(f'<text class="mono" clip-path="url(#cl{i})" x="{32+2*adv}" y="{y}" font-size="{fs}"{fw} '
                 f'fill="{tc}" xml:space="preserve">{esc(txt)}</text>')
    y = 76 + len(lines) * lh
    css.append(f"@keyframes bl{{0%,49%{{opacity:1}}50%,100%{{opacity:0}}}}"
               f"@keyframes on{{to{{visibility:visible}}}}"
               f".cur{{visibility:hidden;animation:on .01s {t0:.2f}s forwards, bl 1s steps(1) {t0:.2f}s infinite}}")
    g.append(f'<text class="mono" x="32" y="{y}" font-size="{fs}" fill="{t["success"]}">$</text>')
    g.append(f'<rect class="cur" x="{32+2*adv}" y="{y-fs+2}" width="{adv:.1f}" height="{fs+2}" fill="{t["link"]}"/>')
    return svg(W, H, "Quickstart: clone, bun install, bun run dev, open the presenter and share the viewer link",
               "".join(css), "".join(g))


# ---------------------------------------------------------------- buttons
def button(t, label, icon):
    fs = 14
    w = int(52 + len(label) * fs * 0.56)
    H = 40
    css = font_css(mono=False) + BASE_CSS
    ic = {
        "live": (f'<circle class="live" cx="23" cy="20" r="5" fill="{t["lime"]}" stroke="{t["lime_ink"]}" stroke-opacity=".25"/>'),
        "server": (f'<rect x="15" y="12" width="16" height="7" rx="2" fill="none" stroke="{t["link"]}" stroke-width="1.4"/>'
                   f'<rect x="15" y="21" width="16" height="7" rx="2" fill="none" stroke="{t["link"]}" stroke-width="1.4"/>'
                   f'<circle cx="19" cy="15.5" r="1.1" fill="{t["link"]}"/><circle cx="19" cy="24.5" r="1.1" fill="{t["link"]}"/>'),
        "docs": (f'<rect x="16" y="11" width="14" height="18" rx="2" fill="none" stroke="{t["link"]}" stroke-width="1.4"/>'
                 f'<line x1="19" x2="27" y1="16" y2="16" stroke="{t["link"]}" stroke-width="1.2"/>'
                 f'<line x1="19" x2="27" y1="20" y2="20" stroke="{t["link"]}" stroke-width="1.2"/>'
                 f'<line x1="19" x2="24" y1="24" y2="24" stroke="{t["link"]}" stroke-width="1.2"/>'),
    }[icon]
    body = (f'<rect x=".5" y=".5" width="{w-1}" height="{H-1}" rx="8" fill="{t["card"]}" stroke="{t["border"]}"/>'
            + ic + f'<text class="sans" x="42" y="25" font-size="{fs}" font-weight="560" fill="{t["text"]}">{label}</text>')
    return svg(w, H, label, css, body)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    def write(name, content):
        p = OUT / name
        p.write_text(content, encoding="utf-8")
        print(f"{p.relative_to(HERE.parent.parent)}  {p.stat().st_size/1024:.0f} KB")

    for mode, t in THEMES.items():
        write(f"header-{mode}.svg", header(t))
        write(f"features-{mode}.svg", features(t))
        write(f"quickstart-{mode}.svg", terminal(t))
        write(f"btn-demo-{mode}.svg", button(t, "Try the live demo", "live"))
        write(f"btn-selfhost-{mode}.svg", button(t, "Self-host it", "server"))
        write(f"btn-docs-{mode}.svg", button(t, "Read the docs", "docs"))


if __name__ == "__main__":
    main()
