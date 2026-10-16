/* ===============================================================
   CAMBRIDGE CAFFS — college cafeteria menus, and nothing else.

   Every half hour a trigger reads each college's published menu and
   keeps it in Script Properties (chunked: one property holds 9 KB).
   The page asks for all of them at once and never waits on a college.

     Jesus       apps.jesus.cam.ac.uk menu board (one page per meal/day)
     Churchill   the menu page, read through WordPress's JSON API
                 (the HTML page sits behind a firewall that blocks scripts)
     Clare Hall  the public Sway, through the JSON the Sway player loads
     Corpus      corpus.cam.ac.uk/foodmenu/menu (one page per day)
     Darwin      darwin.cam.ac.uk/dine/weekly-menu (several weeks, one page)
     Downing     Kafoodle interactive menu, through its public JSON API
     Magdalene   Ten Kites menu (viewthe.menu) — a rotating week with no dates,
                 so its weekdays are placed in the current week
     Newnham     newn.cam.ac.uk/weekly-menus (lunch only)
     Queens'     the weekly-menu page ("Week Commencing ...")
     Robinson    garden-restaurant-menu?date= (one page per day)
     Selwyn      hall-menu?menu_date= (one page per day)
     St John's   menu.joh.cam (the Buttery, a week ahead)
     Wolfson     cafeteria-menus (several days on one page)
     West Hub    University Catering canteen page (weekly plain text)
     Trinity     weekly PDF (a Word table), read with the PDF reader below
     St Edmund's weekly lunch and supper PDFs (PowerPoint grids), listed in
                 the college's WordPress feed
     Fitzwilliam the Buttery's weekly PDF, dated only by its link text
     Homerton    the catering page's menu widget, through its JSON API
     Lucy Cav.   NOT IN COLLEGES: its menu is a Canva design, and Canva answers
                 Apps Script with a bot check (403, 16 Oct 2026). The reader is
                 kept below (fetchLucy_, probeLucy) in case that changes.
     Pembroke    a three-week cycle of PDFs; the page lists the weeks each is served
     Peterhouse  petmenu.co.uk/servery.json, a student-run copy of the College's
                 PDFs, the whole term in one file
     St Cath's   a four-week cycle of lunch, dinner and weekend PDFs, each dated
                 inside ("(12.10/09.11)": the Mondays it is served)

   Every read goes through normalise_(), so all colleges come out the same:
   one set of course names in one order, one spelling per allergen, and
   colleges that don't split their menu into courses get them guessed from
   the dish names.

   SPEED AND FRESHNESS: the page never waits on a college. A trigger runs
   refresh() every 30 minutes; it re-reads every college, keeps the last good
   copy of any that fail, then builds the whole reply once and caches it.
   doGet() only ever hands out that last saved copy, written straight into
   the page, so a visitor sees the menus at once with no second request.
   If the trigger has gone missing, the next visit puts it back.

   To add a college: write fetchX_() returning an array of days in the
   shape below, and add a line to COLLEGES (and a colour in caff.html).

     day = { date:'2026-09-16',
             lunch|dinner|menu: [ { name:'Soup', dishes:[
               { name, health, carbon, kcal, desc, diet:[], allergens:[],
                 noAllergens }  // true only when the college says "none"
             ] } ],
             notes:  { lunch:['...'] },                 // optional
             hours:  { lunch:'12:00–14:00' },           // optional
             labels: { lunch:'Brunch' } }               // optional

   marks: 'full' when every dish carries its dietary marks, so an unmarked dish
   really isn't vegan etc. Otherwise ('partial') unmarked dishes stay "unknown".

   diet keys: vegan, vegetarian, halal, halal-option, gluten-free, gf-option, pescatarian, wf-df
   dishes may also carry desc (a description) and kcal.

   Setup (once):
     1. New Apps Script project, paste this file in as Code.gs.
        Add an HTML file named "caff" containing caff.html.
     2. Run installTrigger() from the editor and grant permissions.
     3. Deploy > New deployment > Web app,
        Execute as: Me, Who has access: Anyone.
   =============================================================== */

const TZ = 'Europe/London';
const EVERY_MINUTES = 30;
const CHUNK = 8000;
const DAYS_AHEAD = 4;              // today plus four: five days on the page
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTHS = ['january','february','march','april','may','june','july','august',
                'september','october','november','december'];

const COLLEGES = [
  { id: 'jesus',     name: 'Jesus',      full: 'Jesus College', marks: 'full',
    url: 'https://www.jesus.cam.ac.uk/college/life-jesus/food-and-drink/cafeteria-lunch-menu',
    fetch: function(){ return fetchJesus_(); } },
  { id: 'churchill', name: 'Churchill',  full: 'Churchill College',
    url: 'https://www.chu.cam.ac.uk/about/campus/dining-at-college/lunch-and-dinner-menu/',
    fetch: function(){ return fetchChurchill_(); } },
  { id: 'clarehall', name: 'Clare Hall', full: 'Clare Hall',
    url: 'https://sway.cloud.microsoft/b7Zz74Q2g96EIhE9',
    fetch: function(){ return fetchClareHall_(); } },
  { id: 'corpus',    name: 'Corpus',     full: 'Corpus Christi College',
    url: 'https://www.corpus.cam.ac.uk/current-students/food-corpus/cafeteria',
    fetch: function(){ return fetchCorpus_(); } },
  { id: 'darwin',    name: 'Darwin',     full: 'Darwin College',
    url: 'https://www.darwin.cam.ac.uk/dine/weekly-menu/',
    fetch: function(){ return fetchDarwin_(); } },
  { id: 'downing',   name: 'Downing',    full: 'Downing College', marks: 'full',
    url: 'https://wba.kafoodle.com/17260/4094',
    fetch: function(){ return fetchDowning_(); } },
  { id: 'fitzwilliam', name: 'Fitzwilliam', full: 'Fitzwilliam College',
    note: 'Fitzwilliam puts out the Buttery menu as a PDF each week. Dishes are marked (v) and (vegan).',
    url: 'https://www.fitz.cam.ac.uk/cafe-bar-and-buttery',
    fetch: function(){ return fetchFitzwilliam_(); } },
  { id: 'homerton',  name: 'Homerton',   full: 'Homerton College',
    url: 'https://www.homerton.cam.ac.uk/catering',
    fetch: function(){ return fetchHomerton_(); } },
  { id: 'magdalene', name: 'Magdalene',  full: 'Magdalene College', marks: 'full',
    note: 'Magdalene publishes the same weekly menu on a rota, with no dates on it, so it is shown against this week.',
    url: 'https://viewthe.menu/lyzv',
    fetch: function(){ return fetchMagdalene_(); } },
  { id: 'newnham',   name: 'Newnham',    full: 'Newnham College',
    url: 'https://newn.cam.ac.uk/weekly-menus',
    fetch: function(){ return fetchNewnham_(); } },
  { id: 'pembroke',  name: 'Pembroke',   full: 'Pembroke College',
    note: 'Pembroke runs a three-week menu cycle, one PDF a week, and its page says which weeks each is served.',
    url: 'https://www.pem.cam.ac.uk/college/catering/information-students/servery-menu',
    fetch: function(){ return fetchPembroke_(); } },
  { id: 'peterhouse', name: 'Peterhouse', full: 'Peterhouse',
    note: 'Peterhouse’s menu comes from petmenu.co.uk, a student-run site built from the College’s PDFs. It isn’t official, so it may be incomplete.',
    url: 'https://petmenu.co.uk/',
    fetch: function(){ return fetchPeterhouse_(); } },
  { id: 'queens',    name: 'Queens’',    full: 'Queens’ College',
    url: 'https://www.queens.cam.ac.uk/life-at-queens/catering/dining-hall/weekly-menu/',
    fetch: function(){ return fetchQueens_(); } },
  { id: 'robinson',  name: 'Robinson',   full: 'Robinson College', marks: 'full',
    url: 'https://www.robinson.cam.ac.uk/college-life/garden-restaurant-menu',
    fetch: function(){ return fetchRobinson_(); } },
  { id: 'selwyn',    name: 'Selwyn',     full: 'Selwyn College',
    url: 'https://www.sel.cam.ac.uk/current-members/hall-menu',
    fetch: function(){ return fetchSelwyn_(); } },
  { id: 'stcatharines', name: 'St Catharine’s', full: 'St Catharine’s College',
    note: 'St Catharine’s runs a four-week cycle of lunch, dinner and weekend PDFs. Dishes come from three counters, and only marks written into a dish’s name are shown.',
    url: 'https://www.caths.cam.ac.uk/students/college-facilities-and-forms/catering-for-our-community/cafeteria',
    fetch: function(){ return fetchStCatharines_(); } },
  { id: 'stjohns',   name: 'St John’s',  full: 'St John’s College',
    url: 'https://menu.joh.cam/',
    fetch: function(){ return fetchStJohns_(); } },
  { id: 'wolfson',   name: 'Wolfson',    full: 'Wolfson College',
    url: 'https://www.wolfson.cam.ac.uk/food/cafeteria-menus',
    fetch: function(){ return fetchWolfson_(); } },
  { id: 'trinity',   name: 'Trinity',    full: 'Trinity College',
    note: 'Trinity puts out one PDF a week. Dishes are marked (v), (vegan) and WF/DF (wheat and dairy free), and the menu warns that anything may contain traces of nuts.',
    url: 'https://www.trin.cam.ac.uk/download/hall-menu-this-week/',
    fetch: function(){ return fetchTrinity_(); } },
  { id: 'stedmunds', name: 'St Edmund’s', full: 'St Edmund’s College',
    note: 'St Edmund’s puts out a lunch and a supper PDF each week. Calories are per 100 g, and allergens aren’t listed, so ask the team.',
    url: 'https://my.st-edmunds.cam.ac.uk/category/menus/',
    fetch: function(){ return fetchStEdmunds_(); } },
  { id: 'westhub',   name: 'West Hub',   full: 'West Hub Canteen', cafe: true,
    note: 'A University café on the West Cambridge site, open Monday to Friday. Only the hot mains are listed each day, with no dietary marks.',
    url: 'https://www.catering.admin.cam.ac.uk/cafes/west-hub-canteen',
    fetch: function(){ return fetchUniCafe_('https://www.catering.admin.cam.ac.uk/cafes/west-hub-canteen'); } },
  { id: 'greenwich', name: 'Greenwich House', full: 'Greenwich House Café', cafe: true,
    note: 'A University café at Madingley Rise, open Monday to Friday. It cooks from the West Hub kitchen, so the mains often match, and there are no dietary marks.',
    url: 'https://www.catering.admin.cam.ac.uk/cafes/greenwich-house-cafe',
    fetch: function(){ return fetchUniCafe_('https://www.catering.admin.cam.ac.uk/cafes/greenwich-house-cafe'); } },
  { id: 'scholars',  name: 'Scholars Brew', full: 'Scholars Brew', cafe: true,
    note: 'A café on Charles Babbage Road by the West Hub, open 08:00 to 16:00. Its page lists the hot dishes for each weekday, with their sides, and no dietary marks.',
    url: 'https://www.catering.admin.cam.ac.uk/cafes/scholars-brew',
    fetch: function(){ return fetchScholars_(); } }
];

/* ---------- web ---------- */

function doGet(e){
  const p = (e && e.parameter) || {};
  if (p.json !== undefined){
    return ContentService.createTextOutput(payload_()).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    /* the menus go into the page itself, so it draws without a second request */
    const boot = payload_().replace(/</g, '\\u003c');
    const html = HtmlService.createHtmlOutputFromFile('caff').getContent()
      .replace('/*BOOT*/null', function(){ return boot; });
    return HtmlService.createHtmlOutput(html)
      .setTitle('Cam Caffs')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    /* no HTML file called "caff" in this project: say so instead of serving raw JSON */
    return HtmlService.createHtmlOutput(
      '<p style="font:16px/1.6 system-ui;max-width:34em;margin:40px auto;padding:0 20px">' +
      'This project has no HTML file named <b>caff</b>, so there is no page to serve. ' +
      'Add caff.html to the project (File, HTML, name it <b>caff</b>), then deploy again.<br><br>' +
      'The menus themselves are fine — <a href="?json">?json</a> returns them.</p>').setTitle('Cam Caffs');
  }
}

/* The whole reply as one string, cached for the day it was built for. */
function payload_(){
  const key = 'payload_' + today_();
  const cached = cacheGet_(key);
  if (cached) return cached;
  const menus = getMenus();
  const s = JSON.stringify(menus);
  cachePut_(key, s);
  /* Nothing refreshed for two hours: the trigger may have been removed. */
  const newest = Math.max.apply(null, menus.colleges.map(function(c){ return c.at || 0; }).concat([0]));
  if (Date.now() - newest > 2 * 3600 * 1000) ensureTrigger_();
  return s;
}
function ensureTrigger_(){
  try {
    const has = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction() === 'refresh'; });
    if (!has) ScriptApp.newTrigger('refresh').timeBased().everyMinutes(EVERY_MINUTES).create();
  } catch (e) { Logger.log('trigger: ' + e); }
}
function cachePut_(key, s){
  const c = CacheService.getScriptCache(), parts = {}, size = 90000;
  let n = 0;
  for (let i = 0; i < s.length; i += size) parts[key + '_' + (n++)] = s.slice(i, i + size);
  parts[key + '_n'] = String(n);
  try { c.putAll(parts, 21600); } catch (e) {}
}
function cacheGet_(key){
  const c = CacheService.getScriptCache();
  const n = Number(c.get(key + '_n') || 0);
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = c.getAll(keys);
  let s = '';
  for (let i = 0; i < n; i++){ if (got[keys[i]] == null) return null; s += got[keys[i]]; }
  return s;
}

/* Also called directly by the page through google.script.run. */
function getMenus(){
  const today = today_();
  const props = PropertiesService.getScriptProperties().getProperties();
  return {
    colleges: COLLEGES.map(function(c){
      /* Only ever the last saved copy: a visitor never waits on a college. */
      const m = load_(c.id, props) || { at: 0, days: [] };
      return {
        id: c.id, name: c.name, full: c.full, url: c.url, at: m.at || 0,
        marks: c.marks || 'partial', note: c.note || '', cafe: !!c.cafe,
        days: (m.days || []).filter(function(d){ return d.date >= today; })
      };
    })
  };
}

/* ---------- refreshing ---------- */

function refresh(){
  /* One refresh at a time: a slow run is never overlapped by the next. */
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    COLLEGES.forEach(function(c){
      try { refreshOne_(c); } catch (e) { Logger.log(c.id + ': ' + e); }
    });
    cachePut_('payload_' + today_(), JSON.stringify(getMenus()));
  } finally {
    lock.releaseLock();
  }
}

function refreshOne_(c){
  let days = [];
  try { days = c.fetch() || []; } catch (e) { Logger.log(c.id + ' fetch: ' + e); }
  const first = today_(), last = addDays_(first, DAYS_AHEAD);
  const byDate = {};
  days.forEach(function(d){
    const had = byDate[d.date];
    if (!had){ byDate[d.date] = d; return; }
    Object.keys(d).forEach(function(k){
      if (k === 'date') return;
      if (had[k] && typeof had[k] === 'object' && !Array.isArray(had[k])) Object.assign(had[k], d[k]);
      else if (!has_(had[k])) had[k] = d[k];
    });
  });
  days = Object.keys(byDate).map(function(k){ return byDate[k]; });
  days.forEach(function(d){ delete d.breakfast; if (d.notes) delete d.notes.breakfast; if (d.hours) delete d.hours.breakfast; });
  days = days.filter(function(d){
    return d.date >= first && d.date <= last &&
      (['lunch','dinner','menu'].some(function(k){ return has_(d[k]); }) || (d.notes && Object.keys(d.notes).length));
  }).sort(function(a, b){ return a.date < b.date ? -1 : 1; });
  days.forEach(normalise_);
  /* An empty read is a failed read, not an empty week: keep the last good one. */
  const had = load_(c.id);
  if (!days.length && had && had.days && had.days.length) return had;
  const out = { at: Date.now(), days: days };
  save_(c.id, out);
  return out;
}

function installTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'refresh') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refresh').timeBased().everyMinutes(EVERY_MINUTES).create();
  refresh();
  return getMenus().colleges.map(function(c){ return c.name + ': ' + c.days.length + ' days'; }).join(', ');
}

/* ---------- Jesus ---------- */

function fetchJesus_(){
  const BOARD = 'https://apps.jesus.cam.ac.uk/foodmenuview/digiboard.php';
  const jobs = [];
  for (let i = 0; i <= 7; i++){
    const date = addDays_(today_(), i);
    jobs.push({ date: date, meal: 'lunch',  url: BOARD + '?event_id=1&date=' + date });
    jobs.push({ date: date, meal: 'dinner', url: BOARD + '?event_id=2&date=' + date });
  }
  const pages = getAll_(jobs.map(function(j){ return j.url; }));
  const byDate = {};
  jobs.forEach(function(j, i){
    const c = parseJesus_(pages[i]);
    if (!c) return;
    (byDate[j.date] = byDate[j.date] || { date: j.date })[j.meal] = c;
  });
  return Object.keys(byDate).map(function(k){ return byDate[k]; });
}

