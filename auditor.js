/**
 * auditor.js — Auditoría de gestión de cookies por contraste entre escenarios.
 *
 * Implementa el módulo de verificación del cumplimiento efectivo (componente C4)
 * del diseño: visita cada sitio seis veces desde un perfil limpio, aplica en cada
 * visita un tratamiento distinto y deriva las violaciones del contraste entre lo
 * observado en un escenario y lo observado en otro.
 *
 * Uso:
 *   npm install playwright
 *   npx playwright install chromium
 *   node auditor.js https://ejemplo.cr
 *   node auditor.js --lista sitios.txt --salida corpus/
 *
 * Produce un JSON por sitio con la evidencia completa de los seis escenarios y
 * las violaciones derivadas. El JSON es el corpus de evidencia: lo que permite
 * que un tercero recalcule el resultado sin volver a visitar el sitio.
 */

'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ───────────────────────────────────────────────────────────── configuración
const CFG = {
  esperaCarga: 7000,        // ms tras domcontentloaded, para que corran los scripts
  esperaInterstitial: 6000, // ms extra cuando hay un aviso superpuesto que se cierra solo
  esperaTrasClic: 4000,     // ms tras pulsar un botón del banner
  timeoutNavegacion: 45000,
  pausaEntreEscenarios: 2000,
  // Agente realista: el diseño exige no presentarse como bot, pero tampoco mentir
  // sobre el propósito. El contacto permite a un administrador identificar el origen.
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
             'Chrome/131.0.0.0 Safari/537.36 (+investigacion-academica-TEC)',
  viewport: { width: 1366, height: 768 },
  locale: 'es-CR',
  timezoneId: 'America/Costa_Rica',
};

// Dominios rastreadores conocidos. En producción esto se sustituye por una lista
// mantenida (p. ej. la de Disconnect o EasyPrivacy); aquí va un núcleo mínimo
// para que el script funcione de entrada.
const RASTREADORES = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'googlesyndication.com',
  'googleadservices.com', 'facebook.com', 'facebook.net', 'connect.facebook.net',
  'hotjar.com', 'clarity.ms', 'segment.io', 'segment.com', 'mixpanel.com',
  'amplitude.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'adsrvr.org', 'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
  'scorecardresearch.com', 'quantserve.com', 'bing.com', 'linkedin.com', 'licdn.com',
  'twitter.com', 't.co', 'tiktok.com', 'ttwstatic.com', 'snapchat.com', 'sc-static.net',
  'yandex.ru', 'mc.yandex.ru', 'newrelic.com', 'nr-data.net', 'cloudflareinsights.com',
  // Publicidad programática y medición, ampliado tras el piloto
  'adform.net', 'smartadserver.com', 'teads.tv', 'sharethrough.com', 'indexww.com',
  'casalemedia.com', 'yieldmo.com', 'districtm.io', '33across.com', 'bidswitch.net',
  'everesttech.net', 'demdex.net', 'omtrdc.net', 'adobedtm.com', 'adsymptotic.com',
  'crwdcntrl.net', 'bluekai.com', 'exelator.com', 'eyeota.net', 'tapad.com',
  'agkn.com', 'mathtag.com', 'turn.com', 'spotxchange.com', 'springserve.com',
  'amazon-adsystem.com', 'media.net', 'onetag-sys.com', 'gumgud.com', 'gumgum.com',
  'sonobi.com', 'lijit.com', 'sovrn.com', 'triplelift.com', 'gemini.yahoo.com',
  'ad.gt', 'adlightning.com', 'confiant-integrations.net', 'permutive.com',
  'parsely.com', 'chartbeat.com', 'chartbeat.net', 'optimizely.com', 'vwo.com',
  'crazyegg.com', 'fullstory.com', 'logrocket.com', 'smartlook.com', 'inspectlet.com',
  'mouseflow.com', 'heap.io', 'heapanalytics.com', 'kissmetrics.com', 'matomo.cloud',
  'pingdom.net', 'onesignal.com', 'pushwoosh.com', 'braze.com', 'appsflyer.com',
  'branch.io', 'adjust.com', 'kochava.com', 'singular.net', 'bttrack.com',
  'taboolasyndication.com', 'zemanta.com', 'revcontent.com', 'mgid.com', 'plista.com',
  'outbrainimg.com', 'disqus.com', 'disquscdn.com', 'addthis.com', 'sharethis.com',
  'hubspot.com', 'hs-analytics.net', 'hsforms.net', 'marketo.net', 'pardot.com',
  'salesforceliveagent.com', 'intercom.io', 'drift.com', 'zdassets.com', 'zopim.com',
  'tawk.to', 'livechatinc.com',
];

