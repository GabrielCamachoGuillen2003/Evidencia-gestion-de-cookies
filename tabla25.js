/**
 * tabla25.js — Genera las filas de la Tabla 25 del Anexo A.
 *
 *   node tabla25.js
 *
 * La tabla del anexo recoge el formato de reporte por sitio. El resultado
 * completo son 258 filas que viven en icc.csv y en el repositorio; aquí se
 * extraen las diez de mayor cota superior, que son las que el informe imprime.
 *
 * La selección no es arbitraria ni azarosa: son los sitios mejor situados del
 * corpus, y se eligen precisamente porque es en ellos donde el hallazgo se
 * pone a prueba. Si ni los diez mejores alcanzan la banda de cumplimiento
 * alto, la afirmación sobre el conjunto se sostiene sola.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CORPUS = 'corpus-reclasificado';
const UNIVERSIDADES_ESTATALES = new Set([
  'ucr.ac.cr', 'una.ac.cr', 'tec.ac.cr', 'itcr.ac.cr', 'uned.ac.cr', 'utn.ac.cr',
  'ina.ac.cr', 'conare.ac.cr', 'cenat.ac.cr', 'sinaes.ac.cr', 'imn.ac.cr',
]);
const sector = (s) => {
  const h = String(s).replace(/^www\./, '').toLowerCase();
  if (/\.go\.cr$|\.sa\.cr$|\.or\.cr$/.test(h) || UNIVERSIDADES_ESTATALES.has(h)) return 'Público';
  return 'Privado';
};

// ── Leer icc.csv ───────────────────────────────────────────────────────────
if (!fs.existsSync('icc.csv')) { console.log('Falta icc.csv. Corra antes: node icc.js corpus-reclasificado --csv icc.csv'); process.exit(1); }
const lineas = fs.readFileSync('icc.csv', 'utf8').replace(/^﻿/, '').split('\n');
const campos = (l) => (l.match(/"((?:[^"]|"")*)"/g) || []).map((c) => c.slice(1, -1).replace(/""/g, '"'));

const filas = [];
for (const l of lineas.slice(1)) {
  const c = campos(l);
  if (c.length < 6) continue;
  filas.push({ sitio: c[0], min: parseFloat(c[3]), max: parseFloat(c[4]), banda: c[5] });
}
filas.sort((a, b) => b.max - a.max);
const diez = filas.slice(0, 10);

// ── Completar con violaciones y fecha desde el corpus ──────────────────────
for (const f of diez) {
  const p = path.join(CORPUS, f.sitio + '.json');
  if (!fs.existsSync(p)) { f.vio = '—'; f.fecha = '—'; continue; }
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ids = [...new Set((d.violaciones || []).map((v) => v.id))].sort();
  f.vio = ids.length ? ids.join(', ') : 'ninguna';
  f.fecha = String(d.auditadoEn || '').slice(0, 10) || '—';
}

console.log('FILAS PARA LA TABLA 25 — cópielas tal cual\n');
console.log('Dominio | Sector | ICC-CR | Banda | Violaciones detectadas | Fecha de observación');
console.log('─'.repeat(100));
for (const f of diez) {
  const icc = `${f.min.toFixed(1).replace('.', ',')} – ${f.max.toFixed(1).replace('.', ',')}`;
  console.log(`${f.sitio} | ${sector(f.sitio)} | ${icc} | ${f.banda} | ${f.vio} | ${f.fecha}`);
}
console.log('\nEl resultado completo de los 258 sitios está en icc.csv.');
