#!/usr/bin/env python3
"""Draws the architecture map (docs/architecture/v1.svg) in the Ganeko Notebook style:
solid colored boxes with white text, navy captions, dashed arrows, solid pill labels.
Run: python3 docs/architecture/draw.py  (PNG: Chrome headless, see bottom)"""
import html, json, os

# Brand marks from Simple Icons (CC0, https://simpleicons.org), filled; the rest are Lucide-style
# line icons (ISC), like the Ganeko Notebook's icon set.
BRANDS = json.load(open(os.path.join(os.path.dirname(__file__), "brands.json")))
LUCIDE = {
    "cpu": '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "branch": '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    "queue": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    "workflow": '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    "database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    "key": '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "sparkles": '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    "terminal": '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
    "chat": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
    "laptop": '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    "smartphone": '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    "play": '<polygon points="6 3 20 12 6 21 6 3"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    "music": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    "mic": '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
    "folder": '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "user": '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
}

def glyph(name, x, y, size=26, color="#fff"):
    """A white icon at (x, y): a brand mark (filled) or a Lucide icon (stroked)."""
    k = size / 24
    if name in BRANDS:
        return f'<path transform="translate({x},{y}) scale({k})" d="{BRANDS[name]}" fill="{color}"/>'
    return f'<g transform="translate({x},{y}) scale({k})" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{LUCIDE[name]}</g>'

C = dict(indigo="#5B5BD6", purple="#8E6FCB", teal="#3FA796", green="#2F8A5B", red="#D1495B", orange="#E08A3C", slate="#4A5866")
DARK = dict(indigo="#3B3BA8", purple="#5E4396", teal="#22705F", green="#1F5E3D", red="#9C2C3B", orange="#9A5512", slate="#2E3944")
NAVY, MUTED, BG, LINE = "#1B2632", "#4A5D72", "#FCFAF7", "#677A8E"
W, H = 220, 64

def box(x, y, title, sub, color, caption=None, w=W, icons=(), kind="service"):
    """kind: service = managed resource (solid); part = a class inside the Worker (outlined); api = no resource, only called (dashed)."""
    ink = "#fff" if kind == "service" else (DARK[color] if kind == "part" else C[color])
    if kind == "service":
        t = f'<rect x="{x}" y="{y}" width="{w}" height="{H}" rx="6" fill="{C[color]}"/>'
    elif kind == "part":
        t = f'<rect x="{x}" y="{y}" width="{w}" height="{H}" rx="6" fill="{C[color]}" fill-opacity="0.2"/>'
    else:
        t = f'<rect x="{x}" y="{y}" width="{w}" height="{H}" rx="6" fill="#fff" stroke="{C[color]}" stroke-width="2" stroke-dasharray="5 4"/>'
    # icons on the left; text centred in the space that's left
    for i, name in enumerate(icons):
        t += glyph(name, x + 14 + i * 32, y + 19, color=ink)
    left = x + (14 + 32 * len(icons) if icons else 0)
    cx = left + (x + w - left) / 2
    t += f'<text x="{cx}" y="{y + 27}" text-anchor="middle" class="t" style="fill:{ink}">{html.escape(title)}</text>'
    t += f'<text x="{cx}" y="{y + 47}" text-anchor="middle" class="s" style="fill:{ink}">{html.escape(sub)}</text>'
    if caption:
        t += f'<text x="{x + w/2}" y="{y + H + 18}" text-anchor="middle" class="c">{html.escape(caption)}</text>'
    return t

def devices(cx, y, names, label):
    """A caption with small device icons before it, centred under a box."""
    tw = 6.6 * len(label); iw = 20 * len(names); x = cx - (iw + 6 + tw) / 2
    t = "".join(f'<g transform="translate({x + i*20},{y - 13}) scale(0.67)" fill="none" stroke="{MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{LUCIDE[n]}</g>' for i, n in enumerate(names))
    return t + f'<text x="{x + iw + 6}" y="{y}" class="c">{html.escape(label)}</text>'

FLOW = dict(send="#5B5BD6", bg="#E08A3C", read="#2F8A5B", sweep="#8E6FCB", delete="#D1495B")
FLOW_MARKERS = "".join(f'<marker id="m-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{v}"/></marker>' for k, v in FLOW.items())

