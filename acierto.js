/**
 * acierto.js — Validez concurrente del detector automático.
 *
 *   node acierto.js
 *
 * Cruza confirmaciones.json (juicio humano) contra el corpus (detección
 * automática) y calcula la tasa de acierto con su intervalo de confianza.
 * Se puede correr cuantas veces haga falta: solo lee, no modifica nada.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REGISTRO = process.argv[2] || 'confirmaciones.json';
const CORPUS = process.argv[3] || 'corpus';

if (!fs.existsSync(REGISTRO)) { console.log(`No existe ${REGISTRO}`); process.exit(1); }
const hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));

let n = 0, aciertos = 0;
const falsosNeg = [], falsosPos = [], dudosos = [], sinFicha = [];
let conBannerHumano = 0;

for (const [sitio, r] of Object.entries(hechas)) {
  const f = path.join(CORPUS, sitio + '.json');
  if (!fs.existsSync(f)) { sinFicha.push(sitio); continue; }
  if (r.banner === null) { dudosos.push(sitio); continue; }
  const auto = !!JSON.parse(fs.readFileSync(f, 'utf8')).resumen.bannerDetectado;
  n++;
  if (r.banner) conBannerHumano++;
  if (auto === r.banner) aciertos++;
  else if (r.banner && !auto) falsosNeg.push(sitio);
  else falsosPos.push(sitio);
}

if (!n) { console.log('No hay confirmaciones que cruzar con el corpus.'); process.exit(0); }

// Intervalo de Wilson al 95%: con proporciones cercanas a 1 el intervalo
// normal daría un límite superior mayor que 100%, que no tiene sentido.
function wilson(exitos, total, z = 1.96) {
  const p = exitos / total, d = 1 + z * z / total;
  const c = (p + z * z / (2 * total)) / d;
  const e = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return [Math.max(0, c - e), Math.min(1, c + e)];
}

const tasa = aciertos / n;
const [lo, hi] = wilson(aciertos, n);
const pc = (x) => (100 * x).toFixed(1) + '%';

console.log('═'.repeat(72));
console.log('VALIDEZ CONCURRENTE — ACIERTO DEL DETECTOR DE BANNER');
console.log('─'.repeat(72));
console.log(`  sitios verificados a mano     ${n}`);
console.log(`  de ellos, con banner          ${conBannerHumano}`);
console.log(`  aciertos del detector         ${aciertos}`);
console.log(`  TASA DE ACIERTO               ${pc(tasa)}   IC 95% [${pc(lo)}, ${pc(hi)}]`);
console.log(`  falsos negativos              ${falsosNeg.length}${falsosNeg.length ? '  ' + falsosNeg.join(', ') : '   ← los que amenazarían el hallazgo'}`);
console.log(`  falsos positivos              ${falsosPos.length}${falsosPos.length ? '  ' + falsosPos.join(', ') : ''}`);
if (dudosos.length) console.log(`  excluidos por no visualizarse ${dudosos.length}  ${dudosos.join(', ')}`);
if (sinFicha.length) console.log(`  sin ficha en el corpus        ${sinFicha.length}  ${sinFicha.join(', ')}`);

// Sensibilidad y especificidad, que es lo que un tribunal puede pedir aparte
const vp = conBannerHumano - falsosNeg.length;
const vn = n - conBannerHumano - falsosPos.length;
console.log('\n  Desglose por dirección del error');
console.log('  ' + '─'.repeat(68));
if (conBannerHumano) {
  const [slo, shi] = wilson(vp, conBannerHumano);
  console.log(`  sensibilidad (detecta banner cuando lo hay)   ${pc(vp / conBannerHumano)}  IC 95% [${pc(slo)}, ${pc(shi)}]   n=${conBannerHumano}`);
}
const negH = n - conBannerHumano;
if (negH) {
  const [elo, ehi] = wilson(vn, negH);
  console.log(`  especificidad (no inventa banner donde no hay) ${pc(vn / negH)}  IC 95% [${pc(elo)}, ${pc(ehi)}]   n=${negH}`);
}

console.log('\n  CÓMO SE REPORTA ESTO');
console.log('  ' + '─'.repeat(68));
console.log('  La cifra que sostiene el hallazgo principal es la SENSIBILIDAD: mide');
console.log('  si el detector se pierde banners que sí existen, que es el único');
console.log('  error capaz de inflar la proporción de sitios sin mecanismo. Un');
console.log('  falso positivo actúa en sentido contrario y hace la estimación más');
console.log('  conservadora, no menos. Declare ambas con su intervalo y su n.');
console.log('═'.repeat(72));
