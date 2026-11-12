#!/usr/bin/env python3
"""One map per flow (docs/architecture/flows/*.svg), in the same style as v1.svg.
Numbers on the arrows give the order. Run: python3 docs/architecture/draw_flows.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from draw import box, arrow, svg  # also redraws v1, unchanged

OUT = os.path.join(os.path.dirname(__file__), "flows")
def save(name, w, h, title, sub, parts):
    open(os.path.join(OUT, name + ".svg"), "w").write(svg(w, h, title, sub, "".join(parts)))

phone = lambda x, y, cap=None: box(x, y, "Phone", "record · distort · compress", "slate", cap, icons=("mic",))
api = lambda x, y, cap=None: box(x, y, "Submit API", "Worker · fetch()", "indigo", cap, icons=("workers",), kind="part")
panel = lambda x, y, cap=None: box(x, y, "Panel + MCP", "Worker · fetch()", "indigo", cap, icons=("workers",), kind="part")
d1 = lambda x, y, cap=None: box(x, y, "D1", "submissions · text · tags", "red", cap, icons=("database",))
r2 = lambda x, y, cap=None: box(x, y, "R2", "incoming/ → media/", "green", cap, icons=("folder",))
queue = lambda x, y, cap=None: box(x, y, "Queue", "one job per submission", "orange", cap, icons=("queue",))

# 1. send
save("1-send", 1560, 500, "Flow 1 · Send a submission", "Compression and upload start as soon as a file is picked, while the form is filled in. Nothing is processed before Send.", [
    phone(40, 180), api(460, 180),
    d1(880, 60), r2(1300, 180), queue(880, 320),
    arrow([(260, 196), (460, 196)], "1. picked · Turnstile", flow="send"),
    arrow([(570, 180), (570, 92), (880, 92)], "2. draft · 6. new", at=0.6, flow="send"),
    arrow([(460, 228), (260, 228)], "3. signed URLs", flow="send"),
    arrow([(150, 270), (150, 440), (1410, 440), (1410, 244)], "4. upload in the background while the form is filled in", at=0.5, flow="send"),
    arrow([(230, 270), (230, 300), (500, 300), (500, 244)], "5. Send · form + consent", at=0.5, flow="send"),
    arrow([(680, 212), (1300, 212)], "6. check size + real type · move or delete", at=0.5, flow="send"),
    arrow([(640, 244), (640, 352), (880, 352)], "7. transcribe(id)", flow="bg"),
])

# 2. transcription
save("2-transcribe", 1160, 420, "Flow 2 · Transcription", "In the background, so the subscriber never waits; the text and the free-form tags feed search, filters and the agent.", [
    queue(40, 100, "fails → retries, then dead-letter"), box(460, 100, "Transcriber", "Worker · queue()", "indigo", icons=("workers",), kind="part"),
    box(880, 100, "Workers AI", "Whisper · LLM for tags", "teal", icons=("sparkles",), kind="api"),
    r2(460, 280), d1(880, 280),
    arrow([(260, 132), (460, 132)], "1. deliver", flow="bg"),
    arrow([(540, 164), (540, 280)], "2. read audio", flow="bg"),
    arrow([(680, 116), (880, 116)], "3. transcribe · 5. tag", flow="bg"),
    arrow([(880, 148), (680, 148)], "4. text · 6. tags", flow="bg"),
    arrow([(640, 164), (640, 222), (990, 222), (990, 280)], "7. save text + tags", at=0.6, flow="bg"),
])

# 3. read
save("3-read", 1160, 420, "Flow 3 · You and the agent read", "Same Worker part for both: Access for you in the browser, a Bearer token for the agent.", [
    box(40, 80, "You", "panel in the browser", "slate", icons=("user",)),
    box(40, 260, "AI agent", "MCP client · the editor", "slate", icons=("claude",)),
    panel(460, 170), d1(880, 80), r2(880, 260),
    arrow([(260, 112), (360, 112), (360, 186), (460, 186)], "1. Access", at=0.5, flow="read"),
    arrow([(260, 292), (360, 292), (360, 218), (460, 218)], "1. MCP · Bearer", at=0.5, flow="read"),
    arrow([(570, 170), (570, 112), (880, 112)], "2. list · search · tags · status", at=0.55, flow="read"),
    arrow([(570, 234), (570, 292), (880, 292)], "3. listen · zip (media + text)", at=0.55, flow="read"),
])

# 4. sweep
save("4-sweep", 1160, 460, "Flow 4 · Hourly sweep", "Finishes sends the phone never confirmed; deletes abandoned drafts after 24 h and failed sends after 7 days.", [
    box(40, 190, "Sweep", "Cron · every hour", "indigo", icons=("clock",), kind="part"),
    d1(460, 70), r2(460, 310, "drafts 24 h · failed 7 days"), queue(880, 190),
    arrow([(150, 190), (150, 102), (460, 102)], "1. find stuck · 3. set status", at=0.45, flow="sweep"),
    arrow([(150, 254), (150, 342), (460, 342)], "2. complete? move or delete", at=0.6, flow="sweep"),
    arrow([(260, 222), (880, 222)], "4. transcribe the valid ones", at=0.62, flow="bg"),
])

# 5. delete
save("5-delete", 1560, 360, "Flow 5 · Deletion request (LGPD)", "No link or account: the subscriber e-mails, you find it by the transcript and delete it.", [
    box(40, 130, "Subscriber", "privacy page address", "slate", "published videos stay online", icons=("mail",)),
    box(460, 130, "You", "panel in the browser", "slate", icons=("user",)),
    panel(880, 130), d1(1300, 50), r2(1300, 210),
    arrow([(260, 162), (460, 162)], "1. e-mail", flow="delete"),
    arrow([(680, 146), (880, 146)], "2. search the text", flow="delete"),
    arrow([(680, 178), (880, 178)], "3. delete", flow="delete", dy=22),
    arrow([(680, 178), (880, 178)], flow="delete"),
    arrow([(1100, 146), (1200, 146), (1200, 82), (1300, 82)], "4. row", at=0.5, flow="delete"),
    arrow([(1100, 178), (1200, 178), (1200, 242), (1300, 242)], "4. files", at=0.5, flow="delete"),
])
print("flows ok")
