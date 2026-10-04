// iFruit OS for arca_phone
const RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'arca_phone';
const post = (name, data = {}) =>
    fetch(`https://${RES}/${name}`, { method: 'POST', body: JSON.stringify(data) }).then((r) => r.json()).catch(() => null);
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const phoneEl = $('#phone');
const screen = $('#screen');
const view = $('#view');

const WALLPAPERS = {
    vinewood: 'linear-gradient(170deg, #ff7e5f 0%, #feb47b 35%, #6a3093 100%)',
    lsnight: 'linear-gradient(170deg, #0f2027, #203a43 55%, #2c5364)',
    blaine: 'linear-gradient(170deg, #e6b980 0%, #eacda3 40%, #8e6e53 100%)',
    pacific: 'linear-gradient(170deg, #00c6ff, #0072ff 60%, #001f54)',
    arca: 'radial-gradient(ellipse at 50% 120%, #00ff6a55, transparent 60%), linear-gradient(170deg, #0b1410, #050807)',
    mono: 'linear-gradient(170deg, #434343, #000000)',
};
const WALL_NAMES = { vinewood: 'Vinewood', lsnight: 'LS Night', blaine: 'Blaine', pacific: 'Pacific', arca: 'Arca', mono: 'Mono' };
const WEATHER = {
    EXTRASUNNY: ['fa-sun', 'Sunny'], CLEAR: ['fa-sun', 'Clear'], CLOUDS: ['fa-cloud-sun', 'Cloudy'], OVERCAST: ['fa-cloud', 'Overcast'],
    SMOG: ['fa-smog', 'Smog'], FOGGY: ['fa-smog', 'Foggy'], CLEARING: ['fa-cloud-sun-rain', 'Clearing'], RAIN: ['fa-cloud-rain', 'Rain'],
    THUNDER: ['fa-cloud-bolt', 'Storm'], SNOW: ['fa-snowflake', 'Snow'], BLIZZARD: ['fa-snowflake', 'Blizzard'], SNOWLIGHT: ['fa-snowflake', 'Light snow'],
    XMAS: ['fa-snowflake', 'Snow'], HALLOWEEN: ['fa-ghost', 'Spooky'], NEUTRAL: ['fa-cloud', 'Mild'],
};

let data = null;            // what the server sent on open
let world = { hour: 12, minute: 0, zone: 'Los Santos', weather: 'CLEAR' };
let stack = [];             // navigation history
let current = { name: 'lock' };
let call = null;
let lockNotes = [];         // notifications shown on the lock screen
let callTimer = null;

// ------------------------------------------------------------ helpers
const pad = (n) => String(n).padStart(2, '0');
const clock = () => `${pad(world.hour)}:${pad(world.minute)}`;
const contactOf = (number) => (data?.contacts || []).find((c) => c.number === number);
const nameOf = (number) => contactOf(number)?.name || number;
const COLORS = ['#ff6b6b', '#f7b733', '#4cd964', '#4c8dff', '#a66bff', '#ff8fb1', '#2ec4b6', '#ff9f43'];
function colorOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
const initials = (name) => (/^[\d-]+$/.test(name) ? '<i class="fa-solid fa-user"></i>' : esc(name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()));
const avatar = (number, cls = '') => `<div class="avatar ${cls}" style="background:${colorOf(number)}">${initials(nameOf(number))}</div>`;
function timeAgo(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : ts.replace(' ', 'T'));
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const unreadTotal = () => (data?.threads || []).reduce((t, th) => t + (th.unread || 0), 0);

function setWallpaper() {
    const key = data?.settings?.wallpaper;
    screen.style.setProperty('--wall', WALLPAPERS[key] || WALLPAPERS.lsnight);
}

// ------------------------------------------------------------ navigation
function go(name, params = {}, push = true) {
    if (push && current) stack.push(current);
    current = { name, ...params };
    render();
}
function back() {
    current = stack.pop() || { name: 'home' };
    render();
}
function home() { stack = []; go('home', {}, false); }

// ------------------------------------------------------------ views
const views = {};

