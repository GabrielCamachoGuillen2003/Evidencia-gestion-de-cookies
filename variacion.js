/**
 * variacion.js — Coeficiente de variación entre mediciones repetidas.
 *
 *   node variacion.js corpus corpus-rep2
 *
 * Compara los sitios medidos dos veces en fechas distintas y calcula cuánto
 * varía el recuento de cookies entre ambas. Es el criterio de estabilidad del
 * plan de validación, con umbral del 10%, y la respuesta cuantitativa al
 * riesgo de comportamiento no determinista: en los sitios con publicidad
 * programática los proveedores rotan entre visitas, y hay que medir cuánto.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const A = process.argv[2] || 'corpus';
const B = process.argv[3] || 'corpus-rep2';
const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];

const leer = (d, s) => {
  const f = path.join(d, s);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

const pares = [];
for (const f of fs.readdirSync(B).filter((x) => x.endsWith('.json'))) {
  const a = leer(A, f), b = leer(B, f);
  if (!a || !b) continue;
  const n = (d) => ESC.reduce((t, e) => t + (((d.escenarios[e] || {}).cookies) || []).length, 0);
  const r = (d) => ESC.reduce((t, e) => t + (((d.escenarios[e] || {}).peticionesRastreo) || []).length, 0);
  if (ESC.every((e) => (a.escenarios[e] || {}).error)) continue;
  pares.push({ sitio: a.sitio, c1: n(a), c2: n(b), r1: r(a), r2: r(b),
               f1: a.auditadoEn.slice(0, 10), f2: b.auditadoEn.slice(0, 10) });
}

if (!pares.length) { console.log('No hay pares comparables.'); process.exit(0); }

// CV de cada par: desviación típica entre las dos medidas sobre su media
const cv = (x, y) => { const m = (x + y) / 2; return m ? 100 * (Math.abs(x - y) / Math.SQRT2) / m : 0; };

console.log('═'.repeat(76));
console.log('ESTABILIDAD ENTRE MEDICIONES REPETIDAS');
console.log('─'.repeat(76));
console.log('  sitio                        cookies m1  m2    CV      rastreadores m1  m2');
let suma = 0, sobre = 0;
for (const p of pares.sort((x, y) => cv(y.c1, y.c2) - cv(x.c1, x.c2))) {
  const v = cv(p.c1, p.c2);
  suma += v;
  if (v > 10) sobre++;
  console.log(`  ${p.sitio.padEnd(28)} ${String(p.c1).padStart(5)} ${String(p.c2).padStart(4)}  ${v.toFixed(1).padStart(6)}%  ` +
              `${String(p.r1).padStart(12)} ${String(p.r2).padStart(4)}${v > 10 ? '   ←' : ''}`);
}
const medio = suma / pares.length;
console.log('─'.repeat(76));
console.log(`  pares comparados              ${pares.length}`);
console.log(`  CV medio                      ${medio.toFixed(1)}%   (umbral: 10%)`);
console.log(`  pares por encima del umbral   ${sobre}`);
console.log(`  fechas                        ${pares[0].f1} frente a ${pares[0].f2}`);
console.log(`\n  ${medio <= 10 ? 'La medición es estable: el recuento no depende apreciablemente del momento\n  de la visita, y los resultados puntuales son reportables como tales.'
  : 'La medición NO alcanza el umbral de estabilidad. Procede reportar por\n  intervalos en lugar de valores puntuales y declararlo como limitación.'}`);
console.log('═'.repeat(76));