// Plataformas de gestión del consentimiento. NO son rastreadores: son la
// infraestructura con la que un sitio pide permiso. Contarlas como rastreo
// penalizaría precisamente a los sitios que sí preguntan, y sesgaría la
// comparación en la única dirección que no debe sesgarse. Se listan aparte
// para poder reconocerlas e informar de su presencia, que es un indicio de
// que el sitio implanta un mecanismo de consentimiento.
const PLATAFORMAS_CONSENTIMIENTO = [
  'cdn.cookielaw.org', 'cookielaw.org', 'onetrust.com', 'cookiebot.com', 'usercentrics.eu',
  'didomi.io', 'privacy-center.org', 'trustarc.com', 'quantcast.mgr.consensu.org',
  'consensu.org', 'iubenda.com', 'termly.io', 'osano.com', 'cookieyes.com',
];

// Nombres de cookie que la literatura y las bases públicas asocian a rastreo.
const COOKIES_RASTREO = [
  /^_ga/, /^_gid$/, /^_gat/, /^__utm/, /^_fbp$/, /^_fbc$/, /^fr$/, /^_hj/, /^_clck$/,
  /^_clsk$/, /^MUID$/, /^IDE$/, /^test_cookie$/, /^_tt_enable_cookie$/, /^_ttp$/,
  /^ajs_/, /^amplitude_/, /^mp_/, /^__qca$/, /^_pk_/, /^sc_at$/, /^li_sugr$/, /^bcookie$/,
];

// Cookies que suelen ser estrictamente necesarias. Sirven de descarte rápido;
// la regla de precedencia completa está en el manual de codificación.
const COOKIES_ESENCIALES = [
  /^(PHP)?SESS/i, /^JSESSIONID$/, /^ASP\.NET_SessionId$/i, /^csrftoken$/i, /^_csrf/i,
  /^XSRF-TOKEN$/i, /^cf_clearance$/, /^__cf_bm$/, /^AWSALB/, /^wordpress_logged_in/,
  /cookie[-_]?consent/i, /^cookielawinfo/i, /^OptanonConsent$/, /^euconsent/i,
];

// ─────────────────────────────────── bases públicas importadas (fuentes F1/F2)
// Las listas de arriba son un núcleo mínimo escrito a mano para que el script
// arranque sin dependencias. Las de abajo son las bases públicas reales, con su
// procedencia y su huella registradas en listas.js, que es lo que permite citar
// la fuente y que un tercero reproduzca la clasificación. Una lista propia no
// puede presentarse como la de Disconnect: por eso se importan y no se copian.
const L = require('./listas.js');
const SET_ESENCIALES = new Set(L.OCD_ESENCIALES);
const SET_RASTREO = new Set(L.OCD_RASTREO);
const SET_FUNCIONALES = new Set(L.OCD_FUNCIONALES);
const SET_DISCONNECT = new Set(L.DISCONNECT_RASTREADORES);

/** ¿El nombre figura en la lista, por coincidencia exacta o por prefijo? */
function enCatalogo(nombre, exactos, prefijos) {
  if (exactos.has(nombre)) return true;
  return prefijos.some((p) => nombre.startsWith(p));
}

// ────────────────────────────────────────────────────────── utilidades varias
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const dominioDe = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** ¿El host pertenece a una plataforma de gestión del consentimiento? */
function esPlataformaConsentimiento(host) {
  const h = host.replace(/^www\./, '');
  return PLATAFORMAS_CONSENTIMIENTO.some((d) => h === d || h.endsWith('.' + d));
}

function esRastreador(host) {
  const h = host.replace(/^www\./, '');
  if (esPlataformaConsentimiento(h)) return false;   // precede a todo lo demás
  if (RASTREADORES.some((d) => h === d || h.endsWith('.' + d))) return true;
  if (SET_DISCONNECT.has(h)) return true;
  // Coincidencia por dominio padre: sub.rastreador.com cuenta como rastreador.
  const partes = h.split('.');
  for (let i = 1; i < partes.length - 1; i++) {
    if (SET_DISCONNECT.has(partes.slice(i).join('.'))) return true;
  }
  return false;
}

function esPrimeraParte(hostCookie, hostSitio) {
  const a = hostCookie.replace(/^\./, '').replace(/^www\./, '');
  const b = hostSitio.replace(/^www\./, '');
  return a === b || b.endsWith('.' + a) || a.endsWith('.' + b);
}

/**
 * Clasificación de una cookie. Implementa, en forma reducida, las reglas de
 * precedencia RC-1 a RC-6: la evidencia más fuerte gana, y cuando ninguna regla
 * resuelve, la cookie queda INDETERMINADA y nunca se le imputa una violación.
 *
 * `soloTrasAceptar` implementa la regla RC-5b, incorporada durante la prueba
 * piloto conforme al procedimiento de ampliación del manual de codificación:
 * una cookie que no existe antes de aceptar y aparece solo después de hacerlo
 * no puede ser estrictamente necesaria, porque el sitio funcionó sin ella.
 */
