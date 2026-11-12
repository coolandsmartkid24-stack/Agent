/* AGENT ROCKY – Right Choice Dress Assistant. No backend, no API keys, no LLM.
   Reads the store catalogue in the browser (Liquid: /products.json · Hydrogen: Storefront API public token). */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.Rocky) return;
  var W = window, D = W.document;
  var CAT = [], CFG = {}, AD = null, COLORSET = {}, S = {};

  /* ---------- helpers ---------- */
  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function E(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function money(n, cur) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || CFG.currency || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch (e) { return (cur || '') + ' ' + Math.round(n); } }
  function emit(n, d) { try { W.dispatchEvent(new CustomEvent('rocky:' + n, { detail: d })); } catch (e) {} }
  function has(t, a) { return a.length <= 3 ? new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t) : t.indexOf(a) > -1; }
  function strip(h) { return String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
  function img(u) { return u ? u + (u.indexOf('?') > -1 ? '&' : '?') + 'width=480' : ''; }

  /* ---------- language knowledge ---------- */
  var BASE = 'black white blue navy red maroon green olive grey beige brown pink yellow orange purple cream khaki tan gold silver mustard teal mint burgundy charcoal ivory lavender peach sky'.split(' ');
  var FAM = { blue: ['navy', 'sky', 'indigo', 'denim', 'royal'], red: ['maroon', 'burgundy', 'wine', 'crimson'], green: ['olive', 'mint', 'sage', 'emerald'], grey: ['gray', 'charcoal', 'ash'], beige: ['cream', 'khaki', 'tan', 'sand', 'ivory'], brown: ['tan', 'chocolate', 'coffee'], pink: ['rose', 'blush'], purple: ['violet', 'lavender', 'plum'] };
  var GROUPS = [['tee', 'tshirt', 't-shirt', 't shirt'], ['pant', 'trouser', 'chino', 'jogger'], ['jean', 'denim'], ['kurta', 'kurti'], ['shoe', 'sneaker', 'trainer', 'footwear', 'loafer'], ['jacket', 'coat', 'bomber', 'blazer'], ['dress', 'gown', 'frock'], ['sweater', 'jumper', 'pullover', 'sweatshirt', 'hoodie'], ['bag', 'backpack', 'tote', 'handbag'], ['short', 'shorts'], ['sandal', 'slipper', 'chappal', 'flip']];
  var SYN = {}; GROUPS.forEach(function (g) { g.forEach(function (w) { SYN[w] = (SYN[w] || []).concat(g.filter(function (x) { return SYN[w] ? SYN[w].indexOf(x) < 0 : true; })); }); });
  var OCC = { wedding: 'wedding formal festive embroider silk suit sherwani kurta gown lehenga dress', shaadi: 'wedding formal festive embroider silk suit sherwani kurta gown', party: 'party evening formal festive dress shirt blazer', eid: 'eid festive kurta shalwar embroider formal', office: 'office formal shirt trouser blazer work', work: 'office formal shirt trouser blazer work', interview: 'formal shirt trouser blazer office', casual: 'casual tee jeans hoodie polo', summer: 'summer linen cotton light short breathable', winter: 'winter wool fleece hoodie jacket sweater coat thermal', gym: 'sport active gym track training', date: 'date evening shirt dress blazer', travel: 'travel comfort casual jacket hoodie', gift: 'gift' };
  var STOP = {}; ('show me find i want need looking look for a an the some something in with to wear please pls give get of and my any have do you is are can what which best good nice new latest colour color size budget price rs pkr inr usd one ones under below above over than less more at least max min maximum minimum about around within upto up between from that this it on im ill like would could should just also but or kind type stuff things item items piece pieces help us hmm ok okay yes no then now so very really wanna gotta buy purchase shop shopping store available stock options option suggest recommend men man mens women woman womens ladies lady female male girl girls boy boys kid kids gents guy guys outfit outfits clothes clothing apparel wearing wear s there their want show').split(' ').forEach(function (w) { STOP[w] = 1; });
  function stem(w) { if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'; if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2); if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) return w.slice(0, -1); return w; }

  /* ---------- intent parser: free text -> structured filters ---------- */
  function parse(raw) {
    var t = ' ' + lc(raw).replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d+(?:\.\d+)?)\s*k\b/g, function (_, n) { return Math.round(n * 1000); }) + ' ';
    var o = { max: null, min: null, colors: [], sizes: [], gender: null, terms: [], words: [], sort: null, occ: [], cheaper: false }, m;
    var cur = '(?:(?:\\b(?:rs\\.?|pkr|inr|usd|rupees?))|[$₹])?\\s*';
    if ((m = t.match(new RegExp('between\\s*' + cur + '(\\d+)\\s*(?:and|to|-)\\s*' + cur + '(\\d+)')))) { o.min = +m[1]; o.max = +m[2]; t = t.replace(m[0], ' '); }
    else {
      if ((m = t.match(new RegExp('(?:under|below|less than|within|upto|up to|max(?:imum)?|not more than|cheaper than|budget(?: is| of)?|upper limit)\\s*' + cur + '(\\d+)')))) { o.max = +m[1]; t = t.replace(m[0], ' '); }
      if ((m = t.match(new RegExp('(?:above|over|more than|min(?:imum)?|at least|starting (?:from|at)|from)\\s*' + cur + '(\\d+)')))) { o.min = +m[1]; t = t.replace(m[0], ' '); }
      if ((m = t.match(new RegExp('(?:around|about|approx(?:imately)?|near|roughly)\\s*' + cur + '(\\d+)')))) { o.min = Math.round(m[1] * 0.75); o.max = Math.round(m[1] * 1.25); t = t.replace(m[0], ' '); }
      if (o.max == null && o.min == null && (m = t.match(/(?:\b(?:rs\.?|pkr|inr|usd)|[$₹])\s*(\d+)/) || t.match(/(\d{3,6})\s*(?:rs|pkr|inr|usd|rupees?|dollars?)/))) { o.max = +m[1]; t = t.replace(m[0], ' '); }
    }
    if (/\bcheaper|less expensive|lower (?:price|budget)|budget[- ]friendly|more affordable\b/.test(t)) o.cheaper = true;
    t = t.replace(/\b(?:size|sz)\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|\d{2})\b/g, function (_, s) { o.sizes.push(s.toUpperCase()); return ' '; })
      .replace(/\b(xxs|xs|xl|xxl|xxxl|2xl|3xl)\b/g, function (_, s) { o.sizes.push(s.toUpperCase()); return ' '; })
      .replace(/\b(s|m|l)\s+size\b/g, function (_, s) { o.sizes.push(s.toUpperCase()); return ' '; })
      .replace(/\b(small|medium|large)\b/g, function (_, s) { o.sizes.push(s[0].toUpperCase()); return ' '; });
    if (/\b(women|woman|womens|women's|ladies|lady|female|girl|girls)\b/.test(t)) o.gender = 'women';
    else if (/\b(men|man|mens|men's|male|gents|guy|guys|boy|boys)\b/.test(t)) o.gender = 'men';
    if (/\b(kid|kids|child|children|toddler)\b/.test(t)) o.gender = 'kids';
    t.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean).forEach(function (w) {
      if (w === 'gray') w = 'grey';
      if (BASE.indexOf(w) > -1 || COLORSET[w]) { if (o.colors.indexOf(w) < 0) o.colors.push(w); return; }
      if (/^(cheapest|cheap|lowest|affordable|cheaper)$/.test(w)) { o.sort = 'asc'; return; }
      if (/^(expensive|premium|luxury|highest|priciest)$/.test(w)) { o.sort = 'desc'; return; }
      if (OCC[w]) { o.occ.push(w); return; }
      if (/^\d{3,6}$/.test(w)) { if (o.max == null && o.min == null) o.max = +w; return; }
      if (STOP[w] || (w.length < 2 && !/\d/.test(w)) || /^\d+$/.test(w)) return;
      var s = stem(w); o.words.push(s); o.terms.push([s].concat(SYN[s] || []));
    });
    if (o.occ.length) { var a = []; o.occ.forEach(function (k) { a = a.concat(OCC[k].split(' ')); }); o.terms.push(a); }
    o.sizes = o.sizes.filter(function (v, i, r) { return r.indexOf(v) === i; });
    return o;
  }
  function empty(I) { return !I.terms.length && !I.colors.length && !I.sizes.length && I.max == null && I.min == null && !I.gender; }

  /* ---------- matching & ranking ---------- */
  function match(p, I, F) {
    if (F.price) { if (I.max != null && p.price > I.max) return null; if (I.min != null && p.price < I.min) return null; }
    if (F.color && I.colors.length && !I.colors.some(function (c) { return [c].concat(FAM[c] || []).some(function (a) { return has(p.f.color, a); }); })) return null;
    if (F.size && I.sizes.length && !I.sizes.some(function (s) { return p.variants.some(function (v) { return v.sz && lc(v.sz) === lc(s) && v.avail && (!F.color || !I.colors.length || I.colors.some(function (c) { return [c].concat(FAM[c] || []).some(function (a) { return has(lc(v.cl), a); }); })); }); })) return null;
    if (F.gender && I.gender && p.g && p.g !== I.gender) return null;
    var s = 0, h = 0;
    I.terms.forEach(function (alts) { var b = 0; alts.forEach(function (a) { var v = (has(p.f.title, a) || has(p.f.type, a)) ? 4 : has(p.f.tags, a) ? 3 : has(p.f.desc, a) ? 1 : 0; if (v > b) b = v; }); if (b) h++; s += b; });
    if (I.terms.length && (F.terms ? h < I.terms.length : h < 1)) return null;
    return s + (p.avail ? 2 : 0);
  }
  function search(I) {
    var F = { price: 1, color: 1, size: 1, gender: 1, terms: 1 }, dropped = [], order = ['size', 'color', 'terms', 'price', 'gender'], spec = { size: I.sizes.length, color: I.colors.length, terms: I.terms.length > 1, price: I.max != null || I.min != null, gender: !!I.gender };
    for (var k = 0; k <= order.length; k++) {
      var r = [];
      CAT.forEach(function (p) { var s = match(p, I, F); if (s != null) r.push({ p: p, s: s }); });
      if (r.length) {
        r.sort(function (a, b) {
          if (I.sort) return (I.sort === 'asc' ? 1 : -1) * (a.p.price - b.p.price);
          if (dropped.indexOf('price') > -1 && I.max != null) return Math.abs(a.p.price - I.max) - Math.abs(b.p.price - I.max);
          return b.s - a.s || a.p.price - b.p.price;
        });
        return { list: r.map(function (x) { return x.p; }), dropped: dropped };
      }
      if (k < order.length) { F[order[k]] = 0; if (spec[order[k]]) dropped.push(order[k]); }
    }
    return { list: [], dropped: [] };
  }
  function describe(I) {
    var d = [I.gender === 'women' ? "women's" : I.gender === 'men' ? "men's" : I.gender === 'kids' ? "kids'" : '', I.colors.join(' or '), I.words.concat(I.occ).join(' ')].filter(Boolean).join(' ') || 'pieces';
    return d + (I.max != null && I.min == null ? ' under ' + money(I.max) : I.min != null && I.max == null ? ' above ' + money(I.min) : I.min != null ? ' between ' + money(I.min) + ' and ' + money(I.max) : '');
  }
  function median(a) { a = a.map(function (p) { return p.price; }).sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

  /* ---------- data adapters ---------- */
  function finish(o) {
    o.f = { title: lc(o.title), type: lc(o.type), tags: lc(o.tags.join(' ') + ' ' + o.vendor), desc: lc(o.desc) };
    var cv = []; o.variants.forEach(function (v) { if (v.cl && cv.indexOf(lc(v.cl)) < 0) cv.push(lc(v.cl)); });
    cv.forEach(function (c) { c.split(/[\s\/-]+/).forEach(function (w) { if (w.length > 2) COLORSET[w] = 1; }); });
    o.colors = cv; o.f.color = cv.join(' ') + ' ' + o.f.title + ' ' + o.f.tags;
    var sz = []; o.variants.forEach(function (v) { if (v.sz && sz.indexOf(v.sz) < 0) sz.push(v.sz); }); o.sizes = sz;
    var g = o.f.tags + ' ' + o.f.type + ' ' + o.f.title; o.g = /\b(women|womens|women's|ladies|girls?)\b/.test(g) ? 'women' : /\b(men|mens|men's|boys?)\b/.test(g) ? 'men' : /\bkids?\b/.test(g) ? 'kids' : null;
    o.price = Math.min.apply(null, o.variants.map(function (v) { return v.price; }).concat([1e12])); if (o.price === 1e12) o.price = 0;
    o.avail = o.variants.some(function (v) { return v.avail; }); return o;
  }
  function optsOf(names, get) { var cl = '', sz = ''; names.forEach(function (n, i) { if (/colou?r/i.test(n)) cl = get(i); else if (/size/i.test(n)) sz = get(i); }); return { cl: cl, sz: sz }; }
  var ADAPT = {
    liquid: function (c) {
      var root = c.root || '/';
      function nl(x) {
        var names = (x.options || []).map(function (o) { return o.name; });
        return finish({ id: String(x.id), handle: x.handle, title: x.title, type: x.product_type || '', vendor: x.vendor || '', tags: Array.isArray(x.tags) ? x.tags : String(x.tags || '').split(/,\s*/), desc: strip(x.body_html), image: img(x.images && x.images[0] && x.images[0].src), url: root + 'products/' + x.handle,
          variants: (x.variants || []).map(function (v) { var o = optsOf(names, function (i) { return v['option' + (i + 1)]; }); return { id: String(v.id), price: parseFloat(v.price), avail: !!v.available, cl: o.cl, sz: o.sz, title: v.title }; }) });
      }
      function recJ(id, intent) { return fetch(root + 'recommendations/products.json?product_id=' + id + '&limit=6&intent=' + intent).then(function (r) { return r.ok ? r.json() : { products: [] }; }).then(function (j) { return (j.products || []).map(function (p) { return p.handle; }); }); }
      return {
        load: function () { var all = [], pg = 1; return (function nx() { return fetch(root + 'products.json?limit=250&page=' + pg).then(function (r) { if (!r.ok) throw new Error('catalog'); return r.json(); }).then(function (j) { var a = j.products || []; all = all.concat(a); if (a.length === 250 && ++pg <= 5) return nx(); return all.map(nl); }); })(); },
        recs: function (p) { return recJ(p.id, 'complementary').then(function (h) { return h.length ? h : recJ(p.id, 'related'); }).then(function (hs) { return hs.map(function (h) { return CAT.filter(function (x) { return x.handle === h; })[0]; }).filter(Boolean); }); },
        add: function (v) { return fetch(root + 'cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: [{ id: +v.id, quantity: 1 }] }) }).then(function (r) { if (!r.ok) throw new Error('cart'); return r.json(); }).then(function (j) { try { D.dispatchEvent(new CustomEvent('cart:refresh')); } catch (e) {} return j; }); },
        cartUrl: root + 'cart'
      };
    },
    storefront: function (c) {
      var ep = 'https://' + c.domain + '/api/' + (c.apiVersion || '2025-10') + '/graphql.json';
      function gq(q, v) { return fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': c.token }, body: JSON.stringify({ query: q, variables: v }) }).then(function (r) { return r.json(); }).then(function (j) { if (j.errors) throw new Error('gql'); return j.data; }); }
      var Q = 'query($n:Int!,$a:String){products(first:$n,after:$a){pageInfo{hasNextPage endCursor}nodes{id handle title productType vendor tags description featuredImage{url}options{name values}variants(first:40){nodes{id availableForSale price{amount}selectedOptions{name value}}}}}}';
      function nl(x) {
        return finish({ id: x.id, handle: x.handle, title: x.title, type: x.productType || '', vendor: x.vendor || '', tags: x.tags || [], desc: x.description || '', image: img(x.featuredImage && x.featuredImage.url), url: '/products/' + x.handle,
          variants: x.variants.nodes.map(function (v) { var m = {}; v.selectedOptions.forEach(function (o) { m[lc(o.name)] = o.value; }); var o = optsOf(Object.keys(m), function (i) { return m[Object.keys(m)[i]]; }); return { id: v.id.split('/').pop(), price: parseFloat(v.price.amount), avail: v.availableForSale, cl: o.cl, sz: o.sz }; }) });
      }
      function rec(id, intent) { return gq('query($id:ID!){productRecommendations(productId:$id,intent:' + intent + '){id}}', { id: id }).then(function (d) { return (d.productRecommendations || []).map(function (p) { return p.id; }); }).catch(function () { return []; }); }
      return {
        load: function () { var all = [], n = 0; return (function nx(a) { return gq(Q, { n: 100, a: a }).then(function (d) { all = all.concat(d.products.nodes); if (d.products.pageInfo.hasNextPage && ++n < 8) return nx(d.products.pageInfo.endCursor); return all.map(nl); }); })(null); },
        recs: function (p) { return rec(p.id, 'COMPLEMENTARY').then(function (h) { return h.length ? h : rec(p.id, 'RELATED'); }).then(function (ids) { return ids.map(function (i) { return CAT.filter(function (x) { return x.id === i; })[0]; }).filter(Boolean); }); },
        add: function (v) { W.location.assign('/cart/' + v.id + ':1'); return new Promise(function () {}); },
        cartUrl: '/cart'
      };
    }
  };
  ADAPT.demo = function (c) {
    return { load: function () { return Promise.resolve(c.products.map(function (a, i) { return finish({ id: 'd' + i, handle: 'd' + i, title: a[0], type: a[1], vendor: '', tags: [], desc: a[5] || '', image: '', url: '#', variants: a[4].split(' ').map(function (z) { return { id: 'd' + i + z, price: a[3], avail: true, cl: a[2], sz: z }; }) }); })); },
      recs: function (p) { return Promise.resolve(CAT.filter(function (x) { return x.id !== p.id && x.type !== p.type; }).slice(0, 4)); }, add: function () { return new Promise(function (r) { setTimeout(r, 500); }); }, cartUrl: '#' };
  };
  function loadCat() {
    if (S.catP) return S.catP;
    S.catP = AD.load().then(function (l) { CAT = l; try { sessionStorage.setItem('rk:cat', JSON.stringify({ t: Date.now(), d: l })); } catch (e) {} return l; });
    try { var c = JSON.parse(sessionStorage.getItem('rk:cat') || 'null'); if (CFG.mode !== 'demo' && c && Date.now() - c.t < 6e5 && c.d.length) { CAT = c.d; CAT.forEach(function (p) { p.colors.forEach(function (x) { x.split(/[\s\/-]+/).forEach(function (w) { if (w.length > 2) COLORSET[w] = 1; }); }); }); S.catP = Promise.resolve(CAT); AD.load().then(function (l) { CAT = l; }).catch(function () {}); } } catch (e) {}
    S.catP.catch(function () { S.catP = null; });
    return S.catP;
  }

  /* ---------- UI (design matches "Agent ROCKY Shopping Companion") ---------- */
  var $ = function (q) { return S.root.querySelector(q); }, REG = {}, RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var HEX = { black: '#1c1b22', white: '#f1eee8', blue: '#6c9bd1', navy: '#2b3a67', green: '#6d7f55', olive: '#6d7f55', red: '#8e2f3d', maroon: '#8e2f3d', grey: '#9a9aa5', beige: '#d8c3a1', brown: '#7a5a43', pink: '#e59ab5' };
  function thumb(p) {
    var c = '#8a879c'; p.colors.concat(p.f.title.split(' ')).some(function (w) { for (var k in HEX) if (has(lc(w), k)) { c = HEX[k]; return true; } });
    var t = p.f.type + ' ' + p.f.title, sh = /trouser|pant|chino|jean/.test(t) ? '<path d="M18 6h28l4 52H36L32 26l-4 32H14z" fill="' + c + '"/>' : /\btee|t-shirt/.test(t) ? '<path d="M22 6l-14 10 6 8 6-4v38h24V20l6 4 6-8L42 6c-2 5-6 7-10 7s-8-2-10-7z" fill="' + c + '"/>' : '<path d="M22 6l-14 10 6 8 6-4v38h24V20l6 4 6-8L42 6l-10 8z" fill="' + c + '"/><path d="M32 14v46" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>';
    return '<svg viewBox="0 0 64 64">' + sh + '</svg>';
  }
  function build() {
    var a = CFG.assets, r = D.createElement('div'); r.id = 'rk'; r.className = 'rk';
    r.innerHTML = '<div class="rk-lw"><button class="rk-launch" type="button" aria-label="Open Agent Rocky"><span class="rk-av"><img src="' + E(a.wave) + '" alt=""></span><span><b>AGENT ROCKY</b><small>' + E(CFG.tagline || 'Your Right Choice Dress Assistant') + '</small></span><span class="rk-go">→</span></button></div>' +
      '<div class="rk-toast"><span class="rk-av"><img src="' + E(a.cheer || a.wave) + '" alt=""></span><div class="rk-tx"></div></div>' +
      '<div class="rk-modal" aria-hidden="true"><div class="rk-panel" role="dialog" aria-modal="true" aria-labelledby="rk-t">' +
      '<div class="rk-head"><span class="rk-av"><img id="rk-hav" src="' + E(a.wave) + '" alt=""></span><div class="rk-ht"><h3 id="rk-t">' + E(CFG.title || "Rocky's Drip Decoder") + '</h3><small>' + E(CFG.subtitle || ((CFG.shop ? CFG.shop + ' ' : '') + 'Shopping Companion · Fit-check on tap')) + '</small></div><button class="rk-ib rk-x" type="button" aria-label="Close chat" title="Close chat">×</button></div>' +
      '<div class="rk-feed" aria-live="polite"></div><div class="rk-tray" hidden><span class="rk-tc"></span><button type="button" class="rk-go2">Squad Compare</button><button type="button" class="rk-clr" aria-label="Clear selection">✕</button></div>' +
      '<form class="rk-bar" autocomplete="off"><input type="text" maxlength="240" aria-label="Message Rocky" placeholder="Tell Rocky your vibe, budget, colour…"><button class="rk-send" aria-label="Send">→</button></form>' +
      (CFG.poweredBy === false ? '' : '<div class="rk-note">Powered by <a href="' + E(CFG.poweredUrl || 'https://fit.tryvtri.com/') + '" target="_blank" rel="noopener">' + E(CFG.poweredName || 'TRYVTRI') + '</a></div>') +
      '<div class="rk-bye" hidden><img alt="" src="' + E(a.thanks) + '"><h4>Thank you for stopping by!</h4><p>Rocky is always here when you need a right-choice outfit.</p><button type="button" class="rk-bye-x">Close</button></div></div></div>';
    D.body.appendChild(r); S.root = r; S.feed = $('.rk-feed'); S.modal = $('.rk-modal'); S.input = $('.rk-bar input'); S.hav = $('#rk-hav'); S.launch = $('.rk-launch');
    var host = CFG.inline && D.querySelector(CFG.inline), lw = $('.rk-lw'); if (host) { host.appendChild(lw); lw.className = 'rk rk-lw in'; } else lw.classList.add('float');
    var ph = ['black shirt under 3000', 'outfit for a wedding, around 8k', 'white sneakers size 9', 'something cheaper in blue', 'gift for my brother under 5000'], pi = 0;
    setInterval(function () { if (!S.input.value && D.activeElement !== S.input) S.input.placeholder = ph[pi++ % ph.length]; }, 3500);
    S.launch.onclick = openChat; $('.rk-x').onclick = bye; $('.rk-bye-x').onclick = done; $('.rk-bye').onclick = done;
    S.modal.addEventListener('click', function (e) { if (e.target === S.modal) bye(); });
    D.addEventListener('click', function (e) { var av = e.target.closest && e.target.closest('.rk-panel .rk-av'); if (av) { av.classList.remove('hop'); void av.offsetWidth; av.classList.add('hop'); } });
    $('.rk-bar').onsubmit = function (e) { e.preventDefault(); var v = S.input.value.trim(); if (v) { S.input.value = ''; ask(v); } };
    $('.rk-go2').onclick = function () { S.sel.length > 1 ? compare() : say('Pick at least 2 products to compare.'); };
    $('.rk-clr').onclick = function () { S.sel = []; tray(); };
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.modal.classList.contains('open')) bye(); });
    S.feed.addEventListener('click', onFeed);
  }
  function reset() { S.feed.innerHTML = ''; S.sel = []; S.last = []; S.rest = []; S.I = null; S.started = 0; S.q = Promise.resolve(); tray(); }
  function openChat() {
    S.modal.classList.add('open'); S.modal.setAttribute('aria-hidden', 'false'); $('.rk-bye').hidden = true; S.input.focus(); emit('open');
    loadCat().catch(function () {}); var i = new Image(); i.src = CFG.assets.thanks;
    if (!S.started) { S.started = 1; setTimeout(function () { think(function () { say('Yo! I am <b>Rocky</b>, your Right Choice Dress Assistant' + (CFG.shop ? ' at ' + E(CFG.shop) : '') + '. Tell me what you are looking for and I will decode the drip. Budget, colour, size, occasion, just type it like <i>“black shirt under 3000”</i>.'); }); }, 200); }
  }
  function bye() { if (!$('.rk-bye').hidden) return done(); $('.rk-bye').hidden = false; emit('close'); clearTimeout(S.bt); S.bt = setTimeout(done, 4000); }
  function done() { clearTimeout(S.bt); S.modal.classList.remove('open'); S.modal.setAttribute('aria-hidden', 'true'); $('.rk-bye').hidden = true; reset(); S.launch.focus(); }

  function queue(fn) { S.q = S.q.then(fn); return S.q; }
  function raw(h, me) { var d = D.createElement('div'); d.className = 'rk-msg' + (me ? ' me' : ''); d.innerHTML = (me ? '' : '<span class="rk-av"><img src="' + E(CFG.assets.wave) + '" alt=""></span>') + '<div class="rk-bub">' + h + '</div>'; S.feed.appendChild(d); S.feed.scrollTop = S.feed.scrollHeight; return d; }
  function typeIn(el) {
    return new Promise(function (fin) {
      var w = D.createTreeWalker(el, NodeFilter.SHOW_TEXT), n = [], t, tot = 0; while ((t = w.nextNode())) { n.push([t, t.nodeValue]); tot += t.nodeValue.length; }
      if (RM || !tot) return fin(); n.forEach(function (x) { x[0].nodeValue = ''; });
      var dt = D.createElement('span'); dt.className = 'rk-dots rk-t'; dt.innerHTML = '<i></i><i></i><i></i>'; el.appendChild(dt);
      var step = Math.max(1, Math.ceil(tot / 150)), k = 0, pos = 0;
      (function tick() { var c = step; while (c > 0 && k < n.length) { var q = n[k][1], take = Math.min(c, q.length - pos); pos += take; n[k][0].nodeValue = q.slice(0, pos); c -= take; if (pos >= q.length) { k++; pos = 0; } } S.feed.scrollTop = S.feed.scrollHeight; if (k < n.length) setTimeout(tick, 22); else { dt.remove(); fin(); } })();
    });
  }
  function say(h) { queue(function () { return typeIn(raw(h).querySelector('.rk-bub')); }); }
  function think(fn, ms) {
    queue(function () { return new Promise(function (res) { var d = raw('<span class="rk-dots"><i></i><i></i><i></i></span>'); S.hav.src = CFG.assets.think; setTimeout(function () { d.remove(); S.hav.src = CFG.assets.wave; fn(); res(); }, ms || CFG.delay || 1400); }); });
  }
  function win(t) {
    queue(function () {
      var e = $('.rk-toast'); $('.rk-tx').textContent = t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
      if (!RM) for (var i = 0; i < 26; i++) { var c = D.createElement('i'); c.className = 'rk-cf'; c.style.left = (20 + Math.random() * 60) + 'vw'; c.style.background = ['#5C3BFE', '#ff6fa5', '#38bdf8', '#ffd166'][i % 4]; c.style.animationDelay = Math.random() * 0.4 + 's'; S.root.appendChild(c); setTimeout(function (x) { x.remove(); }, 2400, c); }
    });
  }
  function sizeDefault(p, I) { return I && I.sizes.filter(function (s) { return p.sizes.some(function (x) { return lc(x) === lc(s); }); })[0] || ''; }
  function cardHtml(p, I, i) {
    REG[p.id] = p; var ds = sizeDefault(p, I), mc = I && I.colors[0];
    var sz = p.sizes.map(function (s) { var ok = p.variants.some(function (v) { return v.sz === s && v.avail; }); return '<button type="button" class="rk-sz' + (lc(s) === lc(ds) ? ' on' : '') + (ok ? '' : ' off') + '" data-s="' + E(s) + '"' + (ok ? '' : ' disabled') + '>' + E(s) + '</button>'; }).join('');
    return '<article class="rk-card" data-id="' + E(p.id) + '" data-s="' + E(ds) + '">' + (i < 2 ? '<span class="rk-tag">ROCKY PICK</span>' : '') +
      '<div class="rk-th" data-d="1">' + (p.image ? '<img loading="lazy" alt="' + E(p.title) + '" src="' + E(p.image) + '">' : thumb(p)) + '</div>' +
      '<b class="rk-nm" tabindex="0" data-d="1">' + E(p.title) + '</b><span class="rk-pr">' + (p.variants.length > 1 && p.variants[0].price !== p.price ? 'From ' : '') + E(money(p.price)) + '</span>' +
      (p.colors.length ? '<span class="rk-col">' + E(p.colors.slice(0, 4).join(' · ')) + '</span>' : '') + (sz ? '<div class="rk-szs">' + sz + '</div><small class="rk-need">Pick a size first</small>' : '') +
      '<div class="rk-row"><a class="rk-view" href="' + E(p.url) + '">View</a><button type="button" class="rk-add"' + (p.avail ? '' : ' disabled') + '>' + (p.avail ? 'Add to cart' : 'Sold out') + '</button><button type="button" class="rk-cmp" aria-label="Add to compare" title="Compare">+</button></div></article>';
  }
  function showCards(list, I) { queue(function () { var d = D.createElement('div'); d.className = 'rk-msg'; d.innerHTML = '<div class="rk-res"><div class="rk-grid">' + list.map(function (p, i) { return cardHtml(p, I, i); }).join('') + '</div>' + (S.rest.length ? '<button type="button" class="rk-more" data-more="1">Show ' + Math.min(6, S.rest.length) + ' more</button>' : '') + '</div>'; S.feed.appendChild(d); S.feed.scrollTop = S.feed.scrollHeight; tray(); }); }
  function variantFor(p, size, I) {
    var cands = p.variants.filter(function (v) { return v.avail && (!size || v.sz === size); }), c = I && I.colors[0];
    return (c && cands.filter(function (v) { return v.cl && has(lc(v.cl), c); })[0]) || cands[0];
  }
  function onFeed(e) {
    var t = e.target, card = t.closest('.rk-card');
    if (t.closest('[data-more]')) { var b = t.closest('[data-more]'); b.remove(); var nx = S.rest.splice(0, 6); S.last = S.last.concat(nx); return showCards(nx, S.I); }
    var pb = t.closest('.rk-pair'); if (pb) return pair(REG[pb.dataset.pid]);
    if (!card) return; var p = REG[card.dataset.id];
    if (t.closest('.rk-sz')) { var s = t.closest('.rk-sz'); card.dataset.s = s.dataset.s; card.querySelectorAll('.rk-sz').forEach(function (x) { x.classList.toggle('on', x === s); }); card.classList.remove('need'); return; }
    if (t.closest('.rk-add')) { return addCart(card, p, t.closest('.rk-add')); }
    if (t.closest('.rk-cmp')) { var i = S.sel.indexOf(p.id); if (i > -1) S.sel.splice(i, 1); else if (S.sel.length < 3) S.sel.push(p.id); return tray(); }
    if (t.closest('[data-d]')) return detail(p);
  }
  function addCart(card, p, btn) {
    var size = card.dataset.s; if (p.sizes.length > 1 && !size) { card.classList.add('need'); return; }
    var v = variantFor(p, size, S.I); if (!v) { say('That size just went out of stock. Try another one?'); return; }
    btn.disabled = true; btn.textContent = 'Adding…';
    AD.add(v).then(function () { btn.textContent = 'Added ✓'; emit('add', { id: p.id, variant: v.id }); win('Locked in the bag!'); say('Added <b>' + E(p.title) + '</b>' + (size ? ' (' + E(size) + ')' : '') + ' to your cart. <a href="' + E(AD.cartUrl) + '">View cart</a>, or tell me what to pair it with.'); })
      .catch(function () { btn.disabled = false; btn.textContent = 'Add to cart'; say('<span class="rk-err">I could not add that just now. Please use the View button and add it from the product page.</span>'); });
  }
  function tray() { var t = $('.rk-tray'); t.hidden = !S.sel.length; $('.rk-tc').textContent = S.sel.length + ' selected'; S.feed.querySelectorAll('.rk-card').forEach(function (c) { c.classList.toggle('sel', S.sel.indexOf(c.dataset.id) > -1); }); }
  function detail(p) {
    think(function () {
      say('<b>' + E(p.title) + '</b><div class="rk-dt"><span>Price</span> ' + E(money(p.price)) + (p.colors.length ? '<br><span>Colours</span> ' + E(p.colors.join(', ')) : '') + (p.sizes.length ? '<br><span>Sizes</span> ' + E(p.sizes.join(', ')) : '') + '<br><span>Availability</span> ' + (p.avail ? 'In stock' : 'Currently sold out') + (p.desc ? '<br>' + E(p.desc.length > 220 ? p.desc.slice(0, 217) + '…' : p.desc) : '') + '</div>' +
        '<div class="rk-acts"><a class="rk-view" href="' + E(p.url) + '">Open product page</a><button type="button" class="rk-pair" data-pid="' + E(p.id) + '">Complete the look</button></div>' + (CFG.tryOn ? '<div class="rk-hand">Want to see it on you? Open the product page and tap <b>' + E(CFG.tryOn) + '</b>.</div>' : ''));
    });
  }
  function pair(p) {
    think(function () { AD.recs(p).then(function (l) {
      l = l.filter(function (x) { return x.id !== p.id && x.avail; }).slice(0, 4);
      if (!l.length) return say('I could not find a matching pairing for <b>' + E(p.title) + '</b> yet. Tell me what you would like to wear it with and I will search for it.');
      S.last = l; S.rest = []; win('Fit pairing found!'); say('Here is what goes well with <b>' + E(p.title) + '</b>:'); showCards(l, S.I);
    }).catch(function () { say('Pairing suggestions are unavailable right now.'); }); });
  }
  function compare() {
    var p = S.sel.map(function (i) { return REG[i]; }).filter(Boolean), h = function (k, fn) { return '<tr><th>' + k + '</th>' + p.map(function (x) { return '<td>' + fn(x) + '</td>'; }).join('') + '</tr>'; };
    think(function () { win('Squad compared!'); say('<b>Squad Compare</b><div class="rk-tw"><table class="rk-tbl"><tr><th></th>' + p.map(function (x) { return '<td><b>' + E(x.title) + '</b></td>'; }).join('') + '</tr>' + h('Price', function (x) { return E(money(x.price)); }) + h('Type', function (x) { return E(x.type || '-'); }) + h('Colours', function (x) { return E(x.colors.join(', ') || '-'); }) + h('Sizes', function (x) { return E(x.sizes.join(', ') || '-'); }) + h('Stock', function (x) { return x.avail ? 'In stock' : 'Sold out'; }) + '</table></div>Based only on the store listing. Tell me what matters most (price, colour, occasion) and I will pick one.'); });
  }

  /* ---------- conversation brain ---------- */
  function ask(text) {
    raw(E(text), 1); emit('ask', { q: text }); var l = lc(text).trim();
    if (/^(bye|goodbye|good bye|see you|cya|exit|close|that'?s all|that is all|i'?m done|done)\b/.test(l)) return think(function () { bye(); }, 300);
    if (/^(thanks|thank you|thx|ty|shukriya|great|perfect|awesome|cool)\b/.test(l) && l.length < 40) return think(function () { say(pick(['Anytime! Want me to look for anything else?', 'Happy to help. Say the word if you want to pair it with something.'])); });
    if (/^(hi|hello|hey|hii+|salam|assalam|yo|good (morning|evening|afternoon))\b/.test(l) && l.length < 30) return think(function () { say('Hey! What are you shopping for today? Tell me the item, colour or budget in your own words.'); });
    if (/\b(how (do|does) (you|this)|what can you do|help me)\b/.test(l) && l.length < 40) return think(function () { say('Just type what you need, for example <i>“navy chinos size 32 under 3500”</i>. I understand budgets, colours, sizes and occasions, and I can refine ("cheaper", "in black"), compare products and suggest what to pair.'); });
    if (/try.*(on|me)|how.*look on/.test(l)) return think(function () { say(CFG.tryOn ? 'Open the product page and tap <b>' + E(CFG.tryOn) + '</b> for your virtual fit-check. I handle the shortlist, it handles the try-on.' : 'I cannot do virtual try-ons, but I can compare sizes and fits from the listing.'); });
    if (/\bcompar/.test(l) && !/\b(under|below)\b/.test(l)) { if (!S.sel.length && S.last.length > 1) S.sel = S.last.slice(0, 3).map(function (p) { return p.id; }); if (S.sel.length > 1) { tray(); return compare(); } return think(function () { say('Tap <b>+</b> on 2 or 3 products and I will compare them.'); }); }
    if (/(go(es)? with|pair|match|complete the look|style (it|this)|what (to|should i) wear with)/.test(l) && S.last.length) return pair(S.last[0]);
    if (/^(which|what).*(best|better|recommend|choose|pick)|\bbest (one|option)|help me (choose|decide)|your (pick|choice)/.test(l) && S.last.length) {
      return think(function () { var p = S.last.filter(function (x) { return x.avail; })[0] || S.last[0], why = []; if (S.I && S.I.max != null) why.push('it fits your ' + money(S.I.max) + ' budget'); if (S.I && S.I.colors.length) why.push('it comes in ' + S.I.colors[0]); why.push(p.avail ? 'it is in stock now' : 'it is the closest match'); say('Going only by what the store lists, my pick is <b>' + E(p.title) + '</b> at ' + E(money(p.price)) + ': ' + why.join(', ') + '. Want me to pair it with something?'); });
    }
    if (/^(show |see |give )?(me )?(more|next|other|another|something else)\b/.test(l) && (S.rest.length || S.last.length)) {
      return think(function () { if (S.rest.length) { var nx = S.rest.splice(0, 6); S.last = S.last.concat(nx); say('Here are some more.'); showCards(nx, S.I); } else say('That is everything matching right now. Try changing the budget, colour or size and I will search again.'); });
    }
    run(parse(text), text);
  }
  function run(I, text) {
    if (I.cheaper && !I.sort && S.last.length && I.max == null) I.max = Math.max(1, median(S.last) - 1);
    var prev = S.I, fresh = I.terms.length > 0;
    if (!fresh && prev && !empty(I)) { var m = JSON.parse(JSON.stringify(prev)); ['max', 'min', 'gender', 'sort'].forEach(function (k) { if (I[k] != null && I[k] !== false) m[k] = I[k]; }); if (I.colors.length) m.colors = I.colors; if (I.sizes.length) m.sizes = I.sizes; if (I.max != null && I.min == null && prev.min != null && I.max < prev.min) m.min = null; I = m; }
    if (empty(I)) return think(function () { say(pick(['I need a little more to go on. What are you shopping for, and is there a colour, size or budget in mind? For example <i>“linen shirt under 3000”</i>.', 'Tell me the item and your budget, and I will do the rest. Something like <i>“black hoodie size L under 4000”</i>.'])); });
    var started = Date.now(); think(function () {
      loadCat().then(function () {
        if (!CAT.length) return say('This store has no products I can read yet. Please check back soon.');
        var r = search(I), d = describe(I), lab = { size: 'in size ' + I.sizes.join('/'), color: 'in ' + I.colors.join('/'), terms: 'matching every keyword', price: 'within your budget', gender: 'for that category' };
        S.I = I;
        if (!r.list.length) { var types = {}; CAT.forEach(function (p) { if (p.type) types[p.type] = 1; }); var ts = Object.keys(types).slice(0, 6); return say('I searched the whole store and nothing fits <b>' + E(d) + '</b>. ' + (ts.length ? 'What this store carries: ' + E(ts.join(', ')) + '. ' : '') + 'Try different words or a wider budget.'); }
        S.last = r.list.slice(0, 6); S.rest = r.list.slice(6, 18); var n = r.list.length;
        if (r.dropped.length) say('Nothing matches <b>' + E(d) + '</b> exactly, so I relaxed it (' + E(r.dropped.map(function (k) { return 'not ' + lab[k]; }).join(', ')) + '). These are the closest ' + n + ':');
        else say(pick(['Found <b>' + n + '</b> match' + (n > 1 ? 'es' : '') + ' for <b>' + E(d) + '</b> in this store. Big W energy.', 'Here are the best <b>' + E(d) + '</b> I can see in the store (' + n + ' match' + (n > 1 ? 'es' : '') + ').', 'Got it. <b>' + n + '</b> option' + (n > 1 ? 's' : '') + ' for <b>' + E(d) + '</b>:']));
        win('Drip decoded!'); showCards(S.last, I);
        if (n > 6) say('Say <i>“show more”</i>, or refine it: <i>“cheaper”</i>, <i>“in blue”</i>, <i>“size L”</i>.');
        emit('results', { q: text, n: n });
      }).catch(function () { say('<span class="rk-err">I could not load the store catalogue just now. Please try again in a moment.</span>'); });
    });
  }

  /* ---------- init ---------- */
  function init(cfg) {
    if (S.root) return; CFG = cfg || {}; CFG.assets = CFG.assets || {};
    AD = (CFG.mode === 'storefront' ? ADAPT.storefront : CFG.mode === 'demo' ? ADAPT.demo : ADAPT.liquid)(CFG);
    build(); reset();
  }
  W.Rocky = { init: init, _t: { parse: parse, search: search, setCat: function (c) { CAT = c; }, finish: finish } };
  if (W.RockyConfig && D.readyState !== 'loading') init(W.RockyConfig);
  else if (W.RockyConfig) D.addEventListener('DOMContentLoaded', function () { init(W.RockyConfig); });
})();