views.lock = () => {
    const [icon, label] = WEATHER[world.weather] || WEATHER.CLEAR;
    const now = new Date();
    return `<div class="lock" data-act="unlock">
        <div class="clock">${clock()}</div>
        <div class="date">${now.toLocaleDateString('en-US', { weekday: 'long' })} <b>${now.getDate()}</b></div>
        <div class="place"><span>${esc(world.zone)}</span><i class="fa-solid ${icon}" title="${label}"></i></div>
        <div class="notes">${lockNotes.slice(0, 4).map((n) => `<div class="note"><span class="ic ${n.cls}"><i class="fa-solid ${n.icon}"></i></span><div><strong>${esc(n.title)}</strong><span>${esc(n.text)}</span></div></div>`).join('')}</div>
        <div class="unlock"><i class="fa-solid fa-lock-open"></i>Click to unlock</div>
    </div>`;
};

views.home = () => {
    const [icon, label] = WEATHER[world.weather] || WEATHER.CLEAR;
    const unread = unreadTotal();
    const missed = (data?.calls || []).filter((c) => c.receiver === data.number && c.status === 'missed').length;
    const app = (id, cls, ic, name, badge = 0, off = false) =>
        `<button class="app${off ? ' off' : ''}" data-app="${id}"><span class="ic ${cls}"><i class="${ic}"></i>${badge ? `<b class="badge">${badge}</b>` : ''}</span><span>${name}</span></button>`;
    return `<div class="home">
        <div class="widget"><div><div class="w-time">${clock()}</div><div class="w-sub">${esc(world.zone)}</div></div>
            <div class="w-weather"><i class="fa-solid ${icon}"></i>${label}</div></div>
        <div class="apps">
            ${app('contacts', 'ic-contacts', 'fa-solid fa-address-book', 'Contacts')}
            ${app('settings', 'ic-settings', 'fa-solid fa-gear', 'Settings')}
            ${app('snapmatic', 'ic-camera', 'fa-solid fa-camera', 'Snapmatic', 0, true)}
            ${app('maps', 'ic-maps', 'fa-solid fa-map-location-dot', 'Maps', 0, true)}
            ${app('fleeca', 'ic-bank', 'fa-solid fa-building-columns', 'Fleeca', 0, !data.bank)}
            ${app('lifeinvader', 'ic-life', 'fa-solid fa-user-group', 'Lifeinvader', 0, true)}
        </div>
        <div class="dock">
            ${app('phone', 'ic-phone', 'fa-solid fa-phone', 'Phone', missed)}
            ${app('messages', 'ic-msg', 'fa-solid fa-comment', 'Messages', unread)}
            ${app('contacts', 'ic-contacts', 'fa-solid fa-address-book', 'Contacts')}
            ${app('settings', 'ic-settings', 'fa-solid fa-gear', 'Settings')}
        </div>
    </div>`;
};

const phoneTabs = (on) => `<div class="tabs">
    <button data-tab="recents" class="${on === 'recents' ? 'on' : ''}"><i class="fa-solid fa-clock"></i>Recents</button>
    <button data-tab="contacts" class="${on === 'contacts' ? 'on' : ''}"><i class="fa-solid fa-address-book"></i>Contacts</button>
    <button data-tab="keypad" class="${on === 'keypad' ? 'on' : ''}"><i class="fa-solid fa-table-cells"></i>Keypad</button>
</div>`;