function parseJesus_(html){
  if (!html || /class="[^"]*fm-empty/.test(html)) return null;
  const courses = [];
  let cur = null;
  html.split(/<tr\b/).forEach(function(r){
    const h = r.match(/<h4>(.*?)<\/h4>/);
    if (h){ cur = { name: text_(h[1]), dishes: [] }; courses.push(cur); return; }
    if (!cur || !/class="fm-item"/.test(r)) return;
    const label = (r.match(/fm-item-label">([\s\S]*?)<\/td>/) || [])[1];
    if (!label) return;
    const price = (r.match(/fm-item-price">([\s\S]*?)<\/td>/) || [])[1];
    const health = (r.match(/fm-health-dot-inner ([a-z]+)/) || [])[1] || '';
    const diet = [], allergens = [];
    r.replace(/fm-attribute ([a-z\-]+) fm-requirement/g, function(_, k){ add_(diet, k); });
    r.replace(/fm-attribute ([a-z\-]+) fm-allergen/g, function(_, k){ add_(allergens, k); });
    cur.dishes.push({ name: text_(label), price: price_(price), health: health, diet: diet, allergens: allergens });
  });
  const out = courses.filter(function(c){ return c.dishes.length; });
  return out.length ? out : null;
}

/* ---------- Churchill ---------- */

function fetchChurchill_(){
  /* page-id 1305 is the "Lunch and dinner menu" page. The slug lookup is the
     fallback in case the page is ever rebuilt under a new id. */
  const API = 'https://www.chu.cam.ac.uk/wp-json/wp/v2/pages';
  let html = '';
  try { html = JSON.parse(get_(API + '/1305?_fields=content')).content.rendered; } catch (e) {}
  if (!/<table/.test(html || '')){
    const list = JSON.parse(get_(API + '?slug=lunch-and-dinner-menu&_fields=content'));
    html = (list[0] && list[0].content.rendered) || '';
  }
  return parseChurchill_(html);
}

function parseChurchill_(html){
  const MON3 = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const now = new Date();
  const days = [];
  (html.match(/<table[\s\S]*?<\/table>/g) || []).forEach(function(t){
    const rows = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    if (rows.length < 2) return;
    const head = text_(rows[0]);                                  // "Wednesday 16th Sep Lunch Dinner"
    const dm = head.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})/);
    if (!dm || !(dm[2].toLowerCase() in MON3)) return;
    const month = MON3[dm[2].toLowerCase()];
    let year = now.getFullYear();
    if (month === 0 && now.getMonth() === 11) year++;             // week spans new year
    if (month === 11 && now.getMonth() === 0) year--;
    const date = year + '-' + pad_(month + 1) + '-' + pad_(Number(dm[1]));

    const cells = (rows[1].match(/<td[\s\S]*?<\/td>/g) || []);
    const day = { date: date, hours: {}, notes: {} };
    lines_(cells[0] || '').forEach(function(l){
      const h = l.match(/^(Lunch|Brunch|Dinner)\s*[–-]\s*(.+)$/i);
      if (!h) return;
      const k = /dinner/i.test(h[1]) ? 'dinner' : 'lunch';
      day.hours[k] = h[2].replace(/\s*[–-]\s*/g, '–');
      if (/brunch/i.test(h[1])) day.labels = { lunch: 'Brunch' };
    });
    [['lunch', cells[1]], ['dinner', cells[2]]].forEach(function(p){
      const dishes = [], notes = [];
      lines_(p[1] || '').forEach(function(l){
        l = l.replace(/^\*\s*/, '').trim();
        if (!l) return;
        const sp = l.match(/^Today.s Special:\s*(.+)$/i);
        if (sp){ notes.push('Today’s special: ' + sp[1]); return; }
        const diet = [];
        l = l.replace(/\s*\(([A-Z ,\/]+)\)\s*$/, function(_, t){
          t.split(/[ ,\/]+/).forEach(function(x){
            if (x === 'VG' || x === 'VE') add_(diet, 'vegan');
            else if (x === 'V') add_(diet, 'vegetarian');
            else if (x === 'H') add_(diet, 'halal');
            else if (x === 'GF') add_(diet, 'gluten-free');
          });
          return '';
        });
        dishes.push({ name: l, diet: diet });
      });
      if (dishes.length) day[p[0]] = [{ name: '', dishes: dishes }];
      if (notes.length) day.notes[p[0]] = notes;
    });
    if (!Object.keys(day.notes).length) delete day.notes;
    days.push(day);
  });
  return days;
}

/* ---------- Clare Hall ---------- */

function fetchClareHall_(){
  const res = UrlFetchApp.fetch('https://sway.cloud.microsoft/s/b7Zz74Q2g96EIhE9/get?currentClientVersion=201', {
    method: 'post', contentType: 'application/json', payload: '',
    muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (res.getResponseCode() !== 200) return [];
  let body = res.getContentText('UTF-8');
  if (body.charAt(0) !== '{'){                                    // came back still gzipped
    body = Utilities.ungzip(res.getBlob().setContentType('application/x-gzip')).getDataAsString('UTF-8');
  }
  return parseClareHall_(sway_(JSON.parse(body)));
}

/* Every paragraph of the Sway, in reading order. */
function sway_(model){
  const out = [];
  (function walk(n){
    if (Array.isArray(n)){ n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Node-TextParagraph'){
      const runs = [];
      (function r(m){
        if (Array.isArray(m)){ m.forEach(r); return; }
        if (!m || typeof m !== 'object') return;
        if (m.type === 'Node-TextRunElement') runs.push((m.props && m.props.Text) || '');
        if (m.children) r(m.children);
      })(n.children);
      out.push(runs.join('').replace(/\s+/g, ' ').trim());
      return;
    }
    Object.keys(n).forEach(function(k){ if (typeof n[k] === 'object') walk(n[k]); });
  })(model.StoryDiff || model);
  return out;
}

function parseClareHall_(paras){
  const TAGS = '(?:PB|VG|V|GF|H)';
  const tail = new RegExp('\\s*[-–]?\\s*(' + TAGS + '(?:\\s*,\\s*' + TAGS + ')*)(\\s+Available)?\\s*$');
  const days = [];
  let day = null, meal = null;
  paras.forEach(function(p){
    if (!p) return;
    const d = p.match(/^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i);
    if (d && MONTHS.indexOf(d[2].toLowerCase()) >= 0){
      day = { date: d[3] + '-' + pad_(MONTHS.indexOf(d[2].toLowerCase()) + 1) + '-' + pad_(Number(d[1])) };
      days.push(day); meal = null; return;
    }
    if (!day) return;
    if (/^(LUNCH|BRUNCH)$/i.test(p)){ meal = 'lunch'; if (/brunch/i.test(p)) day.labels = { lunch: 'Brunch' }; return; }
    if (/^DINNER$/i.test(p)){ meal = 'dinner'; return; }
    if (!meal) return;
    if (/^Our Sustainability/i.test(p)){ day = null; return; }   // end of the menu
    if (p === p.toUpperCase() && /[A-Z]{3}/.test(p)){             // "CLOSED FOR FORMAL HALL"
      day.notes = day.notes || {};
      (day.notes[meal] = day.notes[meal] || []).push(p.charAt(0) + p.slice(1).toLowerCase());
      return;
    }
    const diet = [];
    let name = p;
    const m = p.match(tail);
    if (m){
      name = p.slice(0, m.index).replace(/\s*[-–]\s*$/, '').trim();
      m[1].split(/\s*,\s*/).forEach(function(t){
        if (t === 'PB' || t === 'VG') add_(diet, 'vegan');
        else if (t === 'V') add_(diet, 'vegetarian');
        else if (t === 'H') add_(diet, 'halal');
        else if (t === 'GF') add_(diet, m[2] ? 'gf-option' : 'gluten-free');
      });
    }
    if (/\bhalal\b/i.test(name)) add_(diet, 'halal');
    day[meal] = day[meal] || [{ name: '', dishes: [] }];
    day[meal][0].dishes.push({ name: name, diet: diet });
  });
  return days;
}

/* ---------- Corpus ---------- */

function fetchCorpus_(){
  const dates = [];
  for (let i = 0; i <= 7; i++) dates.push(addDays_(today_(), i));
  const pages = getAll_(dates.map(function(d){
    return 'https://www.corpus.cam.ac.uk/foodmenu/menu/?reference=1&date=' + d;
  }));
  return dates.map(function(d, i){ return parseCorpus_(pages[i], d); });
}

function parseCorpus_(html, date){
  const day = { date: date };
  if (!html) return day;
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  /* One accordion per sitting: a title, then a table whose h3 rows are courses. */
  const parts = html.split(/<span class="accordion-title">/).slice(1);
  parts.forEach(function(part){
    const title = text_(part.split('<')[0]).toLowerCase();
    const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper/.test(title) ? 'dinner'
               : /lunch|brunch/.test(title) ? 'lunch' : null;
    if (!meal) return;
    if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
    const body = (part.match(/<tbody[\s\S]*?<\/tbody>/) || [''])[0];
    const courses = [], index = {};
    let cur = null;
    (body.match(/<tr[\s\S]*?<\/tr>/g) || []).forEach(function(r){
      const h = r.match(/<h3>([\s\S]*?)<\/h3>/);
      if (h){
        const name = text_(h[1]).replace(/\s+\d+$/, '');          // "Meat/Fish 2" -> "Meat/Fish"
        if (!index[name]){ index[name] = { name: name, dishes: [] }; courses.push(index[name]); }
        cur = index[name];
        return;
      }
      const td = r.match(/<td[\s\S]*?<\/td>/g) || [];
      if (!cur || td.length < 2) return;
      const name = text_(td[0]);
      if (!name) return;
      const diet = [];
      if (/plant|vegan/i.test(cur.name)) diet.push('vegan');
      else if (/vegetarian/i.test(cur.name)) diet.push('vegetarian');
      const price = price_(td[1]);
      cur.dishes.push({
        name: name, diet: diet,
        price: /^£0\.00$/.test(price) ? '' : price,
        allergens: text_(td[2] || '').split(/\s*,\s*/).filter(String)
      });
    });
    const out = courses.filter(function(c){ return c.dishes.length; });
    if (out.length) day[meal] = out;
  });
  return day;
}

/* ---------- Darwin ---------- */

function fetchDarwin_(){
  return parseDarwin_(get_('https://www.darwin.cam.ac.uk/dine/weekly-menu/'));
}

function parseDarwin_(html){
  if (!html) return [];
  const MON3 = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const labels = {};
  html.replace(/data-target="([^"]+)">([^<]+)</g, function(_, id, l){ labels[id] = text_(l); });
  const monday = mondayOf_(today_());
  const days = [];
  const blocks = html.split(/<div class="menus-content[^"]*" id="/).slice(1);
  blocks.forEach(function(block, k){
    const id = block.slice(0, block.indexOf('"'));
    /* "w/c 28th Sep" pins the week; otherwise it is this week plus k. */
    let weekStart = addDays_(monday, 7 * k);
    const wc = (labels[id] || '').match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})/);
    if (wc && wc[2].toLowerCase() in MON3){
      const y = Number(monday.slice(0, 4)), mo = MON3[wc[2].toLowerCase()];
      const guess = y + '-' + pad_(mo + 1) + '-' + pad_(Number(wc[1]));
      weekStart = guess < addDays_(monday, -180) ? (y + 1) + guess.slice(4) : guess;
    }
    block.split(/<h3>/).slice(1).forEach(function(section){
      const dow = WEEKDAYS.indexOf(text_(section.split('<')[0]).toLowerCase());
      if (dow < 0) return;
      const day = { date: addDays_(weekStart, (dow + 6) % 7) };
      (section.match(/<table[\s\S]*?<\/table>/g) || []).forEach(function(t){
        const title = text_((t.match(/<th[^>]*>([\s\S]*?)<\/th>/) || [])[1]).toLowerCase();
        const meal = /dinner|supper/.test(title) ? 'dinner' : /lunch|brunch/.test(title) ? 'lunch'
                   : /breakfast/.test(title) ? 'breakfast' : null;
        if (!meal) return;
        if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
        const mains = { name: '', dishes: [] }, sides = { name: 'Sides', dishes: [] };
        (t.match(/<tr[\s\S]*?<\/tr>/g) || []).forEach(function(r){
          const td = r.match(/<td[\s\S]*?<\/td>/g) || [];
          if (td.length < 2) return;
          let name = text_(td[0]);
          if (!name) return;
          const allergens = [];
          td[1].replace(/<li title="([^"]+)"/g, function(_, a){ add_(allergens, text_(a)); });
          const dish = { name: name, price: price_(td[2]), allergens: allergens, diet: [] };
          const s = name.match(/^Sides?\s*[-–:]\s*(.+)$/i);
          if (s){ dish.name = s[1]; sides.dishes.push(dish); } else mains.dishes.push(dish);
        });
        const out = [mains, sides].filter(function(c){ return c.dishes.length; });
        if (out.length) day[meal] = out;
      });
      days.push(day);
    });
  });
  return days;
}

/* ---------- Downing ---------- */

function fetchDowning_(){
  const API = 'https://kitchen.kafoodle.com/api/wba/v1/data/17260';
  const site = JSON.parse(get_(API));
  /* Menu groups named "... Week N" hold one menu per weekday. Lowest N is this week. */
  const groups = (site.menu_groups || []).filter(function(g){ return g.is_active && /week/i.test(g.name); })
    .map(function(g){ return { id: g.id, n: Number((g.name.match(/week\s*(\d+)/i) || [])[1] || 0) }; })
    .sort(function(a, b){ return a.n - b.n; });
  const monday = mondayOf_(today_());
  const days = [];
  groups.forEach(function(g, k){
    const res = UrlFetchApp.fetch(API + '/search/' + g.id, {
      method: 'post', contentType: 'application/json', payload: '{}',
      muteHttpExceptions: true, headers: { Accept: 'application/json' }
    });
    if (res.getResponseCode() !== 200) return;
    const data = JSON.parse(res.getContentText('UTF-8'));
    (data.menus || []).forEach(function(m){
      const wd = (m.name.toLowerCase().match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/) || [])[1];
      if (!wd) return;
      const date = addDays_(monday, 7 * k + (WEEKDAYS.indexOf(wd) + 6) % 7);
      const recipes = {};
      (m.recipes || []).forEach(function(r){ recipes[r.id] = r; });
      const order = (m.widgets || []).filter(function(w){ return w.class === 'dish'; })
        .map(function(w){ return recipes[w.dish_id]; }).filter(Boolean);
      const dishes = (order.length ? order : m.recipes || []).map(function(r){
        const diet = [];
        (r.tags || []).forEach(function(t){
          const n = String(t.name).toLowerCase();
          if (/vegan|plant-based/.test(n)) add_(diet, 'vegan');
          else if (/vegetarian/.test(n)) add_(diet, 'vegetarian');
          else if (/halal/.test(n)) add_(diet, 'halal');
          else if (/gluten free/.test(n)) add_(diet, 'gluten-free');
          else if (/pescatarian/.test(n)) add_(diet, 'pescatarian');
        });
        const allergens = [];
        (r.allergens || []).forEach(function(a){
          if (!a.is_may_contain && !a.primary_id) add_(allergens, a.name);
        });
        const price = (r.prices || [])[0];
        const seq = r.allergen_sequence || {};
        const none = !allergens.length && seq.sequence === 0 && seq.may_sequence === 0 && seq.unknown_sequence === 0;
        return {
          noAllergens: none || undefined,
          name: String(r.name || '').trim(), diet: diet, allergens: allergens,
          price: price ? price.price_text : '',
          carbon: (r.emissions && r.emissions.displayFootprint && r.emissions.category) || ''
        };
      }).filter(function(d){ return d.name; });
      if (dishes.length) days.push({ date: date, menu: [{ name: '', dishes: dishes }] });
    });
  });
  return days;
}

/* ---------- Magdalene (Ten Kites) ---------- */

function fetchMagdalene_(){
  return parseMagdalene_(get_('https://viewthe.menu/lyzv'));
}