function clasificar(cookie, hostSitio, soloTrasAceptar = false) {
  const nombre = cookie.name;
  const host = (cookie.domain || '').replace(/^\./, '');
  const terceraParte = !esPrimeraParte(host, hostSitio);

  if (COOKIES_ESENCIALES.some((rx) => rx.test(nombre)))
    return { clase: 'esencial', regla: 'RC-1', motivo: 'patrón de sesión, seguridad o registro de consentimiento' };

  if (enCatalogo(nombre, SET_ESENCIALES, L.OCD_ESENCIALES_PREFIJO))
    return { clase: 'esencial', regla: 'RC-1', motivo: 'catalogada como Necessary o Security en la Open Cookie Database (F1)' };

  if (COOKIES_RASTREO.some((rx) => rx.test(nombre)))
    return { clase: 'no_esencial', regla: 'RC-2', motivo: 'nombre listado en bases públicas de cookies de rastreo' };

  if (enCatalogo(nombre, SET_RASTREO, L.OCD_RASTREO_PREFIJO))
    return { clase: 'no_esencial', regla: 'RC-2', motivo: 'catalogada como Marketing o Analytics en la Open Cookie Database (F1)' };

  if (terceraParte && esRastreador(host))
    return { clase: 'no_esencial', regla: 'RC-3', motivo: `dominio de tercero con finalidad de rastreo (${host})` };

  if (terceraParte)
    return { clase: 'no_esencial', regla: 'RC-3', motivo: `cookie de tercero (${host})` };

  // RC-5: primera parte, persistente y con valor de alta entropía → presunción
  const duracionDias = cookie.expires > 0 ? (cookie.expires * 1000 - Date.now()) / 86400000 : 0;
  const valor = String(cookie.value || '');
  const entropia = /^[A-Za-z0-9._~+/=-]{16,}$/.test(valor) && /\d/.test(valor) && /[A-Za-z]/.test(valor);
  if (duracionDias > 180 && entropia)
    return { clase: 'no_esencial', regla: 'RC-5', motivo: `primera parte, ${Math.round(duracionDias)} días, valor de alta entropía` };

  // RC-5b: aparece solo después de aceptar, luego el sitio funcionaba sin ella
  if (soloTrasAceptar)
    return { clase: 'no_esencial', regla: 'RC-5b', motivo: 'ausente en E0 y presente tras aceptar: no es necesaria para el funcionamiento' };

  // RC-6. Ninguna regla resuelve. Se deja constancia de si la base F1 la cataloga
  // como Functional o Personalization: esas categorías no bastan para situarla en
  // la exención del artículo 5.3 de la Directiva ePrivacy, que alcanza solo a lo
  // estrictamente necesario, pero tampoco para declararla de rastreo. Queda
  // indeterminada y no se le imputa violación; registrar el motivo permite
  // cuantificar cuánta de la incertidumbre viene de ese grupo concreto.
  if (enCatalogo(nombre, SET_FUNCIONALES, L.OCD_FUNCIONALES_PREFIJO))
    return { clase: 'indeterminada', regla: 'RC-6', motivo: 'catalogada como Functional o Personalization en F1: ni exenta ni de rastreo' };

  return { clase: 'indeterminada', regla: 'RC-6', motivo: 'ninguna regla resuelve; no se imputa violación' };
}

// ──────────────────────────────────────────────── localización del banner
const TXT_ACEPTAR = [
  'aceptar todas', 'aceptar todo', 'acepto todas', 'aceptar cookies', 'permitir todas',
  'aceptar', 'acepto', 'entendido', 'de acuerdo', 'continuar', 'accept all', 'allow all', 'i agree',
];
const TXT_RECHAZAR = [
  'rechazar todas', 'rechazar todo', 'rechazar cookies', 'denegar todas', 'denegar',
  'solo necesarias', 'solo las necesarias', 'únicamente necesarias', 'solo esenciales',
  'rechazar', 'reject all', 'decline all', 'deny', 'only necessary', 'necessary only',
];
const TXT_CONFIGURAR = [
  'configurar', 'configuración', 'personalizar', 'preferencias', 'gestionar', 'más opciones',
  'ajustes', 'manage', 'settings', 'customize', 'preferences',
];

/** Devuelve el primer control visible cuyo texto coincide con alguna variante. */
async function buscarControl(page, variantes) {
  const candidatos = await page.$$(
    'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], a'
  );
  for (const v of variantes) {
    for (const el of candidatos) {
      try {
        if (!(await el.isVisible())) continue;
        const t = ((await el.textContent()) || (await el.getAttribute('value')) || '')
          .trim().toLowerCase().replace(/\s+/g, ' ');
        if (!t || t.length > 60) continue;
        if (t === v || t.startsWith(v) || t.includes(v)) return { el, texto: t, variante: v };
      } catch { /* el nodo pudo desaparecer */ }
    }
  }
  return null;
}

/**
 * Cierra avisos publicitarios superpuestos antes de buscar el banner.
 * Durante el piloto se comprobó que un interstitial puede tapar por completo
 * el aviso de cookies y producir un falso «sin banner» justo en los sitios con
 * más publicidad, que son los que más rastreadores cargan: un sesgo que iría
 * en contra del hallazgo.
 */
