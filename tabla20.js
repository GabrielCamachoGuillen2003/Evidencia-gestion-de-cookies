/**
 * tabla20.js — Cifras del Anexo A listas para transcribir al informe.
 *
 *   node tabla20.js                  sobre el corpus completo
 *   node tabla20.js clasificado/sin-banner
 *
 * Reutiliza las funciones de clasificación de auditor.js en vez de reimplantar
 * las reglas RC. Si las reglas cambiaran, esta tabla cambia con ellas; una copia
 * de la lógica se desincronizaría en silencio y produciría un cuadro que ya no
 * describe lo que el instrumento hace.
 *
 * Reproduce también la derivación de RC-5b tal como la hace el auditor: el
 * conjunto de cookies prescindibles sale ÚNICAMENTE de comparar E1 contra E0,
 * porque lo que la regla establece es que el sitio funcionaba sin ellas antes
 * de que nadie aceptara nada. Tomarlo de otro escenario cambiaría el sentido
 * de la regla.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { clasificar, noEsenciales, esPrimeraParte } = require('./auditor.js');
const RC7 = require('./rc7.js');

const CORPUS = process.argv[2] || 'corpus';
const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];
const ETIQ = {
  E0: 'E0. Carga sin interacción', E1: 'E1. Aceptar todo', E2: 'E2. Rechazar todo',
  E3: 'E3. Selección granular', E4: 'E4. Ignorar y navegar', E5: 'E5. Revisita tras rechazo',
};
const clavesDe = (e) => new Set(((e && e.cookies) || []).map((c) => `${c.name}@${c.domain}`));
const hubo = (e) => !!(e && e.interaccionLograda === true);

const acc = {};
for (const id of ESC) acc[id] = { sitios: 0, total: 0, primera: 0, terceros: 0, noEsen: 0, indet: 0, artef: 0 };
const violaciones = {};
let nFichas = 0, conCookies = 0, sinCookies = 0, noAuditables = 0;

for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (!d.sitio || !d.escenarios) continue;
  const E = d.escenarios, host = d.sitio;
  if (ESC.every((e) => (E[e] || {}).error)) { noAuditables++; continue; }
  nFichas++;

  // RC-5b, idéntico al auditor: solo E1 contra E0
  const baseE0 = clavesDe(E.E0);
  const aparecenAlAceptar = new Set();
  if (hubo(E.E1)) for (const k of clavesDe(E.E1)) if (!baseE0.has(k)) aparecenAlAceptar.add(k);

  let totalSitio = 0;
  for (const id of ESC) {
    const e = E[id];
    if (!e || e.error) continue;
    const cookies = e.cookies || [];
    acc[id].sitios++;
    acc[id].total += cookies.length;
    totalSitio += cookies.length;
    const ne = noEsenciales(e, host, aparecenAlAceptar);
    acc[id].noEsen += ne.size;
    for (const c of cookies) {
      if (RC7.esArtefacto(c)) { acc[id].artef++; continue; }
      const h = (c.domain || '').replace(/^\./, '');
      if (esPrimeraParte(h, host)) acc[id].primera++; else acc[id].terceros++;
      const k = clasificar(c, host, aparecenAlAceptar.has(`${c.name}@${c.domain}`));
      if (k.clase === 'indeterminada') acc[id].indet++;
    }
  }
  if (totalSitio > 0) conCookies++; else sinCookies++;
  for (const v of d.violaciones || []) violaciones[v.id] = (violaciones[v.id] || 0) + 1;
}

const n2 = (x) => x.toFixed(1).replace('.', ',');
const linea = '─'.repeat(78);
console.log('═'.repeat(78));
console.log(`TABLA 20 — Cookies y violaciones por escenario   (corpus: ${CORPUS})`);
console.log(linea);
console.log('  Escenario                    1.ª parte      Terceros   No esenciales   sitios');
for (const id of ESC) {
  const a = acc[id];
  const m = (x) => (a.sitios ? `${String(x).padStart(5)} (${n2(x / a.sitios)})` : '—').padStart(14);
  console.log(`  ${ETIQ[id].padEnd(26)}${m(a.primera)}${m(a.terceros)}${m(a.noEsen)}   ${String(a.sitios).padStart(4)}`);
}
console.log('\n  Entre paréntesis, la media por sitio. Transcriba al informe la media,');
console.log('  que es comparable entre escenarios; el total depende de cuántos sitios');
console.log('  respondieron en cada uno.');

const tot = ESC.reduce((s, id) => s + acc[id].total, 0);
const ind = ESC.reduce((s, id) => s + acc[id].indet, 0);
const art = ESC.reduce((s, id) => s + acc[id].artef, 0);
const base = tot - art;
console.log('\n' + linea);
console.log('BASE DEL CORPUS');
console.log(linea);
console.log(`  fichas auditables                  ${nFichas}`);
console.log(`  no auditables (todos los esc.)     ${noAuditables}`);
console.log(`  instalan al menos una cookie       ${conCookies}`);
console.log(`  no instalan ninguna (regla C7)     ${sinCookies}`);
console.log(`  cookies observadas en total        ${tot}`);
console.log(`  artefactos sin nombre (RC-0)       ${art}`);
console.log(`  base clasificable                  ${base}`);
console.log(`  indeterminadas (RC-6)              ${ind}   ${base ? n2(100 * ind / base) + ' %' : ''}   de la base`);

console.log('\n' + linea);
console.log('VIOLACIONES POR TIPO');
console.log(linea);
for (const id of Object.keys(violaciones).sort()) {
  const n = violaciones[id];
  const base = id === 'V1' ? conCookies : nFichas;
  const etq = id === 'V1' ? 'de los que instalan cookies' : 'de los auditables';
  console.log(`  ${id}   ${String(n).padStart(4)}   ${n2(100 * n / base).padStart(5)} %  ${etq}`);
}
console.log('\n  V1 se reporta sobre los sitios que instalan cookies: un sitio que no');
console.log('  instala ninguna no puede instalarlas antes del consentimiento, y meterlo');
console.log('  en el denominador diluiría la cifra sin razón.');
console.log('═'.repeat(78));