function parseMagdalene_(html){
  if (!html) return [];
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const monday = mondayOf_(today_());
  const days = {};
  let day = null, meal = null, course = null;
  /* Walk the page in order: weekday headers, sitting headers, then dishes. */
  const re = /k10-w-course__name-text(-sub)?">([^<]*)<|<div class="k10-recipe k10-w-recipe/g;
  const marks = [];
  let m;
  while ((m = re.exec(html))) marks.push({ at: m.index, end: re.lastIndex, sub: m[1], text: m[2] });
  marks.forEach(function(k, i){
    if (k.text !== undefined){
      const t = text_(k.text);
      if (!k.sub){
        const dow = WEEKDAYS.indexOf(t.toLowerCase());
        if (dow < 0){ day = null; return; }
        const date = addDays_(monday, (dow + 6) % 7);
        day = days[date] = days[date] || { date: date };
        meal = null;
        return;
      }
      if (!day) return;
      const low = t.toLowerCase();
      const time = (t.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i) || [''])[0];
      meal = /breakfast/.test(low) ? 'breakfast' : /brunch|lunch/.test(low) ? 'lunch'
           : /dinner|supper|night|evening/.test(low) ? 'dinner' : /pm/.test(time) && parseInt(time, 10) >= 5 ? 'dinner' : 'lunch';
      if (/brunch/.test(low)) day.labels = { lunch: 'Brunch' };
      if (time) (day.hours = day.hours || {})[meal] = time.replace(/\s*[-–]\s*/, '–');
      const title = t.replace(time, '').trim();
      if (!/^(breakfast|brunch|lunch|dinner)$/i.test(title)){
        day.notes = day.notes || {};
        add_(day.notes[meal] = day.notes[meal] || [], title);
      }
      course = { name: '', dishes: [] };
      day[meal] = [course];
      return;
    }
    if (!course) return;
    const block = html.slice(k.at, i + 1 < marks.length ? marks[i + 1].at : k.at + 20000);
    const name = text_((block.match(/k10-recipe__name[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
    if (!name) return;
    const suit = text_((block.match(/labels_suitable[^>]*>\s*<b>[^<]*<\/b>([^<]*)/) || [])[1]).toLowerCase();
    const cont = text_((block.match(/labels_contain[^>]*>\s*<b>[^<]*<\/b>([^<]*)/) || [])[1]);
    const diet = [];
    if (/vegan/.test(suit)) diet.push('vegan');
    if (/vegetarian/.test(suit)) diet.push('vegetarian');
    if (/halal/.test(suit)) diet.push('halal');
    if (/gluten/.test(suit)) diet.push('gluten-free');
    if (/\bhalal\b/i.test(name)) add_(diet, 'halal');
    const dish = {
      name: name, diet: diet,
      price: price_((block.match(/k10-recipe__price[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
      allergens: cont ? cont.split(/\s*,\s*/) : []
    };
    if (!cont && /contains none of the listed allergens/i.test(block)) dish.noAllergens = true;
    course.dishes.push(dish);
  });
  return Object.keys(days).map(function(k){
    const d = days[k];
    ['breakfast','lunch','dinner'].forEach(function(x){ if (d[x] && !d[x][0].dishes.length) delete d[x]; });
    return d;
  });
}

/* ---------- Newnham ---------- */

function fetchNewnham_(){
  return parseNewnham_(get_('https://newn.cam.ac.uk/weekly-menus'));
}

function parseNewnham_(html){
  const days = [];
  /* One container per sitting, each titled "Lunch menu" / "Dinner menu". */
  (html || '').split(/class="menu-week-container"/).slice(1).forEach(function(box){
    const title = text_((box.match(/<h1>([^<]*)<\/h1>/) || [])[1]).toLowerCase();
    const meal = /dinner|supper/.test(title) ? 'dinner' : /breakfast/.test(title) ? 'breakfast' : 'lunch';
    box.split(/<div class="paragraph paragraph--type--day-menu/).slice(1).forEach(function(part){
      const date = (part.match(/<time datetime="(\d{4}-\d{2}-\d{2})/) || [])[1];
      if (!date) return;
      const dishes = [];
      (part.match(/<p>[\s\S]*?<\/p>/g) || []).forEach(function(p){
        const x = tagged_(text_(p));
        if (x.name) dishes.push(x);
      });
      if (dishes.length){ const d = { date: date }; d[meal] = [{ name: '', dishes: dishes }]; days.push(d); }
    });
  });
  return days;
}

/* ---------- Queens' ---------- */

function fetchQueens_(){
  return parseQueens_(get_('https://www.queens.cam.ac.uk/life-at-queens/catering/dining-hall/weekly-menu/'));
}

function parseQueens_(html){
  const days = [];
  (html || '').split(/<h2>\s*Week Commencing/i).slice(1).forEach(function(week){
    const wc = text_(week.split('</h2>')[0]).match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
    if (!wc) return;
    const monday = mondayOf_(dayMonth_(Number(wc[1]), wc[2]));
    const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
    let m;
    while ((m = re.exec(week))){
      const dow = WEEKDAYS.indexOf(text_(m[1]).toLowerCase());
      if (dow < 0) continue;
      const day = { date: addDays_(monday, (dow + 6) % 7) };
      m[2].split(/<p>/).slice(1).forEach(function(block){
        const title = text_(block.split('</p>')[0]).toLowerCase();
        const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper/.test(title) ? 'dinner'
                   : /lunch|brunch/.test(title) ? 'lunch' : null;
        if (!meal) return;
        if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
        const dishes = (block.match(/<li[\s\S]*?<\/li>/g) || []).map(function(li){ return tagged_(text_(li)); })
          .filter(function(x){ return x.name; });
        if (dishes.length) day[meal] = [{ name: '', dishes: dishes }];
      });
      days.push(day);
    }
  });
  return days;
}

/* ---------- Robinson ---------- */

function fetchRobinson_(){
  const dates = [];
  for (let i = 0; i <= 7; i++) dates.push(addDays_(today_(), i));
  const pages = getAll_(dates.map(function(d){
    return 'https://www.robinson.cam.ac.uk/college-life/garden-restaurant-menu?date=' + d;
  }));
  return dates.map(function(d, i){ return parseRobinson_(pages[i], d); });
}

function parseRobinson_(html, date){
  const day = { date: date };
  if (!html) return day;
  const shown = text_((html.match(/<h3>Menus for ([^<]*)<\/h3>/) || [])[1]);
  if (shown && Number((shown.match(/\d{1,2}/) || [])[0]) !== Number(date.slice(8))) return day;  // page fell back to another day
  html.split(/<div class="menuColumn">/).slice(1).forEach(function(col){
    const title = text_((col.match(/<h3>([^<]*)<\/h3>/) || [])[1]).toLowerCase();
    if (!/on offer/.test(title)) return;
    const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper|evening/.test(title) ? 'dinner' : 'lunch';
    const body = col.split(/<div class\s*=\s*"cleared"/)[0];
    const courses = [];
    body.split(/<strong>/).slice(1).forEach(function(seg){
      const course = { name: text_(seg.split('</strong>')[0]), dishes: [] };
      seg.split('</strong>')[1].split(/<br\s*\/?>\s*<br\s*\/?>/).forEach(function(item){
        const name = text_(item.replace(/<img[^>]*>/g, ''));
        if (!name) return;
        if (/^(both|all)?\s*served with/i.test(name)){
          day.notes = day.notes || {};
          add_(day.notes[meal] = day.notes[meal] || [], name);
          return;
        }
        const diet = [], allergens = [];
        item.replace(/<img[^>]*alt\s*=\s*"([^"]*)"/g, function(_, alt){
          const a = alt.toLowerCase();
          if (/vegan/.test(a)) add_(diet, 'vegan');
          else if (/vegetarian/.test(a)) add_(diet, 'vegetarian');
          else if (/healthy|low carbon|fair ?trade|alcohol/.test(a)) return;
          else if (/nut/.test(a)) add_(allergens, 'Nuts');
          else add_(allergens, alt);
        });
        course.dishes.push({ name: name, diet: diet, allergens: allergens });
      });
      if (course.dishes.length) courses.push(course);
    });
    if (courses.length) day[meal] = courses;
  });
  return day;
}

/* ---------- Selwyn ---------- */

function fetchSelwyn_(){
  const dates = [];
  for (let i = 0; i <= 7; i++) dates.push(addDays_(today_(), i));
  const pages = getAll_(dates.map(function(d){
    return 'https://www.sel.cam.ac.uk/current-members/hall-menu?menu_date=' + d;
  }));
  return dates.map(function(d, i){ return parseSelwyn_(pages[i], d); });
}

function parseSelwyn_(html, date){
  const day = { date: date };
  if (!html) return day;
  const hdr = text_((html.match(/id="menuhdr">([^<]*)</) || [])[1]);
  if (hdr && Number((hdr.match(/\d{1,2}/) || [])[0]) !== Number(date.slice(8))) return day;
  html.split(/<div class="hallmenu">/).slice(1).forEach(function(block){
    const title = text_((block.match(/submenuhdr">([^<]*)</) || [])[1]).toLowerCase();
    const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper/.test(title) ? 'dinner'
               : /lunch|brunch/.test(title) ? 'lunch' : null;
    if (!meal) return;
    if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
    const body = block.replace(/<div class="submenuhdr">[\s\S]*?<\/div>/, '').split('</div>')[0];
    /* Numbered lines start a dish; anything after a blank line is the sides. */
    const lines = body.split(/<br\s*\/?>/i).map(text_);
    /* No numbered dishes at all ("Breakfast / Lunch"): it's a note, not a menu. */
    if (!lines.some(function(l){ return /^\d+\./.test(l); })){
      const note = lines.filter(String).join(' / ');
      if (note){ day.notes = day.notes || {}; day.notes[meal] = [note]; }
      return;
    }
    const items = [];
    let cur = null;
    lines.forEach(function(l){
      if (!l){ cur = null; return; }
      const n = l.match(/^\d+\.\s*(.*)$/);
      if (n){ cur = { text: n[1], side: false }; items.push(cur); return; }
      if (cur){ cur.text += ' ' + l; return; }          // wrapped line or "(vegan)" on its own
      cur = { text: l, side: true }; items.push(cur);   // after a blank line: the sides
    });
    const mains = { name: '', dishes: [] }, side = { name: 'Sides', dishes: [] };
    items.forEach(function(it){
      const x = tagged_(it.text);
      if (x.name) (it.side ? side : mains).dishes.push(x);
    });
    const out = [mains, side].filter(function(c){ return c.dishes.length; });
    if (out.length) day[meal] = out;
  });
  return day;
}

/* ---------- St John's ---------- */

function fetchStJohns_(){
  return parseStJohns_(get_('https://menu.joh.cam/'));
}

function parseStJohns_(html){
  const days = [];
  (html || '').split(/class="weekday /).slice(1).forEach(function(part){
    const head = text_((part.match(/<h2[^>]*font-crake[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
    const dm = head.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/);
    if (!dm) return;
    const day = { date: dayMonth_(Number(dm[1]), dm[2]) };
    part.split(/class="accordion-item/).slice(1).forEach(function(acc){
      const title = text_((acc.match(/text-center font-bold">([^<]*)</) || [])[1]).toLowerCase();
      const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper/.test(title) ? 'dinner'
                 : /lunch|brunch/.test(title) ? 'lunch' : null;
      if (!meal) return;
      if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
      const courses = [];
      acc.split(/tracking-widest text-black\/60">/).slice(1).forEach(function(sec){
        const course = { name: text_(sec.split('<')[0]), dishes: [] };
        sec.split(/<div class="flex flex-col gap-x-4 overflow-hidden/).slice(1).forEach(function(d){
          const name = text_((d.match(/<p class="text-base font-semibold[^"]*">([\s\S]*?)<\/p>/) || [])[1]);
          if (!name) return;
          const diet = [], allergens = [];
          d.replace(/<span class="rounded-sm bg-[^"]*">([^<]*)<\/span>/g, function(_, t){
            t = t.trim().toLowerCase();
            if (t === 'vegan') add_(diet, 'vegan');
            else if (t === 'vegetarian') add_(diet, 'vegetarian');
            else if (t === 'halal') add_(diet, 'halal');
            else if (/gluten/.test(t)) add_(diet, 'gluten-free');
          });
          const cont = d.split(/Contains:<\/p>/)[1] || '';
          cont.replace(/<span class="text-primary-text[^"]*">([\s\S]*?)<\/span>/g, function(_, t){ add_(allergens, text_(t)); });
          course.dishes.push({ name: name, diet: diet, allergens: allergens });
        });
        if (course.dishes.length) courses.push(course);
      });
      if (courses.length) day[meal] = courses;
    });
    days.push(day);
  });
  return days;
}

/* ---------- Wolfson ---------- */

function fetchWolfson_(){
  return parseWolfson_(get_('https://www.wolfson.cam.ac.uk/food/cafeteria-menus'));
}

function parseWolfson_(html){
  const days = [];
  (html || '').split(/<h3>/).slice(1).forEach(function(part){
    const d = text_(part.split('</h3>')[0]).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!d || MONTHS.indexOf(d[2].toLowerCase()) < 0) return;
    const day = { date: d[3] + '-' + pad_(MONTHS.indexOf(d[2].toLowerCase()) + 1) + '-' + pad_(Number(d[1])) };
    part.split(/<li class="field field--name-field-/).slice(1).forEach(function(sec){
      const key = sec.split(' ')[0];
      const title = text_((sec.match(/<h4>([^<]*)<\/h4>/) || [])[1]).toLowerCase() || key;
      const meal = /breakfast/.test(title) ? 'breakfast' : /dinner|supper/.test(title) ? 'dinner'
                 : /lunch|brunch/.test(title) ? 'lunch' : null;
      if (!meal) return;
      if (/brunch/.test(title)) day.labels = { lunch: 'Brunch' };
      const courses = [], index = {};
      sec.split(/single-food-menu-item/).slice(1).forEach(function(it){
        const spans = (it.match(/<h4>([\s\S]*?)<\/h4>/) || ['', ''])[1].match(/<span>([\s\S]*?)<\/span>/g) || [];
        let label = text_(spans.length > 1 ? spans[0] : '');
        const name = text_(spans[spans.length - 1] || '');
        if (!name) return;
        const diet = [];
        if (/vegan|plant/i.test(label) || /^(vegan|plant[- ]based)\b/i.test(name)) diet.push('vegan');
        else if (/vegetarian/i.test(label) || /\((v|vegetarian)\)/i.test(name)) diet.push('vegetarian');
        if (/\bhalal\b/i.test(name)) diet.push('halal');
        label = label.replace(/\s*-\s*(vegan|vegetarian)$/i, '').replace(/^sided? dish(es)?$/i, 'Side Dishes');
        const allergens = [];
        it.replace(/<div class="field__item">([\s\S]*?)<\/div>/g, function(_, a){ add_(allergens, text_(a)); });
        const price = (it.match(/<span>\s*student\s*<\/span>\s*<span>([^<]*)<\/span>/) || [])[1];
        if (!index[label]){ index[label] = { name: label, dishes: [] }; courses.push(index[label]); }
        index[label].dishes.push({ name: name, diet: diet, allergens: allergens, price: price ? price_(price) : '' });
      });
      if (courses.length) day[meal] = courses;
    });
    days.push(day);
  });
  return days;
}

/* A dish line with its marks pulled out: "(Vegan) Tofu pad Thai", "Curry (halal)". */
function tagged_(line){
  const diet = [];
  let name = String(line || '').replace(/ /g, ' ');
  const take = function(t){
    t = t.toLowerCase().trim();
    if (/^(vegan|vg|ve|pb|plant[- ]based)$/.test(t)) { add_(diet, 'vegan'); return true; }
    if (/^(v|vegetarian)$/.test(t)) { add_(diet, 'vegetarian'); return true; }
    if (/^(h|halal)$/.test(t)) { add_(diet, 'halal'); return true; }
    if (/^halal option( available)?$/.test(t)) { add_(diet, 'halal-option'); return true; }
    if (/^(gf|gluten[- ]free)$/.test(t)) { add_(diet, 'gluten-free'); return true; }
    return false;
  };
  let changed = true;
  while (changed){
    changed = false;
    name = name.replace(/^\s*\(([^)]{1,30})\)\s*/, function(all, t){ if (take(t)){ changed = true; return ''; } return all; })
               .replace(/\s*\(([^)]{1,30})\)\s*$/, function(all, t){ if (take(t)){ changed = true; return ''; } return all; });
  }
  return { name: name.replace(/\s+/g, ' ').trim(), diet: diet };
}

/* "16", "Sep" -> the nearest such date to today. */
function dayMonth_(d, mon){
  const mo = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(String(mon).slice(0, 3).toLowerCase());
  const t = today_(), y = Number(t.slice(0, 4));
  let best = '', gap = Infinity;
  [y - 1, y, y + 1].forEach(function(yy){
    const iso = yy + '-' + pad_(mo + 1) + '-' + pad_(d);
    const g = Math.abs(Date.parse(iso) - Date.parse(t));
    if (g < gap){ gap = g; best = iso; }
  });
  return best;
}

/* ---------- West Hub (University Catering) ---------- */

function fetchUniCafe_(url){
  return parseWestHub_(get_(url));
}

function parseWestHub_(html){
  const days = [];
  /* The heading is sometimes "<h4>Week commencing 14th September</h4>" and sometimes
     wrapped in <strong>, so split on the words themselves. */
  (html || '').split(/Week\s+commencing/i).slice(1).forEach(function(week){
    const wc = text_(week.slice(0, 120)).match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
    if (!wc) return;
    const monday = mondayOf_(dayMonth_(Number(wc[1]), wc[2]));
    week = week.split(/<h[1-4]\b/)[0];                       // stop at the next heading
    const re = /<p>\s*<strong>([^<]*)<\/strong>\s*<\/p>\s*<ul>([\s\S]*?)<\/ul>/g;
    let m;
    while ((m = re.exec(week))){
      const dow = WEEKDAYS.indexOf(text_(m[1]).toLowerCase());
      if (dow < 0) continue;
      const mains = [], sides = [];
      (m[2].match(/<li[\s\S]*?<\/li>/g) || []).forEach(function(li){
        let t = text_(li);
        const isSide = /^sides?\s*:/i.test(t);
        t = t.replace(/^sides?\s*:\s*/i, '');
        /* The sides are published as one comma-separated line, and the items themselves
           contain "&", so it is kept whole rather than split into nonsense. */
        const x = tagged_(t);
        if (x.name) (isSide ? sides : mains).push(x);
      });
      const courses = [];
      if (mains.length) courses.push({ name: 'Mains', dishes: mains });
      if (sides.length) courses.push({ name: 'Sides', dishes: sides });
      if (courses.length) days.push({ date: addDays_(monday, (dow + 6) % 7), lunch: courses });
    }
  });
  return days;
}

/* ---------- Scholars Brew (two hot dishes a day, and their sides) ---------- */

function fetchScholars_(){
  return parseScholars_(get_('https://www.catering.admin.cam.ac.uk/cafes/scholars-brew'));
}

/* "Week commencing 12th October", then each weekday in bold over its list: two dishes and
   "Sides: Taco slaw with pink pickled onions & Sauté potatoes", which go with the dishes above
   them, so they are those dishes' description rather than a dish. A list with no weekdays
   (how it used to be: one spud bar list a week) runs Monday to Friday. */
function parseScholars_(html){
  const cut = String(html || '').split(/Week\s+commencing/i);
  if (cut.length < 2) return [];
  const wc = text_(cut[1].slice(0, 120)).match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
  if (!wc) return [];
  const printed = mondayOf_(dayMonth_(Number(wc[1]), wc[2]));
  const lists = {}, order = [];
  let dow = -1, since = [];
  const list = function(){ if (!lists[dow]){ lists[dow] = []; order.push(dow); } return lists[dow]; };
  cut[1].split(/<h[123]\b/)[0].replace(/<strong[^>]*>([\s\S]*?)<\/strong>|<li[\s\S]*?<\/li>/g, function(all, bold){
    if (bold !== undefined){
      const d = text_(bold).toLowerCase().match(/^(mon|tues|wednes|thurs|fri|satur|sun)day\b/);
      if (d){ dow = WEEKDAYS.indexOf(d[1] + 'day'); since = []; }
      return all;
    }
    const t = text_(all);
    const sides = t.match(/^sides?\s*:\s*(.+)$/i);
    if (sides && since.length){
      since.forEach(function(x){ x.desc = 'Sides: ' + sides[1]; });
      since = [];
      return all;
    }
    const x = tagged_(t);
    if (x.name){ list().push(x); since.push(x); }
    return all;
  });
  if (!order.length) return [];

  /* they don't always update on time: show the list they last put out, and say which week it was */
  const monday = mondayOf_(today_());
  const late = printed < monday;
  const start = late ? monday : printed;
  const note = late ? 'Their last published list, for the week of ' + niceDate_(printed) + '.' : '';
  const daily = order.some(function(d){ return d >= 0; });
  const days = [];
  const put = function(date, dishes, course){
    const d = { date: date, lunch: [{ name: course, dishes: JSON.parse(JSON.stringify(dishes)) }] };
    if (note) d.notes = { lunch: [note] };
    days.push(d);
  };
  if (!daily){
    for (let i = 0; i < 5; i++) put(addDays_(start, i), lists[-1], 'Pizza, pasta & jackets');
    return days;
  }
  order.forEach(function(d){
    if (d < 0) return;
    put(addDays_(start, (d + 6) % 7), (lists[-1] || []).concat(lists[d]), 'Mains');
  });
  return days;
}

function niceDate_(iso){
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const p = String(iso).split('-');
  return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
}

/* ---------- one shape for every college ---------- */

const COURSE_ORDER = ['Breakfast', 'Starters', 'Plant-based', 'Vegetarian', 'Mains', 'Sandwiches',
                      'Pizza, pasta & jackets', 'Salads', 'Sides', 'Desserts'];
const DESSERT_RE = /\bcakes?\b|pudding|crumble|custard|cookies?|brownie|dessert|sponge|\btart\b|\bfool\b|panna cotta|ice cream|sundae|cheesecake|mousse|trifle|doughnut|flapjack|fruit salad|jelly|turnover|bavarois|pavlova|eton mess|muffin|waffle|compote|br[uû]l[eé]e|profiterole|scone|(apple|cherry|pecan|banoffee|mince|lemon meringue) pie|yoghurt with|gateau|roulade|parfait|churros|croissant|pain au chocolat|chocolate|chantilly|pot de cr[eè]me|caramel\b(?!.*(sauce|chicken|pork))/;
const NOT_DESSERT_RE = /yorkshire pudding|black pudding|fish ?cakes?|crab ?cakes?|potato cakes?|rice cakes?/;
/* Savoury words that turn a "crumble" or "tart" into a main. */
const SAVOURY_RE = /leek|mustard|cheddar|cheese|ratatouille|walsingham|onion|mushroom|lentil|beetroot|tomato|chicken|beef|pork|fish|salmon|pepper|herb|garlic|salsify|cobbler/;
const MAIN_RE = /curry|carvery|\brump\b|sirloin|pichana|adobo|larb|sisig|tapas|paella|methi|masala|\bpie\b|burger|stew|tagine|chicken|beef|pork|lamb|turkey|duck|\bfish\b|fishless|\bcod\b|coley|hake|salmon|haddock|mackerel|plaice|\bbass\b|trout|sardines?|tuna|kipper|squid|scampi|crab|prawn|tofu|tempeh|risotto|lasagn|pasta|spaghetti|penne|tagliatelle|linguine|rigatoni|fusilli|farfalle|conchiglie|orzo|noodle|pad thai|pizza|chilli (con|sin)|\b(bean|lentil|beef|veggie|vegetable|aubergine|quinoa|mince)\b[^,]*\bchilli\b|dh?al\b|dahl|\bbake\b|kiev|kyiv|sausage|bacon|meatball|steak|schnitzel|burrito|taco|tostado|falafel|quiche|galette|frittata|moussaka|cannelloni|gnocchi|bowls?\b|goujon|fillet|escalope|wings|\bham\b|chorizo|mortadella|mince|ragu|ragout|cobbler|stir.?fr|fritter|bhaji|kofta|shawarma|rendang|kari|parmo|toad in the hole|macaroni|mac n|halloumi|paneer|jackfruit|quorn|nachos|jacket|piccata|traybake|brisket|biryani|donburi|caponata|pastitsio|cassoulet|florentine|\bsub\b|\bwrap\b|kebab|ravioli|tortellini|enchilada|fajita|katsu|teriyaki|gyoza|buddha|battered|blossom|peri.?peri|piri.?piri|milanese|stuffed|aloo|flat ?bread|buffalo|samosa|spring rolls?|\bin (a )?[a-z ]*sauce\b/;
const SIDE_RE = /\btoast\b|focc?acc?ia|crudo|\bbeans?\b|fries|wedges|potato|mash|\brice\b|vegetables?|\bveg\b|greens|beans|peas\b|corn\b|carrots?|broccoli|cabbage|kale|spinach|salad|slaw|leaves|bread|\brolls?\b|naan|cous ?cous|grains|quinoa|cauliflower|courgette|squash|leeks?|fennel|pak choi|bok choi|chard|yorkshire pudding|stuffing|hash browns?|mushrooms|tomato(es)?|\beggs?\b|petit pain|baguette|aubergine|peppers|onions?/;
const CONDIMENT_RE = /\b(sauce|gravy|dressing|mayo|mayonnaise|ketchup|dip|relish|chutney)$/;
const NIBBLE_RE = /crackers|poppadoms?|croutons/;

function courseName_(n){
  const s = String(n || '').toLowerCase().trim();
  if (!s) return '';
  if (/breakfast|brunch/.test(s)) return 'Breakfast';
  if (/soup|starter/.test(s)) return 'Starters';
  if (/vegan|plant/.test(s)) return 'Plant-based';
  if (/vegetarian|meat.?free/.test(s)) return 'Vegetarian';
  if (/dessert|pudding|sweet/.test(s)) return 'Desserts';
  if (/pizza|pasta|jacket/.test(s)) return 'Pizza, pasta & jackets';
  if (/side|vegetable/.test(s)) return 'Sides';
  if (/salad/.test(s)) return 'Salads';
  if (/main|meat|fish|grill|carvery|chef|special|hot/.test(s)) return 'Mains';
  return String(n).trim().replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

function guessCourse_(name){
  const s = String(name || '').toLowerCase();
  if (/\bsoup\b|chowder|\bbroth\b|borscht|gazpacho|minestrone|caldo\b/.test(s) && !/\bwith\b.*\b(rice|noodles)\b/.test(s)) return 'Starters';
  const words = s.replace(/&/g, ' ').split(/\s+/).filter(String).length;
  if (DESSERT_RE.test(s) && !NOT_DESSERT_RE.test(s)) return SAVOURY_RE.test(s) ? 'Mains' : 'Desserts';
  if ((CONDIMENT_RE.test(s) && words <= 3) || NIBBLE_RE.test(s)) return 'Sides';
  if (MAIN_RE.test(s)) return 'Mains';
  if (SIDE_RE.test(s)) return 'Sides';
  return 'Mains';
}

function allergen_(a){
  const s = String(a || '').trim(), l = s.toLowerCase();
  const detail = (s.match(/\(([^)]+)\)/) || [])[1];
  const d = detail ? ' (' + detail.toLowerCase() + ')' : '';
  if (/sulph|sulfit/.test(l)) return 'Sulphites';
  if (/gluten|cereal/.test(l)) return 'Gluten' + d;
  if (/^(wheat|barley|rye|oats?|spelt|kamut)$/.test(l)) return 'Gluten (' + l + ')';
  if (/milk|dairy|lactose/.test(l)) return 'Milk';
  if (/^eggs?$/.test(l)) return 'Egg';
  if (/sesame/.test(l)) return 'Sesame';
  if (/soy/.test(l)) return 'Soya';
  if (/crustacean/.test(l)) return 'Crustaceans';
  if (/mollusc/.test(l)) return 'Molluscs';
  if (/lupin/.test(l)) return 'Lupin';
  if (/peanut/.test(l)) return 'Peanuts';
  if (/\bnuts?\b|tree nut/.test(l)) return 'Nuts' + d;
  if (/^(almonds?|hazelnuts?|walnuts?|cashews?|pecans?|pistachios?|brazil nuts?|macadamias?)$/.test(l)) return 'Nuts (' + l + ')';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* One voice for every college: no vendor prefixes, no SHOUTING, and marks that are
   written into the dish name become proper tags. */
const BRAND_RE = /^\s*['"‘“]?\s*(pure downing(?:\s*\/\s*healthy choice)?|healthy choice(?:\s*\/\s*pure downing)?|chef'?s special|student choice|street food|deep fried|today'?s special|special of the day)\s*['"’”]?\s*[-–:]\s*/i;
const SMALL_WORDS = ['and','or','with','in','of','the','a','an','on','to','de','au','aux','sur','served','over'];
function titleCase_(s){
  return s.replace(/[A-Za-zÀ-ÿ'’]+/g, function(w, i){
    const low = w.toLowerCase();
    if (i > 0 && SMALL_WORDS.indexOf(low) >= 0) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  });
}
/* A price written into a name: "£3.78 / £4.83", "(£2.50)", "£4". */
const PRICE_ = '£\\s?(?:\\d+(?:[.,]\\d{1,2})?|[.,]\\d{1,2})(?:\\s*(?:\\/|or|[-–])\\s*£\\s?(?:\\d+(?:[.,]\\d{1,2})?|[.,]\\d{1,2}))*';
const PRICE_RE = new RegExp('\\s*[(\\[]\\s*' + PRICE_ + '\\s*[)\\]]|(?:\\s*\\/)?\\s*' + PRICE_ + '(?!\\d)', 'g');
function tidyDish_(x){
  let n = String(x.name || '').replace(/\s+/g, ' ').trim();
  n = n.replace(PRICE_RE, ' ').replace(/\s+/g, ' ').trim();        // no prices, as below
  n = n.replace(BRAND_RE, '');
  n = n.replace(/\s*\*+[^*]*\*+\s*/g, ' ');                       // *CONTAINS ALCOHOL* and friends
  /* Marks written into the name become tags. */
  n = n.replace(/\s*[\(\[]\s*(halal|vegan|vegetarian|v|vg|ve|pb|gf|gluten[- ]free)\s*[\)\]]/ig, function(_, k){
    k = k.toLowerCase();
    if (k === 'halal') add_(x.diet = x.diet || [], 'halal');
    else if (/^(vegan|vg|ve|pb)$/.test(k)) add_(x.diet = x.diet || [], 'vegan');
    else if (/^(vegetarian|v)$/.test(k)) add_(x.diet = x.diet || [], 'vegetarian');
    else add_(x.diet = x.diet || [], 'gluten-free');
    return ' ';
  });
  const letters = n.replace(/[^A-Za-z]/g, '');
  const caps = n.replace(/[^A-Z]/g, '');
  if (letters.length > 3 && caps.length / letters.length > 0.7) n = titleCase_(n);   // SHOUTED names
  n = n.replace(/\s*[-–,;:]\s*$/, '').replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  x.name = n;
  return x;
}

function normalise_(day){
  ['lunch', 'dinner', 'menu'].forEach(function(meal){
    const courses = day[meal];
    if (!has_(courses)) return;
    const out = {}, order = [];
    const put = function(name, dish){
      if (!out[name]){ out[name] = { name: name, dishes: [] }; order.push(name); }
      out[name].dishes.push(dish);
    };
    courses.forEach(function(c){
      c.dishes.forEach(function(x){
        if (x.allergens){
          const seen = [];
          x.allergens.forEach(function(a){ const n = allergen_(a); if (n && seen.indexOf(n) < 0) seen.push(n); });
          x.allergens = seen;
        }
        tidyDish_(x);
        /* One shape for every college: no prices, and none of the one-off extras
           (Downing's carbon rating, St Edmund's calories, Jesus's traffic-light dot). */
        delete x.price; delete x.carbon; delete x.kcal; delete x.health;
        let name = courseName_(c.name);
        if (!name) name = meal === 'breakfast' ? 'Breakfast' : guessCourse_(x.name);
        put(name, x);
      });
    });
    order.sort(function(a, b){
      const ia = COURSE_ORDER.indexOf(a), ib = COURSE_ORDER.indexOf(b);
      return (ia < 0 ? 4.5 : ia) - (ib < 0 ? 4.5 : ib);
    });
    day[meal] = order.map(function(n){ return out[n]; });
  });
  return day;
}

/* ---------- PDF text with positions ----------
   Two colleges publish their menu only as a PDF laid out as a grid, so
   plain text is useless: the days come out jumbled. This reads the words
   together with where they sit on the page, which is enough to put the
   grid back together. It handles what Word and PowerPoint write:
   compressed streams, object streams, TrueType and Type0 fonts with
   ToUnicode maps. It is not a general PDF reader. */

/* zlib inflate (RFC 1950/1951). */
function inflate_(src){
  let pos = 2, bit = 0, hold = 0;                       // skip the 2-byte zlib header
  let out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0;
  const need = function(k){ while (bit < k){ hold |= (src[pos++] || 0) << bit; bit += 8; } };
  const bits = function(k){ need(k); const v = hold & ((1 << k) - 1); hold >>>= k; bit -= k; return v; };
  const grow = function(k){ if (n + k <= out.length) return; const o = new Uint8Array(Math.max(out.length * 2, n + k)); o.set(out); out = o; };
  const table = function(lengths){
    const counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
    return { counts: counts, syms: syms };
  };
  const decode = function(t){
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++){
      code |= bits(1);
      const c = t.counts[len];
      if (code - c < first) return t.syms[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('bad code');
  };
  const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  let fixedL = null, fixedD = null;
  let last = 0;
  while (!last){
    last = bits(1);
    const type = bits(2);
    if (type === 0){
      hold = 0; bit = 0;
      const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      grow(len); out.set(src.subarray(pos, pos + len), n); n += len; pos += len;
      continue;
    }
    let lt, dt;
    if (type === 1){
      if (!fixedL){
        const l = new Uint8Array(288);
        for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9;
        for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
        fixedL = table(l); fixedD = table(new Uint8Array(30).fill(5));
      }
      lt = fixedL; dt = fixedD;
    } else if (type === 2){
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[ORDER[i]] = bits(3);
      const ct = table(cl);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;){
        const sym = decode(ct);
        if (sym < 16) lens[i++] = sym;
        else if (sym === 16){ const p = lens[i - 1]; for (let r = 3 + bits(2); r--;) lens[i++] = p; }
        else if (sym === 17){ for (let r = 3 + bits(3); r--;) lens[i++] = 0; }
        else { for (let r = 11 + bits(7); r--;) lens[i++] = 0; }
      }
      lt = table(lens.subarray(0, hlit)); dt = table(lens.subarray(hlit));
    } else throw new Error('bad block');
    for (;;){
      const sym = decode(lt);
      if (sym < 256){ grow(1); out[n++] = sym; continue; }
      if (sym === 256) break;
      const len = LBASE[sym - 257] + bits(LEXT[sym - 257]);
      const ds = decode(dt);
      const dist = DBASE[ds] + bits(DEXT[ds]);
      grow(len);
      for (let i = 0; i < len; i++){ out[n] = out[n - dist]; n++; }
    }
  }
  return out.subarray(0, n);
}

const latin1_ = function(u8, a, b){
  let s = '';
  for (let i = a || 0, e = b == null ? u8.length : b; i < e; i += 8192)
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(e, i + 8192)));
  return s;
};

/* A tiny PDF object parser: returns JS values; refs are {ref:n}. */
function pdfParse_(s, at){
  let i = at || 0;
  const ws = function(){
    for (;;){
      while (i < s.length && /[\s\0]/.test(s[i])) i++;
      if (s[i] === '%'){ while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      return;
    }
  };
  const DELIM = /[\s\0()<>\[\]{}\/%]/;
  const word = function(){ const st = i; while (i < s.length && !DELIM.test(s[i])) i++; return s.slice(st, i); };
  const value = function(){
    ws();
    const c = s[i];
    if (c === '/'){ i++; return { name: word().replace(/#([0-9a-f]{2})/gi, function(_, h){ return String.fromCharCode(parseInt(h, 16)); }) }; }
    if (c === '<' && s[i + 1] === '<'){
      i += 2; const d = {};
      for (;;){ ws(); if (s[i] === '>' && s[i + 1] === '>'){ i += 2; return d; } const k = value(); d[k.name] = value(); }
    }
    if (c === '<'){ i++; const st = i; while (s[i] !== '>') i++; const h = s.slice(st, i).replace(/\s/g, ''); i++; return { hex: h }; }
    if (c === '['){ i++; const a = []; for (;;){ ws(); if (s[i] === ']'){ i++; return a; } a.push(value()); } }
    if (c === '('){
      i++; let depth = 1, out = '';
      while (i < s.length){
        const ch = s[i++];
        if (ch === '\\'){
          const e = s[i++];
          if (e === 'n') out += '\n'; else if (e === 'r') out += '\r'; else if (e === 't') out += '\t';
          else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
          else if (e === '\r'){ if (s[i] === '\n') i++; }
          else if (e === '\n'){}
          else if (/[0-7]/.test(e)){ let o = e; while (o.length < 3 && /[0-7]/.test(s[i])) o += s[i++]; out += String.fromCharCode(parseInt(o, 8) & 255); }
          else out += e;
        } else if (ch === '('){ depth++; out += ch; }
        else if (ch === ')'){ if (!--depth) break; out += ch; }
        else out += ch;
      }
      return { str: out };
    }
    const w = word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)){
      const save = i;
      if (/^\d+$/.test(w)){
        ws(); const w2 = word();
        if (/^\d+$/.test(w2)){ ws(); if (s[i] === 'R' && DELIM.test(s[i + 1] || ' ')){ i++; return { ref: +w }; } }
        i = save;
      }
      return +w;
    }
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    return { op: w };
  };
  return { value: value, pos: function(){ return i; }, seek: function(p){ i = p; }, ws: ws, word: word };
}

function pdfDoc_(u8){
  const s = latin1_(u8);
  const objs = {};
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))){
    const p = pdfParse_(s, re.lastIndex);
    let v;
    try { v = p.value(); } catch (e) { continue; }
    let at = p.pos();
    const rest = s.slice(at, at + 20);
    const sm = rest.match(/^\s*stream\r?\n/);
    const o = { v: v };
    if (sm && v && typeof v === 'object'){
      const start = at + sm[0].length;
      let len = typeof v.Length === 'number' ? v.Length : -1;
      if (len < 0 || s.slice(start + len, start + len + 30).indexOf('endstream') < 0) len = s.indexOf('endstream', start) - start;
      o.raw = u8.subarray(start, start + len);
      re.lastIndex = start + len;
    }
    objs[m[1]] = o;
  }
  const doc = {
    get: function(x){
      while (x && x.ref !== undefined){ const o = objs[x.ref]; x = o ? o.v : null; }
      return x;
    },
    stream: function(x){
      let o = x;
      if (x && x.ref !== undefined) o = objs[x.ref];
      if (!o || !o.raw) return null;
      if (o.data) return o.data;
      let f = doc.get(o.v.Filter);
      f = Array.isArray(f) ? f.map(function(z){ return doc.get(z).name; }) : f ? [f.name] : [];
      let d = o.raw;
      f.forEach(function(name){
        if (name === 'FlateDecode') d = inflate_(d);
        else throw new Error('filter ' + name);
      });
      const parms = doc.get(o.v.DecodeParms);
      if (parms && doc.get(parms.Predictor) >= 10) d = unpredict_(d, doc.get(parms.Columns) || 1);
      return (o.data = d);
    }
  };
  /* Objects packed inside object streams. */
  Object.keys(objs).forEach(function(k){
    const o = objs[k];
    if (!o.v || !o.v.Type || o.v.Type.name !== 'ObjStm') return;
    let d;
    try { d = latin1_(doc.stream({ ref: +k })); } catch (e) { return; }
    const n = o.v.N, first = o.v.First;
    const head = d.slice(0, first).trim().split(/\s+/).map(Number);
    for (let j = 0; j < n; j++){
      const num = head[2 * j], off = head[2 * j + 1];
      if (objs[num]) continue;
      try { objs[num] = { v: pdfParse_(d, first + off).value() }; } catch (e) {}
    }
  });
  doc.objs = objs;
  return doc;
}

function unpredict_(d, cols){
  const rows = Math.floor(d.length / (cols + 1)), out = new Uint8Array(rows * cols), prev = new Uint8Array(cols);
  for (let r = 0; r < rows; r++){
    const t = d[r * (cols + 1)], row = d.subarray(r * (cols + 1) + 1, (r + 1) * (cols + 1));
    for (let c = 0; c < cols; c++){
      const a = c ? out[r * cols + c - 1] : 0, b = prev[c], cc = c ? prev[c - 1] : 0;
      let v = row[c];
      if (t === 1) v += a; else if (t === 2) v += b; else if (t === 3) v += (a + b) >> 1;
      else if (t === 4){ const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : cc; }
      out[r * cols + c] = v & 255;
    }
    prev.set(out.subarray(r * cols, (r + 1) * cols));
  }
  return out;
}

const WIN1252_ = { 128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,
  145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376 };

function pdfFont_(doc, f){
  f = doc.get(f) || {};
  const font = { two: false, map: null, widths: {}, dw: 1000, bold: /bold|black|heavy/i.test((doc.get(f.BaseFont) || {}).name || '') };
  if (doc.get(f.Subtype) && doc.get(f.Subtype).name === 'Type0'){
    font.two = true;
    const desc = doc.get((doc.get(f.DescendantFonts) || [])[0]) || {};
    if (!font.bold) font.bold = /bold|black|heavy/i.test((doc.get(desc.BaseFont) || {}).name || '');
    font.dw = doc.get(desc.DW) || 1000;
    const w = doc.get(desc.W) || [];
    for (let i = 0; i < w.length;){
      const a = doc.get(w[i]), b = doc.get(w[i + 1]);
      if (Array.isArray(b)){ b.forEach(function(x, j){ font.widths[a + j] = doc.get(x); }); i += 2; }
      else { const c = doc.get(w[i + 2]); for (let k = a; k <= b; k++) font.widths[k] = c; i += 3; }
    }
  } else {
    const fc = doc.get(f.FirstChar) || 0, ws = doc.get(f.Widths) || [];
    ws.forEach(function(x, j){ font.widths[fc + j] = doc.get(x); });
    font.dw = 500;
  }
  if (f.ToUnicode){
    let cm = '';
    try { cm = latin1_(doc.stream(f.ToUnicode)); } catch (e) {}
    font.map = {};
    const hex = function(h){ let t = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) t += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return t; };
    (cm.match(/beginbfchar[\s\S]*?endbfchar/g) || []).forEach(function(b){
      b.replace(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi, function(_, c, u){ font.map[parseInt(c, 16)] = hex(u); });
    });
    (cm.match(/beginbfrange[\s\S]*?endbfrange/g) || []).forEach(function(b){
      b.replace(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]+>|\[[^\]]*\])/gi, function(_, lo, hi, dst){
        lo = parseInt(lo, 16); hi = parseInt(hi, 16);
        if (dst[0] === '['){
          const list = dst.match(/<([0-9a-f]+)>/gi) || [];
          for (let c = lo; c <= hi; c++) if (list[c - lo]) font.map[c] = hex(list[c - lo].slice(1, -1));
        } else {
          const base = parseInt(dst.slice(1, -1), 16);
          for (let c = lo; c <= hi; c++) font.map[c] = String.fromCharCode(base + c - lo);
        }
      });
    });
  }
  font.decode = function(bytes){
    const out = [];
    const step = font.two ? 2 : 1;
    for (let i = 0; i + step - 1 < bytes.length; i += step){
      const code = font.two ? (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1) : bytes.charCodeAt(i);
      let ch = font.map && font.map[code] !== undefined ? font.map[code]
             : font.two ? '' : String.fromCharCode(WIN1252_[code] || code);
      const w = font.widths[code] !== undefined ? font.widths[code] : font.dw;
      out.push({ ch: ch, w: w, space: !font.two && code === 32 });
    }
    return out;
  };
  return font;
}

const mul_ = function(a, b){
  return [a[0]*b[0] + a[1]*b[2], a[0]*b[1] + a[1]*b[3], a[2]*b[0] + a[3]*b[2], a[2]*b[1] + a[3]*b[3],
          a[4]*b[0] + a[5]*b[2] + b[4], a[4]*b[1] + a[5]*b[3] + b[5]];
};

/* Every run of text on every page: { page, x, y, x1, size, bold, text }.
   y grows downwards (0 = top of the page), like reading. */
function pdfRuns_(bytes){
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes, function(b){ return b & 255; });
  const doc = pdfDoc_(u8);
  let root = null;
  Object.keys(doc.objs).some(function(k){ const v = doc.objs[k].v; if (v && v.Type && v.Type.name === 'Catalog'){ root = v; return true; } });
  const pages = [];
  const walk = function(node, inherited){
    node = doc.get(node);
    if (!node) return;
    const res = node.Resources || inherited;
    if (node.Type && node.Type.name === 'Pages') (doc.get(node.Kids) || []).forEach(function(k){ walk(k, res); });
    else pages.push({ node: node, res: res });
  };
  walk(root && root.Pages, null);
  const runs = [];
  pages.forEach(function(pg, pi){
    const box = doc.get(pg.node.MediaBox) || [0, 0, 612, 792];
    const top = doc.get(box[3]);
    const fonts = {};
    const draw = function(content, res, ctm0){
      res = doc.get(res) || {};
      const fontDict = doc.get(res.Font) || {}, xobj = doc.get(res.XObject) || {};
      const p = pdfParse_(content, 0);
      let ctm = ctm0.slice(), stack = [], tm = [1,0,0,1,0,0], tlm = [1,0,0,1,0,0];
      let font = null, fs = 1, tc = 0, tw = 0, th = 1, tl = 0, rise = 0, args = [];
      const show = function(items){
        if (!font) return;
        let text = '', x0 = null, y0 = null, x1 = 0;
        items.forEach(function(it){
          if (typeof it === 'number'){ const tx = -it / 1000 * fs * th; tm = mul_([1,0,0,1,tx,0], tm); if (it < -200) text += ' '; return; }
          font.decode(it).forEach(function(g){
            const trm = mul_(mul_([fs * th, 0, 0, fs, 0, rise], tm), ctm);
            if (x0 === null){ x0 = trm[4]; y0 = trm[5]; }
            const tx = (g.w / 1000 * fs + tc + (g.space ? tw : 0)) * th;
            tm = mul_([1,0,0,1,tx,0], tm);
            text += g.ch;
            x1 = mul_([1,0,0,1,0,0], mul_(tm, ctm))[4];
          });
        });
        if (x0 === null || !text) return;
        const size = Math.abs(fs * Math.hypot(tm[2] * ctm[0] + tm[3] * ctm[2], tm[2] * ctm[1] + tm[3] * ctm[3])) || fs;
        const run = { page: pi, x: x0, y: top - y0, x1: x1, size: size, bold: font.bold, text: text };
        /* Text set on its side ("LUNCH" running up a merged cell): y is where it starts, y1 where it ends. */
        const end = mul_(tm, ctm);
        if (Math.abs(end[1]) > Math.abs(end[0])) run.y1 = top - end[5];
        runs.push(run);
      };
      for (;;){
        p.ws();
        if (p.pos() >= content.length) break;
        let v;
        try { v = p.value(); } catch (e) { break; }
        if (!v || v.op === undefined){ args.push(v); continue; }
        const op = v.op, a = args; args = [];
        switch (op){
          case 'q': stack.push(ctm.slice()); break;
          case 'Q': if (stack.length) ctm = stack.pop(); break;
          case 'cm': ctm = mul_(a.slice(0, 6), ctm); break;
          case 'BT': tm = [1,0,0,1,0,0]; tlm = tm.slice(); break;
          case 'Tf':
            fs = a[1];
            const key = a[0] && a[0].name;
            if (!fonts[key + '@' + pi]) fonts[key + '@' + pi] = pdfFont_(doc, fontDict[key]);
            font = fonts[key + '@' + pi];
            break;
          case 'Tc': tc = a[0]; break;
          case 'Tw': tw = a[0]; break;
          case 'Tz': th = a[0] / 100; break;
          case 'TL': tl = a[0]; break;
          case 'Ts': rise = a[0]; break;
          case 'Tm': tm = a.slice(0, 6); tlm = tm.slice(); break;
          case 'Td': tlm = mul_([1,0,0,1,a[0],a[1]], tlm); tm = tlm.slice(); break;
          case 'TD': tl = -a[1]; tlm = mul_([1,0,0,1,a[0],a[1]], tlm); tm = tlm.slice(); break;
          case 'T*': tlm = mul_([1,0,0,1,0,-tl], tlm); tm = tlm.slice(); break;
          case 'Tj': show([a[0].str !== undefined ? a[0].str : hexStr_(a[0].hex)]); break;
          case "'": tlm = mul_([1,0,0,1,0,-tl], tlm); tm = tlm.slice(); show([a[0].str !== undefined ? a[0].str : hexStr_(a[0].hex)]); break;
          case '"': tw = a[0]; tc = a[1]; tlm = mul_([1,0,0,1,0,-tl], tlm); tm = tlm.slice(); show([a[2].str !== undefined ? a[2].str : hexStr_(a[2].hex)]); break;
          case 'TJ': show((a[0] || []).map(function(x){ return typeof x === 'number' ? x : x.str !== undefined ? x.str : hexStr_(x.hex); })); break;
          case 'Do':
            const xo = xobj[a[0] && a[0].name];
            const xv = doc.get(xo);
            if (xv && xv.Subtype && xv.Subtype.name === 'Form'){
              let data = null;
              try { data = doc.stream(xo); } catch (e) {}
              if (data) draw(latin1_(data), xv.Resources || res, mul_(doc.get(xv.Matrix) || [1,0,0,1,0,0], ctm));
            }
            break;
          case 'BI': { const e = content.indexOf('EI', p.pos()); p.seek(e < 0 ? content.length : e + 2); break; }
        }
      }
    };
    let contents = doc.get(pg.node.Contents);
    contents = Array.isArray(contents) ? contents : [pg.node.Contents];
    const data = contents.map(function(c){ try { return latin1_(doc.stream(c)); } catch (e) { return ''; } }).join('\n');
    draw(data, pg.res, [1,0,0,1,0,0]);
  });
  return runs;
}
function hexStr_(h){ h = h || ''; if (h.length % 2) h += '0'; let s = ''; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return s; }