async function cerrarInterstitial(page) {
  const cerrados = [];
  const SEL = [
    '[aria-label*="cerrar" i]', '[aria-label*="close" i]', '[title*="cerrar" i]',
    '[class*="close" i][class*="ad" i]', '[id*="close" i][id*="ad" i]',
    '.modal-close', '.popup-close', '[data-dismiss="modal"]',
  ];
  for (const s of SEL) {
    for (const el of await page.$$(s)) {
      try {
        if (!(await el.isVisible())) continue;
        const caja = await el.boundingBox();
        if (!caja || caja.width > 220 || caja.height > 220) continue;  // un aspa, no un botón grande
        await el.click({ timeout: 2500 });
        cerrados.push(s);
        await dormir(900);
      } catch { /* desapareció o no era pulsable */ }
    }
  }
  // Algunos interstitials solo se cierran solos; se les da margen una vez.
  if (!cerrados.length) await dormir(CFG.esperaInterstitial);
  return cerrados;
}

/** Heurística de presencia de banner: contenedor visible que menciona cookies. */
async function detectarBanner(page) {
  return page.evaluate(() => {
    const SEL = [
      '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
      '[id*="gdpr" i]', '[class*="gdpr" i]', '[aria-label*="cookie" i]',
      '#onetrust-banner-sdk', '#CybotCookiebotDialog', '.cc-window', '#didomi-host', '#usercentrics-root',
    ];
    for (const s of SEL) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width > 180 && r.height > 40 && cs.display !== 'none' && cs.visibility !== 'hidden' &&
            parseFloat(cs.opacity || '1') > 0.1) {
          return {
            presente: true, selector: s,
            geometria: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            cubrePantalla: r.height > innerHeight * 0.6,
            texto: (el.innerText || '').trim().slice(0, 600),
            // R14: ¿aparece antes de cualquier interacción? Aquí ya está en el DOM al cargar.
          };
        }
      }
    }
    return { presente: false };
  });
}

// ─────────────────────────────────────────────────── ejecución de un escenario
/**
 * Ejecuta un escenario sobre un contexto de navegador recién creado.
 * accion: función (page) => Promise<string[]>  — el tratamiento aplicado.
 */
async function ejecutarEscenario(browser, url, id, accion, opciones = {}) {
  const ctx = await browser.newContext({
    userAgent: CFG.userAgent, viewport: CFG.viewport,
    locale: CFG.locale, timezoneId: CFG.timezoneId,
  });
  const page = await ctx.newPage();

  const peticiones = [];
  page.on('request', (req) => {
    const h = dominioDe(req.url());
    if (h) peticiones.push({ host: h, tipo: req.resourceType() });
  });

  const resultado = {
    escenario: id, url, instante: new Date().toISOString(),
    error: null, bitacora: [], banner: null,
    cookies: [], almacenamiento: {}, terceros: [], peticionesRastreo: [],
  };

  try {
    // Regla C12: ante un rechazo del sitio se reintenta una vez con ritmo
    // reducido antes de declararlo no auditable.
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.timeoutNavegacion });
    } catch (primero) {
      resultado.bitacora.push(`primer intento fallido (${primero.message.split('\n')[0]}); reintento con ritmo reducido`);
      await dormir(5000);
      await page.goto(url, { waitUntil: 'load', timeout: CFG.timeoutNavegacion * 2 });
      resultado.reintentado = true;
    }
    await dormir(CFG.esperaCarga);

    const cerrados = await cerrarInterstitial(page);
    if (cerrados.length) resultado.bitacora.push(`cerrado aviso superpuesto (${cerrados[0]})`);

    resultado.banner = await detectarBanner(page);
    resultado.bitacora.push(resultado.banner.presente ? 'banner detectado' : 'sin banner detectable');

    // El tratamiento propio del escenario
    const pasos = await accion(page, resultado);
    resultado.bitacora.push(...pasos);

    // Captura del estado final
    resultado.cookies = (await ctx.cookies()).map((c) => ({
      name: c.name, domain: c.domain, path: c.path,
      expires: c.expires, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      duracionDias: c.expires > 0 ? Math.round((c.expires * 1000 - Date.now()) / 86400000) : 0,
      valorLongitud: String(c.value || '').length,
    }));
    resultado.almacenamiento = await page.evaluate(() => {
      const leer = (s) => { try { return Object.keys(s).slice(0, 80); } catch { return ['<bloqueado>']; } };
      return { localStorage: leer(localStorage), sessionStorage: leer(sessionStorage) };
    });

    const hostSitio = dominioDe(url);
    const hosts = [...new Set(peticiones.map((p) => p.host))];
    resultado.terceros = hosts.filter((h) => !esPrimeraParte(h, hostSitio));
    resultado.peticionesRastreo = resultado.terceros.filter(esRastreador);
  } catch (e) {
    resultado.error = e.message.split('\n')[0];
  } finally {
    if (opciones.capturar) {
      try { await page.screenshot({ path: opciones.capturar, fullPage: false }); } catch {}
    }
    await ctx.close();
  }
  return resultado;
}