let dialled = '';
views.phone = (p) => {
    const tab = p.tab || 'keypad';
    if (tab === 'recents') {
        const list = data.calls || [];
        return `<div class="app-view"><div class="app-head"><h2>Recents</h2></div><div class="app-body">
            ${list.length ? list.map((c) => {
                const out = c.caller === data.number;
                const other = out ? c.receiver : c.caller;
                const missed = !out && c.status === 'missed';
                return `<div class="row ${missed ? 'missed' : ''}" data-call="${esc(other)}">${avatar(other)}
                    <div class="main"><strong>${esc(nameOf(other))}</strong><small><i class="fa-solid ${out ? 'fa-arrow-up-right-from-square' : 'fa-arrow-down'}"></i> ${out ? 'Outgoing' : missed ? 'Missed' : 'Incoming'}${c.duration ? ` · ${Math.floor(c.duration / 60)}:${pad(c.duration % 60)}` : ''}</small></div>
                    <div class="side">${timeAgo(c.created_at)}</div></div>`;
            }).join('') : '<div class="empty"><i class="fa-solid fa-phone-slash"></i>No recent calls</div>'}
        </div>${phoneTabs('recents')}</div>`;
    }
    if (tab === 'contacts') return views.contacts({ inPhone: true });
    const match = (data.contacts || []).find((c) => c.number === dialled);
    const key = (d, l = '') => `<button class="key" data-key="${d}"><b>${d}</b><small>${l}</small></button>`;
    return `<div class="app-view"><div class="keypad">
        <div class="dialled">${esc(dialled)}</div><div class="dial-name">${match ? esc(match.name) : ''}</div>
        <div class="keys">
            ${key(1)}${key(2, 'ABC')}${key(3, 'DEF')}${key(4, 'GHI')}${key(5, 'JKL')}${key(6, 'MNO')}${key(7, 'PQRS')}${key(8, 'TUV')}${key(9, 'WXYZ')}${key('-')}${key(0, '+')}${key('#')}
        </div>
        <div class="dial-actions"><span></span><button class="call-btn" data-act="dial"><i class="fa-solid fa-phone"></i></button>
            <button class="del-btn" data-act="backspace"><i class="fa-solid fa-delete-left"></i></button></div>
    </div>${phoneTabs('keypad')}</div>`;
};

views.contacts = (p = {}) => {
    const q = (p.q || '').toLowerCase();
    const list = (data.contacts || []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.number.includes(q));
    return `<div class="app-view"><div class="app-head"><h2>Contacts</h2><button class="icon-btn" data-act="newContact"><i class="fa-solid fa-plus"></i></button></div>
        <div class="app-body">
            <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="contact-search" placeholder="Search" value="${esc(p.q || '')}"></div>
            <div class="row" style="cursor:default">${avatar(data.number)}<div class="main"><strong>My number</strong><small>${esc(data.number)}</small></div></div>
            ${list.length ? list.map((c) => `<div class="row" data-contact="${c.id}">${avatar(c.number)}<div class="main"><strong>${esc(c.name)}</strong><small>${esc(c.number)}</small></div>
                <button class="act" data-call="${esc(c.number)}"><i class="fa-solid fa-phone"></i></button><button class="act" data-msg="${esc(c.number)}"><i class="fa-solid fa-comment"></i></button></div>`).join('')
                : '<div class="empty"><i class="fa-solid fa-address-book"></i>No contacts yet</div>'}
        </div>${p.inPhone ? phoneTabs('contacts') : ''}</div>`;
};

views.contact = (p) => {
    const c = p.id ? (data.contacts || []).find((x) => x.id === p.id) : { name: '', number: p.number || '' };
    if (!c) return views.contacts();
    return `<div class="app-view"><div class="app-head"><button class="back" data-act="back"><i class="fa-solid fa-chevron-left"></i> Back</button><h2></h2></div>
        <div class="app-body"><div class="form">
            <div class="big-avatar" style="background:${colorOf(c.number || 'new')}">${c.name ? initials(c.name) : '<i class="fa-solid fa-user"></i>'}</div>
            ${p.id ? `<div class="quick"><button data-call="${esc(c.number)}"><i class="fa-solid fa-phone"></i>Call</button><button data-msg="${esc(c.number)}"><i class="fa-solid fa-comment"></i>Message</button></div>` : ''}
            <label class="field"><span>Name</span><input id="c-name" maxlength="50" value="${esc(c.name)}" placeholder="Lamar Davis"></label>
            <label class="field"><span>Number</span><input id="c-number" maxlength="16" value="${esc(c.number)}" placeholder="555-0123"></label>
            <button class="btn primary" data-act="saveContact" data-id="${p.id || ''}" data-old="${esc(c.number)}">Save</button>
            ${p.id ? `<button class="btn danger" data-act="deleteContact" data-id="${p.id}">Delete contact</button>` : ''}
        </div></div></div>`;
};

