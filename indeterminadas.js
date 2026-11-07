/**
 * indeterminadas.js — Qué son las cookies que ninguna regla resuelve.
 *
 *   node indeterminadas.js corpus-reclasificado
 *   node indeterminadas.js corpus-reclasificado --top 60
 *
 * Una proporción alta de cookies indeterminadas no dice por sí sola si el
 * problema es grave. Puede venir de miles de nombres distintos, y entonces no
 * hay nada que hacer salvo declararlo; o puede concentrarse en unas decenas de
 * nombres repetidos por todo el corpus, y entonces adjudicarlos a mano con su
 * justificación es trabajo de codificación ordinario y perfectamente
 * defendible. Este informe distingue un caso del otro.
 *
 * Ordena por número de SITIOS y no por número de apariciones: una cookie que
 * sale seis veces en un solo sitio, una por escenario, no es más importante que
 * una que sale en sesenta sitios. Contar apariciones premiaría a los sitios con
 * más escenarios respondidos, que es un artefacto de la recolección.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CORPUS = args.find((a) => !a.startsWith('--')) || 'corpus-reclasificado';
const i = args.indexOf('--top');
const TOP = i >= 0 ? parseInt(args[i + 1], 10) : 40;

const porNombre = new Map();
let totalInd = 0, fichas = 0;
const porMotivo = new Map();

for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio) continue;
  fichas++;
  const vistasAqui = new Set();
  for (const c of d.cookiesIndeterminadas || []) {
    totalInd++;
    const m = c.motivo || '(sin motivo registrado)';
    porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
    const clave = c.cookie;
    if (!porNombre.has(clave)) porNombre.set(clave, { apariciones: 0, sitios: new Set(), dominios: new Set() });
    const e = porNombre.get(clave);
    e.apariciones++;
    e.sitios.add(d.sitio);
    if (c.dominio) e.dominios.add(String(c.dominio).replace(/^\./, ''));
    vistasAqui.add(clave);
  }
}

const lista = [...porNombre.entries()]
  .map(([nombre, e]) => ({ nombre, apariciones: e.apariciones, sitios: e.sitios.size, dominios: e.dominios }))
  .sort((a, b) => b.sitios - a.sitios || b.apariciones - a.apariciones);

const n1 = (x) => x.toFixed(1).replace('.', ',');
const linea = '─'.repeat(78);

if (!totalInd) {
  console.log(`No hay cookies indeterminadas en ${CORPUS}/ (${fichas} fichas).`);
  console.log('Si esperaba encontrarlas, compruebe que las fichas traen el campo');
  console.log('cookiesIndeterminadas: las anteriores a la reclasificación no guardan');
  console.log('el motivo, y este informe lo necesita.');
  process.exit(0);
}
console.log('═'.repeat(78));
console.log(`COOKIES INDETERMINADAS — ${CORPUS}`);
console.log(linea);
console.log(`  fichas                        ${fichas}`);
console.log(`  apariciones indeterminadas    ${totalInd}`);
console.log(`  nombres distintos             ${lista.length}`);

console.log('\n' + linea);
console.log('POR MOTIVO');
console.log(linea);
for (const [m, n] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${n1(100 * n / totalInd).padStart(5)} %  ${m.slice(0, 60)}`);
}

console.log('\n' + linea);
console.log(`LOS ${Math.min(TOP, lista.length)} NOMBRES EN MÁS SITIOS`);
console.log(linea);
console.log('  sitios  aparic.  nombre                              dominio más común');
let acumSitios = 0;
for (const e of lista.slice(0, TOP)) {
  acumSitios += e.apariciones;
  const dom = [...e.dominios][0] || '';
  console.log(`  ${String(e.sitios).padStart(6)}  ${String(e.apariciones).padStart(7)}  ${e.nombre.slice(0, 34).padEnd(34)}  ${dom.slice(0, 26)}`);
}
console.log(`\n  esos ${Math.min(TOP, lista.length)} nombres concentran ${acumSitios} de ${totalInd} apariciones` +
            `  (${n1(100 * acumSitios / totalInd)} %)`);

// Concentración acumulada: cuántos nombres hacen falta para cubrir la mitad
let acc = 0, mitad = 0, tresCuartos = 0;
for (let k = 0; k < lista.length; k++) {
  acc += lista[k].apariciones;
  if (!mitad && acc >= totalInd * 0.5) mitad = k + 1;
  if (!tresCuartos && acc >= totalInd * 0.75) { tresCuartos = k + 1; break; }
}
console.log('\n' + linea);
console.log('CONCENTRACIÓN');
console.log(linea);
console.log(`  nombres necesarios para cubrir el 50 % de las apariciones   ${mitad}`);
console.log(`  nombres necesarios para cubrir el 75 %                      ${tresCuartos}`);
console.log('\n  Si esas cifras son bajas, adjudicar esos nombres a mano contra la');
console.log('  rúbrica resuelve la mayor parte de la incertidumbre y el procedimiento');
console.log('  se documenta en el manual de codificación. Si son altas, la dispersión');
console.log('  es real: se declara el porcentaje y se explica que las indeterminadas');
console.log('  no reciben violación, de modo que las cifras quedan como cotas inferiores.');
console.log('═'.repeat(78));
