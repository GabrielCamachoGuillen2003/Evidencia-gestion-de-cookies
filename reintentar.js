/**
 * reintentar.js — Devuelve a la cola los sitios que fallaron por red.
 *
 *   node reintentar.js
 *
 * Un sitio marcado «no se pudo ver» porque la conexión falló en ese momento no
 * es un sitio no verificable: es una verificación que no llegó a hacerse. Dejar
 * los dos casos juntos infla el indicador de cobertura y resta fuerza a un
 * hallazgo que no tiene por qué cargar con un problema de red.
 *
 * Quita de confirmaciones.json las entradas listadas en reintentar.txt para que
 * confirmar.js vuelva a preguntarlas. Antes guarda un respaldo: el registro de
 * confirmaciones es dato primario y no se sobrescribe sin copia.
 */
'use strict';
const fs = require('fs');

const REGISTRO = 'confirmaciones.json';
const LISTA = process.argv[2] || 'reintentar.txt';
const RESPALDO = 'confirmaciones-respaldo.json';

for (const f of [REGISTRO, LISTA]) {
  if (!fs.existsSync(f)) { console.log(`No existe ${f}. Corra antes: node clasificar.js`); process.exit(1); }
}

const hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));
fs.writeFileSync(RESPALDO, JSON.stringify(hechas, null, 2));

const sitios = fs.readFileSync(LISTA, 'utf8').split('\n')
  .map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

let n = 0;
for (const s of sitios) if (s in hechas) { delete hechas[s]; n++; }
fs.writeFileSync(REGISTRO, JSON.stringify(hechas, null, 2));

console.log(`Respaldo guardado en ${RESPALDO}`);
console.log(`Devueltos a la cola: ${n} de ${sitios.length} sitios.`);
console.log(`Quedan ${Object.keys(hechas).length} confirmaciones intactas.`);
console.log('\nAhora corra:  node confirmar.js --todos --min 5 --max 14');