def legend(x, y, items):
    """Flow names: a short coloured line and its name, in a row."""
    t = ""
    for k, name in items:
        t += f'<path d="M{x},{y} L{x+28},{y}" class="a" style="stroke:{FLOW[k]};stroke-width:2.2"/><text x="{x+36}" y="{y+4}" class="lg">{html.escape(name)}</text>'
        x += 50 + 7.4 * len(name)
    return t

def arrow(points, label=None, at=0.5, both=False, flow=None, dy=0):
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    style = f' style="stroke:{FLOW[flow]};stroke-width:2.2"' if flow else ""
    end = f"m-{flow}" if flow else "m"
    t = f'<path d="{d}" class="a"{style} marker-end="url(#{end})"{" marker-start=\"url(#ms)\"" if both else ""}/>'
    if label:
        # label on the longest segment
        segs = list(zip(points, points[1:]))
        (x1, y1), (x2, y2) = max(segs, key=lambda s: abs(s[1][0]-s[0][0]) + abs(s[1][1]-s[0][1]))
        lx, ly = x1 + (x2 - x1) * at, y1 + (y2 - y1) * at + dy  # dy: lift the pill off a short arrow
        w = 7.2 * len(label) + 16
        t += f'<rect x="{lx - w/2}" y="{ly - 11}" width="{w}" height="22" rx="11" fill="{FLOW[flow] if flow else NAVY}"/>'
        t += f'<text x="{lx}" y="{ly + 4}" text-anchor="middle" class="p">{html.escape(label)}</text>'
    return t