/* Runs that touch on the same baseline joined into lines.
   A line remembers whether it ended on a space run of its own, which is how
   Word marks the end of a paragraph (a wrapped line ends on its last word). */
function pdfLines_(runs){
  const order = function(a, b){ return a.page - b.page || Math.round(a.y / 2) - Math.round(b.y / 2) || a.x - b.x; };
  /* Text on its side is a line of its own: the pieces that follow one another up (or down) the
     page, in the order they were drawn, are joined, and the line keeps where it ends as y1. */
  const side = [];
  runs.forEach(function(r){
    if (r.y1 === undefined) return;
    const l = side.length ? side[side.length - 1] : null;
    if (l && l.page === r.page && Math.abs(l.x - r.x) < r.size * 0.3 && Math.abs(r.y - l.y1) < r.size * 0.6){
      l.text += (Math.abs(r.y - l.y1) > r.size * 0.12 && !/\s$/.test(l.text) && !/^\s/.test(r.text) ? ' ' : '') + r.text;
      l.y1 = r.y1;
    } else side.push({ page: r.page, x: r.x, y: r.y, x1: r.x1, y1: r.y1, size: r.size, bold: r.bold, text: r.text, paraEnd: false });
  });
  const sorted = runs.filter(function(r){ return r.y1 === undefined; }).sort(order);
  const lines = [];
  sorted.forEach(function(r){
    const l = lines.length ? lines[lines.length - 1] : null;
    const blank = !/\S/.test(r.text);
    const same = l && l.page === r.page && Math.abs(l.y - r.y) < r.size * 0.35;
    if (blank){
      if (same && r.x - l.x1 < r.size * 0.45 && r.x >= l.x1 - r.size * 0.3){ l.paraEnd = true; if (!/\s$/.test(l.text)) l.text += ' '; }
      return;
    }
    if (same && r.x >= l.x1 - r.size * 0.3 && r.x - l.x1 < r.size * 0.45){
      l.text += (r.x - l.x1 > r.size * 0.12 && !/\s$/.test(l.text) && !/^\s/.test(r.text) ? ' ' : '') + r.text;
      l.x1 = Math.max(l.x1, r.x1); l.bold = l.bold && r.bold; l.paraEnd = false;
      return;
    }
    lines.push({ page: r.page, x: r.x, y: r.y, x1: r.x1, size: r.size, bold: r.bold, text: r.text, paraEnd: false });
  });
  const all = side.length ? lines.concat(side).sort(order) : lines;
  all.forEach(function(l){ l.text = l.text.replace(/\s+/g, ' ').trim(); });
  return all.filter(function(l){ return l.text; });
}

