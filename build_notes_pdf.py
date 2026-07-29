# -*- coding: utf-8 -*-
"""Generates the ChatAppScalable deep-dive revision notes as a PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Preformatted, Table, TableStyle, ListFlowable, ListItem, KeepTogether)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
import re

# ---------- palette ----------
INK      = colors.HexColor('#0f172a')
SLATE    = colors.HexColor('#334155')
CYAN     = colors.HexColor('#0891b2')
CYAN_D   = colors.HexColor('#0e7490')
FUCHSIA  = colors.HexColor('#a21caf')
AMBER    = colors.HexColor('#b45309')
GREEN    = colors.HexColor('#047857')
RED      = colors.HexColor('#b91c1c')
CODEBG   = colors.HexColor('#f1f5f9')
CODEBD   = colors.HexColor('#cbd5e1')
LIGHT    = colors.HexColor('#64748b')

styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name, **kw))

S('Cover',   fontName='Helvetica-Bold', fontSize=30, leading=36, textColor=INK, alignment=TA_CENTER)
S('CoverSub',fontName='Helvetica', fontSize=13, leading=18, textColor=CYAN_D, alignment=TA_CENTER)
S('CoverSm', fontName='Helvetica', fontSize=10, leading=15, textColor=LIGHT, alignment=TA_CENTER)
S('H1', fontName='Helvetica-Bold', fontSize=17, leading=21, textColor=colors.white,
  backColor=CYAN_D, borderPadding=(7,7,7,7), spaceBefore=18, spaceAfter=10, leftIndent=0)
S('H2', fontName='Helvetica-Bold', fontSize=13, leading=16, textColor=CYAN_D, spaceBefore=13, spaceAfter=5)
S('H3', fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=FUCHSIA, spaceBefore=9, spaceAfter=3)
S('Body', fontName='Helvetica', fontSize=9.5, leading=14, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=6)
S('BodyL', fontName='Helvetica', fontSize=9.5, leading=14, textColor=INK, alignment=TA_LEFT, spaceAfter=6)
S('Bull', fontName='Helvetica', fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=2)
S('Mono', fontName='Courier', fontSize=7.4, leading=9.4, textColor=colors.HexColor('#0b3d2e'),
  backColor=CODEBG, borderColor=CODEBD, borderWidth=0.6, borderPadding=(6,6,6,6))
S('Cap', fontName='Helvetica-Oblique', fontSize=8, leading=11, textColor=LIGHT, alignment=TA_CENTER, spaceAfter=8, spaceBefore=2)
S('QQ', fontName='Helvetica-Bold', fontSize=9.8, leading=13, textColor=CYAN_D, spaceBefore=8, spaceAfter=2)
S('AA', fontName='Helvetica', fontSize=9.3, leading=13, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4)
S('Note', fontName='Helvetica', fontSize=9, leading=12.5, textColor=colors.HexColor('#7c2d12'),
  backColor=colors.HexColor('#fff7ed'), borderColor=colors.HexColor('#fdba74'), borderWidth=0.6,
  borderPadding=(6,6,6,6), spaceAfter=8, spaceBefore=2)
S('Th', fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)
S('Td', fontName='Helvetica', fontSize=8, leading=10.5, textColor=INK)

story = []
def P(t, s='Body'): story.append(Paragraph(t, styles[s]))
def SP(h=6): story.append(Spacer(1, h))
def H1(t): story.append(Paragraph(t, styles['H1']))
def H2(t): story.append(Paragraph(t, styles['H2']))
def H3(t): story.append(Paragraph(t, styles['H3']))
def CAP(t): story.append(Paragraph(t, styles['Cap']))
def NOTE(t): story.append(Paragraph('<b>&#9873; </b>' + t, styles['Note']))

def CODE(t):
    t = t.strip('\n')
    story.append(Preformatted(t, styles['Mono']))
    SP(6)

def BULLETS(items, s='Bull'):
    flow = [ListItem(Paragraph(i, styles[s]), leftIndent=10, value='•') for i in items]
    story.append(ListFlowable(flow, bulletType='bullet', start='•', leftIndent=12))
    SP(4)

def TABLE(data, colw, header=True):
    # Wrap every cell in a Paragraph so long text wraps within its column
    # (plain strings in a reportlab Table overflow the cell instead of wrapping).
    wrapped = []
    for r, row in enumerate(data):
        cells = []
        for c in row:
            st = styles['Th'] if (header and r == 0) else styles['Td']
            cells.append(Paragraph(str(c), st))
        wrapped.append(cells)
    t = Table(wrapped, colWidths=colw)
    cmds = [
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('GRID',(0,0),(-1,-1),0.5,CODEBD),
        ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
    ]
    if header:
        cmds += [('BACKGROUND',(0,0),(-1,0),CYAN_D)]
    t.setStyle(TableStyle(cmds))
    story.append(t); SP(8)

# ---------- diagram helpers ----------
def _wraplines(d, x, y, w, h, text, fg, fs):
    lines = text.split('\n')
    total = len(lines)*(fs+2)
    sy = y + h/2 + total/2 - (fs+2) + 2
    for ln in lines:
        d.add(String(x + w/2, sy - 3, ln, textAnchor='middle', fontName='Helvetica', fontSize=fs, fillColor=fg))
        sy -= (fs+2)

def node(d, x, y, w, h, text, fill=CYAN, fg=colors.white, fs=8, stroke=None):
    d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke or fill, strokeWidth=1))
    _wraplines(d, x, y, w, h, text, fg, fs)

def arrow(d, x1, y1, x2, y2, col=SLATE, dash=False):
    ln = Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=1.1)
    if dash: ln.strokeDashArray = [3,2]
    d.add(ln)
    import math
    ang = math.atan2(y2-y1, x2-x1); s=5
    d.add(Polygon([x2, y2,
                   x2 - s*math.cos(ang-0.4), y2 - s*math.sin(ang-0.4),
                   x2 - s*math.cos(ang+0.4), y2 - s*math.sin(ang+0.4)],
                  fillColor=col, strokeColor=col))

def label(d, x, y, text, col=LIGHT, fs=7, anchor='middle'):
    d.add(String(x, y, text, textAnchor=anchor, fontName='Helvetica-Oblique', fontSize=fs, fillColor=col))

# ---- Diagram 1: before vs after ----
def diagram_before_after():
    d = Drawing(460, 250)
    d.add(String(115, 238, 'BEFORE  (basic MERN)', textAnchor='middle', fontName='Helvetica-Bold', fontSize=9, fillColor=RED))
    d.add(String(345, 238, 'AFTER  (scalable, event-driven)', textAnchor='middle', fontName='Helvetica-Bold', fontSize=9, fillColor=GREEN))
    d.add(Line(230, 0, 230, 230, strokeColor=CODEBD, strokeWidth=0.6))
    # before stack
    node(d, 55, 190, 120, 26, 'React client', fill=SLATE)
    node(d, 55, 150, 120, 26, '1 Express server\n+ in-memory socket map', fill=RED, fs=7)
    node(d, 55, 110, 120, 26, 'MongoDB (direct r/w)', fill=SLATE)
    arrow(d, 115, 190, 115, 176); arrow(d, 115, 150, 115, 136)
    label(d, 115, 96, 'single point of failure', RED)
    label(d, 115, 86, 'no cache · no queue', RED)
    # after stack
    node(d, 300, 196, 92, 22, 'React clients', fill=SLATE, fs=7)
    node(d, 300, 168, 92, 20, 'nginx LB (ip_hash)', fill=INK, fs=7)
    node(d, 285, 140, 55, 18, 'API-1', fill=CYAN, fs=7); node(d,342,140,55,18,'API-2',fill=CYAN,fs=7)
    node(d, 300, 116, 40, 16, 'Redis', fill=FUCHSIA, fs=7); node(d,345,116,50,16,'Kafka',fill=AMBER,fs=7)
    node(d, 285, 88, 50, 18, 'db-worker', fill=GREEN, fs=7); node(d,340,88,58,18,'analytics',fill=GREEN,fs=7)
    node(d, 305, 60, 84, 18, 'MongoDB', fill=SLATE, fs=7)
    arrow(d, 346, 196, 346, 188)
    arrow(d, 346, 168, 346, 158)
    arrow(d, 340, 140, 340, 132)
    arrow(d, 346, 116, 346, 106)
    arrow(d, 346, 88, 346, 78)
    label(d, 346, 48, 'horizontally scalable', GREEN)
    return d

# ---- Diagram 2: full architecture ----
def diagram_architecture():
    d = Drawing(470, 300)
    node(d, 175, 272, 120, 22, 'Browser clients (React + Socket.IO)', fill=SLATE, fs=7)
    node(d, 185, 236, 100, 22, 'nginx  —  load balancer\n(ip_hash sticky)', fill=INK, fs=6.5)
    arrow(d, 235, 272, 235, 258)
    for i,x in enumerate([70, 200, 330]):
        node(d, x, 196, 100, 24, f'chat-api-{i+1}\nExpress + Socket.IO', fill=CYAN, fs=6.5)
        arrow(d, 235, 236, x+50, 220, dash=(i!=1))
    # redis + kafka row
    node(d, 40, 150, 120, 26, 'REDIS\ncache · pub/sub · presence', fill=FUCHSIA, fs=6.5)
    node(d, 300, 150, 130, 26, 'KAFKA  (topic: chat-messages)\nKRaft, no ZooKeeper', fill=AMBER, fs=6.5)
    arrow(d, 120, 196, 108, 176)   # api-1 -> redis
    arrow(d, 250, 196, 300, 176)   # api-2 -> kafka
    arrow(d, 380, 196, 365, 176)   # api-3 -> kafka
    # workers
    node(d, 285, 104, 70, 22, 'db-worker\n(group A)', fill=GREEN, fs=6.5)
    node(d, 362, 104, 78, 22, 'analytics-worker\n(group B)', fill=GREEN, fs=6.5)
    arrow(d, 340, 150, 320, 126); arrow(d, 390, 150, 400, 126)
    node(d, 300, 64, 110, 22, 'MongoDB Atlas', fill=SLATE, fs=7)
    arrow(d, 320, 104, 345, 86)
    d.add(String(100, 138, 'Redis adapter fans socket events across all API nodes',
                 textAnchor='middle', fontName='Helvetica-Oblique', fontSize=6.2, fillColor=FUCHSIA))
    return d

# ---- Diagram 3: send sequence ----
def diagram_sequence():
    d = Drawing(470, 250)
    steps = [
        ('1. POST /message/send/:id', CYAN),
        ('2. RPUSH message into Redis list  (durable, instant read source)', FUCHSIA),
        ('3. producer.send -> Kafka topic "chat-messages"  (key = chatKey)', AMBER),
        ('4. io.to(receiver).emit("newMessage")  via Redis adapter', SLATE),
        ('5. HTTP 201 back to sender  (returns before DB write!)', GREEN),
        ('---- asynchronously ----', LIGHT),
        ('6. db-worker consumes -> idempotent upsert into MongoDB', GREEN),
    ]
    y = 224
    for txt, col in steps:
        node(d, 30, y, 410, 20, txt, fill=col, fs=7)
        if y > 40: arrow(d, 235, y, 235, y-8)
        y -= 30
    return d

# ---- Diagram 4: kafka consumer groups ----
def diagram_groups():
    d = Drawing(460, 160)
    node(d, 170, 122, 120, 26, 'Topic: chat-messages\n(retained log)', fill=AMBER, fs=7)
    node(d, 40, 60, 150, 30, 'Group: chat-db-workers\nsaves to MongoDB', fill=GREEN, fs=7)
    node(d, 270, 60, 150, 30, 'Group: chat-analytics-workers\ncounts velocity', fill=GREEN, fs=7)
    arrow(d, 210, 122, 115, 90); arrow(d, 250, 122, 345, 90)
    label(d, 230, 105, 'each GROUP gets its OWN copy of every message', CYAN_D, 7)
    node(d, 60, 16, 110, 20, 'MongoDB', fill=SLATE, fs=7)
    arrow(d, 115, 60, 115, 36)
    return d

# ---- Diagram 5: redis roles ----
def diagram_redis():
    d = Drawing(460, 190)
    node(d, 180, 82, 100, 30, 'REDIS', fill=FUCHSIA, fs=11)
    roles = [
        (30, 150, '1. Chat cache\nLIST per chat = read source', CYAN),
        (250, 150, '2. Pub/Sub adapter\nSocket.IO fan-out', CYAN_D),
        (30, 20, '3. Presence + counters\nonline set, unread, metrics', GREEN),
        (250, 20, '4. Hot-path guards\nknown_users, cooldowns', AMBER),
    ]
    for x,y,t,c in roles:
        node(d, x, y, 180, 30, t, fill=c, fs=6.6)
    arrow(d, 210, 112, 120, 150); arrow(d, 250, 112, 340, 150)
    arrow(d, 210, 82, 120, 50); arrow(d, 250, 82, 340, 50)
    return d

# ---- Diagram 6: tick state machine ----
def diagram_ticks():
    d = Drawing(460, 90)
    states = [('sending','clock',LIGHT),('sent','one grey',SLATE),('delivered','two grey',CYAN_D),('read','two blue',CYAN)]
    x=20
    for name,desc,col in states:
        node(d, x, 40, 95, 30, f'{name}\n({desc})', fill=col, fs=7)
        if x < 340: arrow(d, x+95, 55, x+112, 55)
        x += 112
    label(d, 75, 30, 'API 201', LIGHT); label(d, 187, 30, 'receiver device ack', LIGHT)
    label(d, 300, 30, 'receiver opens chat', LIGHT)
    return d

def DIAG(fn, cap):
    story.append(KeepTogether([fn(), Paragraph(cap, styles['Cap'])]))

# =====================================================================
# COVER
# =====================================================================
SP(120)
P('ChatAppScalable', 'Cover')
SP(6)
P('A Real-Time, Event-Driven MERN Chat System', 'CoverSub')
P('Deep-Dive Architecture &amp; Code Revision Notes', 'CoverSub')
SP(30)
P('Socket.IO &#183; Redis &#183; Apache Kafka &#183; Docker &#183; nginx', 'CoverSm')
SP(10)
P('Interview preparation edition — every design decision, every change, and why.', 'CoverSm')
story.append(PageBreak())

# =====================================================================
# HOW TO USE + CONTENTS
# =====================================================================
H1('0 &#183; How to read these notes')
P("These notes rebuild your project from first principles. They start from what the app "
  "<b>was</b> — an ordinary MERN chat app — and walk through every capability we added to turn it "
  "into a horizontally-scalable, event-driven system, explaining the <i>problem</i> each piece "
  "solves, the <i>code</i> that implements it, and the <i>trade-offs</i>. Read it top to bottom once; "
  "then use the Interview Q&amp;A section (&#167;13) and the file map (&#167;15) as quick refreshers.")
H2('Contents')
TABLE([
 ['#','Section'],
 ['1','The starting point: a basic MERN chat app and why it does not scale'],
 ['2','The big picture: target architecture &amp; the four pillars'],
 ['3','Socket.IO — real-time transport, rooms, and the Redis adapter'],
 ['4','Redis — four jobs in one datastore'],
 ['5','Apache Kafka — the event-driven write path'],
 ['6','The life of a message (end-to-end trace)'],
 ['7','Docker &amp; nginx — packaging and horizontal scale'],
 ['8','Feature deep-dives (ticks, presence, typing, unread, groups)'],
 ['9','Observability — metrics &amp; the live dashboard'],
 ['10','The bugs we fixed (and the lessons)'],
 ['11','Load testing with k6 — method &amp; results'],
 ['12','Data model &amp; Redis key reference'],
 ['13','Interview Q&amp;A bank'],
 ['14','Glossary'],
 ['15','File-by-file responsibility map'],
], [22, 430])
story.append(PageBreak())

# =====================================================================
# 1. STARTING POINT
# =====================================================================
H1('1 &#183; The starting point: a basic MERN chat app')
P("The project began as a textbook MERN application: a React front-end, one Express/Node server, "
  "and MongoDB. Real-time delivery, if present at all, was handled by a <b>single</b> Socket.IO server "
  "that kept an <b>in-memory map</b> of <code>userId &#8594; socket.id</code> (you can still see the "
  "fossils of this in the code: comments like <i>“userSocketMap is GONE”</i> in <code>socket.js</code> "
  "and <i>“Removed getReceiverSocketId”</i> in the message controller).")
H2('How the old flow worked')
BULLETS([
 "<b>Send:</b> the controller called <code>Message.save()</code> to write straight to MongoDB, then "
 "looked up the receiver&#8217;s socket id in the in-memory map and emitted the message to it.",
 "<b>Read:</b> opening a chat did a direct <code>Message.find(...)</code> against MongoDB every time.",
 "<b>Presence:</b> whoever was connected lived in that one server&#8217;s memory.",
])
H2('Why it does not scale — the four walls it hits')
TABLE([
 ['Wall','What breaks'],
 ['One server','A single Node process is a single point of failure and a hard CPU ceiling. Add a second server and the in-memory socket map breaks: a user on server B is invisible to server A, so cross-server messages vanish.'],
 ['Direct DB writes','Every send blocks on a MongoDB round-trip. Under a burst, the database becomes the bottleneck — connection pool exhaustion, timeouts, dropped messages.'],
 ['No cache','Every chat open re-queries MongoDB. Popular conversations hammer the DB with identical reads.'],
 ['No decoupling','Want analytics, search, or notifications? You must edit the send path and make it slower and more fragile each time.'],
], [70, 382])
P("Every subsequent section is the answer to one of these walls. The through-line: <b>separate the "
  "fast, user-facing path from the slow, durable path</b>, and make every layer horizontally scalable.")
DIAG(diagram_before_after, "Figure 1 — From a single-server MERN app (left) to a decoupled, horizontally-scalable system (right).")
story.append(PageBreak())

# =====================================================================
# 2. BIG PICTURE
# =====================================================================
H1('2 &#183; The big picture: architecture &amp; the four pillars')
P("The system splits into a <b>hot path</b> (what the user waits for) and a <b>cold path</b> (durable "
  "persistence and side-effects that happen asynchronously). Four technologies each own one concern:")
TABLE([
 ['Pillar','Job in this project'],
 ['Socket.IO','Real-time, bidirectional events (new messages, ticks, typing, presence) between clients and any API node.'],
 ['Redis','(1) chat-history cache and durable read source, (2) Socket.IO pub/sub adapter across nodes, (3) presence set + unread + metrics counters, (4) hot-path guards.'],
 ['Apache Kafka','A durable, replayable log that decouples message writes from the database; multiple consumer groups fan out (DB persistence, analytics).'],
 ['Docker + nginx','Package every service into containers; nginx load-balances three API replicas with sticky sessions for WebSockets.'],
], [70, 382])
DIAG(diagram_architecture, "Figure 2 — Full runtime architecture. Clients hit nginx, which balances three API nodes; "
     "Redis and Kafka sit behind them; two worker consumer groups drain Kafka.")
P("<b>The one-sentence pitch:</b> <i>“The API publishes each message to Kafka and writes it to a Redis "
  "list, then returns immediately; the client sees the message instantly over Socket.IO, while a "
  "background worker drains Kafka into MongoDB. Reads are served from Redis. This decouples user-facing "
  "latency from database speed, absorbs traffic spikes, and survives a database or worker outage.”</i>")
story.append(PageBreak())

# =====================================================================
# 3. SOCKET.IO
# =====================================================================
H1('3 &#183; Socket.IO — real-time transport across many nodes')
H2('The problem it solves')
P("HTTP is request/response: the server cannot push. A chat needs the <i>server</i> to tell a client "
  "&#8220;you have a new message&#8221; the instant it arrives. Socket.IO gives us a persistent, "
  "bidirectional WebSocket channel for exactly that.")
H2('The scaling problem Socket.IO alone does NOT solve')
P("With three API replicas behind nginx, Alice may be connected to <code>chat-api-1</code> and Bob to "
  "<code>chat-api-3</code>. If Alice&#8217;s message is handled by api-1, how does api-1 push it to Bob, "
  "whose socket lives on api-3? The old in-memory map cannot answer this. Two changes fix it:")
H3('a) The Redis adapter (cross-node fan-out)')
P("Every API node attaches the <code>@socket.io/redis-adapter</code>. When any node emits to a room, "
  "the adapter publishes it over Redis pub/sub; the node that actually holds that socket delivers it. "
  "The emit becomes location-independent.")
CODE('''const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));   // rooms now work across ALL nodes
});''')
H3('b) The room strategy (no more socket-id map)')
P("On connect, each user joins a <b>room named after their own id</b>. To message a user we emit to that "
  "room; we never track socket ids. Presence moves out of memory into a shared Redis <b>set</b>.")
CODE('''io.on("connection", async (socket) => {
  const userId = socket.userId.toString();
  socket.join(userId);                       // personal room
  // join every group room I belong to
  const myGroups = await Group.find({ members: socket.userId }).select("_id");
  for (const g of myGroups) socket.join(`group:${g._id}`);

  await pubClient.sAdd("global_online_users", userId);        // presence in Redis
  io.emit("getOnlineUsers", await pubClient.sMembers("global_online_users"));
});''')
P("<b>Why a room per user?</b> It decouples <i>identity</i> from <i>connection</i>. A user can have "
  "multiple tabs/devices (multiple sockets) all in the same room, on any node, and a single "
  "<code>io.to(userId).emit(...)</code> reaches all of them. Authentication happens once in "
  "<code>socketAuthMiddleware</code>, which reads the JWT cookie and sets <code>socket.userId</code>.")
H2('The event vocabulary')
TABLE([
 ['Event','Direction','Purpose'],
 ['newMessage','server &#8594; receiver','deliver a DM in real time'],
 ['newGroupMessage','server &#8594; group room','deliver a group message to all members'],
 ['messageDelivered','client &#8594; server','receiver&#8217;s device acks receipt (drives &#10003;&#10003;)'],
 ['messageRead / messagesRead','both','receiver opened chat; flip sender ticks to blue'],
 ['messageStatusUpdate','server &#8594; sender','single message advanced sent&#8594;delivered'],
 ['typing / userTyping','both','ephemeral typing indicator (no storage)'],
 ['getOnlineUsers / userLastSeen','server &#8594; all','presence + last-seen'],
 ['unreadUpdate','server &#8594; user','live unread badge count'],
], [110, 95, 247])
story.append(PageBreak())

# =====================================================================
# 4. REDIS
# =====================================================================
H1('4 &#183; Redis — four jobs in one datastore')
DIAG(diagram_redis, "Figure 3 — Redis is not &#8220;just a cache&#8221; here; it plays four distinct roles.")
H2('Role 1 — chat history cache AND the durable read source')
P("This is the most important and most subtle design choice. Each conversation is stored as a Redis "
  "<b>LIST</b> of JSON messages under a deterministic key (<code>getChatKey</code> sorts the two ids so "
  "Alice+Bob and Bob+Alice map to the same key). Reads are served from this list; on a cold cache we "
  "<b>hydrate</b> the whole history from Mongo once.")
CODE('''export const getChatKey = (idA, idB) =>
  `chat:${[idA.toString(), idB.toString()].sort().join("_")}`;

// read path
const cachedLen = await redisCache.lLen(chatKey);
if (cachedLen > 0) { incrMetric("cache_hits");
  return res.json((await redisCache.lRange(chatKey,0,-1)).map(JSON.parse)); }
incrMetric("cache_misses");
const history = await hydrateChatCache(chatKey, myId, UserToChat);   // from Mongo''')
H3('Why a LIST and not one JSON blob?')
P("Appending a new message is a single atomic <code>RPUSH</code>. If we cached a JSON <i>blob</i>, two "
  "people messaging at once would do read&#8211;modify&#8211;write and clobber each other. A LIST also "
  "lets us update one message in place (for ticks) with <code>LSET</code> without rewriting the whole "
  "history.")
H3('Why is the cache the read <i>source</i>, not just an accelerator?')
P("Because the DB write is asynchronous (via Kafka), MongoDB might not have a just-sent message yet. So "
  "on <b>send</b> we <code>RPUSH</code> the message into the list immediately. Reads therefore reflect "
  "the message the instant it is sent — <b>even if the db-worker is down</b>. This single decision is "
  "what fixed the &#8220;message disappears on refresh&#8221; bug (&#167;10).")
CODE('''// sendMessage: make the cache authoritative right now
if ((await redisCache.exists(chatKey)) === 0)
  await hydrateChatCache(chatKey, senderId, receiverId);   // avoid a partial cache
await redisCache.rPush(chatKey, JSON.stringify(message));
await redisCache.expire(chatKey, CHAT_CACHE_TTL_SECONDS);   // 1h TTL''')
H2('Role 2 — the Socket.IO pub/sub adapter')
P("Covered in &#167;3: <code>pubClient</code>/<code>subClient</code> back the redis-adapter so room emits "
  "cross API nodes. Note these are <i>separate</i> Redis connections from the cache client — pub/sub "
  "connections are dedicated by the Redis protocol.")
H2('Role 3 — presence, unread counts, and metrics')
BULLETS([
 "<b>Presence:</b> a Redis SET <code>global_online_users</code> (SADD on connect, SREM on disconnect). "
 "Any node can read the authoritative online list.",
 "<b>Last seen:</b> a hash <code>last_seen</code> written on disconnect.",
 "<b>Unread:</b> a hash per user <code>unread:&lt;userId&gt;</code> keyed by partner/group; HINCRBY on "
 "send, reset to 0 on read.",
 "<b>Metrics:</b> hashes <code>metrics:counters</code> and <code>metrics:requests</code> so counts "
 "aggregate correctly across all three API nodes (an in-memory counter would only see 1/3 of traffic).",
])
H2('Role 4 — hot-path guards')
P("A Redis SET <code>known_users</code> caches &#8220;does this receiver exist?&#8221; so the send path "
  "does a fast <code>SISMEMBER</code> instead of a MongoDB lookup on every message — keeping the write "
  "path off the database, which is the whole point.")
story.append(PageBreak())

# =====================================================================
# 5. KAFKA
# =====================================================================
H1('5 &#183; Apache Kafka — the event-driven write path')
H2('Mental model: a log, not a queue')
P("Kafka is a distributed, append-only <b>commit log</b>. Producers append to <b>topics</b> (split into "
  "<b>partitions</b>); consumers track their own <b>offset</b>. Data is deleted by <i>retention policy</i> "
  "(default 7 days), not on read — which is why messages can be <b>replayed</b> and why many independent "
  "consumers can read the same stream.")
H2('Why Kafka here? (a top interview question)')
BULLETS([
 "<b>Latency decoupling:</b> publishing to Kafka is a fast local append; the user gets their 201 without "
 "waiting on a remote MongoDB write.",
 "<b>Burst absorption:</b> Kafka buffers spikes; the worker drains at a sustainable rate instead of "
 "hammering the DB.",
 "<b>Decoupling &amp; extensibility:</b> analytics was added as a <i>new consumer group</i> with zero "
 "changes to the API. Search, moderation, notifications could follow the same way.",
 "<b>Durability with replay:</b> if MongoDB is down, messages queue safely in Kafka and are replayed "
 "later — nothing is lost.",
])
P("<b>Why not RabbitMQ / Redis Pub-Sub?</b> RabbitMQ deletes on ack and has no replay; Redis Pub/Sub has "
  "no persistence (an offline subscriber loses the message forever). We needed a <i>durable, replayable, "
  "multi-consumer log</i> — Kafka&#8217;s exact shape. (We <i>do</i> use Redis Pub/Sub, but only for live "
  "socket fan-out where a lost message just means a reload.)")
H2('The producer (API side)')
CODE('''await producer.send({
  topic: "chat-messages",
  messages: [{ key: chatKey, value: JSON.stringify(message) }],
});''')
P("<b>The key matters.</b> Kafka guarantees ordering only <i>within</i> a partition, and it routes by "
  "<code>hash(key) % partitions</code>. Keying on <code>chatKey</code> (the conversation) means every "
  "message in a conversation lands on the same partition and is processed in send order — even after we "
  "scale to many partitions. Cross-conversation interleaving is fine for a chat app.")
H2('Consumer groups — fan-out vs load-balancing')
DIAG(diagram_groups, "Figure 4 — Two <b>different</b> group ids means each worker gets its own full copy "
     "of every message. Same group id would <i>split</i> the messages instead.")
P("<code>chat-db-workers</code> persists to MongoDB; <code>chat-analytics-workers</code> counts message "
  "velocity. Because their group ids differ, both see every message, keep independent offsets, and can be "
  "restarted or replayed without affecting each other.")
H2('Idempotent consumption (at-least-once safety)')
P("Kafka&#8217;s practical guarantee is <b>at-least-once</b>: a message may be redelivered (e.g. a worker "
  "crash before the offset commits, or a full replay). So the DB writer must be <b>idempotent</b>. The "
  "<code>_id</code> is generated in the API <i>before</i> publishing and travels with the message, so the "
  "worker upserts on it — replays become no-ops.")
CODE('''const { _id, ...rest } = messageData;
await Message.updateOne({ _id },
  { $setOnInsert: rest },
  { upsert: true, timestamps: false });   // timestamps:false is REQUIRED — see §10''')
H2('KRaft — no ZooKeeper')
P("Kafka historically needed ZooKeeper for cluster metadata. This project runs <b>KRaft</b> mode "
  "(Kafka&#8217;s own Raft-based metadata quorum), visible in compose as "
  "<code>KAFKA_PROCESS_ROLES: broker,controller</code> and the total absence of a ZooKeeper container. "
  "Port 9092 carries client traffic; 9093 is the controller quorum.")
story.append(PageBreak())

# =====================================================================
# 6. LIFE OF A MESSAGE
# =====================================================================
H1('6 &#183; The life of a message (end-to-end)')
P("This is the trace to whiteboard in an interview. Alice sends &#8220;hi&#8221; to Bob:")
DIAG(diagram_sequence, "Figure 5 — The send path. Steps 1&#8211;5 are synchronous (what Alice waits for); "
     "step 6 happens asynchronously.")
BULLETS([
 "<b>1&#8211;2:</b> the API builds the message with a stable <code>_id</code> and RPUSHes it into the "
 "Redis list — reads are now correct immediately.",
 "<b>3:</b> it publishes to Kafka keyed by the conversation.",
 "<b>4:</b> it emits <code>newMessage</code> to Bob&#8217;s room; the Redis adapter routes it to whatever "
 "node Bob is on.",
 "<b>5:</b> it returns HTTP 201 to Alice — <i>before</i> MongoDB is touched. Alice&#8217;s optimistic UI "
 "swaps its temporary bubble for the confirmed one.",
 "<b>6:</b> the db-worker consumes the Kafka record and idempotently upserts it into MongoDB.",
])
P("<b>Delivery &amp; read receipts</b> ride back the other way: Bob&#8217;s client emits "
  "<code>messageDelivered</code> on receipt and <code>messageRead</code> when he opens the chat; the "
  "server updates status in Mongo <i>and</i> in the Redis list (via <code>LSET</code>), then notifies "
  "Alice so her ticks turn double-grey, then blue.")
NOTE("Interview line: &#8220;The response returns after Kafka + Redis, not after MongoDB. User-perceived "
     "latency is decoupled from database speed, and a DB outage degrades to <i>delayed persistence</i> "
     "instead of <i>lost messages</i>.&#8221;")
story.append(PageBreak())

# =====================================================================
# 7. DOCKER + NGINX
# =====================================================================
H1('7 &#183; Docker &amp; nginx — packaging and horizontal scale')
H2('Containers')
P("<code>docker-compose.yml</code> defines eight services on one private network: <code>kafka</code>, "
  "<code>redis</code>, three API replicas (<code>chat-api-1/2/3</code>), <code>db-worker</code>, "
  "<code>analytics-worker</code>, and <code>nginx</code>. Containers reach each other by <b>service "
  "name</b> — that&#8217;s why every service is told <code>KAFKA_BROKER=kafka:9092</code> and "
  "<code>REDIS_URL=redis://redis:6379</code>.")
P("Three compose files exist for three purposes: <code>docker-compose.dev.yml</code> (light: 1 API, no "
  "nginx — for coding without cooking the laptop), <code>docker-compose.yml</code> (full: nginx + 3 APIs "
  "— to demo scaling), and <code>docker-compose.prod.yml</code> (tuned for the free VM).")
H2('nginx — the load balancer')
P("Only nginx is exposed to the outside (port 80). It balances the three API replicas. Two details are "
  "load-bearing for a real-time app:")
BULLETS([
 "<b>ip_hash (sticky sessions):</b> Socket.IO&#8217;s handshake must stay on one node, so nginx pins a "
 "client to a backend by IP. Consequence: <i>your own</i> requests all hit one instance; spread appears "
 "across <i>different</i> users. This is correct, not a bug.",
 "<b>WebSocket upgrade headers:</b> a <code>map $http_upgrade $connection_upgrade</code> plus "
 "<code>proxy_http_version 1.1</code> and long read timeouts let live sockets pass through and stay open.",
])
H2('Scaling story')
P("To scale the API you add replicas and nginx spreads load; to scale persistence you add partitions to "
  "<code>chat-messages</code> and run more <code>db-worker</code> instances in the <i>same</i> group — "
  "Kafka auto-assigns partitions to them (parallelism is capped by partition count). Redis and Kafka are "
  "shared infrastructure. Every API container carries an <code>INSTANCE_ID</code> and stamps an "
  "<code>X-Served-By</code> header so you can see which node answered.")
story.append(PageBreak())

# =====================================================================
# 8. FEATURES
# =====================================================================
H1('8 &#183; Feature deep-dives')
H2('WhatsApp-style delivery ticks')
P("Messages carry a <code>status</code> of <code>sent &#8594; delivered &#8594; read</code>. The UI maps "
  "these to one grey tick, two grey ticks, and two blue ticks (plus a clock while the optimistic message "
  "is in flight).")
DIAG(diagram_ticks, "Figure 6 — Tick state machine. Each transition is driven by a socket event.")
P("The crucial correctness detail lives in <code>patchStatusInCache</code>: when a status changes we "
  "update the message <b>in place</b> in the Redis list (find by <code>_id</code>, <code>LSET</code>) "
  "rather than deleting the key. Deleting would be unsafe — if the db-worker is behind, a re-hydrate from "
  "Mongo could momentarily drop the message. Status also uses <code>$set</code> guarded by the current "
  "state so a late &#8220;delivered&#8221; never overwrites &#8220;read&#8221;.")
H2('Presence &amp; last-seen')
P("Online state is the Redis <code>global_online_users</code> set, broadcast on every connect/disconnect. "
  "On disconnect we also stamp <code>last_seen</code>; the header shows &#8220;Online&#8221;, "
  "&#8220;typing&#8230;&#8221;, or &#8220;last seen 5m ago&#8221;. A client can ask for a specific "
  "user&#8217;s last-seen on demand via <code>getLastSeen</code>.")
H2('Typing indicators')
P("Pure ephemeral socket relay — no storage. The input debounces: it emits <code>typing</code> on "
  "keystrokes and auto-emits <code>stopTyping</code> 1.5s after the last one. Groups use "
  "<code>groupTyping</code> relayed to the group room (excluding the typer via <code>socket.to(room)</code>).")
H2('Unread counts')
P("A Redis hash per user, <code>HINCRBY</code> on each incoming message and reset to 0 when the chat is "
  "opened (which the server also broadcasts, so badges clear on all your devices). Because the key is the "
  "partner-or-group id, DMs and groups share one unread system.")
H2('Group chat')
P("A <code>Group</code> model (name, admin, members) and an optional <code>groupId</code> on messages "
  "(<code>receiverId</code> is only required for DMs). Group messages travel the <b>identical</b> pipeline "
  "— Redis list &#8594; Kafka &#8594; db-worker &#8594; socket — but fan out to a <code>group:&lt;id&gt;"
  "</code> room instead of a single user. Members join their group rooms on connect; "
  "<code>socketsJoin</code> pulls newly-added members into the room live. Admin-only membership is "
  "enforced server-side. A denormalized <code>senderName</code> lets the UI label who said what without "
  "populating on every read.")
NOTE("Design guardrail we hit: <code>getChatPartener</code> (the DM sidebar) maps over "
     "<code>receiverId</code>, which group messages don&#8217;t have. We scoped its query to "
     "<code>groupId: null</code> so group traffic can never crash or pollute the DM list.")
story.append(PageBreak())

# =====================================================================
# 9. OBSERVABILITY
# =====================================================================
H1('9 &#183; Observability — metrics &amp; the live dashboard')
P("A React page at <code>/dashboard</code> polls <code>/api/metrics/summary</code> every 2s and renders "
  "online users, messages/sec (from deltas, as a live sparkline), cache hit ratio, <b>Kafka consumer "
  "lag</b> for both groups, the produced&#8594;persisted pipeline, and the per-instance request split.")
BULLETS([
 "All counters live in Redis hashes so they sum correctly across the 3 API nodes.",
 "Consumer lag is computed with the Kafka <b>admin client</b>: "
 "<code>lag = high&#8209;watermark &#8722; committed offset</code>, summed over partitions. Growing lag "
 "means the worker can&#8217;t keep up — <i>the</i> health metric for an event system.",
 "There is also a <code>/api/metrics/prometheus</code> endpoint in Prometheus text format for scraping.",
])
NOTE("Why this matters in an interview: it proves the architecture rather than asserting it. Run a load "
     "test and literally watch the lag line spike and drain.")
story.append(PageBreak())

# =====================================================================
# 10. BUGS
# =====================================================================
H1('10 &#183; The bugs we fixed (and the lessons)')
P("These are gold in interviews — each is a real failure with a concrete root cause and fix.")
bugs = [
 ("Analytics worker silently dead",
  "It hard-coded <code>brokers:[&quot;localhost:9092&quot;]</code>. Inside its container "
  "&#8220;localhost&#8221; is the container itself, not Kafka, so it retried forever. Fixed by sharing "
  "<code>lib/kafka.js</code> which reads <code>KAFKA_BROKER=kafka:9092</code>.",
  "In Docker, always address services by name, never localhost."),
 ("Messages silently never saved to MongoDB",
  "The idempotent upsert put <code>updatedAt</code> in <code>$setOnInsert</code> while "
  "<code>timestamps:true</code> also added it to <code>$set</code> &#8594; MongoDB "
  "<code>ConflictingUpdateOperators</code> (code 40). The <code>try/catch</code> swallowed it, the offset "
  "committed, and every message was dropped while the consumer looked healthy. Fixed with "
  "<code>timestamps:false</code> on that update.",
  "Never swallow exceptions in a consumer; a silent consumer failure is the worst failure mode. Monitor lag."),
 ("Message disappears on refresh when db-worker is off",
  "Writes were fully async via Kafka; reads hit Mongo/cache which the worker hadn&#8217;t populated. Fixed "
  "by making <code>sendMessage</code> RPUSH into the Redis list immediately, so reads are correct "
  "regardless of the worker.",
  "If reads depend on an async writer, give reads a synchronous durable source."),
 ("querySrv ECONNREFUSED (Mongo)",
  "The <code>mongodb+srv://</code> string needs an SRV DNS lookup that Docker&#8217;s embedded resolver "
  "couldn&#8217;t do. Fixed by pinning containers to public DNS (<code>dns: 8.8.8.8</code>).",
  "SRV connection strings have a DNS dependency; know the non-SRV fallback."),
 ("k6 setup failed with &#8216;email already exists&#8217;",
  "The login controller returns <b>201</b> (not 200) on success, so the test&#8217;s <code>!== 200</code> "
  "check treated login as failed and fell through to signup. Fixed by accepting 200 or 201.",
  "Assumptions about status codes must match the actual API — a stub that guessed 200 hid this."),
 ("Load test blocked as a bot",
  "ArcJet ran in LIVE mode and 403&#8217;d k6 (no browser UA) and rate-limited at 100/min. Fixed by making "
  "the mode env-driven (LIVE / DRY_RUN / OFF).",
  "Bot-protection must be bypassable for legitimate load tests without removing it from prod."),
]
for i,(t,body,lesson) in enumerate(bugs, 1):
    H3(f'{i}. {t}')
    P(body)
    P('<b>Lesson:</b> ' + lesson, 'BodyL')
story.append(PageBreak())

# =====================================================================
# 11. LOAD TEST
# =====================================================================
H1('11 &#183; Load testing with k6')
P("The k6 script authenticates two users, then ramps 0&#8594;100 virtual users over ~3 minutes, each "
  "sending messages and reading history — exercising the Kafka producer, Redis cache, and db-worker. A "
  "<code>handleSummary</code> prints resume-ready headline stats; <code>STRESS=1</code> removes think "
  "time to find peak throughput.")
H2('Representative result (single dev machine, free Atlas)')
TABLE([
 ['Metric','Value','Reading'],
 ['Peak concurrent users','100','concurrency the run sustained'],
 ['Total requests','12,147','over ~3 min'],
 ['Throughput','~67 req/s','capped by realistic think time, not the ceiling'],
 ['Error rate','0.00%','zero failures under load'],
 ['Checks passed','100%','every send/read behaved correctly'],
 ['p95 latency','~700 ms','tail driven by co-located load gen + remote Atlas'],
], [140, 70, 242])
NOTE("Honesty for interviews: the stack and the load generator ran on the <i>same</i> laptop against a "
     "free MongoDB M0, so the ceiling was CPU + the free DB, not the architecture. Always quote numbers "
     "with the hardware, e.g. &#8220;100 concurrent users, 0% errors, p95 ~700ms on a single dev machine.&#8221;")
story.append(PageBreak())

# =====================================================================
# 12. DATA MODEL + KEYS
# =====================================================================
H1('12 &#183; Data model &amp; Redis key reference')
H2('MongoDB collections')
TABLE([
 ['Collection','Key fields'],
 ['User','fullName, email, password (bcrypt), profilePic'],
 ['Message','senderId, receiverId (DM only), groupId (group only), text, image, status, senderName, timestamps'],
 ['Group','name, admin, members[], groupPic'],
], [70, 382])
H2('Redis keys')
TABLE([
 ['Key','Type','Purpose'],
 ['chat:&lt;idA&gt;_&lt;idB&gt;','list','DM history / durable read source'],
 ['group:&lt;groupId&gt;','list','group history'],
 ['global_online_users','set','who is online'],
 ['last_seen','hash','userId &#8594; last-seen ms'],
 ['unread:&lt;userId&gt;','hash','partner/group &#8594; unread count'],
 ['known_users','set','existence guard for the send path'],
 ['metrics:counters / metrics:requests','hash','dashboard metrics'],
], [175, 45, 232])
story.append(PageBreak())

# =====================================================================
# 13. Q&A
# =====================================================================
H1('13 &#183; Interview Q&amp;A bank')
qa = [
 ("Why Kafka and not a direct DB write?",
  "To decouple user-facing latency from DB speed, absorb bursts (Kafka buffers, the worker drains), and "
  "add consumers (analytics, later notifications) without touching the send path. A DB outage becomes "
  "delayed persistence, not lost messages, because Kafka retains the log."),
 ("Why Kafka over RabbitMQ or Redis Pub/Sub?",
  "I needed a durable, replayable, multi-consumer log. RabbitMQ deletes on ack and has no replay; Redis "
  "Pub/Sub has no persistence. I do use Redis Pub/Sub — but only for live socket fan-out where a lost "
  "message just triggers a reload."),
 ("How do you guarantee message ordering?",
  "Kafka orders within a partition, so I key each message by conversation id. All messages in a "
  "conversation hash to the same partition and are consumed in send order, even across many partitions."),
 ("Kafka gives at-least-once — how do you avoid duplicate DB rows?",
  "The consumer is idempotent. The _id is generated in the API before publishing and upserted with "
  "$setOnInsert, so a replay is a no-op and never clobbers a later status change."),
 ("Why two consumer groups?",
  "Different group ids mean fan-out: each group gets a full copy with independent offsets. Same group id "
  "would load-balance (split) the messages. DB persistence and analytics must both see everything, "
  "independently."),
 ("How do Socket.IO events reach a user on another server?",
  "The Redis adapter. Nodes publish room emits over Redis pub/sub; the node holding the socket delivers. "
  "Users join a room named after their id, so io.to(userId).emit reaches every device on any node."),
 ("Why is Redis the read source and not just a cache?",
  "Because writes are async through Kafka, Mongo may lag. On send I RPUSH into the Redis list, so reads "
  "are correct instantly and survive the db-worker being down. TTL re-hydrates from Mongo when cold."),
 ("What happens if the db-worker crashes?",
  "Nothing is lost. The API keeps publishing to Kafka and serving reads from Redis; Kafka retains the "
  "backlog. On restart the worker resumes from its committed offset and drains everything — I tested this "
  "by stopping the worker, sending messages, and refreshing."),
 ("Why ip_hash in nginx?",
  "Socket.IO&#8217;s handshake must stay on one backend, so I pin clients by IP. It means one client "
  "sticks to one node; load spreads across different clients."),
 ("Do you use ZooKeeper?",
  "No — KRaft mode, combined broker+controller. ZooKeeper was removed in Kafka 4.0. Visible via "
  "KAFKA_PROCESS_ROLES=broker,controller and no ZooKeeper container."),
 ("How would you scale persistence?",
  "Add partitions to chat-messages and run more db-workers in the same group; Kafka assigns partitions to "
  "them. Add brokers with replication.factor=3 and acks=all for HA. Batch writes with eachBatch. Watch lag."),
 ("Biggest weaknesses of the current setup?",
  "Single Kafka broker (RF=1) is a SPOF; default partition count limits worker parallelism; no dead-letter "
  "queue; no schema registry; metrics reset on Redis flush. All fine for a demo, not production."),
]
for q,a in qa:
    P('Q. ' + q, 'QQ')
    P('A. ' + a, 'AA')
story.append(PageBreak())

# =====================================================================
# 14. GLOSSARY
# =====================================================================
H1('14 &#183; Glossary')
gl = [
 ('Topic','A named Kafka stream; here just chat-messages.'),
 ('Partition','The append-only log file inside a topic; unit of ordering and parallelism.'),
 ('Offset','A consumer&#8217;s bookmark position within a partition.'),
 ('Consumer group','A set of consumers sharing offsets; different groups each get a full copy.'),
 ('Consumer lag','high-watermark &#8722; committed offset; how far behind a group is.'),
 ('KRaft','Kafka&#8217;s built-in Raft metadata quorum that replaces ZooKeeper.'),
 ('Idempotent write','An operation safe to apply twice; here an upsert on a pre-generated _id.'),
 ('Redis adapter','Socket.IO plugin that routes room emits across nodes via Redis pub/sub.'),
 ('Room','A named set of sockets; we use one per user and one per group.'),
 ('Optimistic UI','Showing a message immediately with a temp id, then swapping for the server record.'),
 ('ip_hash','nginx sticky-session strategy pinning a client to one backend.'),
 ('Hydrate','Load full history from Mongo into the Redis list when the cache is cold.'),
]
TABLE([['Term','Meaning']] + [[t,m] for t,m in gl], [110, 342])
story.append(PageBreak())

# =====================================================================
# 15. FILE MAP
# =====================================================================
H1('15 &#183; File-by-file responsibility map')
H2('Backend')
TABLE([
 ['File','Responsibility'],
 ['lib/kafka.js','Kafka client, producer, consumer factory, admin; connect/shutdown helpers.'],
 ['lib/redis.js','Cache client + reconnect strategy; getChatKey; TTL constant.'],
 ['lib/socket.js','Socket.IO server + Redis adapter; all real-time event handlers; presence.'],
 ['lib/metrics.js','Redis-backed counters + Kafka consumer-lag computation.'],
 ['controllers/message.controller.js','DM send/read, cache hydrate/append, unread, chat partners.'],
 ['controllers/group.controller.js','Create/list groups, group send/read, add member, fan-out.'],
 ['worker.js','db-worker: consumes Kafka, idempotent upsert into Mongo.'],
 ['analytics-worker.js','Second consumer group: message-velocity analytics.'],
 ['routes/*.route.js','Express routing; arcjet + auth middleware.'],
 ['server.js','App wiring: middleware, routes, socket init, instance id, metrics.'],
 ['models/*.js','Mongoose schemas: User, Message (DM+group), Group.'],
], [150, 302])
H2('Frontend')
TABLE([
 ['File','Responsibility'],
 ['store/useChatStore.js','Chat state + all socket subscriptions (messages, ticks, typing, unread, groups).'],
 ['store/useAuth.stores.js','Auth + socket lifecycle + presence/last-seen.'],
 ['components/ChatContainer.jsx','Message list; ticks; group sender labels.'],
 ['components/ChatHeader.jsx','DM/group header; presence, typing, group info.'],
 ['components/ChatList.jsx','Sidebar: groups + DMs, unread badges, New Group.'],
 ['components/CreateGroupModal / GroupInfoModal','Group creation &amp; member management UI.'],
 ['pages/Dashboard.jsx','Live observability dashboard.'],
], [175, 277])
SP(10)
P('End of notes — you now have the full map: what it was, what it became, and why every piece exists.', 'Cap')

# ---------- build ----------
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5); canvas.setFillColor(LIGHT)
    canvas.drawString(20*mm, 12*mm, 'ChatAppScalable — Architecture & Code Revision Notes')
    canvas.drawRightString(190*mm, 12*mm, f'Page {doc.page}')
    canvas.setStrokeColor(CODEBD); canvas.line(20*mm, 15*mm, 190*mm, 15*mm)
    canvas.restoreState()

doc = SimpleDocTemplate('/sessions/gracious-sharp-mendel/mnt/ChatAppScalable/ChatAppScalable_Architecture_Notes.pdf',
    pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm,
    title='ChatAppScalable Architecture Notes', author='Revision notes')
doc.build(story, onLaterPages=footer, onFirstPage=lambda c,d: None)
print('PDF built OK')
