/**
 * familias.js — Agrupa las cookies indeterminadas por familia de plataforma.
 *
 *   node familias.js corpus-reclasificado
 *   node familias.js corpus-reclasificado --min-sitios 3
 *
 * Las cookies que ninguna regla resuelve no son 370 problemas distintos. La
 * mayoría viene de un número reducido de plataformas que bautizan sus cookies
 * con un prefijo común: un sistema anti-bot, un gestor de contenidos, una
 * plataforma de comercio. Adjudicar la familia entera, con su justificación, es
 * trabajo de codificación ordinario; adjudicar 370 nombres sueltos no lo es.
 *
 * El agrupamiento se deriva de los datos y no de lo que el investigador crea
 * reconocer: busca prefijos compartidos por varios nombres y se queda con los
 * que más cubren. Eso evita el riesgo de inventar familias que encajen con una
 * clasificación ya decidida de antemano.
 *
 * Este programa NO clasifica nada. Solo describe. La adjudicación de cada
 * familia es una decisión humana que debe quedar escrita en el manual de
 * codificación, con su fundamento, antes de aplicarse.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CORPUS = args.find((a) => !a.startsWith('--')) || 'corpus-reclasificado';
const iMin = args.indexOf('--min-sitios');
const MIN_SITIOS = iMin >= 0 ? parseInt(args[iMin + 1], 10) : 2;
const LARGO_MIN = 3;      // un prefijo más corto agruparía cosas sin relación
const LARGO_MAX = 14;

// ── Recoger las indeterminadas ─────────────────────────────────────────────
const porNombre = new Map();
let total = 0;
for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio) continue;
  for (const c of d.cookiesIndeterminadas || []) {
    total++;
    if (!porNombre.has(c.cookie)) porNombre.set(c.cookie, { ap: 0, sitios: new Set(), dom: new Map() });
    const e = porNombre.get(c.cookie);
    e.ap++;
    e.sitios.add(d.sitio);
    const h = String(c.dominio || '').replace(/^\./, '');
    if (h) e.dom.set(h, (e.dom.get(h) || 0) + 1);
  }
}
if (!total) { console.log(`No hay cookies indeterminadas en ${CORPUS}/.`); process.exit(0); }

// ── Buscar prefijos compartidos ────────────────────────────────────────────
const nombres = [...porNombre.keys()];
const cuentaPrefijo = new Map();
for (const n of nombres) {
  for (let L = LARGO_MIN; L <= Math.min(LARGO_MAX, n.length); L++) {
    const p = n.slice(0, L);
    if (!cuentaPrefijo.has(p)) cuentaPrefijo.set(p, []);
    cuentaPrefijo.get(p).push(n);
  }
}

// Puntuamos cada prefijo por las apariciones que cubre. A igualdad, gana el más
// largo: un prefijo largo describe una familia concreta, uno corto junta cosas
// que solo comparten las primeras letras por casualidad.
const candidatos = [...cuentaPrefijo.entries()]
  .filter(([, ns]) => ns.length >= 2)
  .map(([p, ns]) => {
    const sitios = new Set(), ap = ns.reduce((s, n) => {
      for (const x of porNombre.get(n).sitios) sitios.add(x);
      return s + porNombre.get(n).ap;
    }, 0);
    return { prefijo: p, nombres: ns, ap, sitios: sitios.size };
  })
  .filter((c) => c.sitios >= MIN_SITIOS)
  .sort((a, b) => b.ap - a.ap || b.prefijo.length - a.prefijo.length);

// Asignación voraz: cada nombre pertenece a una sola familia, la de mayor
// cobertura que lo contenga. Sin esto, un nombre aparecería en varias familias
// y las sumas dejarían de significar nada.
const asignado = new Set();
const familias = [];
for (const c of candidatos) {
  const libres = c.nombres.filter((n) => !asignado.has(n));
  if (libres.length < 2) continue;
  const sitios = new Set();
  let ap = 0;
  const dom = new Map();
  for (const n of libres) {
    const e = porNombre.get(n);
    ap += e.ap;
    for (const s of e.sitios) sitios.add(s);
    for (const [h, k] of e.dom) dom.set(h, (dom.get(h) || 0) + k);
    asignado.add(n);
  }
  familias.push({ prefijo: c.prefijo, nombres: libres.sort(), ap, sitios: sitios.size,
                  dominios: [...dom.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h) });
}
familias.sort((a, b) => b.ap - a.ap);

const sueltos = nombres.filter((n) => !asignado.has(n))
  .map((n) => ({ n, ...porNombre.get(n) }))
  .sort((a, b) => b.ap - a.ap);

// ── Informe ────────────────────────────────────────────────────────────────
const n1 = (x) => x.toFixed(1).replace('.', ',');
const linea = '─'.repeat(78);
console.log('═'.repeat(78));
console.log(`FAMILIAS DE COOKIES INDETERMINADAS — ${CORPUS}`);
console.log(linea);
console.log(`  apariciones indeterminadas   ${total}`);
console.log(`  nombres distintos            ${nombres.length}`);
console.log(`  familias detectadas          ${familias.length}`);
const cubiertas = familias.reduce((s, f) => s + f.ap, 0);
console.log(`  cubiertas por familias       ${cubiertas}   ${n1(100 * cubiertas / total)} %`);
console.log(`  nombres sin familia          ${sueltos.length}   ${n1(100 * (total - cubiertas) / total)} % de las apariciones`);

console.log('\n' + linea);
console.log('FAMILIAS, DE MAYOR A MENOR COBERTURA');
console.log(linea);
let acum = 0;
for (const [i, f] of familias.entries()) {
  acum += f.ap;
  console.log(`\n[${String(i + 1).padStart(2)}]  ${f.prefijo}*`.padEnd(24) +
    `${String(f.ap).padStart(5)} aparic.  ${String(f.sitios).padStart(4)} sitios   acumulado ${n1(100 * acum / total)} %`);
  console.log(`      nombres (${f.nombres.length}): ${f.nombres.slice(0, 10).join(', ')}` +
              (f.nombres.length > 10 ? `, … (+${f.nombres.length - 10})` : ''));
  console.log(`      dominios: ${f.dominios.slice(0, 3).join(', ')}`);
}

console.log('\n' + linea);
console.log('NOMBRES SIN FAMILIA, LOS 25 MÁS FRECUENTES');
console.log(linea);
for (const s of sueltos.slice(0, 25)) {
  const d = [...s.dom.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`  ${String(s.ap).padStart(5)} aparic.  ${String(s.sitios.size).padStart(3)} sitios   ` +
              `${s.n.slice(0, 32).padEnd(32)} ${d ? d[0].slice(0, 24) : ''}`);
}

console.log('\n' + linea);
console.log('QUÉ HACER CON ESTO');
console.log(linea);
console.log('  Cada familia necesita una decisión con su fundamento escrito: esencial,');
console.log('  no esencial, o indeterminada si sigue sin poder resolverse. Esa decisión');
console.log('  es humana y se documenta en el manual de codificación antes de aplicarse,');
console.log('  igual que se hizo con RC-5b durante la prueba piloto. Un agrupamiento');
console.log('  automático describe el problema; no lo resuelve ni lo justifica.');
console.log('═'.repeat(78));