// ──────────────────────────────────────────────── los seis tratamientos
const ESCENARIOS = {
  // E0 — carga sin interacción: qué instala el sitio antes de que yo decida nada.
  E0: async () => ['ninguna interacción con el banner'],

  // E1 — aceptar todo: establece el universo de referencia.
  E1: async (page, res) => {
    const c = await buscarControl(page, TXT_ACEPTAR);
    if (!c) { res.interaccionLograda = false; return ['no se localizó control de aceptación']; }
    await c.el.click({ timeout: 5000 }).catch(() => {});
    await dormir(CFG.esperaTrasClic);
    res.controlUsado = c.texto;
    res.interaccionLograda = true;
    return [`pulsado «${c.texto}»`];
  },

  // E2 — rechazar todo: el contraste decisivo contra E1.
  E2: async (page, res) => {
    let c = await buscarControl(page, TXT_RECHAZAR);
    const pasos = [];
    if (!c) {
      // R03: si no hay rechazo en primera capa, hay que entrar a configuración.
      const cfg = await buscarControl(page, TXT_CONFIGURAR);
      if (cfg) {
        await cfg.el.click({ timeout: 5000 }).catch(() => {});
        await dormir(2500);
        pasos.push(`sin rechazo en primera capa; abierto «${cfg.texto}»`);
        res.rechazoEnPrimeraCapa = false;
        c = await buscarControl(page, TXT_RECHAZAR);
      }
    } else {
      res.rechazoEnPrimeraCapa = true;
    }
    if (!c) {
      res.interaccionLograda = false;
      return [...pasos, 'NO SE ENCONTRÓ CONTROL DE RECHAZO — requiere evaluación manual'];
    }
    await c.el.click({ timeout: 5000 }).catch(() => {});
    await dormir(CFG.esperaTrasClic);
    res.controlUsado = c.texto;
    res.interaccionLograda = true;
    return [...pasos, `pulsado «${c.texto}»`];
  },

  // E3 — selección granular. Automatizable solo en parte: los paneles de
  // preferencias no tienen estructura común. Se marca como mixto y se deja la
  // captura para codificación manual.
  E3: async (page, res) => {
    const cfg = await buscarControl(page, TXT_CONFIGURAR);
    if (!cfg) { res.interaccionLograda = false; return ['no se localizó panel de preferencias — evaluación manual']; }
    await cfg.el.click({ timeout: 5000 }).catch(() => {});
    await dormir(2500);
    const casillas = await page.$$eval('input[type="checkbox"]', (els) =>
      els.filter((e) => e.offsetParent !== null)
         .map((e) => ({ id: e.id || e.name || '', marcada: e.checked, deshabilitada: e.disabled })));
    res.casillas = casillas;
    // R16: ¿vienen premarcadas las finalidades no esenciales?
    res.premarcadas = casillas.filter((c) => c.marcada && !c.deshabilitada).length;
    const guardar = await buscarControl(page, ['guardar', 'confirmar', 'aplicar', 'save', 'confirm']);
    if (guardar) { await guardar.el.click({ timeout: 5000 }).catch(() => {}); await dormir(CFG.esperaTrasClic); }
    res.interaccionLograda = !!guardar;
    return [`panel abierto; ${casillas.length} casillas, ${res.premarcadas} premarcadas`,
            guardar ? `guardado con «${guardar.texto}»` : 'sin botón de guardar — manual'];
  },

  // E4 — ignorar el banner y navegar: ¿trata la navegación como aceptación?
  E4: async (page) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await dormir(1500);
    const enlaces = await page.$$eval('a[href]', (as, origen) =>
      as.map((a) => a.href).filter((h) => h.startsWith(origen) && !h.includes('#')).slice(0, 10),
      new URL(page.url()).origin);
    if (enlaces.length) {
      await page.goto(enlaces[0], { waitUntil: 'domcontentloaded', timeout: CFG.timeoutNavegacion }).catch(() => {});
      await dormir(CFG.esperaCarga);
      return ['desplazamiento y navegación interna sin tocar el banner'];
    }
    return ['desplazamiento sin tocar el banner; sin enlaces internos navegables'];
  },
};

/**
 * E5 — revisita tras rechazo. Único escenario con dos actos dentro del mismo
 * perfil: el perfil nace limpio, se rechaza, se abandona el sitio y se vuelve.
 * Mide si la decisión persiste (R10) y si la revocación sigue disponible (R08).
 */