/* ---------- Trinity (weekly PDF, a Word table) ---------- */

const CHROME_UA_ = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function getBytes_(url){
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': CHROME_UA_ } });
  if (res.getResponseCode() !== 200) return null;
  const b = res.getBlob().getBytes();
  return b && b.length > 4 && String.fromCharCode(b[0] & 255, b[1] & 255, b[2] & 255, b[3] & 255) === '%PDF' ? b : null;
}

function fetchTrinity_(){
  const PAGE = 'https://www.trin.cam.ac.uk/download/hall-menu-this-week/';
  /* The download id is read from the page each time, in case the file is re-uploaded under a new one. */
  const page = UrlFetchApp.fetch(PAGE, { muteHttpExceptions: true, headers: { 'User-Agent': CHROME_UA_ } }).getContentText();
  const id = (page.match(/wpdmdl=(\d+)/) || [])[1] || '30107';
  const bytes = getBytes_(PAGE + '?wpdmdl=' + id);
  return bytes ? parseTrinity_(pdfLines_(pdfRuns_(bytes))) : [];
}

function parseTrinity_(lines){
  lines = lines.filter(function(l){ return l.page === 0 && !/^(st|nd|rd|th)$/.test(l.text); });
  /* Columns: the weekday headers, and the date line under each. */
  const cols = lines.filter(function(l){ return /^(MON|TUES|WEDNES|THURS|FRI|SATUR|SUN)DAY$/.test(l.text); })
    .map(function(l){ return { cx: (l.x + l.x1) / 2, y: l.y, date: '', left: 0, lines: [] }; })
    .sort(function(a, b){ return a.cx - b.cx; });
  if (!cols.length) return [];
  const headY = cols[0].y;
  /* "14th September" arrives as "14", a raised "th", and "September". */
  const near = lines.filter(function(l){ return l.y > headY && l.y < headY + 30; });
  near.forEach(function(l){
    let m = l.text.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]+)$/), day = null, mon = null;
    if (m){ day = m[1]; mon = m[2]; }
    else if (/^\d{1,2}$/.test(l.text)){
      const next = near.filter(function(k){ return /^[A-Za-z]{3,}$/.test(k.text) && k.x > l.x1 && k.x - l.x1 < 25 && Math.abs(k.y - l.y) < 3; })[0];
      if (next){ day = l.text; mon = next.text; }
    }
    if (!day || !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(mon)) return;
    const c = nearest_(cols, l.x + 25);
    if (c) c.date = dayMonth_(Number(day), mon);
  });
  /* The cell's left edge is where its "LUNCH" / "NO LUNCH" marker starts. */
  lines.forEach(function(l){
    if (!/^(NO )?(LUNCH|DINNER|BRUNCH)\b/.test(l.text) || l.y < headY + 15) return;
    const c = nearest_(cols, l.x + 30);
    if (c && (!c.left || l.x < c.left)) c.left = l.x;
  });
  cols.forEach(function(c, i){ if (!c.left) c.left = c.cx - 45; });
  lines.forEach(function(l){
    if (l.y < headY + 15 || l.size > 12) return;
    let c = null;
    cols.forEach(function(k){ if (l.x >= k.left - 4) c = k; });
    if (c) c.lines.push(l);
  });
  const TAGS = /^(\((v|vegan|vg|wf\/df|gf|df|h)\)\s*)+$/i;
  const days = [];
  cols.forEach(function(c, ci){
    if (!c.date) return;
    const day = { date: c.date };
    let meal = null, closed = false, course = null, dietAll = [], items = [];
    const flush = function(){
      if (!meal || closed || !course || !items.length) { items = []; return; }
      day[meal] = day[meal] || [];
      day[meal].push({ name: course, dishes: items.map(function(t){
        const x = tagged_(t.replace(/\s*\((wf\/df)\)/ig, ''));
        if (/\(wf\/df\)/i.test(t)) x.diet.push('wf-df');
        dietAll.forEach(function(d){ add_(x.diet, d); });
        return x;
      }) });
      items = [];
    };
    c.lines.sort(function(a, b){ return a.y - b.y; });
    c.lines.forEach(function(l, i){
      const t = l.text;
      const sec = t.match(/^(NO )?(LUNCH|DINNER|BRUNCH)\b/);
      if (sec){
        flush();
        const k = sec[2] === 'DINNER' ? 'dinner' : 'lunch';
        if (sec[2] === 'BRUNCH' && meal === 'lunch' && !closed){ day.labels = { lunch: 'Brunch' }; return; }
        meal = k; closed = !!sec[1]; course = null;
        if (closed){ day.notes = day.notes || {}; add_(day.notes[k] = day.notes[k] || [], 'No ' + k + ' served today'); }
        if (sec[2] === 'BRUNCH') day.labels = { lunch: 'Brunch' };
        return;
      }
      const head = t.match(/^(Starter Soup|Soups?|Starters?|Mains?|Sides?|Daily Special|Specials?|Desserts?|Puddings?)\s*:\s*(.*)$/i);
      if (head){
        flush();
        course = head[1];
        dietAll = tagged_('x ' + head[2]).diet;
        return;
      }
      if (!course) return;
      const prev = items.length ? items[items.length - 1] : null;
      const prevLine = i > 0 ? c.lines[i - 1] : null;
      /* A line continues the dish above unless that line ended its paragraph.
         Tag-only lines, like "(vegan)", always belong to the dish above. */
      let wrapped = false;
      if (prev && prevLine && !/:\s*$/.test(prevLine.text)){
        wrapped = TAGS.test(t) || /[,&–-]$|\bwith$|\band$/.test(prevLine.text) || !prevLine.paraEnd;
      }
      if (wrapped) items[items.length - 1] = prev + ' ' + t;
      else items.push(t);
    });
    flush();
    days.push(day);
  });
  return days;
}

function nearest_(cols, x){
  let best = null, d = Infinity;
  cols.forEach(function(c){ const k = Math.abs(c.cx - x); if (k < d){ d = k; best = c; } });
  return best;
}

/* ---------- St Edmund's (weekly PDFs, PowerPoint grids) ---------- */