views.messages = () => {
    const list = data.threads || [];
    return `<div class="app-view"><div class="app-head"><h2>Messages</h2><button class="icon-btn" data-act="newMessage"><i class="fa-solid fa-pen-to-square"></i></button></div>
        <div class="app-body">${list.length ? list.map((t) => `<div class="row" data-thread="${esc(t.number)}">${avatar(t.number)}
            <div class="main"><strong>${esc(nameOf(t.number))}</strong><small>${t.mine ? 'You: ' : ''}${esc(t.last)}</small></div>
            <div class="side">${timeAgo(t.time)}${t.unread ? `<br><span class="dot">${t.unread}</span>` : ''}</div></div>`).join('')
            : '<div class="empty"><i class="fa-solid fa-comments"></i>No messages yet</div>'}</div></div>`;
};

views.newMessage = () => `<div class="app-view"><div class="app-head"><button class="back" data-act="back"><i class="fa-solid fa-chevron-left"></i> Back</button><h2></h2></div>
    <div class="app-body"><div class="form">
        <label class="field"><span>To</span><input id="nm-to" maxlength="16" placeholder="555-0123"></label>
        <button class="btn primary" data-act="startThread">Start conversation</button>
        ${(data.contacts || []).map((c) => `<div class="row" data-thread="${esc(c.number)}">${avatar(c.number)}<div class="main"><strong>${esc(c.name)}</strong><small>${esc(c.number)}</small></div></div>`).join('')}
    </div></div></div>`;

views.thread = (p) => `<div class="app-view">
    <div class="app-head"><button class="back" data-act="back"><i class="fa-solid fa-chevron-left"></i></button>
        ${avatar(p.number)}<h2 style="font-size:17px">${esc(nameOf(p.number))}</h2>
        <button class="icon-btn" data-call="${esc(p.number)}"><i class="fa-solid fa-phone"></i></button></div>
    <div class="thread" id="thread">${(p.messages || []).map(bubble).join('') || '<div class="empty">Say hi 👋</div>'}</div>
    <div class="composer"><textarea id="msg-input" rows="1" maxlength="500" placeholder="iMessage"></textarea><button data-act="send"><i class="fa-solid fa-arrow-up"></i></button></div>
</div>`;
const bubble = (m) => `<div class="bubble ${m.mine ? 'me' : 'them'}">${esc(m.body)}</div>`;

views.settings = () => {
    const s = data.settings || {};
    return `<div class="app-view"><div class="app-head"><h2>Settings</h2></div><div class="app-body">
        <div class="group-title">Phone chip</div>
        <div class="group">
            <div class="item"><span class="ic ic-phone"><i class="fa-solid fa-sim-card"></i></span><span>Number</span><b>${esc(data.number)}</b></div>
            <div class="item"><span class="ic ic-contacts"><i class="fa-solid fa-address-book"></i></span><span>Contacts on chip</span><b>${(data.contacts || []).length}</b></div>
        </div>
        <div class="group-title">Sounds</div>
        <div class="group"><div class="item"><span class="ic ic-settings"><i class="fa-solid fa-bell-slash"></i></span><span>Silent mode</span><button class="switch ${s.silent ? 'on' : ''}" data-act="silent"></button></div></div>
        <div class="group-title">Wallpaper</div>
        <div class="group"><div class="walls">${Object.keys(WALLPAPERS).map((k) => `<button class="${(s.wallpaper || 'lsnight') === k ? 'on' : ''}" data-wall="${k}" title="${WALL_NAMES[k]}" style="background:${WALLPAPERS[k]}"></button>`).join('')}</div></div>
        <p class="empty" style="padding:10px">iFruit OS · Your data is stored on your phone chip</p>
    </div></div>`;
};

