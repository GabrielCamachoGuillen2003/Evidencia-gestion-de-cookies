/**
 * icc.js — Cálculo del índice ICC-CR a partir de la evidencia recogida.
 *
 *   node icc.js corpus-reclasificado
 *   node icc.js corpus-reclasificado --csv icc.csv
 *
 * QUÉ CALCULA Y QUÉ NO. De los dieciocho requisitos del catálogo, once se
 * derivan de observaciones que ya están en las fichas: las violaciones, los
 * controles hallados en el banner, las casillas del panel de preferencias y los
 * atributos y duraciones de cada cookie. Los otros siete exigen leer el aviso o
 * la política del sitio, y eso no se automatiza sin convertir un juicio en una
 * conjetura.
 *
 * Por eso el índice NO se reporta como un número sino como un INTERVALO. Cada
 * requisito pendiente se evalúa dos veces: una suponiendo el peor nivel y otra
 * el mejor. El resultado es una cota inferior y una superior, y la banda solo
 * se afirma cuando el intervalo entero cae dentro de ella. Un valor puntual
 * ocultaría que siete requisitos no se han mirado; el intervalo lo enseña.
 *
 * Esto tiene una consecuencia que vale la pena anticipar: en un sitio sin
 * mecanismo de consentimiento, las dimensiones D1 y D3 están casi
 * determinadas en cero, y el techo del índice cae por debajo del umbral de la
 * banda crítica aunque se le conceda lo mejor en todo lo demás. En esos sitios
 * la banda queda establecida sin necesidad de codificar nada a mano.
 *
 * Los niveles siguen los descriptores del Anexo B, no umbrales inventados aquí.
 * Donde un descriptor distingue dos niveles por un rasgo visual que la
 * observación instrumentada no capta —la jerarquía visual de un botón, por
 * ejemplo— el requisito se devuelve como intervalo entre esos dos niveles.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { clasificar, noEsenciales, esPrimeraParte, esRastreador } = require('./auditor.js');

const args = process.argv.slice(2);
const CORPUS = args.find((a) => !a.startsWith('--')) || 'corpus-reclasificado';
const iCsv = args.indexOf('--csv');
const CSV = iCsv >= 0 ? args[iCsv + 1] : null;
const CONFIRMACIONES = 'confirmaciones.json';

const DIMENSIONES = {
  D1: { peso: 0.15, nombre: 'Existencia y accesibilidad del mecanismo', reqs: ['R03', 'R11', 'R13', 'R14'] },
  D2: { peso: 0.20, nombre: 'Calidad de la información',               reqs: ['R06', 'R07', 'R12', 'R15'] },
  D3: { peso: 0.20, nombre: 'Simetría y granularidad de la elección',  reqs: ['R02', 'R04', 'R05', 'R16'] },
  D4: { peso: 0.35, nombre: 'Cumplimiento efectivo',                   reqs: ['R01', 'R08', 'R09', 'R10'] },
  D5: { peso: 0.10, nombre: 'Higiene técnica de las cookies',          reqs: ['R17', 'R18'] },
};
const BANDAS = [[80, 'alto'], [60, 'moderado'], [40, 'bajo'], [0, 'crítico']];
const banda = (v) => BANDAS.find(([u]) => v >= u)[1];

const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];
const clavesDe = (e) => new Set(((e && e.cookies) || []).map((c) => `${c.name}@${c.domain}`));
const hubo = (e) => !!(e && e.interaccionLograda === true);
const R = (min, max, nota) => ({ min, max, nota });      // intervalo de nivel
const NA = (nota) => ({ na: true, nota });               // requisito no aplicable

// ── Evaluación de los once requisitos derivables ───────────────────────────
function evaluar(d, hayBanner, pol) {
  const E = d.escenarios || {};
  const host = d.sitio;
  const vio = new Set((d.violaciones || []).map((v) => v.id));
  const r = {};

  const baseE0 = clavesDe(E.E0);
  const aparecenAlAceptar = new Set();
  if (hubo(E.E1)) for (const k of clavesDe(E.E1)) if (!baseE0.has(k)) aparecenAlAceptar.add(k);
  const ne = {};
  for (const id of ESC) if (E[id] && !E[id].error) ne[id] = noEsenciales(E[id], host, aparecenAlAceptar);

  const todasLasCookies = ESC.flatMap((id) => ((E[id] || {}).cookies) || []);
  const instalaCookies = todasLasCookies.length > 0;

  // ── R01. Ausencia de instalación previa al consentimiento (D4) ───────────
  const neE0 = ne.E0 || new Map();
  const rastreadoresE0 = ((E.E0 || {}).peticionesRastreo || []).length;
  const tercerosPublicitariosE0 = [...neE0.values()].some((c) => {
    const h = String(c.domain || '').replace(/^\./, '');
    return !esPrimeraParte(h, host) && esRastreador(h);
  });
  const tercerosE0 = [...neE0.values()].some((c) => !esPrimeraParte(String(c.domain || '').replace(/^\./, ''), host));
  if (!instalaCookies) r.R01 = NA('el sitio no instala cookies (regla C7)');
  else if (tercerosPublicitariosE0) r.R01 = R(0, 0, 'cookies de terceros con finalidad publicitaria en E0');
  else if (tercerosE0) r.R01 = R(0, 1, 'cookies de terceros en E0');
  else if (neE0.size) r.R01 = R(1, 2, 'cookies no esenciales de primera parte en E0');
  else if (rastreadoresE0) r.R01 = R(1, 2, 'sin cookies no esenciales pero con peticiones a rastreadores en E0');
  else r.R01 = R(3, 3, 'ninguna cookie no esencial ni petición a rastreadores en E0');

  // ── R03 y R04. Rechazo en primera capa y simetría de esfuerzo ────────────
  const e2 = E.E2 || {};
  if (!hayBanner) {
    r.R03 = R(0, 0, 'no hay mecanismo de consentimiento');
    r.R04 = R(0, 0, 'no hay vía de rechazo porque no hay mecanismo');
  } else if (e2.rechazoEnPrimeraCapa === true) {
    // Los niveles 3 y 2 se distinguen por la jerarquía visual del control,
    // que la observación instrumentada no capta.
    r.R03 = R(2, 3, 'control de rechazo hallado en la primera capa; jerarquía visual sin verificar');
    r.R04 = R(3, 3, 'rechazar y aceptar en la primera capa');
  } else if (e2.rechazoEnPrimeraCapa === false && hubo(E.E2)) {
    r.R03 = R(1, 1, 'el rechazo solo se alcanza tras abrir el panel de configuración');
    r.R04 = R(2, 2, 'rechazar exige una acción adicional: abrir la configuración');
  } else {
    r.R03 = R(0, 0, 'no se localizó control de rechazo en ninguna capa');
    r.R04 = R(0, 0, 'sin vía de rechazo equivalente');
  }

  // ── R05 y R16. Granularidad y casillas premarcadas (D3) ──────────────────
  const cas = (E.E3 || {}).casillas || [];
  const casAct = cas.filter((c) => !c.deshabilitada);
  if (!hayBanner) {
    r.R05 = R(0, 0, 'decisión de todo o nada: no hay mecanismo');
    r.R16 = R(0, 0, 'no hay panel de finalidades');
  } else if (!cas.length) {
    r.R05 = R(0, 1, 'no se localizó panel de finalidades');
    r.R16 = NA('no hay casillas que evaluar');
  } else {
    if (casAct.length >= 3) r.R05 = vio.has('V3') ? R(1, 2, 'controles por finalidad, pero la selección no se respetó')
                                                  : R(2, 3, 'controles por finalidad; agrupación sin verificar');
    else if (casAct.length === 2) r.R05 = R(1, 1, 'solo se distingue entre necesarias y el resto');
    else r.R05 = R(0, 1, 'un único control: decisión de todo o nada');
    const pre = (E.E3 || {}).premarcadas || 0;
    if (pre === 0) r.R16 = R(3, 3, 'ninguna finalidad no esencial activada por defecto');
    else if (pre >= casAct.length && casAct.length) r.R16 = R(0, 1, 'todas las finalidades activadas por defecto');
    else if (pre > casAct.length / 2) r.R16 = R(1, 1, `${pre} de ${casAct.length} activadas por defecto`);
    else r.R16 = R(1, 2, `${pre} de ${casAct.length} activadas por defecto; advertencia visual sin verificar`);
  }

  // ── R08. Revocación permanente (D4) ──────────────────────────────────────
  if (!hayBanner) r.R08 = R(0, 0, 'sin mecanismo, no hay nada que revocar');
  else if (vio.has('V6')) r.R08 = R(0, 0, 'no se observó control de revocación');
  else r.R08 = R(1, 3, 'hay mecanismo; la operatividad de la revocación exige comprobación manual');

  // ── R09. Respeto técnico del rechazo en la sesión (D4) ───────────────────
  if (!hubo(E.E2)) {
    r.R09 = NA('no se pudo ejercer el rechazo: sin control que pulsar');
  } else {
    const universo = ne.E1 || new Map();
    const persisten = [...(ne.E2 || new Map()).entries()].filter(([k]) => universo.has(k));
    const hostsPersist = persisten.map(([, c]) => String(c.domain || '').replace(/^\./, ''));
    const hayTerceros = hostsPersist.some((h) => !esPrimeraParte(h, host));
    const hayRastreo = hostsPersist.some((h) => !esPrimeraParte(h, host) && esRastreador(h));
    const cesaron = (((E.E2 || {}).peticionesRastreo) || []).length === 0;
    if (!persisten.length) r.R09 = cesaron ? R(3, 3, 'ninguna cookie no esencial de E1 persiste y cesan los rastreadores')
                                           : R(2, 3, 'ninguna cookie de E1 persiste, pero siguen peticiones a rastreadores');
    else if (hayRastreo) r.R09 = R(0, 0, 'persisten cookies de terceros con identificador de seguimiento');
    else if (hayTerceros) r.R09 = R(1, 1, 'persisten cookies de terceros sin identificador de seguimiento');
    else r.R09 = R(2, 2, 'persisten cookies no esenciales de primera parte');
  }

  // ── R10. Persistencia de la decisión entre visitas (D4) ──────────────────
  const e5 = E.E5 || {};
  if (!hubo(E.E2) || e5.error) {
    r.R10 = NA('no se pudo establecer un rechazo que comprobar en la revisita');
  } else if (vio.has('V5')) {
    r.R10 = e5.bannerReaparece ? R(0, 1, 'se reinstalan cookies rechazadas y el banner reaparece')
                               : R(1, 1, 'se reinstala alguna cookie rechazada');
  } else {
    r.R10 = e5.bannerReaparece ? R(2, 2, 'la decisión se conserva pero el banner reaparece')
                               : R(3, 3, 'la decisión se conserva y no reaparece el banner');
  }

  // ── R14. Aparición previa a la interacción (D1) ──────────────────────────
  const bannerEnE0 = !!((E.E0 || {}).banner && E.E0.banner.presente);
  if (!hayBanner) r.R14 = R(0, 0, 'no se presenta banner en la primera visita');
  else if (bannerEnE0) r.R14 = R(2, 3, 'banner en la primera carga; el retardo exacto no se midió');
  else r.R14 = R(1, 1, 'banner confirmado por una persona pero no presente en la ventana de observación de E0');

  // ── R17. Atributos de seguridad (D5) ─────────────────────────────────────
  const sesion = todasLasCookies.filter((c) => !c.expires || c.expires <= 0 || (c.duracionDias || 0) === 0);
  const muestra = sesion.length ? sesion : todasLasCookies;
  if (!muestra.length) {
    r.R17 = NA('no hay cookies que evaluar');
  } else {
    const sinSecure = muestra.filter((c) => !c.secure).length;
    const sinHttpOnly = muestra.filter((c) => !c.httpOnly).length;
    const noneGeneral = muestra.filter((c) => String(c.sameSite || '').toLowerCase() === 'none').length > muestra.length / 2;
    if (!sinSecure && !sinHttpOnly && !noneGeneral) r.R17 = R(3, 3, 'todas con Secure y HttpOnly');
    else if (sinSecure === muestra.length && sinHttpOnly === muestra.length) r.R17 = R(0, 0, 'ninguna presenta Secure ni HttpOnly');
    else if (sinSecure || noneGeneral) r.R17 = R(1, 1, `${sinSecure} de ${muestra.length} sin Secure${noneGeneral ? '; SameSite=None generalizado' : ''}`);
    else r.R17 = R(2, 2, `con Secure, pero ${sinHttpOnly} de ${muestra.length} sin HttpOnly`);
  }

  // ── R18. Proporcionalidad de la duración (D5) ────────────────────────────
  const neTodas = new Map();
  for (const id of ESC) for (const [k, c] of (ne[id] || new Map())) neTodas.set(k, c);
  const dur = [...neTodas.values()].map((c) => c.duracionDias || 0);
  if (!neTodas.size) {
    r.R18 = NA('no hay cookies no esenciales cuya duración evaluar');
  } else {
    const max = Math.max(...dur);
    if (max > 1825) r.R18 = R(0, 0, `duración máxima de ${Math.round(max)} días: más de cinco años`);
    else if (max > 730) r.R18 = R(1, 1, `duración máxima de ${Math.round(max)} días: más de veinticuatro meses`);
    else if (max > 395) r.R18 = R(2, 2, `duración máxima de ${Math.round(max)} días: más de trece meses`);
    else r.R18 = R(3, 3, `ninguna cookie no esencial supera los trece meses (máximo ${Math.round(max)} días)`);
  }

  // ── Los siete que exigen juicio humano ───────────────────────────────────
  // R11 es la excepción: sin mecanismo no puede haber muro de cookies, de modo
  // que la ausencia de banner determina el cumplimiento sin necesidad de mirar.
  const PENDIENTES = {
    R02: 'acto afirmativo inequívoco: exige observar el diseño del banner',
    R06: 'identidad de los terceros: exige leer la política',
    R07: 'duración declarada: exige leer la política',
    R11: 'muro de cookies: exige comprobar si se condiciona el acceso',
    R12: 'coincidencia entre política y cookies observadas: exige leer la política',
    R13: 'visibilidad del banner: exige observar la captura',
    R15: 'claridad del lenguaje: exige leer el aviso',
  };
  // Si el sitio no presenta aviso NI enlaza política alguna desde la portada,
  // no informa nada sobre cookies en ninguna parte: los cuatro requisitos de D2
  // valen cero por ausencia de vehículo, no por mala redacción. Es una
  // comprobación de existencia, no un juicio sobre el contenido.
  const sinVehiculo = !hayBanner && pol && !pol.error && !pol.cookies && !pol.privacidad;
  const D2 = new Set(['R06', 'R07', 'R12', 'R15']);

  for (const [id, nota] of Object.entries(PENDIENTES)) {
    if (id === 'R11' && !hayBanner) { r.R11 = R(3, 3, 'sin mecanismo no puede condicionarse el acceso a aceptarlo'); continue; }
    if ((id === 'R02' || id === 'R13') && !hayBanner) { r[id] = R(0, 0, 'no hay banner que evaluar'); continue; }
    if (sinVehiculo && D2.has(id)) {
      r[id] = R(0, 0, 'sin aviso ni política enlazada desde la portada: no hay dónde informarlo');
      continue;
    }
    r[id] = { min: 0, max: 3, pendiente: true,
              nota: nota + (pol && pol.cookies ? ` (política en ${pol.cookies.slice(0, 60)})` : '') };
  }
  return r;
}

// ── Índice de una dimensión, como intervalo ────────────────────────────────
function indiceDimension(reqs, ev) {
  const aplicables = reqs.filter((id) => ev[id] && !ev[id].na);
  if (!aplicables.length) return null;                 // dimensión no aplicable
  const k = aplicables.length;
  const sum = (campo) => aplicables.reduce((s, id) => s + ev[id][campo], 0);
  return { min: (sum('min') / (3 * k)) * 100, max: (sum('max') / (3 * k)) * 100,
           k, pendientes: aplicables.filter((id) => ev[id].pendiente).length };
}

// ── Recorrido del corpus ───────────────────────────────────────────────────
let confirm = {};
if (fs.existsSync(CONFIRMACIONES)) confirm = JSON.parse(fs.readFileSync(CONFIRMACIONES, 'utf8'));
let politicas = {};
if (fs.existsSync('politicas.json')) politicas = JSON.parse(fs.readFileSync('politicas.json', 'utf8'));
else console.log('(aviso: no hay politicas.json; D2 queda abierta de 0 a 3 en todos los sitios)\n');

const filas = [];
for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio || !d.escenarios) continue;
  if (ESC.every((e) => (d.escenarios[e] || {}).error)) continue;

  // La presencia de mecanismo la decide la persona, no el detector.
  const c = confirm[d.sitio];
  const hayBanner = c && c.banner === true;
  const verificado = !!(c && c.banner !== null && c.banner !== undefined);

  // Regla C7. Un sitio que no instala ninguna cookie no está obligado a pedir
  // consentimiento para instalarlas: los requisitos del aviso no le resultan
  // aplicables y su ausencia no es incumplimiento. Puntuarlo sería el error
  // inverso al que la regla previene — convertir en incumplidor a quien no
  // tiene nada que cumplir. Queda fuera del índice, no en la banda más baja.
  const instalaAlguna = ESC.some((e) => (((d.escenarios[e] || {}).cookies) || []).length > 0);
  if (!instalaAlguna) {
    filas.push({ sitio: d.sitio, verificado, hayBanner, c7: true, pend: 0, dims: {}, ev: {} });
    continue;
  }

  const ev = evaluar(d, hayBanner, politicas[d.sitio]);
  let min = 0, max = 0, pesoVivo = 0, pend = 0;
  const dims = {};
  for (const [id, cfg] of Object.entries(DIMENSIONES)) {
    const ix = indiceDimension(cfg.reqs, ev);
    dims[id] = ix;
    if (!ix) continue;
    pesoVivo += cfg.peso;
    min += cfg.peso * ix.min;
    max += cfg.peso * ix.max;
    pend += ix.pendientes;
  }
  if (pesoVivo > 0 && pesoVivo < 1) { min /= pesoVivo; max /= pesoVivo; }  // redistribución

  // Regla eliminatoria: incumplir R01 o R09 impide la banda de cumplimiento alto
  const elimina = (ev.R01 && !ev.R01.na && ev.R01.max < 3) || (ev.R09 && !ev.R09.na && ev.R09.max < 3);
  let techo = max;
  if (elimina) techo = Math.min(max, 79.99);

  const pol = politicas[d.sitio];
  const sinVehiculo = !hayBanner && pol && !pol.error && !pol.cookies && !pol.privacidad;
  filas.push({ sitio: d.sitio, verificado, hayBanner, sinVehiculo, min, max: techo, pend, elimina, dims, ev,
               bandaMin: banda(min), bandaMax: banda(techo),
               determinada: banda(min) === banda(techo) ? banda(min) : null });
}
const c7 = filas.filter((f) => f.c7);
const eval_ = filas.filter((f) => !f.c7);
eval_.sort((a, b) => a.min - b.min || a.sitio.localeCompare(b.sitio));

// ── Informe ────────────────────────────────────────────────────────────────
const n1 = (x) => x.toFixed(1).replace('.', ',');
const pc = (x, t) => t ? n1(100 * x / t) + ' %' : '—';
const linea = '─'.repeat(78);
const N = eval_.length;
console.log('═'.repeat(78));
console.log(`ÍNDICE ICC-CR — ${CORPUS}`);
console.log(linea);
console.log(`  fichas en el corpus              ${filas.length}`);
console.log(`  fuera del índice por la regla C7 ${c7.length}   no instalan cookies: nada que consentir`);
console.log(`  sitios evaluados                 ${N}`);
console.log(`  sin aviso ni política enlazada   ${eval_.filter((f) => f.sinVehiculo).length}   D2 determinada en cero`);
console.log(`  con mecanismo confirmado         ${eval_.filter((f) => f.hayBanner).length}`);
console.log(`  sin verificación visual          ${eval_.filter((f) => !f.verificado).length}`);
console.log(`  con la banda ya determinada      ${eval_.filter((f) => f.determinada).length}   ${pc(filas.filter((f) => f.determinada).length, N)}`);

console.log('\n' + linea);
console.log('BANDAS DETERMINADAS SIN CODIFICACIÓN MANUAL');
console.log(linea);
const porBanda = {};
for (const f of eval_) {
  const k = f.determinada || `indeterminada (${f.bandaMin}–${f.bandaMax})`;
  porBanda[k] = (porBanda[k] || 0) + 1;
}
for (const [k, v] of Object.entries(porBanda).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(40)} ${String(v).padStart(4)}   ${pc(v, N)}`);

console.log('\n' + linea);
console.log('ÍNDICE MEDIO POR DIMENSIÓN  (cota inferior – cota superior)');
console.log(linea);
for (const [id, cfg] of Object.entries(DIMENSIONES)) {
  const con = eval_.filter((f) => f.dims[id]);
  if (!con.length) continue;
  const mn = con.reduce((s, f) => s + f.dims[id].min, 0) / con.length;
  const mx = con.reduce((s, f) => s + f.dims[id].max, 0) / con.length;
  console.log(`  ${id}  ${String(Math.round(cfg.peso * 100)).padStart(2)} %  ${cfg.nombre.padEnd(42)} ${n1(mn).padStart(6)} – ${n1(mx).padStart(6)}   (n=${con.length})`);
}
const mnT = eval_.reduce((s, f) => s + f.min, 0) / N;
const mxT = eval_.reduce((s, f) => s + f.max, 0) / N;
console.log(`\n  ICC-CR medio del corpus:  ${n1(mnT)} – ${n1(mxT)}`);
console.log(`  sitios que no pueden alcanzar cumplimiento alto (regla eliminatoria): ` +
            `${eval_.filter((f) => f.elimina).length}`);

console.log('\n' + linea);
console.log('LOS DIEZ SITIOS CON MAYOR COTA SUPERIOR');
console.log(linea);
console.log('  sitio                                cota inf.  cota sup.  banda        pend.');
for (const f of [...eval_].sort((a, b) => b.max - a.max).slice(0, 10))
  console.log(`  ${f.sitio.slice(0, 34).padEnd(34)} ${n1(f.min).padStart(8)} ${n1(f.max).padStart(10)}   ` +
              `${(f.determinada || f.bandaMin + '–' + f.bandaMax).padEnd(12)} ${String(f.pend).padStart(4)}`);

if (CSV) {
  const cab = ['sitio', 'verificado', 'mecanismo', 'icc_min', 'icc_max', 'banda', 'requisitos_pendientes',
               ...Object.keys(DIMENSIONES).flatMap((d) => [`${d}_min`, `${d}_max`]),
               ...['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12','R13','R14','R15','R16','R17','R18']
                 .flatMap((r) => [`${r}_min`, `${r}_max`])];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const out = [cab.join(',')];
  for (const f of eval_) {
    const fila = [f.sitio, f.verificado ? 'sí' : 'no', f.hayBanner ? 'sí' : 'no',
                  f.min.toFixed(1), f.max.toFixed(1), f.determinada || `${f.bandaMin}–${f.bandaMax}`, f.pend];
    for (const d of Object.keys(DIMENSIONES))
      fila.push(f.dims[d] ? f.dims[d].min.toFixed(1) : 'NA', f.dims[d] ? f.dims[d].max.toFixed(1) : 'NA');
    for (const r of ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12','R13','R14','R15','R16','R17','R18']) {
      const e = f.ev[r];
      fila.push(!e || e.na ? 'NA' : e.min, !e || e.na ? 'NA' : e.max);
    }
    out.push(fila.map(esc).join(','));
  }
  fs.writeFileSync(CSV, '﻿' + out.join('\n'), 'utf8');
  console.log(`\n  resultados por sitio escritos en ${CSV}`);
}

console.log('\n' + linea);
console.log('CÓMO LEER ESTE RESULTADO');
console.log(linea);
console.log('  Cada sitio se reporta como un intervalo, no como un número. La cota');
console.log('  inferior supone el peor nivel en los requisitos que aún no se han');
console.log('  codificado a mano; la superior, el mejor. Cuando ambas caen en la misma');
console.log('  banda, la banda está establecida y la codificación manual no la movería.');
console.log('  Donde el intervalo cruza dos bandas, el sitio queda pendiente y se indica');
console.log('  entre cuáles. Reportar un valor puntual ocultaría que siete de los');
console.log('  dieciocho requisitos exigen leer el aviso y la política del sitio.');
console.log('═'.repeat(78));