function fetchStEdmunds_(){
  const feed = UrlFetchApp.fetch('https://my.st-edmunds.cam.ac.uk/category/menus/feed/',
    { muteHttpExceptions: true, headers: { 'User-Agent': CHROME_UA_ } }).getContentText();
  const days = [];
  const today = today_();
  (feed.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 4).forEach(function(item){
    const text = text_(item.replace(/<!\[CDATA\[|\]\]>/g, ' '));
    const wc = text.match(/Week\s+Commencing\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/i);
    let monday;
    if (wc) monday = mondayOf_(dayMonth_(Number(wc[1]), wc[2]));
    else {
      const pub = new Date((item.match(/<pubDate>([^<]*)</) || [])[1]);
      if (isNaN(pub)) return;
      monday = mondayOf_(addDays_(Utilities.formatDate(pub, TZ, 'yyyy-MM-dd'), 2));   // posted at the weekend for the week ahead
    }
    if (addDays_(monday, 6) < today || monday > addDays_(today, 13)) return;
    const pdfs = [];
    item.replace(/https:\/\/[^"'<>\s]+\.pdf/g, function(u){ if (pdfs.indexOf(u) < 0) pdfs.push(u); });
    pdfs.forEach(function(u){
      const name = u.split('/').pop().toLowerCase();
      const meal = /supper|dinner/.test(name) ? 'dinner' : /lunch|brunch/.test(name) ? 'lunch' : null;
      if (!meal) return;
      const bytes = getBytes_(u);
      if (!bytes) return;
      parseGridPdf_(pdfLines_(pdfRuns_(bytes)), monday, meal).forEach(function(d){ days.push(d); });
    });
  });
  return days;
}

/* A week laid out as columns (weekday headers) and optional row labels down the left. */
function parseGridPdf_(lines, monday, meal){
  lines = lines.filter(function(l){ return l.page === 0; });
  const cols = lines.filter(function(l){ return /^(MON|TUES|WEDNES|THURS|FRI|SATUR|SUN)DAY$/i.test(l.text); })
    .map(function(l){ return { cx: (l.x + l.x1) / 2, x: l.x, y: l.y, dow: WEEKDAYS.indexOf(l.text.toLowerCase()), lines: [] }; })
    .sort(function(a, b){ return a.cx - b.cx; });
  if (!cols.length) return [];
  const headY = Math.max.apply(null, cols.map(function(c){ return c.y; }));
  const gap = cols.length > 1 ? (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1) : 120;
  const firstLeft = cols[0].cx - gap / 2;
  /* Row labels: short upper-case words left of the first column. */
  const rows = lines.filter(function(l){
    return l.y > headY && l.x1 < firstLeft + 8 && /^[A-Z][A-Z ()&]{2,}$/.test(l.text);
  }).sort(function(a, b){ return a.y - b.y; });
  /* Rows end at the widest empty band between one label and the next. */
  const content = lines.filter(function(l){ return l.y > headY + 4 && rows.indexOf(l) < 0 && l.x > firstLeft - 4; })
    .map(function(l){ return [l.y - l.size * 0.95, l.y + l.size * 0.3]; }).sort(function(a, b){ return a[0] - b[0]; });
  const bounds = [];
  for (let i = 1; i < rows.length; i++){
    const lo = rows[i - 1].y, hi = rows[i].y;
    let end = lo, best = (lo + hi) / 2, widest = -1;
    content.forEach(function(iv){
      if (iv[1] < lo || iv[0] > hi) return;
      if (iv[0] > end && iv[0] - end > widest){ widest = iv[0] - end; best = (end + iv[0]) / 2; }
      end = Math.max(end, iv[1]);
    });
    if (hi - end > widest && end < hi){ best = (end + hi) / 2; }
    bounds.push(best);
  }
  const rowOf = function(y){
    if (!rows.length) return '';
    let i = 0;
    while (i < bounds.length && y > bounds[i]) i++;
    return rows[i].text;
  };
  const footer = /allergen information|kcal per ?100|adults need/i;
  lines.forEach(function(l){
    if (l.y <= headY + 4 || footer.test(l.text) || rows.indexOf(l) >= 0) return;
    if (l.x1 - l.x > gap * 1.6) return;                              // spans several columns: a banner, not a dish
    const c = nearest_(cols, (l.x + l.x1) / 2);
    if (c && Math.abs(c.cx - (l.x + l.x1) / 2) < gap * 0.6) c.lines.push(l);
  });
  const KCAL = /\s*\(?(\d{1,4})\s*k?cal\b\)?\.?/i;
  const days = [];
  cols.forEach(function(c){
    if (c.dow < 0) return;
    const day = { date: addDays_(monday, (c.dow + 6) % 7) };
    const byRow = {};
    c.lines.sort(function(a, b){ return a.y - b.y; });
    /* Brunch heading and its hours sit at the top of the column. */
    c.lines = c.lines.filter(function(l){
      if (/^brunch$/i.test(l.text)){ day.labels = { lunch: 'Brunch' }; return false; }
      const h = l.text.match(/^(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})$/);
      if (h){ (day.hours = day.hours || {})[meal] = h[1] + '–' + h[2]; return false; }
      if (/^street food:?$/i.test(l.text)) return false;
      return true;
    });
    let cur = null, last = null;
    const close = function(){
      if (!cur) return;
      const nameLines = [], desc = [];
      const nameSize = cur.lines[0].size;
      let inName = true;
      /* The name is the first line and any more at the same size; smaller lines are the description. */
      cur.lines.forEach(function(l, i){
        if (inName && (i === 0 || l.size >= nameSize - 0.4)) nameLines.push(l.text);
        else { inName = false; desc.push(l.text); }
      });
      let name = nameLines.join(' ').replace(/\s*served with.*$/i, '').trim();
      const bucket = byRow[cur.row] = byRow[cur.row] || [];
      if (!name || /^served with/i.test(nameLines.join(' '))){
        cur = null; return;                                            // a description with no dish: ignore
      }
      const x = tagged_(name.replace(/\s*\((v|vg|vegan|ve)\)\s*/ig, function(m){ return ' ' + m.trim() + ' '; }).replace(/\s+/g, ' ').trim());
      const d = desc.join(' ').replace(/\s*served with freshly baked bread\.?/i, '').trim();
      if (d && /\(v\)/i.test(d)) add_(x.diet, 'vegetarian');
      if (d && /\(vg|vegan\)/i.test(d)) add_(x.diet, 'vegan');
      if (/\(v\)/i.test(cur.row)) add_(x.diet, 'vegetarian');
      x.desc = d.replace(/\s*\((v|vg|vegan)\)\s*/ig, ' ').trim();
      if (cur.kcal) x.kcal = cur.kcal;
      bucket.push(x);
      cur = null;
    };
    c.lines.forEach(function(l){
      let t = l.text, kcal = null;
      const k = t.match(KCAL);
      if (k){ kcal = Number(k[1]); t = t.replace(KCAL, ' ').replace(/\s+/g, ' ').trim(); }
      const row = rowOf(l.y);
      if (cur && (row !== cur.row || (last && l.y - last.y > Math.max(l.size, last.size) * 1.65))) close();
      if (t){
        if (!cur) cur = { row: row, lines: [] };
        cur.lines.push({ text: t, bold: l.bold, size: l.size });
      }
      if (kcal !== null){
        if (cur){ cur.kcal = kcal; close(); }
      }
      last = l;
    });
    close();
    const courses = Object.keys(byRow).map(function(r){
      let name = r;
      if (/\(v\)/i.test(r)) name = 'Vegetarian';
      else if (/side/i.test(r)) name = 'Sides';
      return { name: name, dishes: byRow[r] };
    }).filter(function(x){ return x.dishes.length; });
    if (courses.length){ day[meal] = courses; days.push(day); }
  });
  return days;
}

/* ---------- helpers ---------- */

function get_(url){
  /* Some college hosts are flaky from Google's side ("Address unavailable"), so a
     failed read is retried on the other spellings of the same address before giving up. */
  const tries = [url];
  if (/^https:\/\/www\./.test(url)) tries.push(url.replace('https://www.', 'http://www.'));
  else if (/^https:\/\/(?!www\.)/.test(url)) tries.push(url.replace('https://', 'https://www.'));
  for (let i = 0; i < tries.length; i++){
    try {
      const res = UrlFetchApp.fetch(tries[i], { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.getResponseCode() === 200) return res.getContentText('UTF-8');
    } catch (e) { Logger.log('fetch ' + tries[i] + ': ' + e); }
  }
  return '';
}

/* Many pages at once, in parallel. A failed page comes back as ''. */
function getAll_(urls){
  const reqs = urls.map(function(u){
    return { url: u, muteHttpExceptions: true, followRedirects: true,
             headers: { 'User-Agent': 'Mozilla/5.0' } };
  });
  try {
    return UrlFetchApp.fetchAll(reqs).map(function(r){
      return r.getResponseCode() === 200 ? r.getContentText('UTF-8') : '';
    });
  } catch (e) {
    return urls.map(function(u){ try { return get_(u); } catch (x) { return ''; } });
  }
}

function text_(x){
  return String(x || '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&pound;/g, '£').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, function(_, n){ return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, n){ return String.fromCharCode(parseInt(n, 16)); })
    .replace(/\s+/g, ' ').trim();
}

/* A table cell split on its <br>s, each line as plain text. */
function lines_(cell){
  return String(cell).split(/<br\s*\/?>/i).map(text_).filter(function(l){ return l; });
}

/* "£.95" -> "£0.95", "£4,60" -> "£4.60" */
function price_(x){ return text_(x).replace(/^£\./, '£0.').replace(/^(£\d+),(\d\d)$/, '$1.$2'); }

function add_(list, v){ if (v && list.indexOf(v) < 0) list.push(v); }
function has_(m){ return Array.isArray(m) && m.length > 0; }
function pad_(n){ return (n < 10 ? '0' : '') + n; }

function save_(id, obj){
  const props = PropertiesService.getScriptProperties();
  const s = JSON.stringify(obj);
  const key = 'menu_' + id + '_';
  const parts = {};
  let n = 0;
  for (let i = 0; i < s.length; i += CHUNK) parts[key + (n++)] = s.slice(i, i + CHUNK);
  const old = Number(props.getProperty(key + 'n') || 0);
  parts[key + 'n'] = String(n);
  props.setProperties(parts);
  for (let j = n; j < old; j++) props.deleteProperty(key + j);
}

function load_(id, all){
  all = all || PropertiesService.getScriptProperties().getProperties();
  const key = 'menu_' + id + '_';
  const n = Number(all[key + 'n'] || 0);
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) s += all[key + i] || '';
  try { return JSON.parse(s); } catch (e) { return null; }
}

function today_(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function addDays_(date, n){
  const p = date.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12)), TZ, 'yyyy-MM-dd');
}
function mondayOf_(date){
  const p = date.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).getUTCDay();
  return addDays_(date, -((dow + 6) % 7));
}

/* ===============================================================
   SIX MORE DINING HALLS

   Homerton and Peterhouse are JSON; Fitzwilliam, Pembroke and
   St Catharine's are PDFs of a week laid out as a table, read by
   readWeekPdf_() below; Lucy Cavendish is a Canva design read box by
   box into the same reader. A parsed PDF is kept in the script cache
   for six hours, so St Catharine's twelve files aren't read again on
   every refresh. Run debugNewColleges() (and probeLucy()) from the
   editor to see what each one reads.
   =============================================================== */

/* ---------- Homerton ---------- */

const HOMERTON_PAGE = 'https://www.homerton.cam.ac.uk/catering';

function fetchHomerton_(){
  let api = 'https://www.homerton.cam.ac.uk/api/cafeteria-menu';
  const days = [];
  /* Today plus four can reach into next week, so this week and the next. */
  for (let k = 0; k <= 1; k++){
    let body = getJson_(api + '?weekOffset=' + k);
    if (!body && k === 0){
      /* The address is in the page's drupalSettings (cafeteriaMenu.apiEndpoint), should it ever move. */
      const found = (get_(HOMERTON_PAGE).match(/"apiEndpoint"\s*:\s*"([^"]+)"/) || [])[1];
      if (found){
        api = found.replace(/\\\//g, '/').split('?')[0];
        if (api.charAt(0) === '/') api = 'https://www.homerton.cam.ac.uk' + api;
        body = getJson_(api + '?weekOffset=' + k);
      }
    }
    if (!body) break;                                     // a later week that isn't up yet ends the list
    parseHomerton_(JSON.parse(body)).forEach(function(d){ days.push(d); });
  }
  return days;
}

/* { meta:{ weekOffset, start, end }, days:[ { date, weekday, breakfast:[], lunch:[], dinner:[] } ] },
   each item { name, allergens:[ ... ], price }. */
function parseHomerton_(week){
  const days = [];
  ((week && week.days) || []).forEach(function(d){
    const date = String(d.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const day = { date: date };
    ['lunch', 'dinner'].forEach(function(meal){
      const dishes = (d[meal] || []).map(function(it){
        const x = tagged_(text_(it.name));
        x.allergens = (it.allergens || []).map(text_).filter(String);
        return x;
      }).filter(function(x){ return x.name; });
      if (dishes.length) day[meal] = [{ name: '', dishes: dishes }];
    });
    days.push(day);
  });
  return days;
}

/* Like get_, but asking for JSON with a browser's User-Agent (the API has answered a bare one with 403). */
function getJson_(url){
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': CHROME_UA_, Accept: 'application/json' } });
    const body = res.getResponseCode() === 200 ? res.getContentText('UTF-8') : '';
    return /^\s*[\[{]/.test(body) ? body : '';
  } catch (e) { Logger.log('fetch ' + url + ': ' + e); return ''; }
}

/* ---------- Peterhouse (petmenu.co.uk) ---------- */

function fetchPeterhouse_(){
  const body = get_('https://petmenu.co.uk/servery.json');
  return body ? parsePeterhouse_(JSON.parse(body)) : [];
}

/* Every entry is [ text, codes ]. V is vegetarian, VV vegan, HM halal meat. The other codes look
   like the fourteen allergens (G gluten, D milk, E egg, SO soya, SD sulphites ...) but petmenu
   publishes no key to them, so they are left out rather than guessed. */
const PET_DIET_ = { V: 'vegetarian', VV: 'vegan', HM: 'halal' };
const PET_CODE_ = /^(V|VV|HM|C|D|E|F|G|L|M|MO|N|P|PN|S|SD|SO|X)$/;

function parsePeterhouse_(data){
  const days = [];
  const menus = (data && data.menus_by_date) || {};
  Object.keys(menus).forEach(function(date){
    const m = menus[date] || {};
    const course = function(name, entries){
      return { name: name, dishes: petList_(entries).map(petDish_).filter(Boolean) };
    };
    const keep = function(cs){ return cs.filter(function(c){ return c.dishes.length; }); };
    /* The soup and puddings are the same at lunch and dinner: each meal gets its own copy. */
    const soup = function(){ return course('Soup', m.soup); };
    const desserts = function(){ return course('Desserts', m.desserts); };
    const day = { date: date };
    if (m.brunch && (has_(m.brunch.specials) || has_(m.brunch.regular))){
      /* Saturday: the cooked brunch, not the salad bar and puddings listed beside it. */
      day.labels = { lunch: 'Brunch' };
      day.lunch = keep([course('Specials', m.brunch.specials), course('Brunch', m.brunch.regular)]);
    } else {
      const mains = course('Mains', m.lunch && m.lunch.mains);
      /* The salad bar and puddings are listed every day: lunch is only served when something is cooked. */
      if (mains.dishes.length || soup().dishes.length){
        day.lunch = keep([soup(), mains, course('Jacket potatoes', m.potato),
                          course('Sides', m.lunch && m.lunch.sides),
                          { name: 'Salad bar', dishes: petSalads_(m.salads) }, desserts()]);
      }
    }
    const dinner = course('Mains', m.dinner && m.dinner.mains);
    if (dinner.dishes.length) day.dinner = keep([soup(), dinner, course('Sides', m.dinner.sides), desserts()]);
    days.push(day);
  });
  return days;
}

/* An entry or a list of them: the soup comes as a single [ text, codes ]. */
function petList_(e){ return !e ? [] : Array.isArray(e[0]) ? e : [e]; }

function petDish_(entry){
  const x = petPeel_(text_(entry[0]));
  (entry[1] || []).forEach(function(c){ add_(x.diet, PET_DIET_[c]); });
  return x.name ? x : null;
}

/* Codes written into the text itself: "Yorkshire pudding V G D E Included with your main". */
function petPeel_(t){
  const diet = [], words = String(t || '').split(/\s+/).filter(String);
  let i = 0;
  while (i < words.length && !(PET_CODE_.test(words[i]) && (i + 1 === words.length || PET_CODE_.test(words[i + 1])))) i++;
  let j = i;
  while (j < words.length && PET_CODE_.test(words[j])){ add_(diet, PET_DIET_[words[j]]); j++; }
  const x = { name: words.slice(0, i).join(' '), diet: diet };
  const rest = words.slice(j).join(' ');
  if (rest) x.desc = rest;
  return x;
}

/* The salad bar is one string, items two spaces apart, each with its codes after it:
   "Mixed side salad VV  Tomato and fennel VV  Pesto pasta V G D  Grated cheese".
   The entry's own codes belong to the last item. */
function petSalads_(entries){
  const out = [];
  petList_(entries).forEach(function(e){
    const chunks = String(e[0] || '').split(/\s{2,}/).map(function(s){ return s.trim(); }).filter(String);
    chunks.forEach(function(chunk, i){
      const x = petPeel_(chunk);
      if (i === chunks.length - 1) (e[1] || []).forEach(function(c){ add_(x.diet, PET_DIET_[c]); });
      if (x.name) out.push(x);
    });
  });
  return out;
}

/* ---------- Fitzwilliam (weekly PDF) ---------- */

const FITZ_PAGE = 'https://www.fitz.cam.ac.uk/cafe-bar-and-buttery';

function fetchFitzwilliam_(){
  const days = [];
  fitzWeeks_(get_(FITZ_PAGE)).forEach(function(w){
    const lines = pdfLinesOf_(w.url);
    if (lines) parseFitzwilliam_(lines, w.monday).forEach(function(d){ days.push(d); });
  });
  return days;
}

/* "To view the menu week commencing 12 October click here": the file names aren't dated
   ("Buttery Menu (25).pdf"), only the link text. Formal Hall menus share the page and are skipped. */
function fitzWeeks_(html){
  const first = today_(), last = addDays_(first, DAYS_AHEAD), seen = {}, out = [];
  pdfLinks_(html, FITZ_PAGE).forEach(function(a){
    if (/formal/i.test(a.text) || !/menu/i.test(a.text) || seen[a.url]) return;
    const d = a.text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/);
    if (!d || MONTHS.indexOf(d[2].toLowerCase()) < 0 && !/^(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(d[2])) return;
    const monday = mondayOf_(dayMonth_(Number(d[1]), d[2]));
    if (addDays_(monday, 6) < first || monday > last) return;
    seen[a.url] = true;
    out.push({ url: a.url, monday: monday });
  });
  return out;
}

function parseFitzwilliam_(lines, monday){
  return gridDays_(readWeekPdf_(lines, /^(lunch|brunch|dinner|supper)\b/i), monday, {});
}

/* ---------- Pembroke (three-week cycle of PDFs) ---------- */

const PEMBROKE_PAGE = 'https://www.pem.cam.ac.uk/college/catering/information-students/servery-menu';

function fetchPembroke_(){
  const days = [];
  pembrokeWeeks_(get_(PEMBROKE_PAGE)).forEach(function(w){
    const lines = pdfLinesOf_(w.url);
    if (!lines) return;
    w.mondays.forEach(function(monday){
      parsePembroke_(lines, monday).forEach(function(d){ days.push(d); });
    });
  });
  return days;
}

/* "<p><strong>Week 2</strong></p><p>Weeks commencing 12th October, 02nd November, 23rd November</p>",
   then that week's PDF once it is posted. Only the weeks that touch today plus four are kept. */
function pembrokeWeeks_(html){
  const first = today_(), last = addDays_(first, DAYS_AHEAD), out = [];
  String(html || '').split(/(?=<p>\s*<strong>\s*Week\s*\d)/i).slice(1).forEach(function(block){
    const pdf = (pdfLinks_(block, PEMBROKE_PAGE)[0] || {}).url;
    const listed = (text_(block).match(/commencing\s+(.+?)(?:Week\s*\d|\d+(?:\.\d+)?\s*[KM]B\b|$)/i) || [])[1] || '';
    const mondays = [];
    listed.replace(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/g, function(_, d, mon){
      const monday = mondayOf_(dayMonth_(Number(d), mon));
      if (addDays_(monday, 6) >= first && monday <= last) add_(mondays, monday);
    });
    if (pdf && mondays.length) out.push({ url: pdf, mondays: mondays });
  });
  return out;
}

/* Each day: a main, an alternative and an allergen-friendly dish for lunch and for dinner,
   then a pudding and sides that go with both. The rows are "Main dish", "Alternative dish",
   "Allergen friendly dish", "Dessert" and "Sides", the meal beside them or in their label.
   The menu is in capitals, so "BUTTER BEAN STEW" over "WITH SPINACH AND HERB DUMPLINGS" looks
   like two dishes: every row but the sides holds one dish, so all its lines are that dish. */
function parsePembroke_(lines, monday){
  return gridDays_(readWeekPdf_(lines, /^(lunch|brunch|dinner|supper|mains?|alternative|allergen|pudding|desserts?|sides?|vegetarian|vegan|soup)\b/i),
    monday, { shared: /pudding|dessert|sides?/i, desc: /allergen/i, plain: /^(mains?|alternative)$/i,
              single: /^(mains?|alternative|allergen|desserts?|puddings?|soups?)\b/i, twice: true,
              label: pemLabel_, dish: pemDish_ });
}

/* "MAIN DISH" -> "Main", "ALLERGEN FRIENDLY DISH" -> "Allergen friendly", "PUDDING" -> "Desserts". */
function pemLabel_(label){
  const s = label.replace(/\s+(dish|dishes|option|course)$/i, '').trim();
  if (!s) return s;
  if (/^allergen/i.test(s)) return 'Allergen friendly';
  if (/^(puddings?|desserts?)$/i.test(s)) return 'Desserts';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* "GF BATTERED FISH": gluten-free, and still called "GF Battered Fish". */
function pemDish_(x){
  const m = x.name.match(/^(g\.?\s?f\.?|gluten[- ]free)\s+(?=\S)/i);
  if (!m) return x;
  add_(x.diet, 'gluten-free');
  let rest = x.name.slice(m[0].length);
  const letters = rest.replace(/[^A-Za-z]/g, ''), caps = rest.replace(/[^A-Z]/g, '');
  if (letters.length > 3 && caps.length / letters.length > 0.7) rest = titleCase_(rest);
  x.name = (/^gluten/i.test(m[1]) ? 'Gluten-free ' : 'GF ') + rest;
  return x;
}

/* ---------- St Catharine's (four-week cycle of PDFs) ---------- */

const CATZ_PAGE = 'https://www.caths.cam.ac.uk/students/college-facilities-and-forms/catering-for-our-community/cafeteria';

function fetchStCatharines_(){
  const first = today_(), last = addDays_(first, DAYS_AHEAD), days = [];
  catzPdfs_(get_(CATZ_PAGE)).forEach(function(p){
    const lines = pdfLinesOf_(p.url);
    if (!lines) return;
    catzMondays_(lines).forEach(function(monday){
      if (addDays_(monday, 6) < first || monday > last) return;
      parseStCatharines_(lines, monday, p.meal).forEach(function(d){ days.push(d); });
    });
  });
  return days;
}

/* "Week 1  Lunch  Dinner  Weekends": the links are named for the meal, the week is in the file name. */
function catzPdfs_(html){
  const out = [];
  pdfLinks_(html, CATZ_PAGE).forEach(function(a){
    const kind = a.text.toLowerCase();
    if (['lunch', 'dinner', 'weekends'].indexOf(kind) < 0) return;
    out.push({ url: a.url, meal: kind === 'weekends' ? '' : kind,
               week: Number((a.url.match(/(?:weekly|dinner)-(\d)\b/i) || [])[1] || 0) });
  });
  return out;
}

/* The heading dates the PDF by the Mondays it is served: "(12.10/09.11)". */
function catzMondays_(lines){
  const out = [];
  lines.slice(0, 40).some(function(l){
    const m = l.text.match(/\(\s*(\d{1,2}[.\/]\d{1,2}(?:\s*[\/,&]\s*\d{1,2}[.\/]\d{1,2})*)\s*\)/);
    if (!m) return false;
    m[1].split(/\s*[\/,&]\s*(?=\d{1,2}[.\/]\d{1,2})/).forEach(function(dm){
      const p = dm.split(/[.\/]/).map(Number);
      if (p[1] >= 1 && p[1] <= 12) add_(out, mondayOf_(dayMonth_(p[0], MONTHS[p[1] - 1])));
    });
    return out.length > 0;
  });
  return out;
}

/* Three counters a meal, then sides. Only marks written in a dish's name are shown: there is no key. */
function parseStCatharines_(lines, monday, meal){
  return gridDays_(readWeekPdf_(lines, /^(counter\s*\d|sides?|soup|desserts?|pudding|lunch|brunch|dinner|supper)\b/i),
    monday, { meal: meal || null, desc: /counter/i });
}

/* ---------- Lucy Cavendish (a Canva design) ----------
   Warburton Hall's week is a Canva design, overwritten each week, a column a day, embedded on
   https://www.lucy.cam.ac.uk/dining-hall-and-cafe. As plain text its columns come out in the order
   they were drawn, so the text is read together with where each box sits, and then goes through
   the same week-table reader as the PDFs.

   NOT IN USE: on 16 Oct 2026 probeLucy() found Canva answering Apps Script with a bot check
   (403 on both the view and the embed link), so Lucy Cavendish is left out of COLLEGES.
   The reading of the page is tested and kept here in case Canva lets scripts in later. */

const LUCY_CANVA = 'https://www.canva.com/design/DAFvirNLKtg/view';

function fetchLucy_(){
  const html = canvaPage_(LUCY_CANVA + '?embed') || canvaPage_(LUCY_CANVA);
  return html ? parseLucy_(canvaLines_(canvaJson_(html))) : [];
}

function canvaPage_(url){
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': CHROME_UA_, Accept: 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' } });
    const body = res.getContentText('UTF-8');
    if (res.getResponseCode() === 200 && !CANVA_CHECK_.test(body.slice(0, 30000))) return body;
    Logger.log('canva ' + url + ': ' + res.getResponseCode() + (CANVA_CHECK_.test(body) ? ', a bot check' : ''));
  } catch (e) { Logger.log('canva ' + url + ': ' + e); }
  return '';
}
const CANVA_CHECK_ = /<title>\s*Just a moment|challenge-platform|cf-chl-/i;