// ------------------------------------------------------------ Fleeca (arca_bank)
const usd = (n) => `${Math.floor(Number(n) || 0).toLocaleString()}`;
const accountSub = (a) => (a.kind === 'personal' ? 'Personal' : a.kind === 'job' ? 'Job account' : '#' + esc(a.number));
views.fleeca = (p) => {
    const b = p.bank;
    if (!b) return '<div class="app-view"><div class="app-head"><h2>Fleeca</h2></div><div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Loading…</div></div>';
    const total = b.accounts.reduce((t, a) => t + a.balance, 0);
    return `<div class="app-view"><div class="app-head"><h2>Fleeca</h2></div><div class="app-body">
        <div class="bank-total"><small>Total across ${b.accounts.length} account${b.accounts.length === 1 ? '' : 's'}</small><b>${usd(total)}</b><span>Citizen ID ${esc(b.citizenid)}</span></div>
        ${b.accounts.map((a) => `<div class="bank-card ${esc(a.kind)}" data-bacc="${esc(a.ref)}">
            <div><i class="${esc(a.icon)}"></i> ${esc(a.label)}<small>${accountSub(a)}${a.card ? ' · <i class="fa-solid fa-credit-card"></i>' : ''}</small></div>
            <b>${usd(a.balance)}</b></div>`).join('')}
        <p class="empty" style="padding:12px">Open accounts, add people and set card PINs at any Fleeca branch.</p>
    </div></div>`;
};
views.fleecaAccount = (p) => {
    const a = p.account;
    return `<div class="app-view"><div class="app-head"><button class="back" data-act="back"><i class="fa-solid fa-chevron-left"></i> Fleeca</button><h2></h2></div><div class="app-body">
        <div class="bank-total"><small>${esc(a.label)}</small><b>${usd(a.balance)}</b><span>${a.kind === 'personal' ? 'Citizen ID ' + esc(a.number) : 'Account #' + esc(a.number)}</span></div>
        <button class="btn primary" style="width:100%;margin-bottom:12px" data-act="bankTransfer"><i class="fa-solid fa-right-left"></i> Transfer</button>
        <div class="group-title">Activity</div>
        ${(p.tx || []).length ? p.tx.map((t) => `<div class="row" style="cursor:default"><div class="main"><strong>${esc(t.description)}</strong><small>${timeAgo(t.created_at)}${t.actor ? ' · ' + esc(t.actor) : ''}</small></div>
            <div class="side" style="font-weight:700;color:${t.amount > 0 ? 'var(--accent)' : 'var(--text)'}">${t.amount > 0 ? '+' : '−'}${usd(Math.abs(t.amount))}</div></div>`).join('')
            : '<div class="empty">No activity yet</div>'}
    </div></div>`;
};
views.fleecaTransfer = (p) => `<div class="app-view"><div class="app-head"><button class="back" data-act="back"><i class="fa-solid fa-chevron-left"></i> Back</button><h2></h2></div>
    <div class="app-body"><div class="form">
        <div class="bank-total"><small>From ${esc(p.account.label)}</small><b>${usd(p.account.balance)}</b></div>
        <label class="field"><span>To · citizen ID or account number</span><input id="bt-target" maxlength="20" placeholder="ABC12345 or 1001"></label>
        <label class="field"><span>Amount</span><input id="bt-amount" type="number" min="1" placeholder="0"></label>
        <label class="field"><span>Note</span><input id="bt-note" maxlength="60" placeholder="Optional"></label>
        <button class="btn primary" data-act="bankSend">Send money</button>
    </div></div></div>`;

async function openFleeca(push = true) {
    go('fleeca', {}, push);
    const bank = await post('bank');
    if (current.name === 'fleeca') { current.bank = bank || { accounts: [], citizenid: '' }; render(); }
}

function toastIn(text, ok = true) {
    const t = document.createElement('div');
    t.className = 'note';
    t.style.cssText = 'position:absolute;left:14px;right:14px;top:52px;z-index:13';
    t.innerHTML = `<span class="ic ${ok ? 'ic-bank' : 'ic-settings'}"><i class="fa-solid ${ok ? 'fa-check' : 'fa-xmark'}"></i></span><div><strong>${esc(text)}</strong></div>`;
    view.appendChild(t);
    setTimeout(() => t.remove(), 2400);
}

