/**
 * reclasificar.js — Vuelve a clasificar el corpus con las bases públicas.
 *
 *   node reclasificar.js                 solo informa, no toca nada
 *   node reclasificar.js --aplicar       escribe corpus-reclasificado/
 *
 * No se vuelve a auditar ningún sitio. Las cookies observadas están guardadas
 * en las fichas tal como se recogieron, y la clasificación es una operación de
 * análisis que se aplica sobre ellas. Separar la observación de su
 * interpretación es lo que permite mejorar las reglas sin volver a tocar la
 * web y sin que cambie un solo dato primario: lo que cambia es la lectura, y
 * queda a la vista cuánto cambia.
 *
 * Con --aplicar escribe en una carpeta nueva en vez de sobrescribir el corpus.
 * El corpus original es la evidencia; se conserva intacto aunque las reglas
 * evolucionen, porque un revisor tiene que poder rehacer ambas lecturas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { derivarViolaciones } = require('./auditor.js');
const L = require('./listas.js');
const RC7 = require('./rc7.js');

const CORPUS = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || 'corpus';
const APLICAR = process.argv.includes('--aplicar');
const DESTINO = CORPUS.replace(/[\/\\]$/, '') + '-reclasificado';
const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];

let fichas = 0, cookiesTot = 0, artefactos = 0;
let indAntes = 0, indDespues = 0, funcionales = 0;
const vAntes = {}, vDespues = {};
const movidos = [];

if (APLICAR) fs.mkdirSync(DESTINO, { recursive: true });

for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio || !d.escenarios) continue;
  if (ESC.every((e) => (d.escenarios[e] || {}).error)) continue;
  fichas++;

  const total = ESC.reduce((n, e) => n + ((d.escenarios[e] || {}).cookies || []).length, 0);
  cookiesTot += total;
  for (const e of ESC) {
    for (const c of ((d.escenarios[e] || {}).cookies || [])) if (RC7.esArtefacto(c)) artefactos++;
  }
  indAntes += (d.cookiesIndeterminadas || []).length;
  for (const v of d.violaciones || []) vAntes[v.id] = (vAntes[v.id] || 0) + 1;

  const nuevo = derivarViolaciones(d.escenarios, d.sitio);
  indDespues += nuevo.indeterminadas.length;
  funcionales += nuevo.indeterminadas.filter((c) => /Functional o Personalization/.test(c.motivo || '')).length;
  for (const v of nuevo.violaciones) vDespues[v.id] = (vDespues[v.id] || 0) + 1;

  const idA = (d.violaciones || []).map((v) => v.id).sort().join(',');
  const idD = nuevo.violaciones.map((v) => v.id).sort().join(',');
  if (idA !== idD) movidos.push({ sitio: d.sitio, antes: idA || '—', despues: idD || '—' });

  if (APLICAR) {
    const pct = total ? (100 * nuevo.indeterminadas.length) / total : 0;
    const ficha = {
      ...d,
      violaciones: nuevo.violaciones,
      violacionesNoEvaluables: nuevo.omitidas,
      revisionManualRequerida: nuevo.revisionManual,
      pendientesDeEvaluacionManual: nuevo.pendientes,
      cookiesIndeterminadas: nuevo.indeterminadas,
      reclasificadoEn: new Date().toISOString(),
      basesDeClasificacion: L.PROCEDENCIA,
      resumen: {
        ...d.resumen,
        proporcionIndeterminadas: Number(pct.toFixed(1)),
        superaUmbralIndeterminadas: pct > 10,
        criticas: nuevo.violaciones.filter((v) => v.gravedad === 'Crítica').map((v) => v.id),
      },
    };
    fs.writeFileSync(path.join(DESTINO, f), JSON.stringify(ficha, null, 2));
  }
}

const n1 = (x) => x.toFixed(1).replace('.', ',');
const pc = (x, t) => t ? n1(100 * x / t) + ' %' : '—';
const linea = '─'.repeat(72);

console.log('═'.repeat(72));
console.log('RECLASIFICACIÓN CON LAS BASES PÚBLICAS');
console.log(linea);
console.log(`  F1  ${L.PROCEDENCIA.F1.nombre}  ·  ${L.PROCEDENCIA.F1.entradas} cookies  ·  ${L.PROCEDENCIA.F1.descargada}`);
console.log(`  F2  ${L.PROCEDENCIA.F2.nombre}  ·  ${L.PROCEDENCIA.F2.dominios} dominios  ·  ${L.PROCEDENCIA.F2.descargada}`);
console.log(`\n  fichas procesadas        ${fichas}`);
console.log(`  cookies observadas       ${cookiesTot}   (ninguna se vuelve a recoger)`);
console.log(`  artefactos (RC-0)        ${artefactos}   cookies sin nombre: no almacenan nada`);
const BASE = cookiesTot - artefactos;
console.log(`  base de clasificación    ${BASE}`);

console.log('\n' + linea);
console.log('COOKIES INDETERMINADAS (regla RC-6)');
console.log(linea);
console.log(`  antes   ${String(indAntes).padStart(6)}   ${pc(indAntes, cookiesTot)}   sobre las ${cookiesTot} observadas`);
console.log(`  después ${String(indDespues).padStart(6)}   ${pc(indDespues, BASE)}   sobre las ${BASE} clasificables   umbral 10 %  ${indDespues / BASE <= 0.1 ? '✓' : '✗'}`);
const dif = indAntes - indDespues;
if (dif >= 0) console.log(`  resueltas por las bases  ${dif}   ${pc(dif, indAntes || 1)} de las que había`);
else console.log(`  aparecen ${-dif} indeterminadas más: las reglas nuevas dejan sin`);
if (dif < 0) console.log('  resolver casos que las anteriores daban por clasificados. Revíselo.');
console.log(`\n  de las que siguen indeterminadas, ${funcionales} son Functional o`);
console.log('  Personalization en F1: categorías que no caben en la exención del');
console.log('  artículo 5.3 ni bastan para declarar rastreo. No se les imputa nada.');

console.log('\n' + linea);
console.log('VIOLACIONES  (antes → después)');
console.log(linea);
for (const id of [...new Set([...Object.keys(vAntes), ...Object.keys(vDespues)])].sort()) {
  const a = vAntes[id] || 0, b = vDespues[id] || 0;
  const flecha = b === a ? ' =' : (b > a ? ' ↑' : ' ↓');
  console.log(`  ${id}   ${String(a).padStart(4)} → ${String(b).padStart(4)}${flecha}  ${b !== a ? (b > a ? '+' : '') + (b - a) : ''}`);
}
if (movidos.length) {
  console.log(`\n  sitios cuyo conjunto de violaciones cambia: ${movidos.length}`);
  for (const m of movidos.slice(0, 25)) console.log(`      ${m.sitio.padEnd(34)} ${m.antes}  →  ${m.despues}`);
  if (movidos.length > 25) console.log(`      … y ${movidos.length - 25} más`);
} else {
  console.log('\n  ningún sitio cambia su conjunto de violaciones.');
}

console.log('\n' + linea);
if (APLICAR) {
  console.log(`  fichas reclasificadas escritas en ${DESTINO}/`);
  console.log(`  el corpus original en ${CORPUS}/ queda intacto: es la evidencia.`);
} else {
  console.log('  Informe únicamente. Para escribir las fichas:  node reclasificar.js --aplicar');
}
console.log('═'.repeat(72));
