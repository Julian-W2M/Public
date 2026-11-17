javascript:(async () => {
  'use strict';
  /* MacroRecorder - Treasury Team 1.4 - evolucion de Page_inspector.js 3.2 (solo comentarios de bloque: apto para bookmarklet) */

  if (window.__MacroRecorderAI__) {
    try { window.__MacroRecorderAI__.show(); } catch (e) {}
    return;
  }

  const CFG = {
    VERSION: '1.4',
    MAX_TEXT: 180,
    MAX_ATTR: 160,
    MAX_TABLE_ROWS: 8,
    MAX_TABLE_COLS: 15,
    MAX_ITEMS: 500,
    CORRELATION_WINDOW_MS: 4000,
    MUTATION_ATTRIBUTION_MS: 3000,
    INPUT_MERGE_MS: 2500,
    SCROLL_QUIET_MS: 400,
    MAX_ACTIONS: 3000,
    MAX_NETWORK: 1500,
    MAX_MUTATIONS: 1500,
    MAX_NODES_PER_BATCH: 40,
    UPDATE_MIN_NODES: 3,
    ACTION_CORRELATION_WINDOW_MS: 5000,
    STORAGE_KEY: '__MacroRecorderAI_state__',
    HANDOFF_KEY: '__MacroRecorderAI_handoff__'
  };

  const ALLOWED_EVENT_TYPES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'change', 'submit', 'input', 'dblclick', 'keydown', 'keyup', 'contextmenu', 'focus', 'blur']);
  const NOISE_CLASS_REGEX = /^(fui-|react-|fiber|layer|tooltip|provider|tabster|ms-layer|ms-callout|ms-fabric|css-|sc-|jsx-|emotion-)/i;
  const NOISE_URL_REGEX = /(react|fluentui|fluent-ui|webpack|fonts\.googleapis|fonts\.gstatic|\.woff2?(?:\?|$)|\.ttf(?:\?|$)|\.svg(?:\?|$)|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.gif(?:\?|$)|\.ico(?:\?|$)|\.css(?:\?|$)|github\.com|cdn\.|\/static\/|\/_next\/|node_modules|analytics|telemetry|beacon|\.map(?:\?|$)|\.js(?:\?|$))/i;

  const clean = (value, max = CFG.MAX_TEXT) => {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
  };
  const scriptStartedAt = Date.now();
  const iso = ts => new Date(ts).toISOString();
  const normalizeText = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const getAllElementsDeep = root => {
    const elements = [], seenElements = new Set(), seenRoots = new Set(), pending = [root || document];
    while (pending.length) {
      const currentRoot = pending.pop();
      if (!currentRoot || seenRoots.has(currentRoot)) continue;
      seenRoots.add(currentRoot);
      if (currentRoot.nodeType === 1 && !seenElements.has(currentRoot)) {
        seenElements.add(currentRoot);
        elements.push(currentRoot);
      }
      const doc = currentRoot.nodeType === 9 ? currentRoot : currentRoot.ownerDocument;
      if (!doc || !doc.createTreeWalker) continue;
      const walker = doc.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
      let el = walker.nextNode();
      while (el) {
        if (!seenElements.has(el)) {
          seenElements.add(el);
          elements.push(el);
        }
        if (el.shadowRoot) pending.push(el.shadowRoot);
        if (el.localName === 'iframe' || el.localName === 'frame') {
          try { if (el.contentDocument && el.contentDocument.documentElement) pending.push(el.contentDocument); } catch (e) {}
        }
        el = walker.nextNode();
      }
    }
    return elements;
  };

  const deepQueryAll = (selector, root = document) => {
    const result = [];
    for (const el of getAllElementsDeep(root)) {
      if (el === root || !el.matches || isInternalRecorderNode(el)) continue;
      try { if (el.matches(selector)) result.push(el); } catch (e) { return []; }
    }
    return result;
  };

  const deepQueryOne = (selector, root = document) => deepQueryAll(selector, root)[0] || null;
  const isInternalRecorderNode = node => {
    const seen = new Set();
    let current = node;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current.nodeType === 1 && current.id === '__macroRecorderAI_host') return true;
      if (current.parentNode) current = current.parentNode;
      else { const root = current.getRootNode && current.getRootNode(); current = root && root.host; }
    }
    return false;
  };
  const queryByShadowPath = (shadowPath, selector, root = document) => {
    let currentRoot = root;
    for (const hostSelector of shadowPath || []) {
      const host = deepQueryOne(hostSelector, currentRoot);
      if (!host || !host.shadowRoot) return null;
      currentRoot = host.shadowRoot;
    }
    try { return currentRoot.querySelector(selector); } catch (e) { return null; }
  };

  const getAllRootsDeep = root => {
    const roots = new Set([root || document]);
    for (const el of getAllElementsDeep(root || document)) {
      const elRoot = el.getRootNode();
      if (elRoot) roots.add(elRoot);
      if ((el.localName === 'iframe' || el.localName === 'frame') && el.contentDocument) roots.add(el.contentDocument);
    }
    return [...roots];
  };

  /* Estado compartido de la grabacion (serializable salvo _el en acciones) */
  const S = {
    recId: '', status: 'READY', startedAt: 0,
    includeLegacy: false, resumed: false, resumeCount: 0,
    stepCounter: 1, lastEventTs: 0, lastActionTs: 0, lastActionStep: 0, lastUrl: '',
    actions: [], used: new Map(), formSnaps: new Map(), tableSnaps: new Map(),
    navigation: [], mutations: [], network: [], listeners: [], interactionTimeline: [], customEvents: [], loadedModules: [], cellsRouters: [], seq: { req: 1, mut: 1, nav: 1 }
  };
  const resetState = () => {
    Object.assign(S, {
      recId: 'rec-' + Date.now().toString(36), status: 'READY', startedAt: 0, resumed: false, resumeCount: 0,
      stepCounter: 1, lastEventTs: 0, lastActionTs: 0, lastActionStep: 0, lastUrl: location.href,
      actions: [], used: new Map(), formSnaps: new Map(), tableSnaps: new Map(),
      navigation: [], mutations: [], network: [], listeners: [], interactionTimeline: [], customEvents: [], loadedModules: [], cellsRouters: [], seq: { req: 1, mut: 1, nav: 1 }
    });
  };
  resetState();

  /* =====================================================================
     SecurityManager
     ===================================================================== */
  const SecurityManager = (() => {
    const REDACTED = '[REDACTED]';
    const SENSITIVE_RE = /(passw(or)?d|pwd|contrase[nñ]a|token|jwt|api[-_ ]?key|authori[sz]ation|cookie|secret|bearer|session|csrf|xsrf|one-time-code)/i;
    const SELECTOR_KEYS = new Set(['selector', 'primarySelector', 'playwrightSelector', 'cssPath', 'shadowPath', 'robustSelector', 'xpath', 'domPath', 'alternateSelectors', 'tableSelector', 'framePath', 'key', 'id']);
    const URL_KEYS = new Set(['url', 'href', 'from', 'to', 'frameUrl', 'action', 'nextUrl', 'origin', 'pathname', 'endpoint', 'path', 'queryString', 'referrer', 'src', 'oldURL', 'newURL', 'urls']);
    let count = 0;

    const isSensitiveName = n => !!n && SENSITIVE_RE.test(String(n));
    const isSensitiveField = el => {
      if (!el || el.nodeType !== 1 || !el.getAttribute) return false;
      if ((el.getAttribute('type') || '').toLowerCase() === 'password') return true;
      return [el.id, el.getAttribute('name'), el.getAttribute('autocomplete'), el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('data-testid')].some(isSensitiveName);
    };
    const redact = () => { count++; return REDACTED; };

    const sanitizeString = str => {
      let out = String(str);
      out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
      out = out.replace(/Bearer\s+[A-Za-z0-9\-_.=]+/gi, 'Bearer ' + REDACTED);
      out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REDACTED);
      out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[ID]');
      out = out.replace(/\b(tenantid|tenant_id)=[^&"'\s]+/gi, '$1=[TENANT]');
      out = out.replace(/\b(sessionid|session_id|sid)=[^&"'\s]+/gi, '$1=' + REDACTED);
      out = out.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
      return out;
    };
    const redactUrl = url => String(url).replace(/([?&;])([^=&;#\s"']+)=([^&;#\s"']*)/g, (m, p, k) =>
      (isSensitiveName(k) || /^(sig|signature|code|key|sas_token)$/i.test(k)) ? p + k + '=' + redact() : m);

    const deep = (value, key) => {
      if (typeof value === 'string') {
        if (SELECTOR_KEYS.has(key)) return value;
        if (URL_KEYS.has(key)) return redactUrl(value);
        return sanitizeString(redactUrl(value));
      }
      if (Array.isArray(value)) return value.map(v => deep(v, key));
      if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) {
          if (isSensitiveName(k) && !SELECTOR_KEYS.has(k)) out[k] = redact();
          else out[k] = deep(value[k], k);
        }
        return out;
      }
      return value;
    };

    const redactBody = (body, max = 300) => {
      if (body == null) return '';
      let s;
      if (typeof body === 'string') s = body;
      else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) s = body.toString();
      else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const o = {};
        body.forEach((v, k) => { o[k] = isSensitiveName(k) ? redact() : (typeof v === 'string' ? v : '[File]'); });
        s = JSON.stringify(o);
      } else s = '[' + Object.prototype.toString.call(body).slice(8, -1) + ']';
      try { return clean(JSON.stringify(deep(JSON.parse(s))), max); } catch (e) {}
      return clean(sanitizeString(redactUrl('?' + s).slice(1)), max);
    };
    const redactHeaders = h => {
      const out = {};
      for (const k of Object.keys(h || {})) out[k] = isSensitiveName(k) ? redact() : clean(h[k], 200);
      return out;
    };

    return { REDACTED, isSensitiveName, isSensitiveField, redact, sanitizeString, redactUrl, redactBody, redactHeaders, sanitize: v => deep(v, ''), redactionCount: () => count };
  })();

  /* =====================================================================
     SelectorEngine (robustSelector/pathSelector originales + XPath, alternativas, scoring)
     ===================================================================== */
  const SelectorEngine = (() => {
    const cache = new WeakMap();
    const escAttr = v => String(v).replace(/"/g, '\\"');
    const cssEsc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&');

    const isStableClass = c =>
      !!c && c.length <= 40 &&
      !/^(ng-|_ngcontent|_nghost|css-|sc-|jsx-|emotion-|style-|Mui[A-Z]|is-|has-|active$|selected$|open$)/.test(c) &&
      !/^[a-z0-9]{6,}$/i.test(c) && !/\d{3,}/.test(c);

    const isNumericLikeId = s => !s || /^\d+$/.test(s) || /^[a-f0-9]{8,}$/i.test(s) || /^(react|radix|mui|fui|ext)[-:]/i.test(s);

    const isFrameworkNoise = el => {
      if (!el || !el.classList) return false;
      const looksNoisy = [...el.classList].some(c => NOISE_CLASS_REGEX.test(c));
      if (!looksNoisy) return false;
      const hasStableId = el.id && !isNumericLikeId(el.id);
      const hasTestId = !!(el.getAttribute && el.getAttribute('data-testid'));
      const hasAutomationType = !!(el.getAttribute && (el.getAttribute('data-automation-type') || el.getAttribute('data-automationid') || el.getAttribute('data-automation-id')));
      const hasAriaLabel = !!(el.getAttribute && el.getAttribute('aria-label'));
      return !(hasStableId || hasTestId || hasAutomationType || hasAriaLabel);
    };

    const pathSelector = el => {
      if (!el || el.nodeType !== 1) return '';
      if (el.id) return '#' + cssEsc(el.id);
      const parts = [];
      let current = el;
      while (current && current.nodeType === 1 && current !== current.ownerDocument.body && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.name) part += '[name="' + cssEsc(current.name) + '"]';
        else if (current.classList.length) part += '.' + [...current.classList].slice(0, 2).map(c => cssEsc(c)).join('.');
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(x => x.tagName === current.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };

    const robustSelector = el => {
      if (!el || el.nodeType !== 1) return { value: '', quality: 'low', score: 0 };
      const tag = el.tagName.toLowerCase();
      const testId = el.getAttribute && el.getAttribute('data-testid');
      if (testId) return { value: `[data-testid="${escAttr(testId)}"]`, quality: 'high', score: 95 };
      const automationAttr = el.getAttribute && ['data-automation-type', 'data-automationid', 'data-automation-id'].find(a => el.getAttribute(a));
      if (automationAttr) return { value: `${tag}[${automationAttr}="${escAttr(el.getAttribute(automationAttr))}"]`, quality: 'high', score: 90 };
      const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
      if (ariaLabel) return { value: `[aria-label="${escAttr(ariaLabel)}"]`, quality: 'high', score: 85 };
      if (el.id && !isNumericLikeId(el.id)) return { value: '#' + cssEsc(el.id), quality: 'high', score: 80 };
      const name = el.getAttribute && el.getAttribute('name');
      if (name) return { value: `${tag}[name="${escAttr(name)}"]`, quality: 'medium', score: 70 };
      const role = el.getAttribute && el.getAttribute('role');
      const ownText = clean(el.textContent, 40);
      if (role && ownText && ownText.length <= 40) return { value: `${tag}[role="${escAttr(role)}"]`, quality: 'medium', score: 65 };
      if (el.id && isNumericLikeId(el.id)) return { value: '#' + cssEsc(el.id), quality: 'medium', score: 55 };
      const stableClasses = el.classList ? [...el.classList].filter(isStableClass) : [];
      if (stableClasses.length) return { value: `${tag}.${stableClasses.slice(0, 2).map(c => cssEsc(c)).join('.')}`, quality: 'medium', score: 50 };
      return { value: pathSelector(el), quality: 'low', score: 20 };
    };

    const selector = el => robustSelector(el).value;
    const robust = el => { let r = cache.get(el); if (!r) { r = robustSelector(el); cache.set(el, r); } return r; };

    const countCss = (doc, sel) => { try { return doc.querySelectorAll(sel).length; } catch (e) { return -1; } };
    const countXpath = (doc, xp) => { try { return doc.evaluate('count(' + xp + ')', doc, null, XPathResult.NUMBER_TYPE, null).numberValue; } catch (e) { return -1; } };

    const xpath = el => {
      const doc = el.ownerDocument;
      if (el.id && !isNumericLikeId(el.id) && countCss(doc, `[id="${escAttr(el.id)}"]`) === 1) return `//*[@id="${escAttr(el.id)}"]`;
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1) {
        let i = 1, sib = cur.previousElementSibling;
        while (sib) { if (sib.localName === cur.localName) i++; sib = sib.previousElementSibling; }
        parts.unshift(cur.localName + '[' + i + ']');
        cur = cur.parentElement;
      }
      return '/' + parts.join('/');
    };

    const uniquePath = el => {
      const doc = el.getRootNode();
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && cur !== doc.documentElement && cur !== doc) {
        if (cur.id && !isNumericLikeId(cur.id)) { parts.unshift('#' + cssEsc(cur.id)); break; }
        let part = cur.localName;
        const p = cur.parentElement;
        if (p) part += ':nth-child(' + ([...p.children].indexOf(cur) + 1) + ')';
        parts.unshift(part);
        if (countCss(doc, parts.join(' > ')) === 1) break;
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };

    const build = el => {
      let out = cache.get(el);
      if (out && out.__full) return out;
      const doc = el.getRootNode();
      const base = robust(el);
      const tag = el.localName;
      const cands = [];
      const add = (type, sel, lang) => { if (sel && !cands.some(c => c.selector === sel)) cands.push({ type, selector: sel, language: lang || 'css' }); };
      const g = a => el.getAttribute && el.getAttribute(a);
      if (g('data-testid')) add('data-testid', `[data-testid="${escAttr(g('data-testid'))}"]`);
      if (el.id) add('id', '#' + cssEsc(el.id));
      if (g('name')) add('name', `${tag}[name="${escAttr(g('name'))}"]`);
      if (g('aria-label')) add('aria-label', `[aria-label="${escAttr(g('aria-label'))}"]`);
      if (g('role')) add('role', `${tag}[role="${escAttr(g('role'))}"]`);
      if (g('placeholder')) add('placeholder', `${tag}[placeholder="${escAttr(g('placeholder'))}"]`);
      if (g('title')) add('title', `${tag}[title="${escAttr(g('title'))}"]`);
      if (el.dataset) for (const k of Object.keys(el.dataset).slice(0, 4)) { if (!SecurityManager.isSensitiveName(k)) add('data-attribute', `${tag}[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${escAttr(el.dataset[k])}"]`); }
      const sc = [...(el.classList || [])].filter(isStableClass).slice(0, 2);
      if (sc.length) add('class', tag + '.' + sc.map(cssEsc).join('.'));
      add('css-path', uniquePath(el));
      const txt = clean(el.textContent, 60);
      if (txt && !SecurityManager.isSensitiveField(el) && el.children.length <= 3) add('text', `//${tag}[normalize-space(.)="${escAttr(txt)}"]`, 'xpath');
      const xp = xpath(el);
      add('xpath', xp, 'xpath');

      cands.forEach(c => { c.matches = c.language === 'xpath' ? countXpath(doc, c.selector) : countCss(doc, c.selector); });
      const robustMatches = countCss(doc, base.value);
      let primary = base.value, primaryMatches = robustMatches, primaryType = 'robust';
      if (robustMatches !== 1) {
        const u = cands.find(c => c.language === 'css' && c.matches === 1);
        if (u) { primary = u.selector; primaryMatches = 1; primaryType = u.type; }
      }
      const dynClasses = [...(el.classList || [])].filter(c => !isStableClass(c)).length;
      let score = base.score;
      if (primaryMatches === 1) score += 10; else if (primaryMatches > 1) score -= Math.min(30, (primaryMatches - 1) * 5); else score -= 20;
      if (primaryType === 'css-path' || /:nth-/.test(primary)) score -= 10;
      if (dynClasses && /\./.test(primary)) score -= 10;
      if (el.id && !isNumericLikeId(el.id)) score += 5;
      if (g('aria-label') || g('role') || g('data-testid')) score += 5;
      if (isFrameworkNoise(el)) score -= 10;
      score = Math.max(0, Math.min(100, Math.round(score)));

      const shadowHosts = [];
      let currentRoot = doc;
      while (currentRoot && currentRoot.host) {
        shadowHosts.unshift(currentRoot.host);
        currentRoot = currentRoot.host.getRootNode();
      }
      const shadowPath = shadowHosts.map(host => robustSelector(host).value);
      const cssPath = primary;
      const playwrightParts = shadowPath.concat(cssPath).map(value => `css=${value}`);

      out = {
        __full: true,
        primarySelector: primary,
        alternateSelectors: cands.filter(c => c.selector !== primary && c.language === 'css').slice(0, 6).map(c => ({ type: c.type, selector: c.selector, matches: c.matches }))
          .concat(cands.filter(c => c.language === 'xpath' && c.type === 'text').slice(0, 1).map(c => ({ type: 'text-xpath', selector: c.selector, matches: c.matches }))),
        xpath: xp,
        cssPath,
        shadowPath,
        playwrightSelector: playwrightParts.join(' >> '),
        robustSelector: { value: base.value, quality: base.quality, score: base.score, matches: robustMatches },
        selectorReliabilityScore: score,
        reliabilityFactors: { uniqueMatches: primaryMatches, hasStableId: !!(el.id && !isNumericLikeId(el.id)), dynamicClasses: dynClasses, accessibleAttributes: !!(g('aria-label') || g('role') || g('data-testid')), frameworkNoise: isFrameworkNoise(el) }
      };
      cache.set(el, Object.assign(out, { value: base.value, quality: base.quality, score: base.score }));
      return out;
    };

    return { isStableClass, isNumericLikeId, isFrameworkNoise, pathSelector, robustSelector, selector, robust, xpath, build };
  })();

  /* =====================================================================
     DOMAnalyzer (inspector original + informacion de elementos/contexto)
     ===================================================================== */
  const DOMAnalyzer = (() => {
    const infoCache = new WeakMap();
    const headerCache = new WeakMap();
    let _all = null;
    const scanSnapshots = [];
    let scanTimers = [], mutationScanTimer = null;
    const all = () => _all || (_all = getAllElementsDeep(document).filter(el => !isInternalRecorderNode(el)));
    const snapshotScan = reason => {
      const elements = getAllElementsDeep(document).filter(el => !isInternalRecorderNode(el));
      const shadowElements = elements.filter(el => { const root = el.getRootNode(); return !!(root && root.host); });
      scanSnapshots.push({ elapsedMs: Date.now() - scriptStartedAt, reason, domElements: elements.length, shadowHosts: elements.filter(el => !!el.shadowRoot).length, shadowElements: shadowElements.length, customElements: elements.filter(isCustomElement).length });
      if (scanSnapshots.length > 12) scanSnapshots.shift();
    };
    const scheduleScans = () => {
      scanTimers.forEach(clearTimeout);
      scanTimers = [0, 1000, 3000, 5000].map((delay, index) => setTimeout(() => snapshotScan(index === 0 ? 'initial' : `deferred-${delay}ms`), delay));
    };
    const scheduleMutationScan = () => {
      if (mutationScanTimer) return;
      mutationScanTimer = setTimeout(() => { mutationScanTimer = null; snapshotScan('significantMutation'); }, 500);
    };
    const select = (selector, root = document) => {
      const source = (root === document ? all() : getAllElementsDeep(root)).filter(el => !isInternalRecorderNode(el));
      return source.filter(el => el !== root && el.matches && el.matches(selector));
    };
    const isCustomElement = el => !!(el && el.localName && el.localName.includes('-'));
    const shadowChildCount = el => el && el.shadowRoot ? getAllElementsDeep(el.shadowRoot).length : 0;
    const customInfo = el => ({ isCustomElement: isCustomElement(el), shadowRoot: !!el.shadowRoot, childrenInsideShadow: shadowChildCount(el) });

    const visible = el => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };

    const attrs = el => {
      const result = {};
      const sensitive = SecurityManager.isSensitiveField(el);
      for (const attr of el.attributes || []) {
        let value = attr.value;
        if (SecurityManager.isSensitiveName(attr.name) || (attr.name === 'value' && sensitive)) value = SecurityManager.redact();
        else if (value.length > CFG.MAX_ATTR) value = value.slice(0, CFG.MAX_ATTR) + '…';
        result[attr.name] = value;
      }
      return result;
    };
    const dataAttrs = el => {
      const result = {};
      if (!el || !el.dataset) return result;
      for (const key in el.dataset) result[key] = SecurityManager.isSensitiveName(key) ? SecurityManager.redact() : clean(el.dataset[key], CFG.MAX_ATTR);
      return result;
    };
    const valueOf = (el, max = CFG.MAX_ATTR) => SecurityManager.isSensitiveField(el) ? SecurityManager.redact() : clean(el.value, max);
    const textOf = (el, max) => SecurityManager.isSensitiveField(el) ? '' : clean(el.innerText || el.value || '', max);

    const elementInfo = el => {
      const selectorInfo = SelectorEngine.robust(el);
      return {
        tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '', type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '', text: textOf(el), placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', class: clean(el.className, CFG.MAX_ATTR),
        attributes: attrs(el), dataAttributes: dataAttrs(el), selector: selectorInfo.value, selectorQuality: selectorInfo.quality,
        selectorStabilityScore: selectorInfo.score, frameworkNoise: SelectorEngine.isFrameworkNoise(el), visible: visible(el), ...customInfo(el)
      };
    };

    /* Informacion compacta del elemento usado en una accion */
    const actionInfo = el => {
      let i = infoCache.get(el);
      if (i) return i;
      const attributes = attrs(el);
      const keys = Object.keys(attributes);
      if (keys.length > 20) keys.slice(20).forEach(k => delete attributes[k]);
      let labelText = '';
      try { if (el.labels && el.labels[0]) labelText = clean(el.labels[0].innerText, 80); } catch (e) {}
      i = {
        tag: el.localName, id: el.id || '', name: el.getAttribute('name') || '', type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '', ariaLabel: el.getAttribute('aria-label') || '', placeholder: el.getAttribute('placeholder') || '',
        title: el.getAttribute('title') || '', labelText, classes: [...(el.classList || [])].slice(0, 10), text: textOf(el, 120), attributes
        , ...customInfo(el)
      };
      infoCache.set(el, i);
      return i;
    };

    const INTERACTIVE_CLOSEST = 'button,a[href],[role="button"],[role="menuitem"],[role="option"],[role="tab"],[role="link"],[role="checkbox"],input,select,textarea,label,summary';
    const resolveTarget = t => {
      if (!t || t.nodeType !== 1) return t;
      try {
        let current = t;
        while (current && current.nodeType === 1) {
          const found = current.closest(INTERACTIVE_CLOSEST);
          if (found) return found;
          const root = current.getRootNode();
          current = root && root.host;
        }
        return t;
      } catch (e) { return t; }
    };

    const tableHeaders = table => {
      let h = headerCache.get(table);
      if (!h) { h = deepQueryAll('thead th, tr:first-child th, [role="columnheader"]', table).map(th => clean(th.innerText || th.textContent, 60)).slice(0, CFG.MAX_TABLE_COLS); headerCache.set(table, h); }
      return h;
    };
    const tableContext = el => {
      let row = null, table = null, cell = null, current = el;
      while (current && current.nodeType === 1 && !table) {
        if (!row && current.matches('tr,[role="row"]')) row = current;
        if (!cell && current.matches('td,th,[role="gridcell"],[role="columnheader"]')) cell = current;
        if (current.matches('table,[role="grid"],[role="table"],ag-grid,[class*="ag-root"]')) table = current;
        const root = current.getRootNode();
        current = current.parentElement || (root && root.host) || null;
      }
      if (!table) return null;
      const rows = deepQueryAll('tr,[role="row"]', table);
      const rowIndex = rows.indexOf(row);
      const td = cell;
      const cellIndex = td ? td.cellIndex : -1;
      const info = SelectorEngine.build(table);
      return { tableSelector: info.primarySelector, shadowPath: info.shadowPath, rowIndex, cellIndex, columnHeader: tableHeaders(table)[cellIndex] || '', rowText: clean(row && (row.innerText || row.textContent), 150) };
    };

    const brief = e => e ? { tag: e.localName, id: e.id || '', classes: [...(e.classList || [])].filter(SelectorEngine.isStableClass).slice(0, 4), role: e.getAttribute('role') || '', selector: SelectorEngine.robust(e).value } : null;
    const context = el => {
      const p = el.parentElement, gp = p && p.parentElement;
      const kids = [...el.children];
      const tags = {};
      kids.slice(0, 50).forEach(k => { tags[k.localName] = (tags[k.localName] || 0) + 1; });
      const sibs = p ? [...p.children] : [];
      const idx = sibs.indexOf(el);
      const sibBrief = s => s ? { tag: s.localName, text: clean(s.textContent, 40), selector: SelectorEngine.robust(s).value } : null;
      const r = el.getBoundingClientRect();
      const path = [];
      let c = el;
      while (c && c.nodeType === 1 && path.length < 12) {
        const sc = [...(c.classList || [])].filter(SelectorEngine.isStableClass)[0];
        path.unshift(c.localName + (c.id && !SelectorEngine.isNumericLikeId(c.id) ? '#' + c.id : '') + (sc ? '.' + sc : ''));
        c = c.parentElement;
      }
      const form = el.closest && el.closest('form');
      return {
        parent: brief(p), grandParent: brief(gp),
        childrenSummary: { count: kids.length, tags, sample: kids.slice(0, 5).map(k => ({ tag: k.localName, text: clean(k.textContent, 40) })) },
        siblingsSummary: { count: sibs.length, index: idx, previous: sibBrief(sibs[idx - 1]), next: sibBrief(sibs[idx + 1]) },
        domPath: path.join(' > '),
        relativePosition: { indexInParent: idx, siblingsCount: sibs.length, rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, viewportPct: { x: +(r.x / (innerWidth || 1) * 100).toFixed(1), y: +(r.y / (innerHeight || 1) * 100).toFixed(1) } },
        form: form ? SelectorEngine.robust(form).value : '',
        nearestHeading: (() => { const h = el.closest && el.closest('section,fieldset,form,div'); const hh = h && h.querySelector('h1,h2,h3,h4,legend'); return hh ? clean(hh.textContent, 80) : ''; })()
      };
    };

    const fieldInfo = el => ({ ...elementInfo(el), required: !!el.required, disabled: !!el.disabled, value: valueOf(el) });
    const formInfo = (form, index) => {
      const els = deepQueryAll('input,select,textarea,button,fieldset,output,[role="textbox"],[role="combobox"]', form);
      const formSelectorInfo = SelectorEngine.build(form);
      const requiredFields = els.filter(el => !!el.required).length;
      const hiddenFields = els.filter(el => el.type === 'hidden').length;
      const submitButtons = form.querySelectorAll("button[type='submit'], input[type='submit'], button:not([type])").length;
      return {
        index, id: form.id || '', name: form.getAttribute('name') || '', method: (form.method || 'GET').toUpperCase(),
        action: SecurityManager.redactUrl(form.action || location.href), enctype: form.enctype || '', selector: formSelectorInfo.primarySelector,
        shadowPath: formSelectorInfo.shadowPath, playwrightSelector: formSelectorInfo.playwrightSelector,
        formSummary: { requiredFields, hiddenFields, submitButtons, target: form.target || '', action: SecurityManager.redactUrl(form.action || location.href) },
        fields: els.slice(0, CFG.MAX_ITEMS).map(fieldInfo)
      };
    };

    const tableInfo = (table, index) => {
      const rows = deepQueryAll('tr,[role="row"]', table);
      const headers = tableHeaders(table).filter(Boolean);
      const sampleRows = rows.slice(0, CFG.MAX_TABLE_ROWS).map(row => deepQueryAll('td,th,[role="gridcell"],[role="columnheader"]', row).slice(0, CFG.MAX_TABLE_COLS).map(cell => clean(cell.innerText || cell.textContent)));
      const containsLinks = !!deepQueryAll('a[href]', table).length;
      const containsButtons = !!deepQueryAll("button, [role='button'], input[type='button'], input[type='submit']", table).length;
      const containsInputs = !!deepQueryAll('input, select, textarea', table).length;
      const sortableLikely = !!deepQueryAll("th[class*='sort' i], th[aria-sort], th.sortable, th[onclick], [aria-sort]", table).length;
      const wrapper = table.closest('div') || table.parentElement;
      const filterableLikely = !!(deepQueryAll('thead input, thead select', table).length || (wrapper && deepQueryAll("input[type='search'], [class*='filter' i] input", wrapper).length));
      const paginationLikely = !!((wrapper && deepQueryAll("[class*='pagination' i], [class*='paginator' i], [class*='pager' i]", wrapper).length) || (table.id && deepQueryOne(`[aria-controls="${CSS.escape(table.id)}"]`)));
      const selectorInfo = SelectorEngine.build(table);
      return {
        index, id: table.id || '', class: clean(table.className, CFG.MAX_ATTR), selector: SelectorEngine.selector(table), shadowPath: selectorInfo.shadowPath, visible: visible(table),
        gridType: table.getAttribute('role') || (table.localName.includes('-') ? table.localName : ''),
        rows: rows.length, columns: rows.length ? deepQueryAll('td,th,[role="gridcell"],[role="columnheader"]', rows[0]).length : 0, headers, sampleRows,
        containsLinks, containsButtons, containsInputs, sortableLikely, filterableLikely, paginationLikely
      };
    };

    /* Deteccion tecnologica (original + Material UI y otros) */
    const detectFrameworks = () => {
      const found = [];
      const push = (name, version, confidence) => found.push({ name, version: version || '', confidence });
      try { if (window.jQuery || window.$) push('jQuery', (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) || '', 'high'); } catch (e) {}
      try { if (window.jQuery && window.jQuery.fn && window.jQuery.fn.dataTable) push('DataTables', '', 'high'); } catch (e) {}
      try { if (deepQueryOne('table.dataTable, [class*="dataTables_wrapper"]')) push('DataTables', '', 'medium'); } catch (e) {}
      try { if (window.React) push('React', window.React.version || '', 'high'); } catch (e) {}
      try { if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || deepQueryOne('[data-reactroot]')) push('React', '', 'medium'); } catch (e) {}
      try { if (window.Vue) push('Vue', window.Vue.version || '', 'high'); } catch (e) {}
      try { if (window.__VUE__ || deepQueryOne('[data-v-app]') || all().slice(0, 500).some(el => [...el.attributes].some(a => a.name.startsWith('data-v-')))) push('Vue', '', 'medium'); } catch (e) {}
      try { if (window.angular) push('AngularJS', (window.angular.version && window.angular.version.full) || '', 'high'); } catch (e) {}
      try { const ngHost = deepQueryOne('[ng-version]'); if (ngHost) push('Angular', ngHost.getAttribute('ng-version') || '', 'high'); } catch (e) {}
      try {
        const hasBootstrapAsset = !!deepQueryOne('link[href*="bootstrap"], script[src*="bootstrap"]');
        const hasBootstrapClasses = !!deepQueryOne('.container, .row, [class*="col-"], .btn-primary');
        if (window.bootstrap || hasBootstrapAsset) push('Bootstrap', '', 'high');
        else if (hasBootstrapClasses) push('Bootstrap', '', 'low');
      } catch (e) {}
      try { if (window.PrimeFaces) push('PrimeFaces', '', 'high'); } catch (e) {}
      try { if (deepQueryOne('script[src*="primefaces"], .ui-widget, [id*="j_idt"]')) push('PrimeFaces', '', 'medium'); } catch (e) {}
      try { if (deepQueryOne('input[name="__VIEWSTATE"]')) push('ASP.NET WebForms', '', 'high'); } catch (e) {}
      try { if (deepQueryOne('input[name="__RequestVerificationToken"]') && !deepQueryOne('input[name="__VIEWSTATE"]')) push('ASP.NET MVC', '', 'medium'); } catch (e) {}
      try { if (window.Ext) push('ExtJS', window.Ext.version || '', 'high'); } catch (e) {}
      try { if (window.ko) push('Knockout', window.ko.version || '', 'high'); } catch (e) {}
      try { if (deepQueryOne('[class*="MuiButton"], [class*="MuiPaper"], [class*="MuiInput"]')) push('Material UI', '', 'medium'); } catch (e) {}
      try { if (deepQueryOne('[class^="mat-"], [class*=" mat-"], mat-form-field, .cdk-overlay-container')) push('Angular Material', '', 'medium'); } catch (e) {}
      try { if (window.__NEXT_DATA__) push('Next.js', '', 'high'); } catch (e) {}
      try { if (window.__NUXT__) push('Nuxt', '', 'high'); } catch (e) {}
      try {
        const tags = all().filter(el => isCustomElement(el)).map(el => el.localName);
        if (tags.some(tag => /^(bbva-|cells-)/i.test(tag))) push('BBVA Cells / Web Components', '', 'high');
        if (tags.some(tag => /^cells-/i.test(tag))) push('Polymer / Cells', '', 'medium');
        if (tags.some(tag => /^(lit-|vaadin-)/i.test(tag))) push('Lit / Web Components', '', 'low');
        if (tags.some(tag => /(^|-)stencil/i.test(tag))) push('Stencil', '', 'low');
      } catch (e) {}
      const seen = new Set();
      return found.filter(f => (seen.has(f.name) ? false : (seen.add(f.name), true)));
    };

    const FRAMEWORK_GLOBAL_NAMES = new Set(['$', 'jQuery', 'angular', 'Vue', 'React', 'ReactDOM', 'Ext', 'ko', 'Backbone', '_', 'moment', 'axios', 'System', 'define', 'require', 'regeneratorRuntime', 'Zone', 'PrimeFaces', 'bootstrap', 'Popper', 'webpackJsonp', '__webpack_require__', 'Symbol', 'Proxy', 'Reflect', '__MacroRecorderAI__']);
    const detectGlobalFunctions = () => {
      let nativeNames = new Set();
      try {
        const probe = document.createElement('iframe');
        probe.style.display = 'none';
        document.documentElement.appendChild(probe);
        nativeNames = new Set(Object.getOwnPropertyNames(probe.contentWindow));
        probe.parentNode.removeChild(probe);
      } catch (e) {}
      const results = [];
      for (const name of Object.getOwnPropertyNames(window)) {
        if (nativeNames.has(name) || FRAMEWORK_GLOBAL_NAMES.has(name)) continue;
        if (/^(webpack|__|on[A-Z])/.test(name)) continue;
        let value;
        try { value = window[name]; } catch (e) { continue; }
        if (typeof value !== 'function') continue;
        if (/^\s*class\s/.test(Function.prototype.toString.call(value))) continue;
        let preview = '';
        try { preview = clean(Function.prototype.toString.call(value), 200); } catch (e) {}
        results.push({ name, parameterCount: value.length, preview });
        if (results.length >= CFG.MAX_ITEMS) break;
      }
      return results;
    };

    const extractApiCandidates = text => {
      const callPattern = /(fetch|axios(?:\.\w+)?|\$\.ajax|XMLHttpRequest)\s*\(/g;
      const found = new Set();
      let m;
      while ((m = callPattern.exec(text)) && found.size < 300) {
        const snippet = text.slice(m.index, m.index + 220);
        const urlMatch = snippet.match(/(['"`])((?:https?:\/\/|\/)[^'"`]{2,200})\1/);
        if (urlMatch) found.add(urlMatch[2]);
      }
      return [...found];
    };

    const ACTION_KEYWORDS = ['Guardar', 'Eliminar', 'Buscar', 'Validar', 'Enviar', 'Reenviar', 'Archivar', 'Importar', 'Exportar', 'Imprimir', 'Descargar', 'Cargar', 'Filtrar', 'Ordenar', 'Responder', 'Nuevo', 'Agregar', 'Cancelar', 'Actualizar', 'Confirmar', 'Aceptar', 'Editar', 'Modificar', 'Cerrar'];
    const NORMALIZED_KEYWORDS = ACTION_KEYWORDS.map(k => ({ label: k, norm: normalizeText(k) }));
    const matchActionKeyword = label => {
      if (!label) return null;
      const norm = normalizeText(label);
      const found = NORMALIZED_KEYWORDS.find(k => new RegExp('\\b' + k.norm + '\\b').test(norm));
      return found ? found.label : null;
    };
    const inferAction = el => {
      for (const c of [el.getAttribute('aria-label') || '', el.getAttribute('title') || '', textOf(el, 61)]) {
        if (!c || c.length > 60) continue;
        const match = matchActionKeyword(c);
        if (match) return match;
      }
      return 'Unknown';
    };

    /* Inspeccion estatica completa (todas las secciones del Page_inspector original). Se ejecuta una vez al finalizar. */
    const inspect = () => {
      _all = null;
      const page = { title: document.title, url: SecurityManager.redactUrl(location.href), origin: location.origin, pathname: location.pathname, domain: location.hostname, readyState: document.readyState };
      const frameworks = detectFrameworks();
      const globalFunctions = detectGlobalFunctions();
      const forms = select('form').map(formInfo);
      const formSummary = {
        totalForms: forms.length, requiredFields: forms.reduce((a, f) => a + f.formSummary.requiredFields, 0),
        hiddenFields: forms.reduce((a, f) => a + f.formSummary.hiddenFields, 0), submitButtons: forms.reduce((a, f) => a + f.formSummary.submitButtons, 0)
      };
      const interactiveSelector = "input,select,textarea,button,a,[role='button'],[onclick],[onchange],[onsubmit],[ondblclick]";
      const interactive = select(interactiveSelector).slice(0, CFG.MAX_ITEMS).map(el => ({
        ...elementInfo(el), value: 'value' in el ? valueOf(el) : '', href: SecurityManager.redactUrl(el.href || ''), target: el.target || '',
        disabled: 'disabled' in el ? !!el.disabled : false, checked: 'checked' in el ? !!el.checked : false, required: 'required' in el ? !!el.required : false,
        events: { onclick: clean(el.getAttribute('onclick')), onchange: clean(el.getAttribute('onchange')), onsubmit: clean(el.getAttribute('onsubmit')), ondblclick: clean(el.getAttribute('ondblclick')) }
      }));
      const inputs = select('input').slice(0, CFG.MAX_ITEMS).map(el => ({
        ...elementInfo(el), inputType: el.type, value: valueOf(el), autocomplete: el.autocomplete || '', checked: !!el.checked, disabled: !!el.disabled, readonly: !!el.readOnly, required: !!el.required
      }));
      const selects = select('select').slice(0, CFG.MAX_ITEMS).map(el => ({
        ...elementInfo(el), value: valueOf(el), options: [...el.options].slice(0, 100).map(o => ({ value: o.value, text: clean(o.textContent), selected: o.selected }))
      }));
      const buttons = select("button, input[type='button'], input[type='submit'], input[type='reset'], [role='button']").slice(0, CFG.MAX_ITEMS).map(el => ({
        ...elementInfo(el), buttonType: el.getAttribute('type') || el.type || 'button', value: valueOf(el), onclick: clean(el.getAttribute('onclick')),
        formAction: el.getAttribute('formaction') || '', formMethod: el.getAttribute('formmethod') || ''
      }));
      const links = select('a[href]').slice(0, CFG.MAX_ITEMS).map(el => ({
        text: clean(el.innerText), href: SecurityManager.redactUrl(el.href), target: el.target || '', id: el.id || '', name: el.getAttribute('name') || '',
        onclick: clean(el.getAttribute('onclick')), selector: SelectorEngine.selector(el)
      }));
      const tableEls = select('table,[role="table"],[role="grid"],[class*="ag-root"],ag-grid,[class*="grid-container" i]');
      const tables = tableEls.map(tableInfo).filter(t => t.visible || t.id || t.headers.length || t.rows > 1).slice(0, 300);
      const scripts = select('script').map((s, index) => ({
        index, src: s.src || '', type: s.type || '', async: !!s.async, defer: !!s.defer, inline: !s.src, inlinePreview: s.src ? '' : clean(s.textContent, 300)
      }));
      const iframes = select('iframe,frame').map((iframe, index) => {
        const src = SecurityManager.redactUrl(iframe.src || '');
        let declaredOrigin = '';
        try { declaredOrigin = new URL(iframe.src || '', iframe.ownerDocument.location.href).origin; } catch (e) {}
        const base = { index, id: iframe.id || '', name: iframe.name || '', src, title: iframe.title || '', sandbox: iframe.getAttribute('sandbox') || '', allow: iframe.getAttribute('allow') || '', selector: SelectorEngine.selector(iframe), sameOrigin: false, declaredOrigin };
        try {
          const d = iframe.contentDocument;
          if (d) {
            base.sameOrigin = d.location.origin === iframe.ownerDocument.location.origin;
            base.innerTitle = d.title || '';
            base.innerForms = deepQueryAll('form', d).length;
            base.innerInputs = deepQueryAll('input', d).length;
            base.innerLinks = deepQueryAll('a[href]', d).length;
            base.innerTables = deepQueryAll('table,[role="grid"],[role="table"]', d).length;
            base.innerShadowHosts = getAllElementsDeep(d).filter(el => !!el.shadowRoot).length;
          } else if (declaredOrigin && declaredOrigin !== iframe.ownerDocument.location.origin) base.accessError = 'cross-origin';
        } catch (e) { base.accessError = clean(e.message, 150); }
        return base;
      });
      const javascriptElements = all().filter(el => [...el.attributes].some(a => a.name.toLowerCase().startsWith('on'))).slice(0, CFG.MAX_ITEMS).map(el => {
        const events = {};
        for (const a of el.attributes) if (a.name.toLowerCase().startsWith('on')) events[a.name] = clean(a.value, 300);
        return { ...elementInfo(el), events };
      });
      const sourceText = (document.documentElement.outerHTML.slice(0, 2000000) + '\n' + scripts.filter(s => s.inlinePreview).map(s => s.inlinePreview).join('\n') + '\n' + all().filter(el => el.localName === 'script').map(el => el.textContent || '').join('\n').slice(0, 1000000));
      const possibleUrls = [...new Set((sourceText.match(/https?:\/\/[^\s"'<>]+|\/[A-Za-z0-9_\-./?=&%]+/g) || []).map(u => u.replace(/[),;]+$/, '')))].slice(0, 500).map(SecurityManager.redactUrl);
      const staticApiUrls = extractApiCandidates(sourceText);
      const ids = select('[id]').map(el => ({ id: el.id, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name: el.getAttribute('name') || '', text: textOf(el), selector: SelectorEngine.selector(el) })).slice(0, CFG.MAX_ITEMS);
      const names = select('[name]').map(el => ({ name: el.getAttribute('name'), tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', id: el.id || '', value: 'value' in el ? valueOf(el) : '', selector: SelectorEngine.selector(el) })).slice(0, CFG.MAX_ITEMS);
      const visibleText = select('h1,h2,h3,h4,h5,label,legend,button,th,span,div,td,[role="heading"],[role="button"],[role="menuitem"]').slice(0, 4000).filter(visible)
        .map(el => clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name') || textOf(el) || el.textContent)).filter(t => t && t.length >= 2 && t.length <= CFG.MAX_TEXT && !/^[\d\s.,%$€-]+$/.test(t));
      const uiText = [...new Set(visibleText)].slice(0, 500);
      const actions = select("button, input[type='button'], input[type='submit'], a[href], [role='button'], [role='menuitem'], [onclick]").slice(0, CFG.MAX_ITEMS)
        .filter(el => visible(el) && !SelectorEngine.isFrameworkNoise(el))
        .map(el => { const action = inferAction(el); const locator = SelectorEngine.build(el); return action === 'Unknown' ? null : { action, selector: locator.primarySelector, playwrightSelector: locator.playwrightSelector, shadowPath: locator.shadowPath, trigger: 'click' }; })
        .filter(Boolean).filter((it, i, arr) => arr.findIndex(x => x.selector === it.selector && x.action === it.action) === i);
      const elements = all();
      const lightElements = [...document.querySelectorAll('*')].filter(el => !isInternalRecorderNode(el));
      const internalRecorderElements = getAllElementsDeep(document).filter(isInternalRecorderNode).map(el => ({ tag: el.localName, id: el.id || '', role: el.getAttribute('role') || '', selector: el.id ? '#' + CSS.escape(el.id) : el.localName }));
      const shadowElements = elements.filter(el => { const root = el.getRootNode(); return !!(root && root.host); });
      const shadowHosts = elements.filter(el => !!el.shadowRoot).map(el => {
        let depth = 1, root = el.getRootNode();
        while (root && root.host) { depth++; root = root.host.getRootNode(); }
        const info = SelectorEngine.build(el);
        return { tag: el.localName, depth, children: el.children.length, shadowChildren: getAllElementsDeep(el.shadowRoot).length, selector: info.primarySelector, shadowPath: info.shadowPath };
      });
      const customElementInventory = elements.filter(isCustomElement).map(el => {
        let registered = false;
        try { registered = !!(window.customElements && customElements.get(el.localName)); } catch (e) {}
        return { tag: el.localName, isCustomElement: true, registered, shadowRoot: !!el.shadowRoot, childrenInsideShadow: shadowChildCount(el), selector: SelectorEngine.build(el).primarySelector };
      }).slice(0, CFG.MAX_ITEMS);
      const microfrontendTags = /(^|-)dashboard-page$|^legacy-page$|bbva.*(dashboard|app-template)|cells-/i;
      const microfrontends = elements.filter(el => microfrontendTags.test(el.localName)).slice(0, 100).map(el => ({
        type: 'microfrontend', tag: el.localName, children: el.children.length,
        shadowChildren: shadowChildCount(el), selector: SelectorEngine.build(el).primarySelector,
        loadedScripts: scripts.filter(s => s.src && s.src.toLowerCase().includes(el.localName)).map(s => s.src).slice(0, 10),
        childComponents: getAllElementsDeep(el).filter(child => child !== el && isCustomElement(child)).map(child => child.localName).filter((tag, i, arr) => arr.indexOf(tag) === i).slice(0, 30)
      }));
      const loadedModuleCandidates = [];
      try {
        performance.getEntriesByType('resource').filter(entry => /\.(?:m?js)(?:[?#]|$)/i.test(entry.name) && /(bbva|cells|solution|accounts|cards|payments|microfrontend)/i.test(entry.name)).slice(-200).forEach(entry => {
          loadedModuleCandidates.push({ source: 'performance-resource', url: SecurityManager.redactUrl(entry.name), initiatorType: entry.initiatorType, durationMs: Math.round(entry.duration) });
        });
      } catch (e) {}
      if (typeof window.loadCellsPage === 'function') {
        let preview = '';
        try { preview = Function.prototype.toString.call(window.loadCellsPage); } catch (e) {}
        const moduleNames = [...new Set(preview.match(/bbva-btge-[a-z0-9-]+-solution/gi) || [])];
        moduleNames.forEach(module => loadedModuleCandidates.push({ source: 'loadCellsPage-definition', module, confidence: 'candidate' }));
      }
      const actionableEls = select("button,a[href],input,select,textarea,[role='button'],[role='link'],[role='menuitem'],[role='checkbox'],[role='combobox']");
      const actionableCount = actionableEls.length;
      const shadowActionableCount = actionableEls.filter(el => { const root = el.getRootNode(); return !!(root && root.host); }).length;
      const deepDomAnalysis = {
        domElements: elements.length, lightDomElements: lightElements.length, shadowHosts: shadowHosts.length,
        shadowElements: shadowElements.length, customElements: elements.filter(isCustomElement).length,
        iframes: select('iframe,frame').length, actionableControls: actionableCount,
        tablesDetected: tableEls.length, formsDetected: forms.length,
        internalRecorderElements: internalRecorderElements.length,
        incrementalScans: [...scanSnapshots],
        traditional: { elements: lightElements.length, buttons: [...document.querySelectorAll("button,input[type='button'],input[type='submit'],[role='button']")].length, inputs: [...document.querySelectorAll('input')].length, tables: [...document.querySelectorAll('table')].length },
        shadow: { hosts: shadowHosts.length, elements: shadowElements.length, controls: shadowActionableCount, tables: tableEls.filter(el => { const root = el.getRootNode(); return !!(root && root.host); }).length }
      };
      const summary = {
        totalElements: elements.length, forms: forms.length, inputs: select('input').length, selects: select('select').length,
        textareas: select('textarea').length, buttons: select("button, input[type='button'], input[type='submit'], input[type='reset'], [role='button']").length,
        links: select('a[href]').length, tables: tableEls.length, scripts: scripts.length, iframes: select('iframe,frame').length,
        elementsWithInlineEvents: javascriptElements.length
      };
      const menus = select("[role='menu'],[role='menubar'],[role='tablist'],nav,[role='listbox'],[role='grid'],[role='treegrid']").slice(0, 100)
        .map(el => ({ tag: el.localName, role: el.getAttribute('role') || '', selector: SelectorEngine.selector(el), shadowPath: SelectorEngine.build(el).shadowPath, items: deepQueryAll("a,button,[role='menuitem'],[role='tab'],[role='option'],[role='row']", el).length }));
      return { page, frameworks, globalFunctions, forms, formSummary, interactive, inputs, selects, buttons, links, tables, scripts, iframes, javascriptElements, possibleUrls, staticApiUrls, ids, names, uiText, actions, summary, menus, interactiveSelector, deepDomAnalysis, shadowHosts, customElements: customElementInventory, microfrontends, loadedModuleCandidates, applicationElements: { total: elements.length, controls: actionableCount, forms: forms.length, tables: tableEls.length }, internalRecorderElements };
    };

    /* Candidatos de automatizacion, resumen y plantillas (originales) */
    const deriveAutomation = (insp, apiCandidates, workflowCandidates, eventListeners) => {
      const PRIORITY = new Set(['Guardar', 'Buscar', 'Validar', 'Descargar', 'Exportar', 'Enviar']);
      const candidateEls = select("button, a[href], input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [role='textbox'], [role='combobox'], [role='grid'], [role='table'], table, ag-grid, [class*='ag-root']");
      const scored = candidateEls.filter(el => {
        if (!visible(el) || SelectorEngine.isFrameworkNoise(el)) return false;
        if ((el.localName === 'table' || el.getAttribute('role') === 'grid' || el.getAttribute('role') === 'table' || el.localName === 'ag-grid') && deepQueryAll('tr,[role="row"]', el).length <= 1) return false;
        return true;
      }).map(el => {
        const sel = SelectorEngine.build(el);
        const tag = el.tagName.toLowerCase();
        const actionType = tag === 'table' || el.getAttribute('role') === 'grid' || el.getAttribute('role') === 'table' || tag === 'ag-grid'
          ? 'grid' : (tag === 'a' ? 'link' : (tag === 'input' || tag === 'select' || tag === 'textarea' || el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox' ? 'input' : 'button'));
        const text = SecurityManager.isSensitiveField(el) ? '' : clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name') || el.innerText || el.textContent || el.value || '', 80);
        let score = sel.selectorReliabilityScore;
        if (actionType === 'button') { const m = matchActionKeyword(text) || matchActionKeyword(el.getAttribute('title') || ''); if (m && PRIORITY.has(m)) score = Math.min(100, score + 10); }
        if (actionType === 'grid' && deepQueryAll('tr,[role="row"]', el).length > 1) score = Math.min(100, score + 5);
        return { text, selector: sel.primarySelector, playwrightSelector: sel.playwrightSelector, shadowPath: sel.shadowPath, selectorScore: score, actionType };
      }).filter(i => i.selector && i.selectorScore >= 50).sort((a, b) => b.selectorScore - a.selectorScore);
      const automationCandidates = [];
      const seen = new Set();
      for (const it of scored) { if (seen.has(it.selector)) continue; seen.add(it.selector); automationCandidates.push(it); if (automationCandidates.length >= 100) break; }

      const automationSummary = {
        application: clean(document.title, 80).split(/\s[-:|]\s/)[0].trim() || location.hostname,
        keyFields: automationCandidates.filter(c => c.actionType === 'input').slice(0, 10).map(c => c.selector),
        keyActions: automationCandidates.filter(c => c.actionType === 'button').slice(0, 10).map(c => c.selector),
        keyFieldDetails: automationCandidates.filter(c => c.actionType === 'input').slice(0, 10).map(c => ({ selector: c.selector, playwrightSelector: c.playwrightSelector, text: c.text })),
        keyActionDetails: automationCandidates.filter(c => c.actionType === 'button').slice(0, 10).map(c => ({ selector: c.selector, playwrightSelector: c.playwrightSelector, text: c.text })),
        likelyWorkflows: [...new Set(insp.actions.map(a => a.action))].slice(0, 8),
        keyEndpoints: apiCandidates.slice(0, 10).map(c => c.endpoint)
      };
      const f = automationCandidates.find(c => c.actionType === 'input') || null;
      const a = automationCandidates.find(c => c.actionType === 'button') || null;
      const fm = insp.forms.length ? insp.forms[0] : null;
      const javascript = [], playwright = [];
      const jsPath = c => ['document', ...c.shadowPath.map(s => `.querySelector('${s}').shadowRoot`), `.querySelector('${c.selector}')`].join('');
      if (f) { javascript.push(`${jsPath(f)}.value = 'texto'; ${jsPath(f)}.dispatchEvent(new Event('input', { bubbles: true, composed: true }));`); playwright.push(`await page.locator('${f.playwrightSelector}').fill('texto');`); }
      if (a) { javascript.push(`${jsPath(a)}.click();`); playwright.push(`await page.locator('${a.playwrightSelector}').click();`); }
      if (fm) {
        const formPath = ['document', ...(fm.shadowPath || []).map(s => `.querySelector('${s}').shadowRoot`), `.querySelector('${fm.selector}')`].join('');
        javascript.push(`const f = ${formPath}; f.requestSubmit ? f.requestSubmit() : f.submit();`);
        playwright.push(`await page.locator('${fm.playwrightSelector || fm.selector}').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.submit());`);
      }
      const automationTemplates = { playwright, javascript };

      const automationReadiness = (() => {
        let score = 0;
        score += Math.min(30, insp.forms.length * 5);
        score += Math.min(25, insp.interactive.length * 0.5);
        score += Math.min(15, apiCandidates.length * 1.5);
        score += Math.min(15, eventListeners.length * 0.3);
        score += Math.min(15, insp.ids.length * 0.1);
        return { score: Math.max(0, Math.min(100, Math.round(score))), formsDetected: insp.forms.length, actionableControls: insp.interactive.length, apiCandidates: apiCandidates.length, eventListeners: eventListeners.length };
      })();

      const importantSelectors = (() => {
        const els = select("input, select, textarea, button, a[href], [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [role='combobox'], [role='textbox'], [id]");
        const seenS = new Set(), candidates = [];
        for (const el of els) {
          if (!visible(el) || SelectorEngine.isFrameworkNoise(el)) continue;
          const info = SelectorEngine.robust(el);
          if (info.quality !== 'high' && info.score < 80) continue;
          if (!info.value || seenS.has(info.value)) continue;
          seenS.add(info.value);
          const tag = el.tagName.toLowerCase();
          candidates.push({ el, selector: info.value, type: tag === 'a' ? 'link' : (tag === 'input' || tag === 'select' || tag === 'textarea' || el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox' ? 'input' : 'button'), text: SecurityManager.isSensitiveField(el) ? '' : clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || el.innerText || el.textContent || el.value || '', 80), score: info.score });
        }
        return candidates.sort((x, y) => y.score - x.score).slice(0, 50).map(candidate => {
          const info = SelectorEngine.build(candidate.el);
          return { selector: info.primarySelector, playwrightSelector: info.playwrightSelector, shadowPath: info.shadowPath, type: candidate.type, text: candidate.text, score: info.selectorReliabilityScore };
        });
      })();
      const scoreBySel = new Map(automationCandidates.map(c => [c.selector, c.selectorScore]));
      const importantActions = (() => {
        const out = [], s = new Set();
        for (const it of insp.actions.map(x => ({ ...x, score: scoreBySel.has(x.selector) ? scoreBySel.get(x.selector) : 50 })).sort((x, y) => y.score - x.score)) {
          if (s.has(it.selector)) continue; s.add(it.selector); out.push(it); if (out.length >= 50) break;
        }
        return out;
      })();
      const importantTables = [...insp.tables].sort((x, y) => y.rows - x.rows).slice(0, 20).map(t => ({ selector: t.selector, headers: t.headers, rows: t.rows, columns: t.columns, containsLinks: t.containsLinks, containsButtons: t.containsButtons, containsInputs: t.containsInputs }));
      return { automationCandidates, automationSummary, automationTemplates, automationReadiness, importantSelectors, importantActions, importantTables };
    };

    return { visible, attrs, dataAttrs, elementInfo, actionInfo, resolveTarget, tableContext, tableInfo, formInfo, context, inspect, deriveAutomation, matchActionKeyword, valueOf, scheduleScans, scheduleMutationScan, scanSnapshots };
  })();

  /* =====================================================================
     NetworkAnalyzer (hooks fetch/XHR originales + tiempos y correlacion)
     ===================================================================== */
  const NetworkAnalyzer = (() => {
    const origAdd = EventTarget.prototype.addEventListener;
    let origFetch = null, OrigXHR = window.XMLHttpRequest, xo = null, xs = null, xh = null, hooked = false;
    const xhrEntries = new WeakMap();
    const isNoiseUrl = url => NOISE_URL_REGEX.test(url);
    const pathOf = url => { try { return new URL(url, location.href).pathname; } catch (e) { return String(url).split('?')[0]; } };

    const newEntry = (source, method, url, headers, body) => {
      const now = Date.now();
      const safeUrl = SecurityManager.redactUrl(clean(url, 500));
      const e = {
        id: 'req-' + (S.seq.req++), source, method: String(method || 'GET').toUpperCase(), url: safeUrl, path: pathOf(url),
        queryString: (() => { try { return SecurityManager.redactUrl(new URL(url, location.href).search || ''); } catch (er) { return ''; } })(),
        headers: SecurityManager.redactHeaders(headers), requestBodyPreview: body ? SecurityManager.redactBody(body) : '',
        responseStatus: null, responseSize: null, responseContentType: '', download: false,
        timestamp: now, startTimestamp: iso(now), endTimestamp: null, durationMs: null, error: '',
        triggeredByAction: (S.lastActionTs && now - S.lastActionTs <= CFG.ACTION_CORRELATION_WINDOW_MS) ? S.lastActionStep : null
      };
      if (S.network.length < CFG.MAX_NETWORK) S.network.push(e);
      const timelineItem = RecordingManager.recordTimeline('apiCall', null, {
        requestId: e.id, method: e.method, url: e.url, status: null, durationMs: null, triggeredByAction: e.triggeredByAction
      }, e.triggeredByAction);
      if (timelineItem) e.timelineIndex = S.interactionTimeline.indexOf(timelineItem);
      UIManager.render();
      return e;
    };
    const finish = e => {
      const n = Date.now();
      e.endTimestamp = iso(n); e.durationMs = n - e.timestamp;
      const timelineItem = Number.isInteger(e.timelineIndex) && S.interactionTimeline[e.timelineIndex];
      if (timelineItem) timelineItem.detail = { ...timelineItem.detail, status: e.responseStatus, durationMs: e.durationMs, error: e.error || '' };
      StorageManager.schedule();
      UIManager.render();
    };
    const readHeaders = (e, get) => {
      try {
        e.responseContentType = clean(get('content-type') || '', 100);
        const cd = get('content-disposition') || '';
        e.download = /attachment/i.test(cd) || /octet-stream|pdf|zip|excel|spreadsheet|msword/i.test(e.responseContentType);
        const len = get('content-length');
        if (len) e.responseSize = Number(len);
      } catch (er) {}
    };
    const jsonKeys = text => {
      try { const j = JSON.parse(text); const o = Array.isArray(j) ? j[0] : j; if (o && typeof o === 'object') return Object.keys(o).filter(k => !SecurityManager.isSensitiveName(k)).slice(0, 15); } catch (e) {}
      return null;
    };

    const hook = () => {
      if (hooked) return;
      hooked = true;
      origFetch = window.fetch ? window.fetch.bind(window) : null;
      if (origFetch) {
        window.fetch = function (...args) {
          const [resource, init] = args;
          const method = (init && init.method) || (resource && resource.method) || 'GET';
          const url = typeof resource === 'string' ? resource : (resource && resource.url) || String(resource);
          let headers = {};
          try {
            const h = (init && init.headers) || (resource && resource.headers);
            if (h) headers = h instanceof Headers ? Object.fromEntries(h.entries()) : { ...h };
          } catch (e) {}
          const entry = newEntry('fetch', method, url, headers, init && init.body);
          const promise = origFetch(...args);
          promise.then(res => {
            entry.responseStatus = res.status;
            readHeaders(entry, n => res.headers.get(n));
            finish(entry);
            if (/json|text|xml|html/i.test(entry.responseContentType) && !entry.download) {
              try { res.clone().text().then(t => { entry.responseSize = t.length; const k = jsonKeys(t.slice(0, 1000000)); if (k) entry.responseJsonKeys = k; }).catch(() => {}); } catch (e) {}
            }
          }).catch(err => { entry.error = clean(err && err.message, 120); finish(entry); });
          return promise;
        };
      }
      if (OrigXHR) {
        xo = OrigXHR.prototype.open; xs = OrigXHR.prototype.send; xh = OrigXHR.prototype.setRequestHeader;
        OrigXHR.prototype.open = function (method, url, ...rest) {
          xhrEntries.set(this, { method, url: String(url), headers: {}, entry: null });
          return xo.call(this, method, url, ...rest);
        };
        OrigXHR.prototype.setRequestHeader = function (name, value) {
          const p = xhrEntries.get(this);
          if (p) p.headers[name] = value;
          return xh.call(this, name, value);
        };
        OrigXHR.prototype.send = function (body) {
          const p = xhrEntries.get(this);
          if (p) {
            const entry = newEntry('xhr', p.method, p.url, p.headers, body);
            const self = this;
            origAdd.call(this, 'loadend', () => {
              entry.responseStatus = self.status;
              readHeaders(entry, n => self.getResponseHeader(n));
              try { if (!self.responseType || self.responseType === 'text') { entry.responseSize = (self.responseText || '').length; const k = jsonKeys(self.responseText.slice(0, 1000000)); if (k) entry.responseJsonKeys = k; } } catch (e) {}
              finish(entry);
            });
          }
          return xs.call(this, body);
        };
      }
    };
    const unhook = () => {
      if (!hooked) return;
      hooked = false;
      if (origFetch) window.fetch = origFetch;
      if (OrigXHR && xo) { OrigXHR.prototype.open = xo; OrigXHR.prototype.send = xs; OrigXHR.prototype.setRequestHeader = xh; }
    };

    /* Correlacion original accion -> request (click/submit, ventana 4 s) */
    const buildActionNetworkMap = () => {
      const meaningful = S.actions.filter(a => ['click', 'change', 'submit', 'input'].includes(a.actionType));
      const used = new Set(), map = [];
      for (const it of meaningful) {
        const related = [];
        S.network.forEach((req, i) => {
          if (used.has(i)) return;
          const d = req.timestamp - it.timestampMs;
          if (d >= 0 && d <= CFG.ACTION_CORRELATION_WINDOW_MS) { related.push({ method: req.method, url: req.url, status: req.responseStatus, durationMs: req.durationMs }); used.add(i); }
        });
        if (related.length) map.push({
          action: { text: (it.element && (it.element.text || it.element.ariaLabel)) || '', selector: it.selectors ? it.selectors.primarySelector : '', playwrightSelector: it.selectors ? it.selectors.playwrightSelector : '', shadowPath: it.selectors ? it.selectors.shadowPath : [] },
          step: it.step, requests: related
        });
      }
      return map.slice(0, CFG.MAX_ITEMS);
    };

    const buildApiCandidates = staticApiUrls => {
      const aggregate = new Map();
      const categorize = (path, methods) => {
        const p = path.toLowerCase();
        if (/login|logon|auth|token|signin|sso/.test(p)) return 'AUTH';
        if (/search|query|find|filter/.test(p)) return 'SEARCH';
        if (/export/.test(p)) return 'EXPORT';
        if (/import|upload/.test(p)) return 'IMPORT';
        if (/download|file|blob|attachment/.test(p)) return 'FILE DOWNLOAD';
        if (methods.some(m => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m))) return 'CRUD';
        return 'READ';
      };
      const register = (url, method, req) => {
        if (!url || isNoiseUrl(url)) return;
        const path = pathOf(url);
        if (!path || path === '/') return;
        const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        const functionalGet = method === 'GET' && /\/(api|rest|graphql|service|data)\b/i.test(path);
        if (!mutating && !functionalGet && !(req && req.triggeredByAction)) return;
        if (!aggregate.has(path)) aggregate.set(path, { endpoint: path, methods: new Set(), frequency: 0, steps: new Set(), statuses: new Set(), durations: [] });
        const e = aggregate.get(path);
        e.methods.add(method); e.frequency += 1;
        if (req) { if (req.triggeredByAction) e.steps.add(req.triggeredByAction); if (req.responseStatus != null) e.statuses.add(req.responseStatus); if (req.durationMs != null) e.durations.push(req.durationMs); }
      };
      S.network.forEach(r => register(r.url, r.method, r));
      (staticApiUrls || []).forEach(u => register(u, 'GET', null));
      return [...aggregate.values()].map(e => {
        const methods = [...e.methods];
        return {
          endpoint: e.endpoint, methods, category: categorize(e.endpoint, methods), frequency: e.frequency, triggeredByActions: [...e.steps], statuses: [...e.statuses],
          avgDurationMs: e.durations.length ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.durations.length) : null
        };
      }).sort((a, b) => b.frequency - a.frequency).slice(0, CFG.MAX_ITEMS);
    };

    return { hook, unhook, isNoiseUrl, buildActionNetworkMap, buildApiCandidates };
  })();

  /* =====================================================================
     MutationAnalyzer
     ===================================================================== */
  const MutationAnalyzer = (() => {
    const observers = new Map();
    let originalAttachShadow = null, attachShadowWrapper = null, scanTimers = [];
    const REL_ATTRS = ['aria-expanded', 'aria-hidden', 'aria-selected', 'aria-checked', 'aria-busy', 'hidden', 'disabled', 'open', 'class'];
    const own = n => isInternalRecorderNode(n);

    const overlayKind = el => {
      const g = a => (el.getAttribute(a) || '').toLowerCase();
      const role = g('role');
      if (g('aria-modal') === 'true') return 'modal';
      if (el.localName === 'dialog' || role === 'dialog' || role === 'alertdialog' || /dialog/i.test(el.localName)) return 'dialog';
      if (role === 'tooltip') return 'tooltip';
      if (role === 'menu' || role === 'listbox') return 'dropdown';
      const c = typeof el.className === 'string' ? el.className : '';
      if (!c) return null;
      if (/modal/i.test(c) || /modal/i.test(el.localName)) return 'modal';
      if (/dialog/i.test(c)) return 'dialog';
      if (/popup|popover/i.test(c) || /popup|popover/i.test(el.localName)) return 'popup';
      if (/drawer|offcanvas/i.test(c) || /drawer/i.test(el.localName)) return 'drawer';
      if (/dropdown|select-menu|autocomplete|listbox/i.test(c) || /dropdown|listbox/i.test(el.localName)) return 'dropdown';
      if (/toast|snackbar|notification/i.test(c)) return 'toast';
      return null;
    };
    const INNER_OVERLAY = '[role="dialog"],[role="alertdialog"],dialog,[aria-modal="true"],.modal,.ui-dialog,.p-dialog,.mat-dialog-container,.cdk-overlay-pane';

    const snapshotOverlay = el => {
      try {
        const h = deepQueryAll('h1,h2,h3,h4,[class*="title" i],[class*="header" i]', el)[0];
        return {
          title: h ? clean(h.textContent, 100) : clean(el.getAttribute('aria-label') || '', 100), text: clean(el.innerText, 200),
          buttons: deepQueryAll('button,[role="button"],a[href]', el).slice(0, 10).map(b => ({ text: clean(b.innerText || b.getAttribute('aria-label'), 60), selector: SelectorEngine.robust(b).value, playwrightSelector: SelectorEngine.build(b).playwrightSelector })),
          fields: deepQueryAll('input,select,textarea', el).slice(0, 15).map(f => ({ name: f.name || f.id || '', type: f.type || f.localName, selector: SelectorEngine.robust(f).value, playwrightSelector: SelectorEngine.build(f).playwrightSelector }))
        };
      } catch (e) { return null; }
    };

    const push = (kind, el, extra, after, ts) => {
      if (S.mutations.length >= CFG.MAX_MUTATIONS) return;
      S.mutations.push({
        id: 'mut-' + (S.seq.mut++), timestamp: iso(ts), timestampMs: ts, afterAction: after, kind,
        selector: SelectorEngine.robust(el).value, tag: el.localName, text: SecurityManager.isSensitiveField(el) ? '' : clean(el.textContent, 80), ...extra
      });
    };

    const onMut = records => {
      if (S.status !== 'RECORDING') return;
      const ts = Date.now();
      const after = (S.lastActionTs && ts - S.lastActionTs <= CFG.MUTATION_ATTRIBUTION_MS) ? S.lastActionStep : null;
      const updates = new Map();
      const attrSeen = new Set();
      let budget = CFG.MAX_NODES_PER_BATCH, attrBudget = 20, significantChanges = 0;
      let applicationChanged = false;
      for (const m of records) {
        const t = m.target;
        if (!t || own(t)) continue;
        applicationChanged = true;
        if (m.type === 'childList') {
          significantChanges += m.addedNodes.length + m.removedNodes.length;
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1 || own(n)) continue;
            if (budget-- <= 0) break;
            for (const root of getAllRootsDeep(n)) { observeRoot(root); EventCaptureManager.observeRoot(root); }
            let kind = overlayKind(n), el = n;
            if (!kind) { const inner = deepQueryAll(INNER_OVERLAY, n)[0]; if (inner) { el = inner; kind = overlayKind(inner) || 'dialog'; } }
            if (kind) push('appeared', el, { category: kind, details: snapshotOverlay(el) }, after, ts);
            else if (t.nodeType === 1) { const u = updates.get(t) || { added: 0, removed: 0 }; u.added++; updates.set(t, u); }
          }
          for (const n of m.removedNodes) {
            if (n.nodeType !== 1 || own(n)) continue;
            if (budget-- <= 0) break;
            let kind = overlayKind(n), removed = n;
            if (!kind) { const inner = deepQueryAll(INNER_OVERLAY, n)[0]; if (inner) { removed = inner; kind = overlayKind(inner) || 'dialog'; } }
            if (kind) push('disappeared', removed, { category: kind }, after, ts);
            else if (t.nodeType === 1) { const u = updates.get(t) || { added: 0, removed: 0 }; u.removed++; updates.set(t, u); }
          }
        } else if (m.type === 'attributes' && attrBudget > 0 && t.nodeType === 1) {
          const name = m.attributeName;
          const cat = overlayKind(t);
          if (name === 'class' && !cat) continue;
          const key = t.localName + (t.id || '') + name;
          if (attrSeen.has(key)) continue;
          attrSeen.add(key); attrBudget--;
          const newVal = name === 'class' ? clean(t.getAttribute(name), 120) : t.getAttribute(name);
          if (newVal === m.oldValue) continue;
          push('attributeChange', t, { category: cat || 'attribute', details: { attribute: name, oldValue: clean(m.oldValue, 120), newValue: clean(newVal, 120) } }, after, ts);
        }
      }
      if (after != null) {
        updates.forEach((u, parent) => {
          if (u.added + u.removed < CFG.UPDATE_MIN_NODES && u.added === 0) return;
          push('componentUpdate', parent, { category: 'dynamicRender', details: { added: u.added, removed: u.removed } }, after, ts);
        });
      }
      if (significantChanges >= CFG.UPDATE_MIN_NODES) DOMAnalyzer.scheduleMutationScan();
      StorageManager.schedule();
      if (applicationChanged) UIManager.render();
    };

    const observeRoot = root => {
      const target = root && root.nodeType === 9 ? root.documentElement : root;
      if (!target || observers.has(target) || !target.nodeType) return;
      const mo = new MutationObserver(onMut);
      try {
        mo.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: REL_ATTRS, attributeOldValue: true });
        observers.set(target, mo);
      } catch (e) {}
    };

    const start = () => {
      if (observers.size) return;
      getAllRootsDeep(document).forEach(observeRoot);
      originalAttachShadow = Element.prototype.attachShadow;
      attachShadowWrapper = function (init) {
        const shadowRoot = originalAttachShadow.call(this, init);
        if (shadowRoot && shadowRoot.mode === 'open' && S.status === 'RECORDING') {
          observeRoot(shadowRoot);
          EventCaptureManager.observeRoot(shadowRoot);
        }
        return shadowRoot;
      };
      Element.prototype.attachShadow = attachShadowWrapper;
      [1000, 3000, 5000].forEach(delay => scanTimers.push(setTimeout(() => getAllRootsDeep(document).forEach(observeRoot), delay)));
    };
    const stop = () => {
      scanTimers.forEach(clearTimeout); scanTimers = [];
      observers.forEach((mo, target) => { try { onMut(mo.takeRecords()); } catch (e) {} mo.disconnect(); });
      observers.clear();
      if (attachShadowWrapper && Element.prototype.attachShadow === attachShadowWrapper) Element.prototype.attachShadow = originalAttachShadow;
      originalAttachShadow = null; attachShadowWrapper = null;
    };
    return { start, stop, observeRoot };
  })();

  /* =====================================================================
     StorageManager (persistencia sessionStorage/localStorage)
     ===================================================================== */
  const StorageManager = (() => {
    let timer = null;
    const serialize = () => ({
      v: 1, recId: S.recId, status: S.status, startedAt: S.startedAt, includeLegacy: S.includeLegacy,
      resumeCount: S.resumeCount, stepCounter: S.stepCounter, lastEventTs: S.lastEventTs, lastActionTs: S.lastActionTs, lastActionStep: S.lastActionStep, lastUrl: S.lastUrl,
      actions: S.actions, used: [...S.used.values()], formSnaps: [...S.formSnaps.entries()], tableSnaps: [...S.tableSnaps.entries()],
      navigation: S.navigation, mutations: S.mutations, network: S.network, interactionTimeline: S.interactionTimeline, customEvents: S.customEvents, loadedModules: S.loadedModules, cellsRouters: S.cellsRouters, seq: S.seq, savedAt: Date.now()
    });
    const write = (obj, handoffAt) => {
      const payload = Object.assign({}, obj, handoffAt ? { handoffAt } : {});
      let json = JSON.stringify(payload);
      try { sessionStorage.setItem(CFG.STORAGE_KEY, json); } catch (e) {
        try {
          payload.network = payload.network.slice(-300); payload.mutations = payload.mutations.slice(-300);
          sessionStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(payload));
        } catch (e2) {}
      }
      if (handoffAt) { try { localStorage.setItem(CFG.HANDOFF_KEY, json); } catch (e) {} }
    };
    const save = handoffAt => { clearTimeout(timer); timer = null; if (S.status === 'RECORDING' || S.status === 'PAUSED') write(serialize(), handoffAt); };
    const schedule = () => { if (timer || S.status !== 'RECORDING') return; timer = setTimeout(() => save(), 400); };
    const clear = () => { clearTimeout(timer); timer = null; try { sessionStorage.removeItem(CFG.STORAGE_KEY); } catch (e) {} try { localStorage.removeItem(CFG.HANDOFF_KEY); } catch (e) {} };
    const load = () => {
      let st = null;
      try { const s = sessionStorage.getItem(CFG.STORAGE_KEY); if (s) st = JSON.parse(s); } catch (e) {}
      if (!st) {
        try {
          const l = localStorage.getItem(CFG.HANDOFF_KEY);
          if (l) { const p = JSON.parse(l); if (p.handoffAt && Date.now() - p.handoffAt < 30000) st = p; localStorage.removeItem(CFG.HANDOFF_KEY); }
        } catch (e) {}
      }
      return st && st.v === 1 && ['RECORDING', 'PAUSED'].includes(st.status) ? st : null;
    };
    const restore = st => {
      Object.assign(S, {
        recId: st.recId, status: st.status, startedAt: st.startedAt, includeLegacy: st.includeLegacy, resumeCount: (st.resumeCount || 0) + 1, resumed: true,
        stepCounter: st.stepCounter, lastEventTs: st.lastEventTs, lastActionTs: st.lastActionTs, lastActionStep: st.lastActionStep, lastUrl: st.lastUrl,
        actions: st.actions || [], used: new Map((st.used || []).map(u => [u.key, u])), formSnaps: new Map(st.formSnaps || []), tableSnaps: new Map(st.tableSnaps || []),
        navigation: st.navigation || [], mutations: st.mutations || [], network: st.network || [], interactionTimeline: st.interactionTimeline || [], customEvents: st.customEvents || [], loadedModules: st.loadedModules || [], cellsRouters: st.cellsRouters || [], seq: st.seq || S.seq
      });
    };
    return { save, schedule, clear, load, restore };
  })();

  /* =====================================================================
     RecordingManager
     ===================================================================== */
  const RecordingManager = (() => {
    const recordTimeline = (type, el, detail = {}, actionStep = S.lastActionStep) => {
      if (S.status !== 'RECORDING' || S.interactionTimeline.length >= 4000 || isInternalRecorderNode(el)) return null;
      let selectors = null, text = '';
      if (el && el.nodeType === 1) {
        try { selectors = SelectorEngine.build(el); } catch (e) {}
        text = SecurityManager.isSensitiveField(el) ? '' : clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '', 120);
      }
      const ts = Date.now();
      const repeatKey = type === 'cellsRouter' ? `${detail.component || ''}|${detail.method || ''}|${(detail.arguments || []).slice(0, 2).join('|')}` : (type === 'customEvent' ? String(detail.eventName || '') : '');
      const previous = S.interactionTimeline[S.interactionTimeline.length - 1];
      if (repeatKey && previous && previous.type === type && previous.repeatKey === repeatKey && ts - previous.timestampMs <= 100) {
        previous.repeatCount = (previous.repeatCount || 1) + 1;
        return previous;
      }
      const item = {
        timestamp: iso(ts), timestampMs: ts, type, text, ...(repeatKey ? { repeatKey, repeatCount: 1 } : {}),
        selector: selectors ? selectors.primarySelector : '',
        playwrightSelector: selectors ? selectors.playwrightSelector : '',
        shadowPath: selectors ? selectors.shadowPath : [],
        frameContext: el && el.nodeType === 1 ? frameContextOf(el) : { isTop: true, frameUrl: SecurityManager.redactUrl(location.href), depth: 0 },
        actionStep: actionStep || null, detail: SecurityManager.sanitize(detail)
      };
      S.interactionTimeline.push(item);
      StorageManager.schedule();
      return item;
    };

    const frameContextOf = el => {
      const doc = (el && el.ownerDocument) || document;
      const win = doc.defaultView;
      if (!win || win === window) return { isTop: true, frameUrl: SecurityManager.redactUrl(location.href), frameName: '', depth: 0, framePath: [] };
      let depth = 0; const path = [];
      try { let w = win; while (w !== window && w.frameElement) { path.unshift(SelectorEngine.robust(w.frameElement).value); w = w.parent; depth++; } } catch (e) {}
      return { isTop: false, frameUrl: SecurityManager.redactUrl(win.location.href), frameName: win.name || '', depth, framePath: path };
    };

    const registerForm = (f, fromEl) => {
      if (!f) return;
      const snapInfo = DOMAnalyzer.formInfo(f, -1);
      const sel = [...(snapInfo.shadowPath || []), snapInfo.selector].join(' >> ');
      let snap = S.formSnaps.get(sel);
      if (!snap) { snap = { ...snapInfo, interactions: 0, usedFields: [] }; S.formSnaps.set(sel, snap); }
      snap.interactions++;
      if (fromEl && fromEl !== f) { const fs = SelectorEngine.robust(fromEl).value; if (!snap.usedFields.includes(fs) && snap.usedFields.length < 60) snap.usedFields.push(fs); }
    };
    const registerTable = el => {
      const context = DOMAnalyzer.tableContext(el);
      if (!context) return;
      const table = queryByShadowPath(context.shadowPath, context.tableSelector, el.ownerDocument || document);
      if (!table) return;
      const info = DOMAnalyzer.tableInfo(table, -1);
      const sel = [...(info.shadowPath || []), info.selector].join(' >> ');
      if (!S.tableSnaps.has(sel)) S.tableSnaps.set(sel, { ...info, interactions: 0 });
      S.tableSnaps.get(sel).interactions++;
    };

    const USED_TYPES = new Set(['click', 'dblclick', 'contextmenu', 'input', 'change', 'submit']);
    const markUsed = (el, element, selectors, type, step, frame) => {
      const key = selectors.primarySelector + (frame.framePath.length ? '|' + frame.framePath.join('>') : '');
      let u = S.used.get(key);
      if (!u) {
        u = { key, ...element, selectors, domContext: DOMAnalyzer.context(el), frameContext: frame, interactionCount: 0, actionTypes: {}, firstStep: step, lastStep: step, steps: [] };
        S.used.set(key, u);
      }
      u.interactionCount++; u.actionTypes[type] = (u.actionTypes[type] || 0) + 1; u.lastStep = step;
      if (u.steps.length < 50 && !u.steps.includes(step)) u.steps.push(step);
      registerForm(el.closest && el.closest('form'), el);
      registerTable(el);
    };

    const addAction = (actionType, el, detail = {}, opts = {}) => {
      if (S.status !== 'RECORDING' || S.actions.length >= CFG.MAX_ACTIONS) return null;
      const ts = Date.now();
      const step = S.stepCounter++;
      let element = null, selectors = null;
      const frame = frameContextOf(el);
      if (el && el.nodeType === 1) {
        element = DOMAnalyzer.actionInfo(el);
        selectors = SelectorEngine.build(el);
        const tc = DOMAnalyzer.tableContext(el);
        if (tc) element = { ...element, tableContext: tc };
        if (USED_TYPES.has(actionType)) markUsed(el, element, selectors, actionType, step, frame);
        if (selectors) selectors = { primarySelector: selectors.primarySelector, alternateSelectors: selectors.alternateSelectors, xpath: selectors.xpath, cssPath: selectors.cssPath, shadowPath: selectors.shadowPath, playwrightSelector: selectors.playwrightSelector, robustSelector: selectors.robustSelector, selectorReliabilityScore: selectors.selectorReliabilityScore, reliabilityFactors: selectors.reliabilityFactors };
      }
      const a = {
        step, timestamp: iso(ts), timestampMs: ts, deltaPreviousMs: ts - (S.lastEventTs || S.startedAt || ts), actionType,
        url: SecurityManager.redactUrl(location.href), pageTitle: document.title, frameContext: frame, element, selectors, detail, context: !!opts.context
      };
      Object.defineProperty(a, '_el', { value: el, writable: true, enumerable: false });
      S.actions.push(a);
      S.lastEventTs = ts;
      if (!opts.context && actionType !== 'scroll') { S.lastActionTs = ts; S.lastActionStep = step; }
      if (actionType !== 'start' && el && !isInternalRecorderNode(el)) recordTimeline(actionType, el, detail, step);
      StorageManager.schedule();
      UIManager.render();
      return a;
    };

    const addNavigation = (type, from, to) => {
      const ts = Date.now();
      const after = (S.lastActionTs && ts - S.lastActionTs <= CFG.ACTION_CORRELATION_WINDOW_MS) ? S.lastActionStep : null;
      S.navigation.push({ id: 'nav-' + (S.seq.nav++), type, timestamp: iso(ts), timestampMs: ts, from: SecurityManager.redactUrl(from || ''), to: SecurityManager.redactUrl(to || ''), title: document.title, afterAction: after });
      S.lastUrl = to || location.href;
      const associatedAction = after;
      addAction('navigation', null, { navType: type, from: SecurityManager.redactUrl(from || ''), to: SecurityManager.redactUrl(to || ''), associatedActionStep: associatedAction }, { context: true });
      recordTimeline('navigation', null, { navType: type, from: SecurityManager.redactUrl(from || ''), to: SecurityManager.redactUrl(to || '') }, associatedAction);
    };

    const detachAll = () => { EventCaptureManager.detach(); NetworkAnalyzer.unhook(); MutationAnalyzer.stop(); };
    const attachAll = () => { NetworkAnalyzer.hook(); EventCaptureManager.attach(); MutationAnalyzer.start(); };

    const start = opts => {
      if (S.status === 'RECORDING') return;
      if (S.status === 'PAUSED') {
        S.status = 'RECORDING';
        attachAll();
        StorageManager.save();
        UIManager.render();
        return;
      }
      resetState();
      S.includeLegacy = !!(opts && opts.includeLegacy);
      S.startedAt = Date.now();
      S.status = 'RECORDING';
      attachAll();
      addAction('start', null, { url: SecurityManager.redactUrl(location.href), viewport: { width: innerWidth, height: innerHeight }, userAgent: navigator.userAgent }, { context: true });
      S.navigation.push({ id: 'nav-' + (S.seq.nav++), type: 'start', timestamp: iso(S.startedAt), timestampMs: S.startedAt, from: '', to: SecurityManager.redactUrl(location.href), title: document.title, afterAction: null });
      StorageManager.save();
      UIManager.render();
    };

    const pause = () => {
      if (S.status !== 'RECORDING') return;
      EventCaptureManager.flush();
      detachAll();
      S.status = 'PAUSED';
      StorageManager.save();
      UIManager.render();
    };

    const resume = st => {
      StorageManager.restore(st);
      if (st.status === 'PAUSED') {
        S.status = 'PAUSED';
        UIManager.render();
        return;
      }
      S.status = 'RECORDING';
      attachAll();
      addNavigation('pageLoad', S.lastUrl, location.href);
      UIManager.render();
    };

    const stop = async reason => {
      if (S.status !== 'RECORDING' && S.status !== 'PAUSED') return;
      EventCaptureManager.flush();
      detachAll();
      S.status = 'STOPPED';
      S.stopReason = reason || 'manual';
      UIManager.render();
      await new Promise(r => setTimeout(r, 50));
      try { await ExportManager.exportAll(); } catch (e) { console.error('MacroRecorder - Treasury Team: error exportando', e); }
      S.status = 'FINISHED';
      StorageManager.clear();
      UIManager.render();
    };

    const cancel = () => {
      if (S.status !== 'RECORDING' && S.status !== 'PAUSED') return;
      detachAll();
      S.status = 'CANCELLED';
      StorageManager.clear();
      UIManager.render();
    };

    return { start, pause, resume, stop, cancel, addAction, addNavigation, frameContextOf, recordTimeline };
  })();

  /* =====================================================================
     EventCaptureManager
     ===================================================================== */
  const EventCaptureManager = (() => {
    const origAdd = EventTarget.prototype.addEventListener;
    const origRemove = EventTarget.prototype.removeEventListener;
    const origHistory = {};
    const frameHistoryHooks = new Map();
    let origOpen = null, cellsScanTimer = null;
    let docs = [], attached = false, scrollPending = null, scrollTimer = null, iframeObserver = null;
    const rootHandlers = new Map();
    const realmPatches = new Map();
    const windowHandlers = new Map();
    const seenFrames = new WeakSet();
    const globalRestorers = [];
    const wrappedOwners = new WeakMap();
    const wrappedFunctions = new WeakSet();
    const DOC_EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'input', 'change', 'submit', 'keydown', 'keyup', 'focus', 'blur', 'scroll'];
    const eventListenersLog = [];
    const handledEvents = new WeakSet();

    const eventElement = e => {
      try { return (e.composedPath && e.composedPath().find(n => n && n.nodeType === 1 && !UIManager.isOwnNode(n))) || e.target; } catch (er) { return e.target; }
    };
    const active = e => S.status === 'RECORDING' && eventElement(e) && eventElement(e).nodeType === 1 && !UIManager.isOwn(e);

    const describeValue = el => {
      const tag = el.localName, type = (el.type || '').toLowerCase();
      if (SecurityManager.isSensitiveField(el)) return { value: SecurityManager.REDACTED, redacted: true };
      if (tag === 'select') { const o = [...el.selectedOptions]; return { value: o.map(x => x.value).join(','), selectedText: o.map(x => clean(x.textContent, 80)).join(', ') }; }
      if (type === 'checkbox' || type === 'radio') return { checked: !!el.checked, value: clean(el.value, 100) };
      if (type === 'file') return { files: [...(el.files || [])].map(f => ({ name: f.name, size: f.size, type: f.type })) };
      if (el.isContentEditable && tag !== 'input' && tag !== 'textarea') return { value: clean(el.textContent, 200) };
      return { value: clean(el.value, 300), length: (el.value || '').length };
    };

    const onPointer = e => {
      if (!active(e)) return;
      const raw = eventElement(e);
      logListener(raw, e.type, null, 'observed');
      const el = DOMAnalyzer.resolveTarget(raw);
      RecordingManager.addAction(e.type, el, { button: e.button, clientX: e.clientX, clientY: e.clientY, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, isTrusted: e.isTrusted, rawTargetTag: raw.localName }, { context: e.type === 'focus' || e.type === 'blur' || e.type === 'mousedown' || e.type === 'mouseup' || e.type === 'pointerdown' || e.type === 'pointerup' });
    };

    const onInput = e => {
      if (!active(e)) return;
      const el = eventElement(e);
      logListener(el, e.type, null, 'observed');
      const last = S.actions[S.actions.length - 1];
      const val = describeValue(el);
      const now = Date.now();
      if (last && last._el === el && last.actionType === 'input' && now - last.timestampMs < CFG.INPUT_MERGE_MS) {
        last.detail = { ...last.detail, ...val, events: [...(last.detail.events || ['input']), e.type] };
        last.actionType = e.type;
        last.timestampMs = now; last.timestamp = iso(now);
        S.lastActionTs = now; S.lastEventTs = now;
        StorageManager.schedule();
        return;
      }
      RecordingManager.addAction(e.type, el, { ...val, events: [e.type] });
    };

    const onSubmit = e => {
      if (!active(e)) return;
      const f = eventElement(e);
      logListener(f, e.type, null, 'observed');
      const fields = [...(f.elements || [])].slice(0, 40).filter(x => x.name || x.id).map(x => ({
        name: x.name || x.id, type: x.type || x.localName, value: SecurityManager.isSensitiveField(x) ? SecurityManager.REDACTED : (x.type === 'file' ? '[file]' : clean(x.value, 80))
      }));
      RecordingManager.addAction('submit', f, { method: (f.method || 'GET').toUpperCase(), action: SecurityManager.redactUrl(f.action || location.href), submitter: e.submitter ? clean(e.submitter.innerText || e.submitter.value, 60) : '', fields });
    };

    const SPECIAL_UP = new Set(['Enter', 'Escape', 'Tab']);
    const onKey = e => {
      if (!active(e)) return;
      logListener(eventElement(e), e.type, null, 'observed');
      const k = e.key;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return;
      const combo = e.ctrlKey || e.metaKey || e.altKey;
      const special = k.length > 1 || combo;
      if (!special) return;
      if (e.type === 'keyup' && !SPECIAL_UP.has(k)) return;
      const hide = SecurityManager.isSensitiveField(e.target) && k.length === 1;
      RecordingManager.addAction(e.type, eventElement(e), { key: hide ? SecurityManager.REDACTED : k, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, contextOnly: true }, { context: true });
    };

    const flushScroll = () => {
      clearTimeout(scrollTimer); scrollTimer = null;
      const p = scrollPending; scrollPending = null;
      if (!p) return;
      RecordingManager.addAction('scroll', p.el, { target: p.el ? 'element' : 'window', from: p.from, to: p.to, events: p.count }, { context: true });
    };
    const onScroll = e => {
      if (S.status !== 'RECORDING') return;
      const t = e.target;
      if (t && t.nodeType === 1 && UIManager.isOwn(e)) return;
      const isDoc = !t || t.nodeType === 9;
      const win = isDoc ? ((t && t.defaultView) || window) : null;
      const pos = isDoc ? { x: Math.round(win.scrollX), y: Math.round(win.scrollY) } : { x: Math.round(t.scrollLeft), y: Math.round(t.scrollTop) };
      const el = isDoc ? null : t;
      if (scrollPending && (scrollPending.el !== el || scrollPending.win !== win)) flushScroll();
      if (!scrollPending) scrollPending = { el, win, from: pos, to: pos, count: 0 };
      scrollPending.to = pos; scrollPending.count++;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(flushScroll, CFG.SCROLL_QUIET_MS);
    };

    const handlers = { click: onPointer, mousedown: onPointer, mouseup: onPointer, pointerdown: onPointer, pointerup: onPointer, dblclick: onPointer, contextmenu: onPointer, input: onInput, change: onInput, submit: onSubmit, keydown: onKey, keyup: onKey, focus: onPointer, blur: onPointer, scroll: onScroll };

    const patchRealm = win => {
      try {
        const prototype = win.EventTarget.prototype;
        if (realmPatches.has(prototype)) return;
        const originalAdd = prototype.addEventListener;
        const originalDispatch = prototype.dispatchEvent;
        const wrapperAdd = function (type, handler, options) {
          logListener(this, type, handler);
          return originalAdd.call(this, type, handler, options);
        };
        const wrapperDispatch = function (event) {
          try { recordCustomEvent(this, event); } catch (e) {}
          return originalDispatch.call(this, event);
        };
        prototype.addEventListener = wrapperAdd;
        prototype.dispatchEvent = wrapperDispatch;
        if (prototype.addEventListener === wrapperAdd && prototype.dispatchEvent === wrapperDispatch) {
          realmPatches.set(prototype, { originalAdd, wrapperAdd, originalDispatch, wrapperDispatch });
        }
      } catch (e) {}
    };

    const hookFrameHistory = win => {
      if (!win || win === window || frameHistoryHooks.has(win)) return;
      let historyObject;
      try { historyObject = win.history; } catch (e) { return; }
      const saved = { historyObject, methods: {}, onHash: null, onPop: null };
      ['pushState', 'replaceState'].forEach(fn => {
        const original = historyObject[fn];
        const wrapper = function () {
          const from = win.location.href;
          const result = original.apply(this, arguments);
          try { if (S.status === 'RECORDING') RecordingManager.addNavigation(`iframe-${fn}`, from, win.location.href); } catch (e) {}
          return result;
        };
        saved.methods[fn] = { original, wrapper };
        try { historyObject[fn] = wrapper; } catch (e) {}
      });
      saved.onHash = e => { if (S.status === 'RECORDING') RecordingManager.addNavigation('iframe-hashchange', e.oldURL, e.newURL); };
      saved.onPop = () => { if (S.status === 'RECORDING') RecordingManager.addNavigation('iframe-popstate', S.lastUrl, win.location.href); };
      try { origAdd.call(win, 'hashchange', saved.onHash); origAdd.call(win, 'popstate', saved.onPop); } catch (e) {}
      frameHistoryHooks.set(win, saved);
    };

    const attachDoc = doc => {
      if (!doc || docs.includes(doc)) return;
      if (doc.nodeType === 9 && doc.defaultView) { hookFrameHistory(doc.defaultView); patchRealm(doc.defaultView); attachWindow(doc.defaultView); }
      docs.push(doc);
      const registered = {};
      DOC_EVENTS.forEach(t => {
        registered[t] = e => {
        if (t !== 'scroll') {
          if (handledEvents.has(e)) return;
          handledEvents.add(e);
        }
        handlers[t](e);
        };
        origAdd.call(doc, t, registered[t], t === 'scroll' ? { capture: true, passive: true } : true);
      });
      rootHandlers.set(doc, registered);
    };
    const observeFrame = f => {
      if (seenFrames.has(f)) return;
      seenFrames.add(f);
      try {
        origAdd.call(f, 'load', () => {
          if (!attached || S.status !== 'RECORDING') return;
          try { const d = f.contentDocument; if (d && d.documentElement) getAllRootsDeep(d).forEach(attachDoc); } catch (e) {}
        });
      } catch (e) {}
    };
    const scanIframes = () => {
      getAllElementsDeep(document).filter(el => el.localName === 'iframe' || el.localName === 'frame').forEach(f => {
        observeFrame(f);
        try { const d = f.contentDocument; if (d && d.documentElement) getAllRootsDeep(d).forEach(attachDoc); } catch (e) {}
      });
    };

    const onHash = e => { if (S.status === 'RECORDING') RecordingManager.addNavigation('hashchange', e.oldURL, e.newURL); };
    const onPop = () => { if (S.status === 'RECORDING') RecordingManager.addNavigation('popstate', S.lastUrl, location.href); };
    const onBeforeUnload = () => {
      if (S.status !== 'RECORDING') return;
      flushScroll();
      RecordingManager.addNavigation('beforeunload', location.href, '');
      StorageManager.save();
    };
    const onPageHide = () => { if (S.status === 'RECORDING') StorageManager.save(); };

    const safeMessage = value => {
      try {
        const json = JSON.stringify(value);
        if (json == null) return null;
        return json.length > 5000 ? '[message truncated]' : SecurityManager.sanitize(JSON.parse(json));
      } catch (e) { return '[unserializable message]'; }
    };
    const frameForWindow = win => {
      for (const frame of getAllElementsDeep(document).filter(el => el.localName === 'iframe' || el.localName === 'frame')) {
        try { if (frame.contentWindow === win) return frame; } catch (e) {}
      }
      return null;
    };
    const onMessage = e => {
      if (S.status !== 'RECORDING') return;
      const sourceFrame = frameForWindow(e.source);
      RecordingManager.recordTimeline('postMessage', sourceFrame, { direction: 'received', origin: SecurityManager.redactUrl(e.origin || ''), data: safeMessage(e.data) });
    };
    const attachWindow = win => {
      if (!win || windowHandlers.has(win)) return;
      const handlers = { message: onMessage, blur: checkFocusedFrame, focus: checkFocusedFrame };
      try {
        Object.keys(handlers).forEach(type => origAdd.call(win, type, handlers[type], true));
        windowHandlers.set(win, handlers);
        patchWindowPostMessage(win);
        patchMessageChannel(win);
      } catch (e) {}
    };
    const frameActivityTimer = { id: null, lastFrame: null };
    const checkFocusedFrame = () => {
      if (S.status !== 'RECORDING') return;
      let activeElement;
      try {
        activeElement = document.activeElement;
        const seen = new Set();
        while (activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement && !seen.has(activeElement)) {
          seen.add(activeElement);
          activeElement = activeElement.shadowRoot.activeElement;
        }
      } catch (e) { return; }
      const frame = activeElement && (activeElement.localName === 'iframe' || activeElement.localName === 'frame') ? activeElement : null;
      if (frame === frameActivityTimer.lastFrame) return;
      frameActivityTimer.lastFrame = frame;
      if (frame) {
        const meta = { selector: SelectorEngine.build(frame).playwrightSelector, src: SecurityManager.redactUrl(frame.src || ''), title: clean(frame.title, 100), sameOrigin: false };
        try { meta.sameOrigin = !!frame.contentDocument; } catch (e) {}
        RecordingManager.addAction('frameFocus', frame, meta);
        RecordingManager.recordTimeline('frameFocus', frame, meta);
      }
    };

    const patchMessageChannel = win => {
      const patchPost = (prototype, label) => {
        if (!prototype || typeof prototype.postMessage !== 'function') return;
        wrapCellsMethod(prototype, 'postMessage', label);
      };
      try { patchPost(win.MessagePort && win.MessagePort.prototype, 'MessagePort'); } catch (e) {}
      try { patchPost(win.BroadcastChannel && win.BroadcastChannel.prototype, 'BroadcastChannel'); } catch (e) {}
    };
    const patchWindowPostMessage = win => {
      try {
        const owner = win;
        const key = 'postMessage';
        const original = owner[key];
        const previous = wrappedOwners.get(owner);
        if (typeof original !== 'function' || (previous && previous.get(key) === original)) return;
        const wrapper = function (message, targetOrigin) {
          if (S.status === 'RECORDING') {
            const detail = { direction: 'sent', targetOrigin: String(targetOrigin || ''), data: safeMessage(message) };
            RecordingManager.recordTimeline('postMessageSend', frameForWindow(this), detail);
          }
          return original.apply(this, arguments);
        };
        owner[key] = wrapper;
        if (owner[key] === wrapper) {
          const wrappers = wrappedOwners.get(owner) || new Map();
          wrappers.set(key, wrapper); wrappedOwners.set(owner, wrappers);
          globalRestorers.push({ owner, key, original, wrapper });
        }
      } catch (e) {}
    };

    const logListener = (el, type, handler, source = 'registered') => {
      try {
        if (!type || String(type).length > 120 || eventListenersLog.length >= 4000) return;
        const isShadowRoot = !!(el && el.nodeType === 11 && el.host);
        const isDelegated = el === document || el === window || el === document.body || el === document.documentElement;
        if (!isDelegated && !isShadowRoot && !(el && el.nodeType === 1)) return;
        if (isInternalRecorderNode(el) || (isShadowRoot && isInternalRecorderNode(el.host))) return;
        const eventHost = isShadowRoot ? el.host : el;
        const selectorInfo = eventHost && eventHost.nodeType === 1 ? SelectorEngine.robust(eventHost) : null;
        const shadowPath = [];
        let root = eventHost && eventHost.getRootNode ? eventHost.getRootNode() : null;
        while (root && root.host) { shadowPath.unshift(SelectorEngine.robust(root.host).value); root = root.host.getRootNode(); }
        eventListenersLog.push({
          tag: isShadowRoot ? 'shadowRoot' : (isDelegated ? (el === window ? 'window' : 'document') : el.tagName.toLowerCase()), id: isDelegated || isShadowRoot ? '' : (el.id || ''), name: isDelegated || isShadowRoot ? '' : (el.getAttribute('name') || ''),
          selector: selectorInfo ? selectorInfo.value : '', playwrightSelector: selectorInfo ? [...shadowPath, selectorInfo.value].map(value => `css=${value}`).join(' >> ') : '', shadowPath,
          eventType: String(type), handlerName: handler && handler.name ? handler.name : (source === 'observed' ? '(observed)' : '(anonymous)'), source, timestamp: iso(Date.now()), delegated: isDelegated || isShadowRoot
        });
      } catch (e) {}
    };

    const recordCustomEvent = (target, event) => {
      if (S.status !== 'RECORDING' || !event || !event.type || isInternalRecorderNode(target)) return;
      const eventCtor = target && target.ownerDocument && target.ownerDocument.defaultView && target.ownerDocument.defaultView.CustomEvent;
      const isCustom = (eventCtor && event instanceof eventCtor) || (event.constructor && event.constructor.name === 'CustomEvent');
      if (!isCustom || S.customEvents.length >= 2000) return;
      const element = target && target.nodeType === 1 ? target : (target && target.host) || null;
      let detail = null;
      try {
        const json = JSON.stringify(event.detail);
        detail = json && json.length <= 4000 ? SecurityManager.sanitize(JSON.parse(json)) : (json ? '[detail truncated]' : null);
      } catch (e) { detail = '[unserializable detail]'; }
      const selectors = element ? SelectorEngine.build(element) : null;
      const semanticName = detail && detail.method === 'publish' && Array.isArray(detail.args) && typeof detail.args[0] === 'string' ? detail.args[0] : String(event.type);
      const recent = S.customEvents[S.customEvents.length - 1];
      const eventSignature = `${semanticName}|${selectors ? selectors.primarySelector : ''}|${JSON.stringify(detail)}`;
      if (recent && recent.signature === eventSignature && Date.now() - recent.timestampMs <= 100) {
        recent.repeatCount = (recent.repeatCount || 1) + 1;
        logListener(element || target, event.type, null, 'custom-dispatch');
        return;
      }
      const item = {
        timestamp: iso(Date.now()), timestampMs: Date.now(), signature: eventSignature, repeatCount: 1, eventName: semanticName, sourceEventType: String(event.type), bubbles: !!event.bubbles, composed: !!event.composed,
        selector: selectors ? selectors.primarySelector : '', playwrightSelector: selectors ? selectors.playwrightSelector : '', shadowPath: selectors ? selectors.shadowPath : [],
        detail, actionStep: S.lastActionTs && Date.now() - S.lastActionTs <= CFG.ACTION_CORRELATION_WINDOW_MS ? S.lastActionStep : null
      };
      S.customEvents.push(item);
      logListener(element || target, event.type, null, 'custom-dispatch');
      RecordingManager.recordTimeline('customEvent', element, { eventName: item.eventName, sourceEventType: item.sourceEventType, detail, bubbles: item.bubbles, composed: item.composed }, item.actionStep);
      if (/^(?:__)?(?:kyop-)?(?:menu|module|solution|page)_loaded$/i.test(semanticName) && S.loadedModules.length < 500) {
        const module = { timestamp: item.timestamp, module: semanticName, source: 'custom-event', selector: selectors ? selectors.primarySelector : '', actionStep: item.actionStep };
        S.loadedModules.push(module);
        RecordingManager.recordTimeline('moduleLoad', element, module, item.actionStep);
      }
      StorageManager.schedule();
    };

    const wrapCellsMethod = (owner, key, kind) => {
      if (!owner) return;
      let original;
      try { original = owner[key]; } catch (e) { return; }
      if (typeof original !== 'function' || wrappedFunctions.has(original)) return;
      const ownerWrappers = wrappedOwners.get(owner);
      if (ownerWrappers && ownerWrappers.get(key) === original) return;
      const wrapper = function (...args) {
        if (S.status === 'RECORDING') {
          const argSummary = args.slice(0, 4).map(arg => {
            if (arg == null || ['string', 'number', 'boolean'].includes(typeof arg)) return typeof arg === 'string' ? SecurityManager.sanitizeString(clean(arg, 160)) : arg;
            if (arg && arg.nodeType === 1) return SelectorEngine.robust(arg).value;
            if (typeof arg !== 'object') return `[${typeof arg}]`;
            let keys = [];
            try { keys = Object.keys(arg).slice(0, 20); } catch (e) {}
            const properties = {};
            for (const property of keys) {
              try {
                const value = arg[property];
                if (SecurityManager.isSensitiveName(property)) properties[property] = SecurityManager.REDACTED;
                else if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) properties[property] = typeof value === 'string' ? SecurityManager.sanitizeString(clean(value, 160)) : value;
                else if (Array.isArray(value)) properties[property] = { type: 'Array', length: value.length };
                else properties[property] = { type: 'Object', keys: Object.keys(value).filter(k => !SecurityManager.isSensitiveName(k)).slice(0, 12) };
              } catch (e) { properties[property] = '[unavailable]'; }
            }
            return { type: 'Object', keys, properties };
          });
          const signature = `${kind}|${key}|${JSON.stringify(argSummary)}`;
          const previous = S.cellsRouters[S.cellsRouters.length - 1];
          if (previous && previous.signature === signature && Date.now() - previous.timestampMs <= 100) {
            previous.repeatCount = (previous.repeatCount || 1) + 1;
            return original.apply(this, args);
          }
          if (kind === 'module') {
            const moduleName = String(args.find(arg => typeof arg === 'string') || 'unknown');
            const timestampMs = Date.now();
            const item = { timestamp: iso(timestampMs), timestampMs, signature, module: moduleName, functionName: String(key), actionStep: S.lastActionStep || null };
            if (S.loadedModules.length < 500) S.loadedModules.push(item);
            RecordingManager.recordTimeline('moduleLoad', null, item, item.actionStep);
          } else if (kind === 'MessagePort' || kind === 'BroadcastChannel') {
            const item = { timestamp: iso(Date.now()), timestampMs: Date.now(), signature, component: kind, method: 'postMessage', arguments: argSummary, actionStep: S.lastActionStep || null };
            RecordingManager.recordTimeline('postMessageSend', null, item, item.actionStep);
          } else {
            const timestampMs = Date.now();
            const item = { timestamp: iso(timestampMs), timestampMs, signature, component: kind, method: String(key), arguments: argSummary, actionStep: S.lastActionStep || null };
            if (S.cellsRouters.length < 1000) S.cellsRouters.push(item);
            RecordingManager.recordTimeline('cellsRouter', null, item, item.actionStep);
          }
        }
        return original.apply(this, args);
      };
      try {
        owner[key] = wrapper;
        if (owner[key] === wrapper) {
          const wrappers = wrappedOwners.get(owner) || new Map();
          wrappers.set(key, wrapper);
          wrappedOwners.set(owner, wrappers);
          wrappedFunctions.add(original);
          globalRestorers.push({ owner, key, original, wrapper });
        }
      } catch (e) {}
    };

    const cellsGlobalsSeen = new Set();
    const hookCellsGlobals = () => {
      let names = [];
      try { names = Object.getOwnPropertyNames(window); } catch (e) { return; }
      for (const name of names) {
        if (!/^(loadCellsPage|CellsPolymerBridge|.*Router|.*PageManager|.*TemplateManager)$/i.test(name)) continue;
        let value;
        try { value = window[name]; } catch (e) { continue; }
        if (name === 'loadCellsPage' && typeof value === 'function') wrapCellsMethod(window, name, 'module');
        const targets = [value, value && value.prototype].filter(target => target && (typeof target === 'object' || typeof target === 'function'));
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          let childNames = [];
          try { childNames = Object.getOwnPropertyNames(value).filter(child => /router|pageManager|templateManager/i.test(child)).slice(0, 20); } catch (e) {}
          for (const childName of childNames) {
            try {
              const child = value[childName];
              if (child && (typeof child === 'object' || typeof child === 'function')) targets.push(child, child.prototype);
            } catch (e) {}
          }
        }
        for (const target of targets) {
          let keys = [];
          try { keys = Object.getOwnPropertyNames(target); } catch (e) {}
          const methods = keys.filter(key => /^(navigate|go|goTo|route|loadPage|changePage|setPage|publish|emit|dispatch|trigger|fire|notify|loadCellsPage)$/i.test(key));
          if (methods.length && !cellsGlobalsSeen.has(name)) {
            cellsGlobalsSeen.add(name);
            if (S.cellsRouters.length < 1000) S.cellsRouters.push({ timestamp: iso(Date.now()), component: name, methods, type: 'discovered' });
          }
          methods.forEach(method => wrapCellsMethod(target, method, method.toLowerCase() === 'loadcellspage' ? 'module' : name));
        }
      }
    };

    const scanDevToolsListeners = () => {
      if (typeof getEventListeners !== 'function') return;
      for (const el of deepQueryAll("input,select,textarea,button,a,[role='button'],[onclick],[onchange],[onsubmit],[ondblclick]", document).slice(0, CFG.MAX_ITEMS)) {
        try { const map = getEventListeners(el); for (const type of Object.keys(map)) for (const l of map[type]) logListener(el, type, l.listener); } catch (e) {}
      }
    };

    const observeRoot = root => {
      attachDoc(root);
      const ownerDoc = root && root.nodeType === 9 ? root : root && root.ownerDocument;
      if (!ownerDoc) return;
      for (const frame of deepQueryAll('iframe,frame', root)) {
        observeFrame(frame);
        try { const frameDoc = frame.contentDocument; if (frameDoc && frameDoc.documentElement) getAllRootsDeep(frameDoc).forEach(attachDoc); } catch (e) {}
      }
    };

    const attach = () => {
      if (attached) return;
      attached = true;
      cellsGlobalsSeen.clear();
      eventListenersLog.length = 0;
      patchRealm(window);
      attachDoc(document);
      getAllRootsDeep(document).forEach(attachDoc);
      scanIframes();
      iframeObserver = new MutationObserver(ms => {
        for (const n of ms.flatMap(m => [...m.addedNodes]).filter(node => node.nodeType === 1)) {
          const added = getAllElementsDeep(n);
          added.filter(el => el.localName === 'iframe' || el.localName === 'frame').forEach(observeFrame);
          getAllRootsDeep(n).forEach(attachDoc);
        }
      });
      iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
      checkFocusedFrame();
      frameActivityTimer.id = setInterval(checkFocusedFrame, 250);
      origAdd.call(window, 'hashchange', onHash);
      origAdd.call(window, 'popstate', onPop);
      origAdd.call(window, 'beforeunload', onBeforeUnload);
      origAdd.call(window, 'pagehide', onPageHide);
      ['pushState', 'replaceState'].forEach(fn => {
        const orig = history[fn];
        origHistory[fn] = orig;
        const wrapper = function () {
          const from = location.href;
          const r = orig.apply(this, arguments);
          try { if (S.status === 'RECORDING') RecordingManager.addNavigation(fn, from, location.href); } catch (e) {}
          return r;
        };
        origHistory[fn + '_w'] = wrapper;
        history[fn] = wrapper;
      });
      origOpen = window.open;
      window.open = function (url) {
        try { if (S.status === 'RECORDING') { RecordingManager.addAction('window.open', null, { url: SecurityManager.redactUrl(String(url || '')) }, { context: true }); StorageManager.save(Date.now()); } } catch (e) {}
        return origOpen.apply(this, arguments);
      };
      hookCellsGlobals();
      cellsScanTimer = setInterval(hookCellsGlobals, 750);
      scanDevToolsListeners();
    };

    const detach = () => {
      if (!attached) return;
      attached = false;
      clearInterval(cellsScanTimer); cellsScanTimer = null;
      docs.forEach(d => { try { const registered = rootHandlers.get(d) || {}; DOC_EVENTS.forEach(t => origRemove.call(d, t, registered[t], t === 'scroll' ? { capture: true } : true)); } catch (e) {} });
      docs = [];
      rootHandlers.clear();
      windowHandlers.forEach((handlers, win) => { try { Object.keys(handlers).forEach(type => origRemove.call(win, type, handlers[type], true)); } catch (e) {} });
      windowHandlers.clear();
      clearInterval(frameActivityTimer.id); frameActivityTimer.id = null; frameActivityTimer.lastFrame = null;
      if (iframeObserver) { iframeObserver.disconnect(); iframeObserver = null; }
      origRemove.call(window, 'hashchange', onHash);
      origRemove.call(window, 'popstate', onPop);
      origRemove.call(window, 'beforeunload', onBeforeUnload);
      origRemove.call(window, 'pagehide', onPageHide);
      ['pushState', 'replaceState'].forEach(fn => { if (history[fn] === origHistory[fn + '_w']) history[fn] = origHistory[fn]; });
      if (origOpen && window.open !== origOpen) window.open = origOpen;
      realmPatches.forEach((patch, prototype) => {
        try {
          if (prototype.addEventListener === patch.wrapperAdd) prototype.addEventListener = patch.originalAdd;
          if (prototype.dispatchEvent === patch.wrapperDispatch) prototype.dispatchEvent = patch.originalDispatch;
        } catch (e) {}
      });
      realmPatches.clear();
      frameHistoryHooks.forEach((saved, win) => {
        try {
          origRemove.call(win, 'hashchange', saved.onHash);
          origRemove.call(win, 'popstate', saved.onPop);
          Object.keys(saved.methods).forEach(fn => { if (saved.historyObject[fn] === saved.methods[fn].wrapper) saved.historyObject[fn] = saved.methods[fn].original; });
        } catch (e) {}
      });
      frameHistoryHooks.clear();
      for (let i = globalRestorers.length - 1; i >= 0; i--) {
        const entry = globalRestorers[i];
        try { if (entry.owner[entry.key] === entry.wrapper) entry.owner[entry.key] = entry.original; } catch (e) {}
        wrappedFunctions.delete(entry.original);
      }
      globalRestorers.length = 0;
    };

    const flush = () => flushScroll();

    const dedupeEventListeners = list => {
      const map = new Map();
      for (const item of list) {
        const key = `${item.delegated}|${item.tag}|${item.id}|${item.selector}|${item.eventType}`;
        if (!map.has(key)) map.set(key, { ...item, occurrences: 1 }); else map.get(key).occurrences += 1;
      }
      return [...map.values()];
    };
    const getEventListeners_ = () => dedupeEventListeners(eventListenersLog).slice(0, CFG.MAX_ITEMS);

    return { attach, detach, flush, observeRoot, getEventListeners: getEventListeners_ };
  })();

  /* =====================================================================
     WorkflowAnalyzer
     ===================================================================== */
  const WorkflowAnalyzer = (() => {
    const RX = {
      search: /\b(buscar|busqueda|filtrar|consultar|search|find|filter|query)\b/,
      save: /\b(guardar|grabar|enviar|aceptar|confirmar|crear|aprobar|registrar|save|submit|send|create|approve|apply|confirm|accept)\b/,
      download: /\b(descargar|exportar|imprimir|download|export|print)\b/,
      open: /\b(abrir|detalle|detalles|editar|ver|open|view|detail|details|edit)\b/
    };
    const MUT = /^(POST|PUT|PATCH|DELETE)$/;
    const labelOf = a => { const e = a.element || {}; return e.text || e.ariaLabel || e.title || e.labelText || e.placeholder || e.name || e.id || ''; };
    const fieldLabel = a => { const e = a.element || {}; return e.labelText || e.ariaLabel || e.placeholder || e.name || e.id || e.text || ''; };
    const q = s => '"' + s + '"';

    const analyze = (reqsByStep, obsByStep) => {
      const phases = [];
      let prev = null;
      for (const a of S.actions) {
        if (a.actionType === 'scroll' || a.context && a.actionType !== 'start' && a.actionType !== 'navigation') continue;
        const reqs = reqsByStep.get(a.step) || [];
        const obs = obsByStep.get(a.step) || {};
        const label = normalizeText(labelOf(a));
        const t = a.actionType;
        const hasMut = reqs.some(r => MUT.test(r.method));
        const hasSearch = reqs.some(r => RX.search.test(normalizeText(r.path)));
        let phase = null;
        if (t === 'start') phase = 'Abrir pantalla';
        else if (t === 'navigation') {
          const absorbed = prev && ['click', 'dblclick', 'submit'].includes(prev.actionType) && a.timestampMs - prev.timestampMs < 3000;
          phase = absorbed ? null : 'Abrir pantalla';
        } else if (t === 'input' || t === 'change') phase = 'Completar formulario';
        else if (t === 'submit') phase = hasSearch ? 'Buscar' : (reqs.some(r => r.download) ? 'Descargar' : 'Guardar');
        else if (t === 'click' || t === 'dblclick') {
          const opens = obs.navigated || obs.dialogOpened;
          if (reqs.some(r => r.download) || RX.download.test(label)) phase = 'Descargar';
          else if (RX.search.test(label) || hasSearch) phase = 'Buscar';
          else if (RX.save.test(label) || hasMut) phase = 'Guardar';
          else if (a.element && a.element.tableContext) phase = opens || t === 'dblclick' ? 'Abrir detalle' : 'Seleccionar fila';
          else if (opens || RX.open.test(label)) phase = 'Abrir detalle';
          else phase = 'Interactuar';
        }
        if (!a.context || t === 'start' || t === 'navigation') prev = a;
        if (phase) phases.push({ phase, action: a, reqs });
      }
      const groups = [];
      for (const p of phases) {
        const g = groups[groups.length - 1];
        if (g && g.phase === p.phase && p.phase !== 'Abrir pantalla') { g.items.push(p.action); g.reqs.push(...p.reqs); }
        else groups.push({ phase: p.phase, items: [p.action], reqs: [...p.reqs] });
      }
      return groups.map(g => {
        const steps = g.items.map(a => a.step);
        const range = steps.length === 1 ? 'paso ' + steps[0] : `pasos ${steps[0]}-${steps[steps.length - 1]}`;
        const names = [...new Set(g.items.map(a => g.phase === 'Completar formulario' ? fieldLabel(a) : labelOf(a)).filter(Boolean))].slice(0, 6).map(q).join(', ');
        const apis = [...new Map(g.reqs.map(r => [r.method + r.path, r])).values()].slice(0, 4).map(r => `${r.method} ${r.path} -> HTTP ${r.responseStatus == null ? '?' : r.responseStatus}`).join('; ');
        const first = g.items[0];
        let d;
        switch (g.phase) {
          case 'Abrir pantalla': d = 'Abrir la pantalla ' + (() => { try { return new URL(first.url).pathname + (new URL(first.url).hash || ''); } catch (e) { return first.url; } })(); break;
          case 'Completar formulario': d = `Completar ${new Set(g.items.map(a => a.selectors && a.selectors.primarySelector)).size} campo(s): ${names}`; break;
          case 'Buscar': d = 'Ejecutar la busqueda ' + (names ? 'con ' + names : ''); break;
          case 'Seleccionar fila': d = `Seleccionar fila ${first.element && first.element.tableContext ? first.element.tableContext.rowIndex : ''} de la tabla ${first.element && first.element.tableContext ? first.element.tableContext.tableSelector : ''}`; break;
          case 'Abrir detalle': d = 'Abrir el detalle ' + (names ? 'mediante ' + names : ''); break;
          case 'Guardar': d = 'Guardar/confirmar ' + (names ? 'mediante ' + names : ''); break;
          case 'Descargar': d = 'Descargar/exportar ' + (names ? 'mediante ' + names : ''); break;
          default: d = 'Interactuar con ' + names;
        }
        return { phase: g.phase, description: `${d.trim()} (${range})${apis ? ' [API: ' + apis + ']' : ''}`, stepRefs: steps, apis: apis ? apis.split('; ') : [] };
      });
    };

    const candidates = (groups, actionNetworkMap, insp, automationSummary, tables) => {
      const out = [];
      if (groups.length) {
        out.push({ workflow: 'Procedimiento grabado', description: groups.map(g => g.phase).join(' -> '), steps: groups.map(g => g.phase), details: groups.map(g => g.description), stepRefs: groups.map(g => g.stepRefs) });
        groups.forEach((g, i) => {
          if (['Buscar', 'Guardar', 'Descargar', 'Abrir detalle'].includes(g.phase)) {
            const pre = groups[i - 1] && groups[i - 1].phase === 'Completar formulario' ? groups[i - 1] : null;
            out.push({ workflow: g.phase === 'Buscar' ? 'Buscar registros' : g.phase === 'Guardar' ? 'Guardar registro' : g.phase === 'Descargar' ? 'Descargar archivo' : 'Abrir detalle de registro', steps: (pre ? [pre.phase] : []).concat(g.phase), details: (pre ? [pre.description] : []).concat(g.description), stepRefs: (pre ? [pre.stepRefs] : []).concat([g.stepRefs]) });
          }
        });
      }
      const searchField = automationSummary.keyFields[0];
      const searchBtn = insp.actions.find(a => a.action === 'Buscar');
      const mainTable = [...tables].sort((a, b) => b.rows - a.rows)[0];
      if (searchField && (searchBtn || mainTable)) {
        const steps = ['Fill Search Field'];
        if (searchBtn) steps.push('Click Search');
        if (mainTable) steps.push('Wait Table Refresh');
        out.push({ workflow: 'Search Records', steps });
      }
      for (const entry of actionNetworkMap) {
        const label = entry.action.text || 'Action';
        const steps = ['Click ' + label];
        entry.requests.forEach(r => steps.push(`Wait ${r.method} ${r.url}`));
        out.push({ workflow: label + ' Operation', steps, stepRefs: [entry.step] });
      }
      const observedSteps = S.interactionTimeline.filter(item => {
        if (!['click', 'change', 'submit', 'navigation', 'customEvent', 'cellsRouter', 'moduleLoad', 'apiCall'].includes(item.type)) return false;
        const eventName = item.detail && (item.detail.eventName || (item.detail.arguments && item.detail.arguments[0]));
        return !['ch_global_session_manager_send_event', '__kyop-menu_loaded'].includes(eventName);
      }).slice(0, 100);
      if (observedSteps.length > 1) {
        const descriptions = observedSteps.map(item => {
          if (item.type === 'navigation') return `Navegar a ${item.detail && item.detail.to || ''}`.trim();
          if (item.type === 'apiCall') return `Llamar ${item.detail && item.detail.method || ''} ${item.detail && item.detail.url || ''}`.trim();
          if (item.type === 'moduleLoad') return `Cargar modulo ${item.detail && item.detail.module || ''}`.trim();
          if (item.type === 'customEvent') return `Evento ${item.detail && item.detail.eventName || ''}`.trim();
          if (item.type === 'cellsRouter') return `Cells ${item.detail && item.detail.method || item.detail && item.detail.component || ''} ${item.detail && item.detail.arguments && item.detail.arguments[0] || ''}`.trim();
          return `${item.type}: ${item.text || item.selector || ''}`.trim();
        });
        out.push({ workflow: 'Flujo observado', description: descriptions.join(' -> '), steps: descriptions, stepRefs: observedSteps.map(item => item.actionStep).filter(Boolean) });
      }
      const dedup = [], seen = new Set();
      for (const wf of out) { const k = wf.workflow + '|' + wf.steps.join('>'); if (seen.has(k)) continue; seen.add(k); dedup.push(wf); }
      return dedup.slice(0, 50);
    };

    return { analyze, candidates };
  })();

  /* =====================================================================
     ExportManager
     ===================================================================== */
  const ExportManager = (() => {
    const pad = n => String(n).padStart(2, '0');
    const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
    const download = (data, filename) => {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const wait = ms => new Promise(r => setTimeout(r, ms));

    const exportAll = async () => {
      const endedAt = Date.now();
      const insp = DOMAnalyzer.inspect();
      const eventListeners = EventCaptureManager.getEventListeners();
      const apiCandidates = NetworkAnalyzer.buildApiCandidates(insp.staticApiUrls);
      const actionNetworkMap = NetworkAnalyzer.buildActionNetworkMap();

      const reqsByStep = new Map();
      S.network.forEach(r => { if (r.triggeredByAction && !NetworkAnalyzer.isNoiseUrl(r.url)) { if (!reqsByStep.has(r.triggeredByAction)) reqsByStep.set(r.triggeredByAction, []); reqsByStep.get(r.triggeredByAction).push(r); } });
      const mutByStep = new Map(), navByStep = new Map();
      S.mutations.forEach(m => { if (m.afterAction != null) { if (!mutByStep.has(m.afterAction)) mutByStep.set(m.afterAction, []); mutByStep.get(m.afterAction).push(m); } });
      S.navigation.forEach(n => { if (n.afterAction != null) { if (!navByStep.has(n.afterAction)) navByStep.set(n.afterAction, []); navByStep.get(n.afterAction).push(n); } });

      const obsByStep = new Map();
      const observableFor = (a, i) => {
        const muts = mutByStep.get(a.step) || [], navs = navByStep.get(a.step) || [], next = S.actions[i + 1];
        const dialog = muts.find(m => m.kind === 'appeared' && ['modal', 'dialog', 'popup', 'drawer'].includes(m.category));
        const o = {
          urlChanged: navs.length ? { from: navs[0].from, to: navs[navs.length - 1].to } : ((next && next.url !== a.url) ? { from: a.url, to: next.url } : null),
          navigated: navs.length > 0 || !!(next && next.url !== a.url && next.timestampMs - a.timestampMs < 3000),
          dialogOpened: !!dialog, dialogSelector: dialog ? dialog.selector : null,
          dynamicContentUpdated: muts.some(m => m.kind === 'componentUpdate'),
          mutations: muts.slice(0, 10).map(m => ({ id: m.id, kind: m.kind, category: m.category, selector: m.selector, text: m.text })),
          requestsTriggered: (reqsByStep.get(a.step) || []).length
        };
        obsByStep.set(a.step, o);
        return o;
      };
      const observables = S.actions.map(observableFor);

      const groups = WorkflowAnalyzer.analyze(reqsByStep, obsByStep);
      const auto = DOMAnalyzer.deriveAutomation(insp, apiCandidates, [], eventListeners);
      const workflowCandidates = WorkflowAnalyzer.candidates(groups, actionNetworkMap, insp, auto.automationSummary, insp.tables);

      const updFormSnaps = () => [...S.formSnaps.entries()].map(([sel, snap]) => {
        try { const f = queryByShadowPath(snap.shadowPath, snap.selector); if (f) return { ...DOMAnalyzer.formInfo(f, -1), interactions: snap.interactions, usedFields: snap.usedFields }; } catch (e) {}
        return snap;
      });
      const updTableSnaps = () => [...S.tableSnaps.entries()].map(([sel, snap]) => {
        try { const t = queryByShadowPath(snap.shadowPath, snap.selector); if (t) return { ...DOMAnalyzer.tableInfo(t, -1), interactions: snap.interactions }; } catch (e) {}
        return snap;
      });
      const usedForms = updFormSnaps(), usedTables = updTableSnaps();

      const metadata = {
        tool: 'MacroRecorder - Treasury Team', version: CFG.VERSION, recordingId: S.recId, generatedAt: iso(endedAt), startedAt: iso(S.startedAt),
        actualDurationMs: endedAt - S.startedAt, stopReason: S.stopReason || 'manual',
        totalActions: S.actions.length, totalRequests: S.network.length, totalMutations: S.mutations.length, resumedAfterNavigation: S.resumed, resumeCount: S.resumeCount,
        pagesVisited: [...new Set(S.actions.map(a => a.url))], userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight },
        security: { mode: 'redact-sensitive', redactedValues: SecurityManager.redactionCount(), policy: 'password, token, jwt, apikey, authorization, cookie, secret, bearer, session, csrf -> [REDACTED]' }
      };

      const used = [...S.used.values()];
      const modals = S.mutations.filter(m => m.kind === 'appeared' && ['modal', 'dialog', 'popup', 'drawer', 'dropdown'].includes(m.category))
        .map(m => ({ id: m.id, category: m.category, selector: m.selector, afterAction: m.afterAction, details: m.details || null }));

      const estructura = SecurityManager.sanitize({
        metadata,
        page: { ...insp.page, summary: insp.summary, formSummary: insp.formSummary, menus: insp.menus, automationReadiness: auto.automationReadiness, automationSummary: auto.automationSummary },
        applicationElements: insp.applicationElements,
        internalRecorderElements: insp.internalRecorderElements,
        iframes: insp.iframes,
        deepDomAnalysis: insp.deepDomAnalysis,
        shadowHosts: insp.shadowHosts,
        customElements: insp.customElements,
        microfrontends: insp.microfrontends,
        frameworks: insp.frameworks,
        interactedElements: used,
        forms: usedForms.length ? usedForms : insp.forms.slice(0, 5),
        tables: usedTables.length ? usedTables : insp.tables.slice(0, 5),
        navigationEvents: S.navigation.map(({ timestampMs, ...n }) => n),
        interactionTimeline: S.interactionTimeline.map(({ timestampMs, repeatKey, ...entry }) => entry),
        customEvents: S.customEvents.map(({ timestampMs, signature, ...entry }) => entry),
        loadedModules: S.loadedModules,
        loadedModuleCandidates: insp.loadedModuleCandidates,
        cellsRouters: S.cellsRouters.map(({ timestampMs, signature, ...entry }) => entry),
        eventListeners,
        observedMutations: S.mutations.map(({ timestampMs, ...m }) => m),
        apiCandidates,
        workflowCandidates,
        detectedModals: modals,
        actionNetworkMap,
        networkRequests: S.network.filter(r => !NetworkAnalyzer.isNoiseUrl(r.url)).map(r => ({ id: r.id, source: r.source, method: r.method, url: r.url, queryString: r.queryString, requestBodyPreview: r.requestBodyPreview, responseStatus: r.responseStatus, responseSize: r.responseSize, responseContentType: r.responseContentType, responseJsonKeys: r.responseJsonKeys, startTimestamp: r.startTimestamp, endTimestamp: r.endTimestamp, durationMs: r.durationMs, triggeredByAction: r.triggeredByAction, error: r.error })),
        legacyInspector: {
          importantSelectors: auto.importantSelectors, importantActions: auto.importantActions, importantTables: auto.importantTables,
          automationCandidates: auto.automationCandidates.slice(0, 40), automationTemplates: auto.automationTemplates, eventListeners: eventListeners.slice(0, 100),
          uiText: insp.uiText.slice(0, 100), globalFunctions: insp.globalFunctions.slice(0, 50), deepDomAnalysis: insp.deepDomAnalysis
        }
      });

      const secuencia = SecurityManager.sanitize({
        metadata: { ...metadata, startUrl: S.actions[0] ? S.actions[0].url : '', procedure: groups.map(g => g.description) },
        interactionTimeline: S.interactionTimeline.map(({ timestampMs, repeatKey, ...entry }) => entry),
        customEvents: S.customEvents.map(({ timestampMs, signature, ...entry }) => entry),
        loadedModules: S.loadedModules,
        actions: S.actions.map((a, i) => ({
          step: a.step, timestamp: a.timestamp, deltaPreviousMs: a.deltaPreviousMs, url: a.url, pageTitle: a.pageTitle, frameContext: a.frameContext,
          action: { type: a.actionType, context: a.context, ...a.detail }, element: a.element, selectors: a.selectors, observableResult: observables[i],
          networkRequests: (reqsByStep.get(a.step) || []).map(r => ({ id: r.id, method: r.method, url: r.url, status: r.responseStatus, startTimestamp: r.startTimestamp, endTimestamp: r.endTimestamp, durationMs: r.durationMs, pending: r.responseStatus == null && !r.error, download: r.download, error: r.error || undefined }))
        }))
      });

      download(JSON.stringify(estructura, null, 2), 'estructura_pagina.json');
      await wait(400);
      download(JSON.stringify(secuencia, null, 2), 'secuencia_acciones.json');

      if (S.includeLegacy) {
        const full = SecurityManager.sanitize({
          inspector: { name: 'Compact Page Inspector', version: '3.2', generatedAt: iso(endedAt) },
          page: insp.page, summary: insp.summary, frameworks: insp.frameworks, forms: insp.forms, formSummary: insp.formSummary, inputs: insp.inputs, selects: insp.selects, buttons: insp.buttons,
          links: insp.links, tables: insp.tables, scripts: insp.scripts, iframes: insp.iframes, interactive: insp.interactive, eventListeners, globalFunctions: insp.globalFunctions,
          javascriptElements: insp.javascriptElements, networkActivity: S.network, apiCandidates, possibleUrls: insp.possibleUrls, ids: insp.ids, names: insp.names, uiText: insp.uiText,
          actions: insp.actions, interactionRecording: S.actions.filter(a => ALLOWED_EVENT_TYPES.has(a.actionType)).map(a => ({ timestamp: a.timestampMs, eventType: a.actionType, selector: a.selectors ? a.selectors.primarySelector : '', tag: a.element ? a.element.tag : '', id: a.element ? a.element.id : '', name: a.element ? a.element.name : '', text: a.element ? a.element.text : '', ariaLabel: a.element ? a.element.ariaLabel : '' })),
          actionNetworkMap, automationCandidates: auto.automationCandidates, automationSummary: auto.automationSummary, automationTemplates: auto.automationTemplates, workflowCandidates, automationReadiness: auto.automationReadiness
        });
        const ai = SecurityManager.sanitize({
          page: insp.page, frameworks: insp.frameworks, automationSummary: auto.automationSummary, importantSelectors: auto.importantSelectors, importantActions: auto.importantActions,
          importantTables: auto.importantTables, workflowCandidates, apiCandidates: apiCandidates.slice(0, 50), actionNetworkMap: actionNetworkMap.slice(0, 50).map(e => ({ action: e.action.text, selector: e.action.selector, requests: e.requests })),
          automationTemplates: auto.automationTemplates, automationReadiness: auto.automationReadiness, deepDomAnalysis: insp.deepDomAnalysis,
          shadowHosts: insp.shadowHosts, customElements: insp.customElements.slice(0, 100), microfrontends: insp.microfrontends
        });
        await wait(400);
        download(JSON.stringify(full, null, 2), `PageInspector_FULL_${stamp()}.json`);
        await wait(400);
        download(JSON.stringify(ai, null, 2), `PageInspector_AI_${stamp()}.json`);
        window.__MacroRecorderAI_legacy__ = { full, ai };
      }

      window.__MacroRecorderAI_last__ = { estructura, secuencia };
      console.log('MacroRecorder - Treasury Team: JSON generados', { acciones: S.actions.length, requests: S.network.length, mutaciones: S.mutations.length });
    };

    return { exportAll };
  })();

  /* =====================================================================
     UIManager (Shadow DOM, position:fixed, z-index maximo)
     ===================================================================== */
  const UIManager = (() => {
    let hostEl = null, els = {};
    let lastFrameWarningScan = 0;
    const LABELS = { READY: 'READY', RECORDING: 'RECORDING', PAUSED: 'PAUSED', STOPPED: 'STOPPED', CANCELLED: 'CANCELLED', FINISHED: 'FINISHED' };
    const COLORS = { READY: '#2563eb', RECORDING: '#dc2626', PAUSED: '#d97706', STOPPED: '#d97706', CANCELLED: '#6b7280', FINISHED: '#16a34a' };

    const refreshFrameWarning = (force = false) => {
      if (!els.warn) return;
      const now = Date.now();
      if (!force && now - lastFrameWarningScan < 1000) return;
      lastFrameWarningScan = now;
      const inaccessibleCount = getAllElementsDeep(document).filter(el =>
        (el.localName === 'iframe' || el.localName === 'frame') && !isInternalRecorderNode(el)
      ).filter(frame => {
        try {
          const frameDoc = frame.contentDocument;
          return !frameDoc || frameDoc.location.origin !== frame.ownerDocument.location.origin;
        } catch (e) {
          return true;
        }
      }).length;
      els.warn.hidden = inaccessibleCount === 0;
      els.warn.textContent = inaccessibleCount
        ? `Aviso: ${inaccessibleCount} iframe(s) inaccesible(s). El navegador bloquea sus clics y campos desde este bookmarklet.`
        : '';
    };

    const build = () => {
      hostEl = document.createElement('div');
      hostEl.id = '__macroRecorderAI_host';
      hostEl.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
      const root = hostEl.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          .p{font:13px/1.4 Arial,sans-serif;background:#111827;color:#fff;border-radius:8px;padding:10px 12px;width:240px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
          .h{display:flex;justify-content:space-between;align-items:center;cursor:move;font-weight:bold;margin-bottom:8px;user-select:none}
          .r{display:flex;justify-content:space-between;align-items:center;margin:4px 0}
          button{font:12px Arial;padding:5px 8px;border:0;border-radius:4px;color:#fff;cursor:pointer;margin-right:4px}
          button:disabled{opacity:.4;cursor:not-allowed}
          .b{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:bold;font-size:11px}
          label{font-size:11px;color:#d1d5db}
          .w{margin:8px 0;padding:7px 8px;border-left:3px solid #d97706;border-radius:3px;background:#fff4ce;color:#634b00;font:11px/1.4 Arial,sans-serif}
          .w[hidden]{display:none}
        </style>
        <div class="p">
          <div class="h" id="hd"><span>MacroRecorder - Treasury Team</span><button id="x" type="button" aria-label="Cerrar panel" title="Cerrar" style="background:#374151;width:24px;height:24px;padding:0">&times;</button></div>
          <div class="r"><span>Estado</span><span class="b" id="st">READY</span></div>
          <div class="w" id="warn" role="status" aria-live="polite" hidden></div>
          <div class="r"><span id="cnt" style="font-size:11px;color:#9ca3af"></span></div>
          <div class="r"><label><input type="checkbox" id="leg"> Incluir inspector completo (FULL/AI)</label></div>
          <div class="r" style="margin-top:8px"><button id="bs" style="background:#16a34a">Start</button><button id="bp" style="background:#d97706">Pause</button><button id="bc" style="background:#6b7280">Cancel</button><button id="bf" style="background:#2563eb">Finish</button></div>
        </div>`;
      ['st', 'warn', 'cnt', 'leg', 'bs', 'bp', 'bc', 'bf', 'x', 'hd'].forEach(id => { els[id] = root.getElementById(id); });
      els.bs.addEventListener('click', () => RecordingManager.start({ includeLegacy: els.leg.checked }));
      els.bp.addEventListener('click', () => RecordingManager.pause());
      els.bc.addEventListener('click', () => RecordingManager.cancel());
      els.bf.addEventListener('click', () => RecordingManager.stop('manual'));
      els.x.addEventListener('click', e => {
        e.stopPropagation();
        hostEl.remove();
        if (S.status !== 'RECORDING') delete window.__MacroRecorderAI__;
      });
      let drag = null;
      els.hd.addEventListener('pointerdown', e => {
        if (e.target.closest('button,input')) return;
        const r = hostEl.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        els.hd.setPointerCapture(e.pointerId);
      });
      els.hd.addEventListener('pointermove', e => { if (drag) { hostEl.style.left = (e.clientX - drag.dx) + 'px'; hostEl.style.top = (e.clientY - drag.dy) + 'px'; hostEl.style.right = 'auto'; } });
      els.hd.addEventListener('pointerup', () => { drag = null; });
      (document.body || document.documentElement).appendChild(hostEl);
    };

    const render = () => {
      if (!hostEl) return;
      refreshFrameWarning();
      const st = S.status, rec = st === 'RECORDING', active = rec || st === 'PAUSED';
      els.st.textContent = LABELS[st]; els.st.style.background = COLORS[st];
      els.cnt.textContent = (active || st === 'STOPPED' || st === 'FINISHED') ? `${S.actions.length} acciones · ${S.network.length} requests · ${S.mutations.length} mutaciones` : '';
      els.bs.disabled = rec || st === 'STOPPED';
      els.bp.disabled = !rec;
      els.bc.disabled = !active;
      els.bf.disabled = !active || st === 'STOPPED';
      els.leg.disabled = active;
    };

    const isOwnNode = n => !!hostEl && (n === hostEl || hostEl.contains(n));
    const isOwn = e => { try { const p = e.composedPath ? e.composedPath() : []; return !!hostEl && (p.includes(hostEl) || isOwnNode(e.target)); } catch (er) { return false; } };
    const show = () => { if (hostEl && !hostEl.isConnected) (document.body || document.documentElement).appendChild(hostEl); render(); };

    return { build, render, show, isOwn, isOwnNode, host: () => hostEl };
  })();

  /* =====================================================================
     Arranque
     ===================================================================== */
  window.__MacroRecorderAI__ = {
    version: CFG.VERSION, show: () => UIManager.show(), start: o => RecordingManager.start(o), pause: () => RecordingManager.pause(), stop: () => RecordingManager.stop('manual'),
    cancel: () => RecordingManager.cancel(), getAllElementsDeep: root => getAllElementsDeep(root || document),
    state: () => ({ status: S.status, actions: S.actions.length, requests: S.network.length, mutations: S.mutations.length })
  };

  UIManager.build();
  DOMAnalyzer.scheduleScans();
  const pending = StorageManager.load();
  if (pending) RecordingManager.resume(pending);
  else UIManager.render();
})();