views.nochip = () => `<div class="nochip">
    <i class="fa-solid fa-triangle-exclamation"></i>
    <div class="glitch" data-text="OS VISUAL ISSUE">OS VISUAL ISSUE</div>
    <p>No phone chip detected. Insert a chip to restore your number, contacts and messages.</p>
    <code>ERR_CHIP_NOT_FOUND · 0x3F</code>
</div>`;

// ------------------------------------------------------------ call overlay
function callOverlay() {
    if (!call) return '';
    const label = call.state === 'incoming' ? 'Incoming call…' : call.state === 'outgoing' ? 'Calling…' : `<span id="call-time">0:00</span>`;
    const controls = call.state === 'incoming'
        ? `<div><button class="call-btn end" data-act="hangup"><i class="fa-solid fa-phone-slash"></i></button>Decline</div>
           <div><button class="call-btn" data-act="answer"><i class="fa-solid fa-phone"></i></button>Accept</div>`
        : `<div><button class="call-btn end" data-act="hangup"><i class="fa-solid fa-phone-slash"></i></button>End</div>`;
    return `<div class="call ${call.state !== 'active' ? 'ringing' : ''}">
        ${avatar(call.number)}<h3>${esc(nameOf(call.number))}</h3><div class="num">${contactOf(call.number) ? esc(call.number) : 'Mobile'}</div>
        <div class="state">${label}</div><div class="controls">${controls}</div></div>`;
}

// ------------------------------------------------------------ render
function render() {
    $('#sb-time').textContent = clock();
    if (!data) return;
    if (data.nochip) {
        view.innerHTML = views.nochip();
        screen.classList.remove('dim');
        return;
    }
    setWallpaper();
    screen.classList.toggle('dim', current.name !== 'lock' && current.name !== 'home');
    view.innerHTML = (views[current.name] || views.home)(current) + callOverlay();
    if (current.name === 'thread') {
        const t = $('#thread');
        t.scrollTop = t.scrollHeight;
        $('#msg-input')?.focus();
    }
}

// ------------------------------------------------------------ actions
async function openThread(number, push = true) {
    const messages = await post('thread', { number });
    const th = (data.threads || []).find((t) => t.number === number);
    if (th) th.unread = 0;
    go('thread', { number, messages: messages || [] }, push);
}

