/**
 * resumen.js — Agrega el corpus en las tablas que van al informe.
 *
 *   node resumen.js corpus
 *   node resumen.js corpus --csv resultados.csv
 *
 * Produce lo que la Sección 3.12 pide reportar al cerrar la Fase 2: cobertura
 * del levantamiento, presencia de mecanismo de consentimiento, violaciones por
 * tipo, recuento de cookies y rastreadores por escenario, y la proporción de
 * indeterminadas calculada SOBRE EL CORPUS COMPLETO, que es como está definido
 * el umbral, y no sitio por sitio.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'corpus';
const csvIdx = process.argv.indexOf('--csv');
const csvOut = csvIdx > 0 ? process.argv[csvIdx + 1] : null;

const fichas = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0');
const linea = (c = '─') => console.log(c.repeat(78));

// ── clasificación de cada sitio ────────────────────────────────────────────
const noAuditables = [], sinBanner = [], conBanner = [], limpios = [];
for (const f of fichas) {
  const errores = ESC.filter((e) => f.escenarios && f.escenarios[e] && f.escenarios[e].error).length;
  if (errores === ESC.length) { noAuditables.push(f); continue; }
  const cookies = ESC.reduce((n, e) => n + ((f.escenarios[e] || {}).cookies || []).length, 0);
  if (cookies === 0) { limpios.push(f); continue; }
  (f.resumen.bannerDetectado ? conBanner : sinBanner).push(f);
}
const auditables = fichas.length - noAuditables.length;

linea('═');
console.log('COBERTURA DEL LEVANTAMIENTO');
linea();
console.log(`  sitios en la muestra            ${fichas.length}`);
console.log(`  auditados con éxito             ${auditables}  (${pct(auditables, fichas.length)}%)`);
console.log(`  no auditables                   ${noAuditables.length}  (${pct(noAuditables.length, fichas.length)}%)  umbral: 10% por estrato`);
for (const f of noAuditables) {
  const e = ESC.map((k) => (f.escenarios[k] || {}).error).find(Boolean) || '';
  console.log(`      ${f.sitio.padEnd(26)} ${e.slice(0, 44)}`);
}

console.log('\nPRESENCIA DE MECANISMO DE CONSENTIMIENTO');
linea();
console.log(`  con banner detectado            ${conBanner.length}  (${pct(conBanner.length, auditables)}% de los auditables)`);
for (const f of conBanner) console.log(`      ${f.sitio}`);
console.log(`  sin banner, PENDIENTE de confirmar manualmente (regla C1)   ${sinBanner.length}`);
for (const f of sinBanner) console.log(`      ${f.sitio}`);
if (limpios.length) {
  console.log(`  sin cookie alguna → regla C7, requisitos de banner no aplicables   ${limpios.length}`);
  for (const f of limpios) console.log(`      ${f.sitio}`);
}

// ── violaciones ────────────────────────────────────────────────────────────
const porTipo = {}, noEval = {};
for (const f of fichas) {
  for (const v of f.violaciones || []) (porTipo[v.id] = porTipo[v.id] || []).push(f.sitio);
  for (const o of f.violacionesNoEvaluables || []) (noEval[o.id] = noEval[o.id] || []).push(f.sitio);
}
console.log('\nVIOLACIONES OBSERVADAS');
linea();
const GRAV = { V1: 'Alta', V2: 'Crítica', V3: 'Crítica', V4: 'Alta', V5: 'Media', V6: 'Media' };
for (const id of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
  const n = (porTipo[id] || []).length;
  const ne = (noEval[id] || []).length;
  console.log(`  ${id}  [${(GRAV[id] || '').padEnd(7)}]  ${String(n).padStart(3)} sitios  ` +
    `(${pct(n, auditables)}% de los auditables)` +
    (ne ? `   · ${ne} no evaluables por falta de tratamiento efectivo` : ''));
}
console.log('  V7, V8                            pendientes de evaluación manual y mixta');

// ── cookies y rastreadores por escenario ───────────────────────────────────
console.log('\nCOOKIES Y RASTREADORES POR ESCENARIO (media sobre sitios auditados)');
linea();
console.log('  Esc.   cookies   rastreadores   sitios con datos');
for (const e of ESC) {
  const v = fichas.map((f) => f.escenarios[e]).filter((x) => x && !x.error);
  if (!v.length) continue;
  const mc = v.reduce((n, x) => n + (x.cookies || []).length, 0) / v.length;
  const mr = v.reduce((n, x) => n + (x.peticionesRastreo || []).length, 0) / v.length;
  console.log(`  ${e}    ${mc.toFixed(1).padStart(7)}   ${mr.toFixed(1).padStart(12)}   ${String(v.length).padStart(8)}`);
}

// ── indeterminadas sobre el corpus completo ────────────────────────────────
let totalCookies = 0, totalIndet = 0;
for (const f of fichas) {
  totalCookies += ESC.reduce((n, e) => n + ((f.escenarios[e] || {}).cookies || []).length, 0);
  totalIndet += (f.cookiesIndeterminadas || []).length;
}
console.log('\nCALIDAD DE LA CLASIFICACIÓN');
linea();
console.log(`  observaciones de cookie en el corpus   ${totalCookies}`);
console.log(`  indeterminadas                         ${totalIndet}  (${pct(totalIndet, totalCookies)}%)   umbral: 10%`);
console.log(`  ${pct(totalIndet, totalCookies) <= 10 ? 'Dentro del umbral.' : 'SUPERA EL UMBRAL → reportar por cotas de doble frontera (regla del instrumento).'}`);

// ── trabajo manual pendiente ───────────────────────────────────────────────
const pendientes = fichas.filter((f) => f.revisionManualRequerida && f.revisionManualRequerida.length);
console.log('\nTRABAJO MANUAL PENDIENTE ANTES DE PODER CODIFICAR');
linea();
console.log(`  fichas no codificables todavía   ${pendientes.length} de ${fichas.length}`);
const motivos = {};
for (const f of pendientes) for (const r of f.revisionManualRequerida) motivos[r.asunto] = (motivos[r.asunto] || 0) + 1;
for (const [m, n] of Object.entries(motivos).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(n).padStart(3)} ×  ${m}`);
}

// ── CSV por sitio ──────────────────────────────────────────────────────────
if (csvOut) {
  const cab = ['sitio', 'auditable', 'banner_detectado', 'tratamientos_aplicados',
    'violaciones', 'no_evaluables', 'cookies_E0', 'cookies_E1', 'cookies_E2',
    'rastreadores_E0', 'rastreadores_E1', 'indeterminadas', 'codificable'];
  const filas = fichas.map((f) => {
    const g = (e, k) => ((f.escenarios[e] || {})[k] || []).length;
    const err = ESC.every((e) => (f.escenarios[e] || {}).error);
    return [f.sitio, err ? 'no' : 'si', f.resumen ? f.resumen.bannerDetectado : '',
      (f.resumen && f.resumen.tratamientosAplicados || []).join(' '),
      (f.violaciones || []).map((v) => v.id).join(' '),
      (f.violacionesNoEvaluables || []).map((v) => v.id).join(' '),
      g('E0', 'cookies'), g('E1', 'cookies'), g('E2', 'cookies'),
      g('E0', 'peticionesRastreo'), g('E1', 'peticionesRastreo'),
      (f.cookiesIndeterminadas || []).length,
      f.resumen ? f.resumen.codificable : ''].join(',');
  });
  fs.writeFileSync(csvOut, [cab.join(','), ...filas].join('\n'), 'utf8');
  console.log(`\n  CSV por sitio escrito en: ${path.resolve(csvOut)}`);
}
linea('═');