/* Every JSON object the page's scripts carry: <script type="application/json">,
   JSON.parse('...') and window.x = {...}. */
function canvaJson_(html){
  const out = [];
  (String(html || '').match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).forEach(function(tag){
    const body = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
    if (/type\s*=\s*"application\/(ld\+)?json"/i.test(tag)){ try { out.push(JSON.parse(body)); } catch (e) {} return; }
    body.replace(/JSON\.parse\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\])*)\1\s*\)/g, function(_, q, s){
      try { out.push(JSON.parse(jsString_(s))); } catch (e) {}
    });
    const re = /=\s*\{/g;
    let m;
    while ((m = re.exec(body))){
      const start = re.lastIndex - 1, end = closeBrace_(body, start);
      if (end < 0) continue;
      if (end - start > 2000){ try { out.push(JSON.parse(body.slice(start, end + 1))); re.lastIndex = end; } catch (e) {} }
    }
  });
  return out;
}

/* A JavaScript string literal's text: \x41, é, \n, \' ... */
function jsString_(s){
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, function(_, e){
    if (e.length === 3 && e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e.length === 5 && e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }[e] || e;
  });
}

/* Where the object literal opening at s[i] closes, skipping strings. */
function closeBrace_(s, i){
  let depth = 0, q = '';
  for (; i < s.length; i++){
    const c = s[i];
    if (q){ if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{') depth++;
    else if (c === '}' && !--depth) return i;
  }
  return -1;
}

/* Text boxes with where they sit, as PDF-style lines ({ page, x, y, x1, size, text }).
   Canva doesn't document its format, so this goes by shape: an object with a top and a left
   (or y and x) and a width holds a box; text inside it under text/content/value is what it
   says. A box with boxes inside is a group, and its children sit relative to it. The boxes of
   one array are one page, numbered in the order met. */
function canvaLines_(objs){
  const lines = [];
  let pages = 0;
  const num = function(){ for (let i = 0; i < arguments.length; i++) if (typeof arguments[i] === 'number') return arguments[i]; return null; };
  const texts = function(n, depth, out){
    if (depth > 6 || !n || typeof n !== 'object') return out;
    Object.keys(n).forEach(function(k){
      const v = n[k];
      if (typeof v === 'string' && /^(text|content|value)$/i.test(k) && /[A-Za-z]/.test(v)) out.push(v);
      else if (v && typeof v === 'object' && !boxOf(v)) texts(v, depth + 1, out);
    });
    return out;
  };
  const boxOf = function(n){
    if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
    const top = num(n.top, n.y), left = num(n.left, n.x), width = num(n.width, n.w);
    if (top === null || left === null || !width) return null;
    return { top: top, left: left, width: width, height: num(n.height, n.h) || 0 };
  };
  (function walk(n, page, dx, dy, inBox){
    if (Array.isArray(n)){
      const p = !inBox && n.some(boxOf) ? pages++ : page;          // a group's children stay on its page
      n.forEach(function(k){ walk(k, p, dx, dy, inBox); });
      return;
    }
    if (!n || typeof n !== 'object') return;
    const b = boxOf(n);
    if (b){
      const said = texts(n, 0, []).join('\n').split(/\n+/).map(function(t){ return t.replace(/\s+/g, ' ').trim(); }).filter(String);
      if (said.length){
        const lh = (b.height || said.length * 14) / said.length;
        said.forEach(function(t, i){
          lines.push({ page: page, x: dx + b.left, y: dy + b.top + lh * (i + 0.8), x1: dx + b.left + b.width,
                       size: Math.max(6, lh * 0.8), bold: false, text: t });
        });
        return;
      }
      dx += b.left; dy += b.top;                                   // a group: its children sit inside it
    }
    Object.keys(n).forEach(function(k){ if (n[k] && typeof n[k] === 'object') walk(n[k], page, dx, dy, inBox || !!b); });
  })(objs, -1, 0, 0, false);
  /* The first page with text on it is page 0, as readWeekPdf_ expects. */
  const first = Math.min.apply(null, lines.map(function(l){ return l.page; }).concat([Infinity]));
  lines.forEach(function(l){ l.page -= first; });
  return lines.sort(function(a, b){ return a.page - b.page || a.y - b.y || a.x - b.x; });
}

/* The week's heading ("12th October – 18th October") dates it; then a column a day of breakfast,
   lunch (brunch on Saturday, the Sunday roast on Sunday) and supper. */
function parseLucy_(lines){
  if (!lines || !lines.length) return [];
  let monday = '';
  lines.some(function(l){
    const m = l.page === 0 && l.text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\s*[–—-]\s*\d{1,2}/);
    if (!m || MONTHS.map(function(x){ return x.slice(0, 3); }).indexOf(m[2].slice(0, 3).toLowerCase()) < 0) return false;
    monday = mondayOf_(dayMonth_(Number(m[1]), m[2]));
    return true;
  });
  if (!monday) return [];
  return gridDays_(readWeekPdf_(lines, /^(breakfast|brunch|lunch|sunday roast|supper|dinner|soups?|mains?|sides?|desserts?)\b/i),
    monday, { prep: lucyMarks_ });
}

/* Lucy's own key is the other way round from most: V is vegan, Vn vegetarian. Both are written
   out before the usual reading, which would take (V) for vegetarian. GF stays GF. */
function lucyMarks_(t){
  const word = function(c){ c = c.toLowerCase(); return c === 'vn' ? '(vegetarian)' : c === 'v' ? '(vegan)' : '(GF)'; };
  return String(t)
    .replace(/\(\s*(vn|v|gf)\s*(?:[,\/&]\s*(vn|v|gf)\s*)?(?:[,\/&]\s*(vn|v|gf)\s*)?\)/gi, function(_, a, b, c){
      return [a, b, c].filter(Boolean).map(word).join(' ');
    })
    .replace(/\s+((?:vn|v|gf)(?:\s*[,\/&]?\s*(?:vn|v|gf))*)\s*$/i, function(_, k){
      return ' ' + k.split(/[\s,\/&]+/).filter(String).map(word).join(' ');
    });
}

/* Run once from the editor: logs what Canva hands Apps Script, so fetchLucy_ can be fitted to it. */
function probeLucy(){
  [LUCY_CANVA + '?embed', LUCY_CANVA].forEach(function(url){
    let res;
    try {
      res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': CHROME_UA_, Accept: 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' } });
    } catch (e) { Logger.log(url + ': ' + e); return; }
    const body = res.getContentText('UTF-8');
    Logger.log('==== ' + url + ' -> ' + res.getResponseCode() + ', ' + body.length + ' characters, title "' +
      text_((body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]) + '"' + (CANVA_CHECK_.test(body) ? ', A BOT CHECK' : ''));
    Logger.log('og:image ' + ((body.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1] || 'none'));
    const objs = canvaJson_(body);
    Logger.log(objs.length + ' JSON objects, sizes ' + objs.map(function(o){ return JSON.stringify(o).length; }).join(', '));
    let n = 0;
    (function walk(v, path){
      if (n >= 250) return;
      if (typeof v === 'string'){
        if (/[A-Za-z]{3}/.test(v) && v.length < 300 && !/^https?:|^[\w-]{20,}$/.test(v)){ Logger.log(path + ' = ' + JSON.stringify(v)); n++; }
        return;
      }
      if (v && typeof v === 'object') Object.keys(v).forEach(function(k){ walk(v[k], path + '.' + k); });
    })(objs, '$');
    const lines = canvaLines_(objs);
    Logger.log(lines.length + ' text lines with positions');
    lines.slice(0, 120).forEach(function(l){ Logger.log([l.page, Math.round(l.x), Math.round(l.y), Math.round(l.x1), l.size.toFixed(1), l.text].join(' ')); });
    if (lines.length) Logger.log(JSON.stringify(parseLucy_(lines)).slice(0, 4000));
    /* Scripts that load the design separately, if the page carries no text itself */
    (body.match(/https:\/\/[^"'\s]+(?:document|design|content)[^"'\s]*/gi) || []).slice(0, 20).forEach(function(u){ Logger.log('url ' + u); });
  });
}

/* ---------- a week laid out as a table in a PDF ---------- */

const DAY_HEAD_ = /^(mon|tues|wednes|thurs|fri|satur|sun)day\b[\s,.:–-]*(\d{1,2}(?:st|nd|rd|th)?(?:\s+[A-Za-z]{3,})?|\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?)?$/i;
const MEAL_WORD_ = /\b(breakfast|lunch|brunch|dinner|supper)\b/i;

/* The days of a week and each day's cells: [ { dow, cells:[ { label, lines:[...] } ] } ].
   label is the row or column heading the cell sits under ('' where there are none). */
function readWeekPdf_(lines, labelRe){
  lines = lines.filter(function(l){ return l.page === 0; });
  const heads = {};
  lines.forEach(function(l){
    const m = l.text.match(DAY_HEAD_);
    if (!m) return;
    const dow = WEEKDAYS.indexOf((m[1] + 'day').toLowerCase());
    if (!heads[dow] || l.size > heads[dow].size) heads[dow] = l;
  });
  const days = Object.keys(heads).map(function(k){
    const h = heads[k];
    return { dow: Number(k), head: h, cx: (h.x + h.x1) / 2, cy: h.y, lines: [] };
  });
  if (days.length < 2) return [];
  const spread = function(f){ const v = days.map(f); return Math.max.apply(null, v) - Math.min.apply(null, v); };
  const across = spread(function(d){ return d.cx; }) > spread(function(d){ return d.cy; });
  const headLines = days.map(function(d){ return d.head; });
  const body = lines.filter(function(l){ return headLines.indexOf(l) < 0; });
  return across ? weekAcross_(days, body, labelRe) : weekDown_(days, body, labelRe);
}

/* "LUNCH" (or "Dinner 17:30–19:00") on its own beside or above the rows: it heads a section of
   the table rather than naming a row. */
const MEAL_LABEL_ = /^(breakfast|lunch|brunch|dinner|supper)(\s+(service|menu))?\s*:?\s*\(?\s*(\d{1,2}[:.]\d{2}\s*[–-]\s*\d{1,2}[:.]\d{2})?\s*\)?$/i;

/* A line's top and bottom down the page (where it starts and ends, for text on its side). */
function lineTop_(l){ return l.y1 !== undefined ? Math.min(l.y, l.y1) : l.y - l.size * 0.8; }
function lineBottom_(l){ return l.y1 !== undefined ? Math.max(l.y, l.y1) : l.y + l.size * 0.2; }

/* Days as columns, labels (if any) down the left. */
function weekAcross_(days, lines, labelRe){
  days.sort(function(a, b){ return a.cx - b.cx; });
  const gap = (days[days.length - 1].cx - days[0].cx) / (days.length - 1);
  const left = days[0].cx - gap / 2, right = days[days.length - 1].cx + gap / 2;
  const top = Math.max.apply(null, days.map(function(d){ return d.cy; }));
  const below = lines.filter(function(l){ return l.y > top + 2; });
  const margin = below.filter(function(l){ return l.x1 < left + gap * 0.15; });
  /* "LUNCH" or "DINNER" printed across the whole table heads the rows beneath it, like a label. */
  const banners = below.filter(function(l){
    return margin.indexOf(l) < 0 && l.x1 - l.x > gap * 1.6 && /^(no\s+)?(breakfast|lunch|brunch|dinner|supper)\b/i.test(l.text);
  });
  const keep = function(g){ return !labelRe || labelRe.test(g.text); };
  /* Rows named down the side ("Main dish", "Alternative dish", "Sides") inside LUNCH and DINNER
     sections, the meal in a column further left or printed across the table: the rows are the
     labels, and each takes the meal of its section. Without both, the labels are the rows as before. */
  const meals = margin.filter(function(l){ return MEAL_LABEL_.test(l.text); });
  const rows = mergeLabels_(margin.filter(function(l){ return meals.indexOf(l) < 0; }), 'y').filter(keep)
    .sort(function(a, b){ return a.y - b.y; });
  const sections = meals.concat(banners.filter(function(l){ return !/^no\s/i.test(l.text); }));
  const sectioned = rows.length > 0 && sections.length > 0;
  const labels = sectioned ? rows : mergeLabels_(margin, 'y').filter(keep)
    .concat(banners.map(function(l){ return { text: l.text, y: l.y, x: (l.x + l.x1) / 2, parts: [l], last: l }; }))
    .sort(function(a, b){ return a.y - b.y; });
  const content = below.filter(function(l){ return margin.indexOf(l) < 0 && banners.indexOf(l) < 0 && l.x1 > left; });
  const cut = bands_(labels.map(function(g){ return g.y; }),
    content.map(function(l){ return [l.y - l.size * 0.95, l.y + l.size * 0.3]; }));
  const placed = [];
  content.forEach(function(l){
    const cx = (l.x + l.x1) / 2;
    if (cx < left || cx > right || l.x1 - l.x > gap * 1.6) return;   // a banner across several days
    let i = 0;
    while (i < days.length - 1 && cx > (days[i].cx + days[i + 1].cx) / 2) i++;
    if (labels.length){ l.row = bandOf_(cut, l.y); l.label = labels[l.row].text; }
    else { l.label = ''; delete l.row; }
    days[i].lines.push(l);
    placed.push(l);
  });
  if (sectioned){
    /* Each row's extent down the page: its label and everything in its band. */
    const span = labels.map(function(g){
      return { lo: Math.min.apply(null, g.parts.map(lineTop_)), hi: Math.max.apply(null, g.parts.map(lineBottom_)) };
    });
    placed.forEach(function(l){
      const s = span[l.row];
      s.lo = Math.min(s.lo, lineTop_(l)); s.hi = Math.max(s.hi, lineBottom_(l));
    });
    const heads = sections.map(function(l){ return { lo: lineTop_(l), hi: lineBottom_(l), size: l.size, meal: l.text.match(MEAL_WORD_)[1] }; })
      .sort(function(a, b){ return a.lo - b.lo; });
    const which = sectionOf_(span, heads, Math.max(heads[0].size, labels[0].last.size) * 0.8);
    placed.forEach(function(l){
      const g = labels[l.row];
      if (!MEAL_WORD_.test(g.text)) l.label = heads[which[l.row]].meal + ' ' + g.text;
    });
  }
  return days.map(cells_);
}

/* Which section each row (or column) belongs to. rows and heads: [{ lo, hi }] in order along the
   page. A first heading level with or ahead of the first row heads the rows from there on (a label
   at the top of its section, or a banner); otherwise each heading sits in the middle of its rows
   (centred on a merged cell), and its rows are the run that centres on it. */
function sectionOf_(rows, heads, tol){
  const out = [];
  if (heads[0].lo <= rows[0].lo + tol){
    rows.forEach(function(r, i){
      let k = 0;
      while (k + 1 < heads.length && heads[k + 1].lo <= r.lo + tol) k++;
      out[i] = k;
    });
    return out;
  }
  let s = 0;
  heads.forEach(function(h, k){
    if (s >= rows.length) return;
    let e = rows.length - 1;
    if (k < heads.length - 1){
      const c = (h.lo + h.hi) / 2;
      let best = Infinity;
      e = s;
      for (let j = s; j <= rows.length - (heads.length - k); j++){
        const d = Math.abs((rows[s].lo + rows[j].hi) / 2 - c);
        if (d < best){ best = d; e = j; }
      }
    }
    for (let j = s; j <= e; j++) out[j] = k;
    s = e + 1;
  });
  return out;
}

/* Days as rows, labels (if any) across the top. */
function weekDown_(days, lines, labelRe){
  days.sort(function(a, b){ return a.cy - b.cy; });
  const edge = Math.max.apply(null, days.map(function(d){ return d.head.x1; }));
  const top = days[0].cy - days[0].head.size;
  const head = lines.filter(function(l){ return l.y < top && l.x > edge - 2; });
  const keep = function(g){ return labelRe && labelRe.test(g.text); };
  /* LUNCH and DINNER over groups of columns ("Main dish", "Alternative dish"...), as in weekAcross_. */
  const meals = head.filter(function(l){ return MEAL_LABEL_.test(l.text); });
  const cols = mergeLabels_(head.filter(function(l){ return meals.indexOf(l) < 0; }), 'x').filter(keep);
  const sectioned = cols.length > 0 && meals.length > 0;
  const labels = sectioned ? cols : mergeLabels_(head, 'x').filter(keep);
  const content = lines.filter(function(l){ return l.y >= top && l.x > edge - 2; });
  const cut = bands_(days.map(function(d){ return d.cy; }),
    content.map(function(l){ return [l.y - l.size * 0.95, l.y + l.size * 0.3]; }));
  content.forEach(function(l){
    const day = days[bandOf_(cut, l.y)];
    if (labels.length){
      const cx = (l.x + l.x1) / 2;
      let best = 0;
      labels.forEach(function(g, i){ if (Math.abs(g.x - cx) < Math.abs(labels[best].x - cx)) best = i; });
      l.row = best; l.label = labels[best].text;
    } else { l.label = ''; delete l.row; }
    day.lines.push(l);
  });
  if (sectioned){
    const order = labels.map(function(g, i){ return i; }).sort(function(a, b){ return labels[a].x - labels[b].x; });
    const span = order.map(function(i){
      const g = labels[i];
      return { i: i, lo: Math.min.apply(null, g.parts.map(function(p){ return p.x; })), hi: Math.max.apply(null, g.parts.map(function(p){ return p.x1; })) };
    });
    const at = {};
    span.forEach(function(s, j){ at[s.i] = j; });
    content.forEach(function(l){
      if (l.row === undefined) return;
      const s = span[at[l.row]];
      s.lo = Math.min(s.lo, l.x); s.hi = Math.max(s.hi, l.x1);
    });
    const heads = meals.map(function(l){ return { lo: l.x, hi: l.x1, size: l.size, meal: l.text.match(MEAL_WORD_)[1] }; })
      .sort(function(a, b){ return a.lo - b.lo; });
    const which = sectionOf_(span, heads, Math.max(heads[0].size, labels[order[0]].last.size) * 0.8);
    content.forEach(function(l){
      if (l.row === undefined) return;
      const g = labels[l.row];
      if (!MEAL_WORD_.test(g.text)) l.label = heads[which[at[l.row]]].meal + ' ' + g.text;
    });
  }
  return days.map(cells_);
}

/* A label printed over two lines ("Allergen" / "friendly") is one label. */
function mergeLabels_(ls, axis){
  const out = [];
  ls.slice().sort(function(a, b){ return a.y - b.y || a.x - b.x; }).forEach(function(l){
    const g = out.length ? out[out.length - 1] : null;
    const near = g && (axis === 'y' ? l.y - g.last.y < l.size * 1.5 && Math.abs(l.x - g.last.x) < l.size * 3
                                    : Math.abs(l.y - g.last.y) < l.size * 1.5 && Math.abs((l.x + l.x1) / 2 - g.x) < l.size * 4);
    if (near && !(MEAL_WORD_.test(l.text) && !MEAL_WORD_.test(g.text))){
      g.text += ' ' + l.text; g.parts.push(l); g.last = l;
    } else out.push({ text: l.text, y: l.y, x: (l.x + l.x1) / 2, parts: [l], last: l });
  });
  return out;
}

/* Where one band ends and the next starts: the widest empty stretch between two anchors,
   since a label is usually centred on its row rather than at the top of it. */
function bands_(anchors, spans){
  spans = spans.slice().sort(function(a, b){ return a[0] - b[0]; });
  const cut = [];
  for (let i = 1; i < anchors.length; i++){
    const lo = anchors[i - 1], hi = anchors[i];
    let end = lo, best = (lo + hi) / 2, widest = -1;
    spans.forEach(function(s){
      if (s[1] < lo || s[0] > hi) return;
      if (s[0] > end && s[0] - end > widest){ widest = s[0] - end; best = (end + s[0]) / 2; }
      end = Math.max(end, s[1]);
    });
    if (end < hi && hi - end > widest) best = (end + hi) / 2;
    cut.push(best);
  }
  return cut;
}
function bandOf_(cut, y){ let i = 0; while (i < cut.length && y > cut[i]) i++; return i; }

/* A day's lines grouped into cells by row (or by label where there are no rows), in reading order.
   Two rows with the same label (Main dish at lunch and at dinner) are two cells. */
function cells_(day){
  const cells = [], index = {};
  day.lines.sort(function(a, b){ return a.y - b.y || a.x - b.x; }).forEach(function(l){
    const key = (l.row === undefined ? '' : l.row) + '|' + l.label;
    if (!index[key]){ index[key] = { label: l.label, lines: [] }; cells.push(index[key]); }
    index[key].lines.push(l);
  });
  return { dow: day.dow, cells: cells };
}

/* Cells into the usual day shape. opts.meal: the meal a PDF holds when it holds one;
   opts.shared: courses that go with every meal of the day (Pembroke's pudding and sides);
   opts.desc: labels that describe a dish rather than name a course ("Counter 1");
   opts.plain: labels that say nothing about the course ("Alternative"), so the dish name decides;
   opts.prep: a college's own marks rewritten into the usual ones before they are read;
   opts.label: a college's row labels rewritten into plain ones ("ALLERGEN FRIENDLY DISH" -> "Allergen friendly");
   opts.single: rows that hold one dish, so all their lines are that dish (not at brunch, which is a list);
   opts.twice: no LUNCH or DINNER anywhere, but the same rows twice: the second set is dinner;
   opts.dish: a last look at each dish once its marks are read. */
const MEAL_HEAD_ = /^(no\s+)?(breakfast|lunch|brunch|dinner|supper|sunday roast)\b\s*:?\s*(\d{1,2}[:.]\d{2}\s*[–-]\s*\d{1,2}[:.]\d{2})?\s*$/i;
const COURSE_HEAD_ = /^(soups?|starters?|mains?|sides?|desserts?|puddings?|salads?)\s*:?$/i;

/* A wrapped line put back: "UP-SIDE-" and "DOWN" is "UP-SIDE-DOWN". */
function joinLine_(a, b){ return /[A-Za-z]-$/.test(a) ? a + b : a + ' ' + b; }

function gridDays_(week, monday, opts){
  return (week || []).map(function(w){
    const day = { date: addDays_(monday, (w.dow + 6) % 7) };
    const shared = [], seen = {};
    let meal = opts.meal || null;
    w.cells.forEach(function(cell){
      let course = cell.label;
      const mw = (course.match(MEAL_WORD_) || [])[1];
      if (mw){ meal = mealOf_(mw, day); course = course.replace(MEAL_WORD_, ''); }
      course = course.replace(/^[\s:–-]+|[\s:–-]+$/g, '');
      if (opts.label) course = opts.label(course);
      if (opts.twice && !mw && course && !(opts.shared && opts.shared.test(course))){
        if (seen[course]) meal = 'dinner';
        else if (!meal) meal = 'lunch';
        seen[course] = true;
      }
      let cur = meal, sub = course;
      const items = [];
      cell.lines.forEach(function(l){
        const t = l.text;
        /* A heading inside the cell ("LUNCH", "Brunch 11:30-13:30", "NO DINNER") starts that meal. */
        const head = t.match(MEAL_HEAD_);
        if (head){
          cur = mealOf_(head[2], day); sub = course;
          if (head[3]) (day.hours = day.hours || {})[cur] = head[3].replace(/\s*[–-]\s*/, '–').replace(/\./g, ':');
          if (head[1]) note_(day, cur, 'No ' + cur + ' today');
          return;
        }
        /* A supper with a name ("Breast Cancer Awareness Supper") is that day's dinner, its name a note. */
        if (/^.{3,50}\bsupper$/i.test(t)){ cur = 'dinner'; sub = course; note_(day, 'dinner', t); return; }
        /* A formal ("Welcome Formal", "Matriculation Dinner") is not the servery's dinner: note it, skip its menu. */
        if (t.length <= 40 && /\bformal\b|^matriculation dinner$|\bguest night\b/i.test(t)){ cur = 'formal'; note_(day, 'dinner', t); return; }
        /* "Soup", "Mains", "Sides" inside the cell start that course. */
        const sec = t.match(COURSE_HEAD_);
        if (sec){ sub = opts.label ? opts.label(sec[1]) : sec[1]; return; }
        const prev = items.length ? items[items.length - 1] : null;
        const same = prev && prev.meal === cur && prev.course === sub;
        const one = same && opts.single && opts.single.test(sub) && cur !== 'breakfast' &&
          !(cur === 'lunch' && day.labels && day.labels.lunch === 'Brunch');
        const wrapped = one || same && (/^[a-z(&]/.test(t) || /[,&–-]$|\b(with|and|or|in|on|of)$/i.test(prev.text));
        if (wrapped) prev.text = joinLine_(prev.text, t);
        else items.push({ text: t, meal: cur, course: sub });
      });
      items.forEach(function(it){
        if (it.meal === 'breakfast' || it.meal === 'formal') return;
        if (/^(closed|no (service|lunch|dinner|brunch|supper)\b.*|not open.*)$/i.test(it.text)){ note_(day, it.meal || 'lunch', it.text); return; }
        const x = tagged_(opts.prep ? opts.prep(it.text) : it.text);
        if (!x.name) return;
        if (opts.dish) opts.dish(x);
        const course = it.course;
        let name = course;
        if (opts.desc && opts.desc.test(course)){ x.desc = course; name = ''; }
        else if (opts.plain && opts.plain.test(course)) name = '';
        if (!it.meal || (opts.shared && opts.shared.test(course))){ shared.push({ name: name, dish: x, meal: it.meal }); return; }
        const list = day[it.meal] = day[it.meal] || [];
        let c = list.filter(function(k){ return k.name === name; })[0];
        if (!c){ c = { name: name, dishes: [] }; list.push(c); }
        c.dishes.push(x);
      });
    });
    /* Pudding and sides: under every meal that has dishes, or lunch if none does; but when lunch
       and dinner each have a row of their own, each row stays with its meal. */
    const meals = ['lunch', 'dinner'].filter(function(m){ return has_(day[m]); });
    const own = {};
    shared.forEach(function(s){ if (s.meal) add_(own[s.name] = own[s.name] || [], s.meal); });
    shared.forEach(function(s){
      (s.meal && own[s.name].length > 1 ? [s.meal] : meals.length ? meals : ['lunch']).forEach(function(m){
        const list = day[m] = day[m] || [];
        let c = list.filter(function(k){ return k.name === s.name; })[0];
        if (!c){ c = { name: s.name, dishes: [] }; list.push(c); }
        c.dishes.push(JSON.parse(JSON.stringify(s.dish)));
      });
    });
    return day;
  });
}

function mealOf_(word, day){
  const w = word.toLowerCase();
  if (w === 'brunch') day.labels = { lunch: 'Brunch' };
  if (w === 'sunday roast') day.labels = { lunch: 'Sunday roast' };
  return w === 'breakfast' ? 'breakfast' : w === 'dinner' || w === 'supper' ? 'dinner' : 'lunch';
}
function note_(day, meal, text){
  day.notes = day.notes || {};
  add_(day.notes[meal] = day.notes[meal] || [], text);
}

/* Every PDF linked from a page: { url, text }, with relative links made whole. */
function pdfLinks_(html, base){
  const out = [];
  String(html || '').replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function(_, attrs, inner){
    const href = (attrs.match(/href\s*=\s*"([^"]+)"/i) || [])[1];
    if (!href || !/\.pdf(\?|#|$)/i.test(href)) return;
    let url = href.replace(/&amp;/g, '&');
    if (url.charAt(0) === '/') url = base.match(/^https?:\/\/[^\/]+/)[0] + url;
    else if (!/^https?:/i.test(url)) url = base.replace(/[^\/]*$/, '') + url;
    out.push({ url: url, text: text_(inner).replace(/[​ ]/g, ' ').trim() });
  });
  return out;
}

/* A PDF's lines, read once and kept for six hours (St Catharine's alone links twelve). */
function pdfLinesOf_(url){
  const key = 'pdf_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)).replace(/=+$/, '');
  const hit = cacheGet_(key);
  if (hit) return JSON.parse(hit);
  const bytes = getBytes_(url);
  if (!bytes) return null;
  let lines;
  try { lines = pdfLines_(pdfRuns_(bytes)); } catch (e) { Logger.log(url + ': ' + e); return null; }
  cachePut_(key, JSON.stringify(lines));
  return lines;
}

/* ---------- checking it ---------- */

/* Run this from the editor (it isn't private, so it's in the Run menu). For each new college it
   logs what was read, and for the PDF ones every line with its position too: paste the log back
   if a PDF reads wrongly and the parser can be fitted to it. */
function debugNewColleges(){
  const show = function(name, days){
    Logger.log('==== ' + name + ': ' + days.length + ' days');
    days.forEach(function(d){
      ['lunch', 'dinner'].forEach(function(m){
        (d[m] || []).forEach(function(c){
          Logger.log(d.date + ' ' + m + ' / ' + (c.name || '-') + ': ' + c.dishes.map(function(x){
            return x.name + (x.diet && x.diet.length ? ' [' + x.diet.join(',') + ']' : '') + (x.desc ? ' (' + x.desc + ')' : '');
          }).join(' | '));
        });
      });
      if (d.notes) Logger.log(d.date + ' notes ' + JSON.stringify(d.notes));
    });
  };
  const dump = function(url){
    const bytes = getBytes_(url);
    if (!bytes){ Logger.log('could not download ' + url); return; }
    Logger.log('---- ' + url);
    pdfLines_(pdfRuns_(bytes)).forEach(function(l){
      Logger.log([l.page, Math.round(l.x), Math.round(l.y), Math.round(l.x1), l.size.toFixed(1), l.bold ? 'B' : '', l.text].join(' '));
    });
  };
  [['Homerton', fetchHomerton_], ['Peterhouse', fetchPeterhouse_], ['Fitzwilliam', fetchFitzwilliam_],
   ['Pembroke', fetchPembroke_], ['St Catharine’s', fetchStCatharines_]].forEach(function(p){
    try { show(p[0], p[1]()); } catch (e) { Logger.log(p[0] + ' failed: ' + e); }
  });
  fitzWeeks_(get_(FITZ_PAGE)).forEach(function(w){ dump(w.url); });
  pembrokeWeeks_(get_(PEMBROKE_PAGE)).forEach(function(w){ dump(w.url); });
  catzPdfs_(get_(CATZ_PAGE)).slice(0, 3).forEach(function(p){ dump(p.url); });
}