async function sendMessage() {
    const input = $('#msg-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const msg = await post('send', { number: current.number, body });
    if (!msg) return;
    current.messages = [...(current.messages || []), msg];
    const th = (data.threads || []).find((t) => t.number === current.number);
    if (th) Object.assign(th, { last: body, mine: true, time: Date.now() });
    else (data.threads = data.threads || []).unshift({ number: current.number, last: body, mine: true, time: Date.now(), unread: 0 });
    const t = $('#thread');
    if (t) { if (!current.messages[1]) t.innerHTML = ''; t.insertAdjacentHTML('beforeend', bubble(msg)); t.scrollTop = t.scrollHeight; }
}

function startCall(number) {
    if (!number || call) return;
    post('call', { number });
}

view.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act],[data-app],[data-tab],[data-key],[data-call],[data-msg],[data-thread],[data-contact],[data-wall],[data-bacc]');
    if (!el) return;
    const d = el.dataset;

    if (d.call) { e.stopPropagation(); return startCall(d.call); }
    if (d.msg) { e.stopPropagation(); return openThread(d.msg); }
    if (d.thread) return openThread(d.thread);
    if (d.contact) return go('contact', { id: Number(d.contact) });
    if (d.bacc) {
        const account = current.bank.accounts.find((a) => a.ref === d.bacc);
        const tx = await post('bankTx', { ref: d.bacc });
        return go('fleecaAccount', { account, tx: tx || [] });
    }
    if (d.tab) return go('phone', { tab: d.tab }, false);
    if (d.key !== undefined) { if (dialled.length < 16) dialled += d.key; return render(); }
    if (d.wall) { data.settings.wallpaper = d.wall; post('saveSettings', data.settings); return render(); }
    if (d.app) {
        if (el.classList.contains('off')) return;
        if (d.app === 'phone') return go('phone', { tab: 'keypad' });
        if (d.app === 'fleeca') return openFleeca();
        return go(d.app);
    }

    switch (d.act) {
        case 'unlock': return go('home', {}, false);
        case 'bankTransfer': return go('fleecaTransfer', { account: current.account });
        case 'bankSend': {
            const res = await post('bankTransfer', { ref: current.account.ref, target: $('#bt-target').value.trim(), amount: Number($('#bt-amount').value), note: $('#bt-note').value });
            if (!res) return;
            if (res.ok) { stack = [{ name: 'home' }]; await openFleeca(false); }
            toastIn(res.msg || (res.ok ? 'Sent' : 'Failed'), res.ok);
            return;
        }
        case 'back': return back();
        case 'backspace': dialled = dialled.slice(0, -1); return render();
        case 'dial': return startCall(dialled);
        case 'answer': return post('answer');
        case 'hangup': return post('hangup');
        case 'send': return sendMessage();
        case 'newContact': return go('contact', {});
        case 'newMessage': return go('newMessage');
        case 'startThread': { const to = $('#nm-to').value.trim(); if (/^[\d-]{3,16}$/.test(to)) openThread(to, false); return; }
        case 'silent': data.settings.silent = !data.settings.silent; post('saveSettings', data.settings); return render();
        case 'saveContact': {
            const name = $('#c-name').value.trim(), number = $('#c-number').value.trim();
            if (!name || !/^[\d-]{3,16}$/.test(number)) return;
            const list = await post('saveContact', { id: d.id || null, name, number, oldNumber: d.old });
            if (list) { data.contacts = list; back(); }
            return;
        }
        case 'deleteContact': {
            const list = await post('deleteContact', { id: Number(d.id) });
            if (list) { data.contacts = list; back(); }
            return;
        }
    }
});

