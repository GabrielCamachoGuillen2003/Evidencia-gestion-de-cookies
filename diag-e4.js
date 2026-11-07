/**
 * diag-e4.js — ¿Está el escenario E4 haciendo lo que dice hacer?
 *
 *   node diag-e4.js corpus
 *   node diag-e4.js clasificado/con-banner
 *
 * El escenario E4 debe cargar el sitio, desplazarse, ignorar el banner y
 * NAVEGAR a una página interna. Si la navegación no ocurre, E4 deja de ser un
 * escenario distinto y se convierte en una repetición de E0 — y entonces la
 * violación V4, que afirma que el sitio trata la navegación como aceptación,
 * no estaría midiendo ninguna navegación.
 *
 * Este programa no repara nada. Comprueba, sitio por sitio, tres cosas que
 * juntas responden la pregunta: si la bitácora registra que hubo navegación,
 * si el conjunto de cookies de E4 es idéntico al de E0, y si E4 devolvió error.
 * Un conjunto idéntico no prueba por sí solo que el escenario falló —un sitio
 * puede instalarlo todo en la primera carga—, pero que sea idéntico en TODOS
 * los sitios sí sería concluyente.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CORPUS = process.argv[2] || 'corpus';
const clavesDe = (e) => new Set(((e && e.cookies) || []).map((c) => `${c.name}@${c.domain}`));

let n = 0;
const navego = [], noNavego = [], sinEnlaces = [], conError = [];
const identicos = [], distintos = [];
const detalle = [];

for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  const E0 = (d.escenarios || {}).E0, E4 = (d.escenarios || {}).E4;
  if (!d.sitio || !E0 || !E4) continue;
  n++;

  const bit = (E4.bitacora || []).join(' | ');
  if (E4.error) conError.push(d.sitio);
  if (/sin enlaces internos navegables/.test(bit)) sinEnlaces.push(d.sitio);
  else if (/desplazamiento y navegación interna/.test(bit)) navego.push(d.sitio);
  else noNavego.push(d.sitio);

  const a = clavesDe(E0), b = clavesDe(E4);
  const mismo = a.size === b.size && [...a].every((k) => b.has(k));
  (mismo ? identicos : distintos).push(d.sitio);

  const soloE4 = [...b].filter((k) => !a.has(k));
  detalle.push({ sitio: d.sitio, e0: a.size, e4: b.size, nuevas: soloE4.length,
                 navego: /desplazamiento y navegación interna/.test(bit), error: !!E4.error });
}

const pc = (x) => n ? (100 * x / n).toFixed(1).replace('.', ',') + ' %' : '—';
const linea = '─'.repeat(74);
console.log('═'.repeat(74));
console.log(`DIAGNÓSTICO DEL ESCENARIO E4 — ${CORPUS}`);
console.log(linea);
console.log(`  fichas con E0 y E4            ${n}`);
console.log(`\n  LA BITÁCORA DICE QUE…`);
console.log(`    navegó a una página interna ${navego.length}   ${pc(navego.length)}`);
console.log(`    no halló enlaces internos   ${sinEnlaces.length}   ${pc(sinEnlaces.length)}`);
console.log(`    no consta navegación        ${noNavego.length}   ${pc(noNavego.length)}   ← sospechoso`);
console.log(`    devolvió error              ${conError.length}   ${pc(conError.length)}`);

console.log(`\n  EL CONJUNTO DE COOKIES DE E4 FRENTE AL DE E0`);
console.log(`    idéntico                    ${identicos.length}   ${pc(identicos.length)}`);
console.log(`    distinto                    ${distintos.length}   ${pc(distintos.length)}`);

const navegaronIdentico = detalle.filter((x) => x.navego && x.e0 === x.e4 && x.nuevas === 0).length;
const navegaronDistinto = detalle.filter((x) => x.navego && x.nuevas > 0).length;
console.log(`\n  CRUCE: de los que SÍ navegaron (${navego.length})`);
console.log(`    el conjunto no cambió       ${navegaronIdentico}`);
console.log(`    aparecieron cookies nuevas  ${navegaronDistinto}`);

console.log('\n' + linea);
console.log('CÓMO LEER ESTO');
console.log(linea);
if (noNavego.length > n * 0.5) {
  console.log('  La mayoría de las fichas no registra navegación. E4 no está aplicando');
  console.log('  su tratamiento y la violación V4 no mide lo que afirma medir: habría');
  console.log('  que volver a auditar antes de reportarla.');
} else if (navegaronDistinto === 0 && navego.length > 10) {
  console.log('  Las fichas dicen que hubo navegación, pero en ningún sitio apareció');
  console.log('  una cookie nueva. Eso es improbable y apunta a que las cookies se');
  console.log('  capturan antes de que la navegación surta efecto.');
} else {
  console.log('  E4 aplica su tratamiento y produce cookies que E0 no tiene. Que un');
  console.log('  sitio concreto dé el mismo conjunto en ambos escenarios es normal:');
  console.log('  significa que instala todo en la primera carga.');
}
console.log('\n  Primeros sitios sin navegación registrada:');
for (const s of noNavego.slice(0, 12)) console.log(`      ${s}`);
console.log('═'.repeat(74));
