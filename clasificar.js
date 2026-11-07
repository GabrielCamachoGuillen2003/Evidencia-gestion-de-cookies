/**
 * clasificar.js — Ordena el corpus según el juicio humano y tría los dudosos.
 *
 *   node clasificar.js
 *
 * Hace tres cosas.
 *
 * PRIMERA. Reparte las fichas en carpetas según lo que la persona vio, no según
 * lo que opinó el detector: con-banner, sin-banner, no-verificable y
 * no-auditable. Copia, no mueve: el corpus original queda intacto, de modo que
 * la clasificación es reversible y el dato primario nunca se toca.
 *
 * SEGUNDA. Separa los dudosos por su causa. Un «no se pudo ver» puede venir de
 * un reto anti-bot que el navegador instrumentado nunca pasa, de una caída
 * puntual de la red, o de un dominio que ese día no resolvió. Son tres cosas
 * distintas y el informe las trata distinto: la primera es una limitación
 * declarada del instrumento, la segunda se reintenta y la tercera es pérdida
 * muestral. Agruparlas sería esconder información que el tribunal va a pedir.
 *
 * TERCERA. Lista los dominios fuera de .cr para que usted los revise. Un sitio
 * que no es costarricense es un defecto del marco muestral y no puede quedarse
 * en el denominador de un estudio sobre el entorno web de Costa Rica.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CORPUS = process.argv[2] || 'corpus';
const REGISTRO = 'confirmaciones.json';
const DESTINO = 'clasificado';
const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];

if (!fs.existsSync(REGISTRO)) { console.log(`No existe ${REGISTRO}.`); process.exit(1); }
const hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));

const grupos = {
  'con-banner': [], 'sin-banner': [], 'no-verificable': [], 'no-auditable': [], 'sin-confirmar': [],
};
const causas = { 'anti-bot': [], 'caida': [], 'no-resuelve': [] };
const fueraDeCR = [];
const desacuerdos = { falsoNegativo: [], falsoPositivo: [] };

for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio) continue;
  const esc = d.escenarios || {};
  const sitio = d.sitio;

  if (!/\.cr$/.test(sitio)) fueraDeCR.push(sitio);

  if (ESC.every((e) => (esc[e] || {}).error)) { grupos['no-auditable'].push([sitio, f]); continue; }

  const r = hechas[sitio];
  if (!r) { grupos['sin-confirmar'].push([sitio, f]); continue; }

  if (r.banner === null) {
    grupos['no-verificable'].push([sitio, f]);
    const e = r.error || '';
    if (/NAME_NOT_RESOLVED|ENOTFOUND/.test(e)) causas['no-resuelve'].push(sitio);
    else if (e) causas['caida'].push(sitio);
    else causas['anti-bot'].push(sitio);          // cargó sin error pero no se pudo ver
    continue;
  }

  grupos[r.banner ? 'con-banner' : 'sin-banner'].push([sitio, f]);

  const auto = !!(d.resumen || {}).bannerDetectado;
  if (r.banner && !auto) desacuerdos.falsoNegativo.push(sitio);
  if (!r.banner && auto) desacuerdos.falsoPositivo.push(sitio);
}

// ── Carpetas ───────────────────────────────────────────────────────────────
fs.mkdirSync(DESTINO, { recursive: true });
for (const [g, lista] of Object.entries(grupos)) {
  const dir = path.join(DESTINO, g);
  fs.mkdirSync(dir, { recursive: true });
  for (const [, f] of lista) fs.copyFileSync(path.join(CORPUS, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, '_sitios.txt'), lista.map(([s]) => s).sort().join('\n') + '\n');
}

const pc = (x, t) => t ? (100 * x / t).toFixed(1) + '%' : '—';
const linea = '─'.repeat(74);
console.log('═'.repeat(74));
console.log('CLASIFICACIÓN POR JUICIO HUMANO');
console.log(linea);
const auditables = grupos['con-banner'].length + grupos['sin-banner'].length + grupos['no-verificable'].length + grupos['sin-confirmar'].length;
for (const g of ['con-banner', 'sin-banner', 'no-verificable', 'sin-confirmar', 'no-auditable']) {
  console.log(`  ${g.padEnd(18)} ${String(grupos[g].length).padStart(4)}   ${g === 'no-auditable' ? '' : pc(grupos[g].length, auditables) + ' de los auditables'}`);
}

const verificados = grupos['con-banner'].length + grupos['sin-banner'].length;
console.log(`\n  base verificada a mano        ${verificados}`);
console.log(`  con mecanismo de consentim.   ${grupos['con-banner'].length}   ${pc(grupos['con-banner'].length, verificados)}`);
console.log(`  SIN mecanismo alguno          ${grupos['sin-banner'].length}   ${pc(grupos['sin-banner'].length, verificados)}   ← el hallazgo, ya sin extrapolar`);

console.log('\nDESACUERDO ENTRE LA PERSONA Y EL DETECTOR');
console.log(linea);
console.log(`  falsos negativos  ${String(desacuerdos.falsoNegativo.length).padStart(3)}   banners que el detector no vio`);
for (const s of desacuerdos.falsoNegativo) console.log(`      ${s}`);
console.log(`  falsos positivos  ${String(desacuerdos.falsoPositivo.length).padStart(3)}   banners que el detector inventó`);
for (const s of desacuerdos.falsoPositivo) console.log(`      ${s}`);

console.log('\nTRIAJE DE LOS NO VERIFICABLES');
console.log(linea);
const etiqueta = {
  'anti-bot': 'cargó sin error pero no se pudo ver — reto anti-bot (regla C12)',
  'caida': 'la red falló al verificar — el sitio sí se auditó en su día',
  'no-resuelve': 'el dominio no resolvió ese día',
};
for (const [c, lista] of Object.entries(causas)) {
  if (!lista.length) continue;
  console.log(`\n  ${c.toUpperCase()}  (${lista.length})  ${etiqueta[c]}`);
  for (const s of lista.sort()) console.log(`      ${s}`);
}
fs.writeFileSync('reintentar.txt',
  '# Dudosos por fallo de red: el sitio se auditó bien en su día.\n' +
  '# Bórrelos de confirmaciones.json y vuelva a correr confirmar.js.\n' +
  causas['caida'].concat(causas['no-resuelve']).sort().join('\n') + '\n');
fs.writeFileSync('revisar-en-chrome.txt',
  '# Sitios que cargan pero que el navegador instrumentado no pasa.\n' +
  '# Ábralos en su Chrome normal y anote si hay aviso de cookies.\n' +
  causas['anti-bot'].sort().join('\n') + '\n');

if (fueraDeCR.length) {
  console.log('\nDOMINIOS FUERA DE .cr — revíselos uno por uno');
  console.log(linea);
  console.log('  Un sitio que no sea costarricense es contaminación del marco muestral');
  console.log('  y no puede quedarse en el denominador. Los .com de empresas ticas sí van.');
  for (const s of fueraDeCR.sort()) console.log(`      ${s}`);
}

console.log('\n' + linea);
console.log(`  carpetas escritas en ${DESTINO}/   (copias; el corpus queda intacto)`);
console.log('  reintentar.txt        los que fallaron por red');
console.log('  revisar-en-chrome.txt los que bloquean al navegador instrumentado');
console.log('═'.repeat(74));