async function escenarioE5(browser, url) {
  const ctx = await browser.newContext({
    userAgent: CFG.userAgent, viewport: CFG.viewport,
    locale: CFG.locale, timezoneId: CFG.timezoneId,
  });
  const page = await ctx.newPage();
  const res = {
    escenario: 'E5', url, instante: new Date().toISOString(),
    error: null, bitacora: [], banner: null, cookies: [], almacenamiento: {},
    terceros: [], peticionesRastreo: [], bannerReaparece: null,
  };
  const peticiones = [];
  page.on('request', (r) => { const h = dominioDe(r.url()); if (h) peticiones.push(h); });

  try {
    // Acto 1: rechazar
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.timeoutNavegacion });
    await dormir(CFG.esperaCarga);
    const pasos = await ESCENARIOS.E2(page, res);
    res.bitacora.push('acto 1 — ' + pasos.join('; '));

    // Acto 2: abandonar y volver, con el mismo perfil
    await page.goto('about:blank');
    await dormir(CFG.pausaEntreEscenarios);
    peticiones.length = 0;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.timeoutNavegacion });
    await dormir(CFG.esperaCarga);

    res.banner = await detectarBanner(page);
    res.bannerReaparece = res.banner.presente;
    res.bitacora.push('acto 2 — revisita: ' + (res.bannerReaparece
      ? 'el banner REAPARECE (indicio de que la decisión no persistió)'
      : 'el banner no reaparece'));

    res.cookies = (await ctx.cookies()).map((c) => ({
      name: c.name, domain: c.domain, expires: c.expires,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      duracionDias: c.expires > 0 ? Math.round((c.expires * 1000 - Date.now()) / 86400000) : 0,
      valorLongitud: String(c.value || '').length,
    }));
    const hostSitio = dominioDe(url);
    const hosts = [...new Set(peticiones)];
    res.terceros = hosts.filter((h) => !esPrimeraParte(h, hostSitio));
    res.peticionesRastreo = res.terceros.filter(esRastreador);
  } catch (e) {
    res.error = e.message.split('\n')[0];
  } finally {
    await ctx.close();
  }
  return res;
}

// ───────────────────────────────────────── derivación de violaciones
/** Claves de cookie presentes en el escenario de línea base. */
function clavesDe(escenario) {
  return new Set((escenario && escenario.cookies || []).map((c) => `${c.name}@${c.domain}`));
}

/**
 * Cookies no esenciales de un escenario. `aparecenAlAceptar` son las claves
 * que la regla RC-5b marca como prescindibles por haber surgido únicamente
 * después de una aceptación efectiva.
 */
function noEsenciales(escenario, hostSitio, aparecenAlAceptar = new Set()) {
  const out = new Map();
  for (const c of escenario.cookies || []) {
    const clave = `${c.name}@${c.domain}`;
    const k = clasificar(c, hostSitio, aparecenAlAceptar.has(clave));
    if (k.clase === 'no_esencial') out.set(clave, { ...c, ...k });
  }
  return out;
}

/** ¿Se aplicó realmente el tratamiento del escenario? */
const hubo = (e) => !!(e && e.interaccionLograda === true);