def svg(width, height, title, subtitle, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" font-family="Onest, Inter, system-ui, sans-serif">
<defs>
<marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{LINE}"/></marker>
{FLOW_MARKERS}
<marker id="ms" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{LINE}"/></marker>
<style>.t{{fill:#fff;font-size:15px;font-weight:700}}.s{{fill:#fff;font-size:12px;opacity:.92}}.c{{fill:{MUTED};font-size:12px}}
.a{{fill:none;stroke:{LINE};stroke-width:1.6;stroke-dasharray:6 5}}.p{{fill:#fff;font-size:11.5px;font-weight:600}}
.h{{fill:{NAVY};font-size:22px;font-weight:800}}.hs{{fill:{MUTED};font-size:13px}}.g{{fill:none;stroke:#E6D5C1;stroke-width:1.5;stroke-dasharray:2 4}}.gl{{fill:#8C6A43;font-size:12px;font-weight:600}}.lg{{fill:{NAVY};font-size:13px;font-weight:600}}.ft{{font-size:12px;font-weight:700;letter-spacing:.06em}}</style>
</defs>
<rect width="100%" height="100%" fill="{BG}"/>
<text x="32" y="44" class="h">{html.escape(title)}</text><text x="32" y="66" class="hs">{html.escape(subtitle)}</text>
{body}
</svg>'''

# ---------- v1 ----------
# Columns: outside (A) | Worker parts (X1, X2) | managed services (X3).
# Rows: 1 = send, 2 = transcription, 3 = owner and agent read, 4 = hourly sweep.
A, X1, X2, X3 = 40, 440, 800, 1200
R1, R2, R3, R4 = 150, 310, 470, 630
v = []
v.append('<rect x="376" y="96" width="1084" height="684" rx="10" class="g"/>' + f'<path transform="translate(390,102) scale(0.75)" d="{BRANDS["cloudflare"]}" fill="#F38020"/>' + '<text x="414" y="116" class="gl">CLOUDFLARE</text>')
v.append('<rect x="24" y="108" width="252" height="146" rx="10" class="g"/><text x="38" y="128" class="gl">SUBSCRIBER</text>')
v.append(box(A, R1, "Phone", "record · distort · compress", "slate", icons=("mic",)) + devices(A + 110, R1 + 84, ("smartphone",), "pt-BR site, no sign-in"))
v.append('<rect x="24" y="428" width="252" height="256" rx="10" class="g"/><text x="38" y="448" class="gl">OWNER</text>')
v.append(box(A, R3, "You", "panel in the browser", "slate", icons=("user",)) + devices(A + 110, R3 + 84, ("laptop",), "Cloudflare Access"))
v.append(box(A, R3 + 120, "AI agent", "MCP client · the editor", "slate", "Bearer token", icons=("claude",)))
# the Worker and its four parts
v.append('<rect x="410" y="134" width="640" height="590" rx="8" fill="#5B5BD6" fill-opacity="0.06" stroke="#5B5BD6" stroke-width="1.5" stroke-dasharray="6 4"/>'
         '<text x="424" y="712" class="gl" style="fill:#5B5BD6">WORKER</text>')
v.append(box(X1, R1, "Submit API", "Turnstile · upload URL", "indigo", icons=("workers",), kind="part"))
v.append(box(X2, R2, "Transcriber", "queue consumer", "indigo", icons=("workers",), kind="part"))
v.append(box(X1, R3, "Panel + MCP", "status · zip · search", "indigo", icons=("workers",), kind="part"))
v.append(box(X2, R4, "Sweep", "Cron · every hour", "indigo", icons=("clock",), kind="part"))
# managed services
v.append(box(X3, R1, "Queue", "one job per submission", "orange", icons=("queue",)))
v.append(box(X3, R2, "Workers AI", "Whisper · tags LLM", "teal", icons=("sparkles",), kind="api"))
v.append(box(X3, R3, "D1", "submissions · text · tags", "red", icons=("database",)))
v.append(box(X3, R4, "R2", "incoming/ → media/", "green", icons=("folder",)))
# 1. send
v.append(arrow([(260, R1 + 32), (440, R1 + 32)], "upload URL", flow="send", dy=-22))
v.append(arrow([(260, R1 + 32), (440, R1 + 32)], flow="send"))
v.append(arrow([(150, R1), (150, 84), (1500, 84), (1500, R4 + 32), (1420, R4 + 32)], "direct upload to incoming/", at=0.5, flow="send"))
v.append(arrow([(660, R1 + 52), (720, R1 + 52), (720, R3 + 14), (1200, R3 + 14)], "create submission", at=0.62, flow="send"))
v.append(arrow([(660, R1 + 24), (1200, R1 + 24)], "enqueue", flow="bg", dy=-22))
v.append(arrow([(660, R1 + 24), (1200, R1 + 24)], flow="bg"))
# 2. transcription
v.append(arrow([(1310, R1 + 64), (1310, R1 + 112), (960, R1 + 112), (960, R2)], "consume", at=0.5, flow="bg"))
v.append(arrow([(1020, R2 + 32), (1200, R2 + 32)], "transcribe · tag", flow="bg", dy=-22))
v.append(arrow([(1020, R2 + 32), (1200, R2 + 32)], flow="bg"))
v.append(arrow([(960, R2 + 64), (960, R2 + 116), (1310, R2 + 116), (1310, R3)], "text + tags", at=0.6, flow="bg"))
# 3. read
v.append(arrow([(260, R3 + 32), (440, R3 + 32)], "Access", flow="read", dy=-22))
v.append(arrow([(260, R3 + 32), (440, R3 + 32)], flow="read"))
v.append(arrow([(260, R3 + 152), (340, R3 + 152), (340, R3 + 52), (440, R3 + 52)], "MCP", at=0.5, flow="read"))
v.append(arrow([(660, R3 + 40), (1200, R3 + 40)], "list · search · tags", flow="read", dy=22))
v.append(arrow([(660, R3 + 40), (1200, R3 + 40)], flow="read"))
v.append(arrow([(560, R3 + 64), (560, 750), (1310, 750), (1310, R4 + 64)], "listen · zip · download", at=0.45, flow="read"))
# 4. sweep
v.append(arrow([(1020, R4 + 32), (1200, R4 + 32)], "validate · clean", flow="sweep", dy=-22))
v.append(arrow([(1020, R4 + 32), (1200, R4 + 32)], flow="sweep"))
v.append(arrow([(910, R4), (910, R4 - 40), (1150, R4 - 40), (1150, R3 + 56), (1200, R3 + 56)], flow="sweep"))
v.append(legend(40, 812, [("send", "send"), ("bg", "transcription"), ("read", "read"), ("sweep", "hourly sweep")]))
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "v1.svg")
open(out, "w").write(svg(1540, 840, "Coffee Time · v1", "One Worker on Cloudflare: subscribers upload straight to R2, a queue transcribes, the owner and the AI agent read.", "".join(v)))
print("ok")