view.addEventListener('input', (e) => {
    if (e.target.id === 'contact-search') {
        const pos = e.target.selectionStart;
        current.q = e.target.value;
        render();
        const s = $('#contact-search');
        s.focus(); s.setSelectionRange(pos, pos);
    }
});
view.addEventListener('keydown', (e) => {
    if (e.target.id === 'msg-input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
// tell Lua when we're typing so walking keys don't move the player
document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea')) post('typing', { state: true }); });
document.addEventListener('focusout', (e) => { if (e.target.matches('input, textarea')) post('typing', { state: false }); });

$('#home-bar').addEventListener('click', () => { if (data && !data.nochip && current.name !== 'lock') home(); });

document.addEventListener('keydown', (e) => {
    if (phoneEl.classList.contains('hidden')) return;
    if (e.key === 'Escape') return post('close');
    if (document.activeElement && document.activeElement.matches('input, textarea')) return;
    if (current.name === 'phone' && (current.tab || 'keypad') === 'keypad') {
        if (/^[0-9#-]$/.test(e.key) && dialled.length < 16) { dialled += e.key; render(); }
        if (e.key === 'Backspace') { dialled = dialled.slice(0, -1); render(); }
        if (e.key === 'Enter') startCall(dialled);
    }
});

// ------------------------------------------------------------ banners (phone closed)
function banner(html, cls = '', ms = 5000) {
    const el = document.createElement('div');
    el.className = `banner ${cls}`;
    el.innerHTML = html;
    $('#banners').prepend(el);
    if (ms) setTimeout(() => { el.classList.add('leave'); setTimeout(() => el.remove(), 260); }, ms);
    return el;
}
let callBanner = null;
function clearCallBanner() { if (callBanner) { callBanner.remove(); callBanner = null; } }

// ------------------------------------------------------------ messages from Lua
const isOpen = () => !phoneEl.classList.contains('hidden') && !phoneEl.classList.contains('out');

window.addEventListener('message', ({ data: msg }) => {
    const p = msg.data;
    switch (msg.action) {
        case 'open':
            data = p;
            world = p.world || world;
            call = p.call || call;
            data.settings = data.settings || {};
            phoneEl.classList.remove('hidden', 'out');
            clearCallBanner();
            stack = [];
            current = call ? { name: 'home' } : { name: 'lock' };
            render();
            break;
        case 'close':
            phoneEl.classList.add('out');
            setTimeout(() => { if (phoneEl.classList.contains('out')) phoneEl.classList.add('hidden'); }, 260);
            if (call && call.state === 'incoming') showCallBanner();
            break;
        case 'world':
            world = p;
            $('#sb-time').textContent = clock();
            if (current.name === 'lock' || current.name === 'home') render();
            break;
        case 'message': {
            if (!data || data.nochip || p.to !== data.number) {
                // phone not opened yet this session: still show the banner
                banner(`<span class="ic ic-msg"><i class="fa-solid fa-comment"></i></span><div><strong>${esc(p.from)}</strong><span>${esc(p.body)}</span></div>`);
                break;
            }
            const th = (data.threads = data.threads || []).find((t) => t.number === p.from);
            const viewing = isOpen() && current.name === 'thread' && current.number === p.from;
            if (th) Object.assign(th, { last: p.body, mine: false, time: Date.now(), unread: viewing ? 0 : (th.unread || 0) + 1 });
            else data.threads.unshift({ number: p.from, last: p.body, mine: false, time: Date.now(), unread: viewing ? 0 : 1 });
            if (viewing) {
                current.messages.push({ body: p.body, mine: false });
                $('#thread')?.insertAdjacentHTML('beforeend', bubble({ body: p.body, mine: false }));
                const t = $('#thread'); if (t) t.scrollTop = t.scrollHeight;
                post('thread', { number: p.from }); // marks it read
            } else {
                lockNotes.unshift({ icon: 'fa-comment', cls: 'ic-msg', title: nameOf(p.from), text: p.body });
                if (isOpen()) { if (current.name !== 'thread') render(); }
                else banner(`<span class="ic ic-msg"><i class="fa-solid fa-comment"></i></span><div><strong>${esc(nameOf(p.from))}</strong><span>${esc(p.body)}</span></div>`);
            }
            break;
        }
        case 'call':
            call = p;
            clearInterval(callTimer);
            if (call.state === 'active') {
                const start = Date.now();
                callTimer = setInterval(() => {
                    const s = Math.floor((Date.now() - start) / 1000);
                    const el = $('#call-time'); if (el) el.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
                }, 1000);
            }
            if (isOpen()) render(); else if (call.state === 'incoming') showCallBanner(); else clearCallBanner();
            break;
        case 'callEnded':
            clearInterval(callTimer);
            if (call && call.state === 'incoming' && p.status === 'missed') lockNotes.unshift({ icon: 'fa-phone', cls: 'ic-phone', title: 'Missed call', text: nameOf(call.number) });
            call = null;
            clearCallBanner();
            if (isOpen()) {
                render();
                const v = view.firstElementChild;
                if (v) { const t = document.createElement('div'); t.className = 'note'; t.style.cssText = 'position:absolute;left:14px;right:14px;top:52px;z-index:13'; t.innerHTML = `<span class="ic ic-phone"><i class="fa-solid fa-phone-slash"></i></span><div><strong>${esc(p.text)}</strong></div>`; view.appendChild(t); setTimeout(() => t.remove(), 2200); }
            } else {
                banner(`<span class="ic ic-phone"><i class="fa-solid fa-phone-slash"></i></span><div><strong>${esc(p.text)}</strong></div>`, '', 2500);
            }
            break;
    }
});

function showCallBanner() {
    clearCallBanner();
    if (!call) return;
    callBanner = banner(`<span class="ic ic-phone"><i class="fa-solid fa-phone"></i></span><div><strong>${esc(nameOf(call.number))}</strong><span>Incoming call · press <kbd>M</kbd></span></div>`, 'calling', 0);
}