function derivarViolaciones(E, hostSitio) {
  const V = [];
  const indet = [];
  const omitidas = [];
  const baseE0 = clavesDe(E.E0);

  // RC-5b: el conjunto se deriva ÚNICAMENTE de E1, comparado contra E0. Una
  // cookie que aparece tras rechazar no entra aquí: lo que la regla establece
  // es que el sitio funcionaba sin ella antes de que alguien aceptara nada.
  const aparecenAlAceptar = new Set();
  if (hubo(E.E1)) {
    for (const clave of clavesDe(E.E1)) if (!baseE0.has(clave)) aparecenAlAceptar.add(clave);
  }

  for (const id of Object.keys(E)) {
    for (const c of E[id].cookies || []) {
      const clave = `${c.name}@${c.domain}`;
      const k = clasificar(c, hostSitio, aparecenAlAceptar.has(clave));
      // Se guarda la regla y el motivo, no solo el nombre: sin ellos no se puede
      // saber por qué una cookie quedó sin resolver, y por tanto tampoco cuánta
      // de la incertidumbre total viene de cada causa.
      if (k.clase === 'indeterminada')
        indet.push({ escenario: id, cookie: c.name, dominio: c.domain, regla: k.regla, motivo: k.motivo });
    }
  }

  const ne = {};
  for (const id of Object.keys(E)) ne[id] = noEsenciales(E[id], hostSitio, aparecenAlAceptar);
  const universoRef = ne.E1 || new Map();   // E1 define el universo de referencia

  // V1 — instalación previa al consentimiento
  if (ne.E0 && ne.E0.size) {
    V.push({ id: 'V1', gravedad: 'Alta', nombre: 'Instalación previa al consentimiento',
      evidencia: [...ne.E0.keys()], regla: 'cookies no esenciales presentes en E0' });
  } else if (E.E0 && E.E0.peticionesRastreo.length) {
    V.push({ id: 'V1', gravedad: 'Alta', nombre: 'Instalación previa al consentimiento',
      evidencia: E.E0.peticionesRastreo, regla: 'peticiones a dominios rastreadores en E0 sin cookie observable' });
  }

  // V2 — cookies pese al rechazo explícito: la intersección del Algoritmo 3.
  // Exige que la aceptación de E1 y el rechazo de E2 se hayan aplicado de
  // verdad: sin ambas, E1 y E2 son la misma visita pasiva y el contraste no
  // significa nada.
  if (!hubo(E.E1) || !hubo(E.E2)) {
    omitidas.push({ id: 'V2', motivo: !hubo(E.E1)
      ? 'no se logró aceptar en E1, de modo que no hay universo de referencia'
      : 'no se logró rechazar en E2, de modo que no hubo decisión que respetar' });
  } else if (ne.E2 && universoRef.size) {
    const inter = [...ne.E2.keys()].filter((k) => universoRef.has(k));
    if (inter.length) {
      V.push({ id: 'V2', gravedad: 'Crítica', nombre: 'Cookies pese al rechazo explícito',
        evidencia: inter, regla: 'no_esenciales(E2) ∩ universo_ref ≠ ∅' });
    }
  }

  // V3 — selección granular ignorada (parcial: requiere confirmación manual)
  if (!hubo(E.E3)) {
    omitidas.push({ id: 'V3', motivo: 'no se logró completar una selección granular en E3' });
  } else if (ne.E3 && ne.E3.size && E.E3.casillas && E.E3.casillas.length) {
    V.push({ id: 'V3', gravedad: 'Crítica', nombre: 'Incumplimiento de la selección granular',
      evidencia: [...ne.E3.keys()], regla: 'cookies no esenciales tras selección granular',
      requiereConfirmacionManual: true });
  }

  // V4 — aceptación implícita por navegación
  if (E.E4 && ne.E4 && ne.E4.size && E.E4.banner && E.E4.banner.presente) {
    V.push({ id: 'V4', gravedad: 'Alta', nombre: 'Aceptación implícita por navegación',
      evidencia: [...ne.E4.keys()], regla: 'cookies no esenciales en E4 sin interacción con el banner' });
  }

  // V5 — no persistencia de la decisión. Solo tiene sentido si en el acto 1 de
  // E5 se llegó a rechazar: sin rechazo previo, que el banner aparezca en la
  // revisita es lo normal y no prueba nada.
  if (!hubo(E.E5)) {
    omitidas.push({ id: 'V5', motivo: 'no se logró rechazar en el primer acto de E5, de modo que no hay decisión cuya persistencia medir' });
    omitidas.push({ id: 'V6', motivo: 'sin rechazo previo no puede valorarse la revocación' });
  } else {
    const reinstala = ne.E5 && universoRef.size
      ? [...ne.E5.keys()].filter((k) => universoRef.has(k)) : [];
    if (E.E5.bannerReaparece || reinstala.length) {
      V.push({ id: 'V5', gravedad: 'Media', nombre: 'No persistencia de la decisión',
        evidencia: E.E5.bannerReaparece ? ['el banner reaparece en la revisita', ...reinstala] : reinstala,
        regla: 'banner reaparece en E5 o se reinstalan cookies rechazadas' });
    }
    // V6 — revocación inoperante (indicio; la comprobación plena es mixta)
    if (E.E5.banner && !E.E5.banner.presente && ne.E5 && ne.E5.size) {
      V.push({ id: 'V6', gravedad: 'Media', nombre: 'Revocación inoperante',
        evidencia: [...ne.E5.keys()], regla: 'persisten cookies no esenciales sin control de revocación visible',
        requiereConfirmacionManual: true });
    }
  }

  // V7 y V8 no son automatizables aquí: V7 exige leer la política de cookies y
  // V8 decodificar la cadena TCF. Quedan marcadas como pendientes.
  const pendientes = [
    { id: 'V7', nombre: 'Discrepancia entre declaración y realidad', modo: 'manual',
      razon: 'requiere contrastar el inventario observado contra la política de cookies' },
    { id: 'V8', nombre: 'Discrepancia entre la cadena TCF y el comportamiento', modo: 'mixto',
      razon: 'requiere decodificar la cadena TCF y verificar la transmisión a proveedores' },
  ];

  // Regla C1 del manual: la ausencia de banner nunca se da por buena sin
  // revisión humana, y nunca se registra por un fallo de detección.
  const sinBanner = !(E.E0 && E.E0.banner && E.E0.banner.presente);
  const revision = [];
  if (sinBanner) {
    revision.push({
      regla: 'C1',
      asunto: 'no se detectó banner en ningún escenario',
      queHacer: 'Abrir el sitio en ventana privada y confirmar a mano. Si se confirma que no existe banner, ' +
                'R03, R13 y R14 reciben nivel 0. Si el sitio tampoco instala cookies no esenciales, aplica ' +
                'en cambio la regla C7 y esos requisitos son no aplicables.',
      pistas: { cookiesEnE0: (E.E0.cookies || []).length,
                rastreadoresEnE0: (E.E0.peticionesRastreo || []).length },
    });
  }
  for (const id of ['E1', 'E2', 'E3']) {
    if (E[id] && E[id].interaccionLograda === false) {
      revision.push({ regla: 'C1', asunto: `no se completó el tratamiento de ${id}`,
        queHacer: `Reproducir ${id} a mano y codificar el resultado, o confirmar que el control no existe.` });
    }
  }

  return { violaciones: V, pendientes, indeterminadas: indet, omitidas, revisionManual: revision };
}

// ────────────────────────────────────────────────────────── auditoría de sitio
async function auditarSitio(browser, url, dirSalida) {
  const host = dominioDe(url);
  console.log(`\n▸ ${host}`);
  const E = {};

  for (const id of ['E0', 'E1', 'E2', 'E3', 'E4']) {
    process.stdout.write(`   ${id} … `);
    const captura = dirSalida ? path.join(dirSalida, `${host}_${id}.png`) : null;
    E[id] = await ejecutarEscenario(browser, url, id, ESCENARIOS[id], { capturar: captura });
    const n = (E[id].cookies || []).length;
    console.log(E[id].error ? `error: ${E[id].error}` : `${n} cookies, ${E[id].peticionesRastreo.length} rastreadores`);
    await dormir(CFG.pausaEntreEscenarios);
  }
  process.stdout.write('   E5 … ');
  E.E5 = await escenarioE5(browser, url);
  console.log(E.E5.error ? `error: ${E.E5.error}` : `${E.E5.cookies.length} cookies${E.E5.bannerReaparece ? ', banner reaparece' : ''}`);

  const analisis = derivarViolaciones(E, host);

  // Doble frontera: cota inferior cuenta las indeterminadas como esenciales,
  // cota superior como no esenciales. La incertidumbre queda a la vista.
  const cotaInferior = analisis.violaciones.filter((v) => !v.requiereConfirmacionManual).length;
  const cotaSuperior = analisis.violaciones.length;

  const totalCookies = Object.values(E).reduce((n, e) => n + (e.cookies || []).length, 0);
  const pctIndet = totalCookies ? (100 * analisis.indeterminadas.length) / totalCookies : 0;

  const ficha = {
    sitio: host, url, auditadoEn: new Date().toISOString(),
    escenarios: E,
    violaciones: analisis.violaciones,
    violacionesNoEvaluables: analisis.omitidas,
    revisionManualRequerida: analisis.revisionManual,
    pendientesDeEvaluacionManual: analisis.pendientes,
    cookiesIndeterminadas: analisis.indeterminadas,
    resumen: {
      violacionesConfirmadas: cotaInferior,
      cotaSuperior,
      criticas: analisis.violaciones.filter((v) => v.gravedad === 'Crítica').map((v) => v.id),
      universoReferencia: (E.E1.cookies || []).length,
      bannerDetectado: !!(E.E0.banner && E.E0.banner.presente),
      tratamientosAplicados: ['E1', 'E2', 'E3'].filter((id) => E[id] && E[id].interaccionLograda === true),
      proporcionIndeterminadas: Number(pctIndet.toFixed(1)),
      superaUmbralIndeterminadas: pctIndet > 10,
      codificable: !analisis.revisionManual.length,
    },
  };

  if (dirSalida) {
    fs.writeFileSync(path.join(dirSalida, `${host}.json`), JSON.stringify(ficha, null, 2));
  }

  console.log(`   → ${analisis.violaciones.length} violación(es): ` +
    (analisis.violaciones.map((v) => v.id).join(', ') || 'ninguna') +
    (analisis.omitidas.length ? ` | ${analisis.omitidas.length} no evaluable(s): ${analisis.omitidas.map((o) => o.id).join(', ')}` : '') +
    ` | indeterminadas ${pctIndet.toFixed(1)}%${pctIndet > 10 ? ' (SUPERA EL UMBRAL)' : ''}`);
  if (analisis.revisionManual.length) {
    console.log(`     ⚑ revisión manual: ${analisis.revisionManual.map((r) => r.asunto).join('; ')}`);
  }

  return ficha;
}

// ───────────────────────────────────────────────────────────────────── main
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('uso: node auditor.js <url> [más urls…]');
    console.log('     node auditor.js --lista sitios.txt --salida corpus/');
    process.exit(1);
  }

  let urls = [];
  let dirSalida = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lista') {
      urls.push(...fs.readFileSync(args[++i], 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
    } else if (args[i] === '--salida') {
      dirSalida = args[++i];
    } else {
      urls.push(args[i]);
    }
  }
  urls = urls.map((u) => (/^https?:\/\//.test(u) ? u : 'https://' + u));
  if (dirSalida) fs.mkdirSync(dirSalida, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const fichas = [];
  for (const url of urls) {
    try {
      fichas.push(await auditarSitio(browser, url, dirSalida));
    } catch (e) {
      console.log(`   ✗ ${url}: ${e.message.split('\n')[0]}`);
      fichas.push({ sitio: dominioDe(url), url, error: e.message.split('\n')[0] });
    }
  }
  await browser.close();

  console.log(`\n${'─'.repeat(58)}`);
  console.log(`sitios auditados: ${fichas.length}`);
  const conV2 = fichas.filter((f) => f.violaciones && f.violaciones.some((v) => v.id === 'V2'));
  console.log(`con V2 (cookies pese al rechazo): ${conV2.length}`);
  const noAud = fichas.filter((f) => f.error);
  if (noAud.length) console.log(`no auditables: ${noAud.length} → ${noAud.map((f) => f.sitio).join(', ')}`);
  if (dirSalida) console.log(`corpus escrito en: ${path.resolve(dirSalida)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { clasificar, derivarViolaciones, noEsenciales, esRastreador,
                    esPrimeraParte, esPlataformaConsentimiento };
