/**
 * submuestra.js — Depura el corpus y selecciona la submuestra de verificación.
 *
 *   node submuestra.js corpus
 *   node submuestra.js corpus --limpiar        (mueve las fichas inválidas)
 *
 * Hace dos cosas que el informe necesita poder justificar.
 *
 * PRIMERA. Separa las fichas cuyo dominio no resuelve. Un dominio inexistente
 * es un defecto del marco muestral, no un sitio que se negó a ser auditado, y
 * contarlo como pérdida distorsiona un indicador de calidad del levantamiento.
 * Con --limpiar las aparta a corpus-descartados/ en lugar de borrarlas, de modo
 * que la depuración queda documentada y es reversible.
 *
 * SEGUNDA. Selecciona la submuestra de 60 sitios para verificación manual que
 * exige el plan de validación. La selección es ALEATORIA con semilla fija: no
 * se eligen los sitios a dedo, y cualquiera puede reproducir exactamente la
 * misma selección con la misma semilla. Elegirlos por conveniencia invalidaría
 * la estimación de la tasa de acierto del detector.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'corpus';
const limpiar = process.argv.includes('--limpiar');
const SEMILLA = 20261105;     // fecha del levantamiento; declararla en el informe
const TAMANO = 60;            // submuestra de validez concurrente

// Generador reproducible (xorshift32). Math.random() no sirve: no es replicable.
function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const fichas = archivos.map((f) => ({ archivo: f, d: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));

// ── 1. Fichas cuyo dominio no existe ───────────────────────────────────────
const inexistentes = [], caidos = [], validos = [];
for (const f of fichas) {
  const errs = ESC.map((e) => (f.d.escenarios[e] || {}).error).filter(Boolean);
  if (errs.length < ESC.length) { validos.push(f); continue; }
  (/ERR_NAME_NOT_RESOLVED/.test(errs[0]) ? inexistentes : caidos).push(f);
}

console.log('═'.repeat(76));
console.log('DEPURACIÓN DEL MARCO');
console.log('─'.repeat(76));
console.log(`  fichas en el corpus              ${fichas.length}`);
console.log(`  auditadas con éxito              ${validos.length}`);
console.log(`  dominio inexistente              ${inexistentes.length}   ← defecto del marco, NO pérdida`);
for (const f of inexistentes) console.log(`      ${f.d.sitio}`);
console.log(`  caídas o inaccesibles            ${caidos.length}   ← pérdida muestral legítima`);
for (const f of caidos) console.log(`      ${f.d.sitio}`);

const muestraReal = validos.length + caidos.length;
console.log(`\n  muestra efectiva                 ${muestraReal}`);
console.log(`  tasa de pérdida                  ${(100 * caidos.length / muestraReal).toFixed(1)}%   (umbral: 10%)`);

if (limpiar && inexistentes.length) {
  const destino = dir.replace(/\/$/, '') + '-descartados';
  fs.mkdirSync(destino, { recursive: true });
  for (const f of inexistentes) {
    fs.renameSync(path.join(dir, f.archivo), path.join(destino, f.archivo));
  }
  fs.writeFileSync(path.join(destino, 'MOTIVO.txt'),
    'Fichas apartadas del corpus porque el dominio no resuelve.\n' +
    'Son defectos del marco muestral, no sitios no auditables, y por tanto\n' +
    'no computan en la tasa de pérdida del levantamiento.\n\n' +
    inexistentes.map((f) => f.d.sitio).join('\n') + '\n');
  console.log(`\n  ${inexistentes.length} fichas movidas a ${destino}/`);
}

// ── 2. Submuestra de verificación ──────────────────────────────────────────
/**
 * Sector según la definición de la Sección 3.5.2 del informe, que incluye en el
 * sector público las universidades y entes educativos ESTATALES. La regla
 * anterior se guiaba solo por el dominio y dejaba a la UCR, la UNA, el TEC y la
 * UNED del lado privado, al revés de lo que el marco define. No afecta al
 * hallazgo principal, que no se desglosa por sector, pero sí a cualquier
 * comparación entre sectores: con la regla vieja esa comparación diría algo
 * distinto de lo que el marco declara estar comparando.
 *
 * Los dominios .or.cr son colegios profesionales y asociaciones: entes públicos
 * no estatales. Se mantienen en público porque así los cuenta el marco.
 */
const UNIVERSIDADES_ESTATALES = new Set([
  'ucr.ac.cr', 'una.ac.cr', 'tec.ac.cr', 'itcr.ac.cr', 'uned.ac.cr', 'utn.ac.cr',
  'ina.ac.cr', 'conare.ac.cr', 'cenat.ac.cr', 'sinaes.ac.cr', 'imn.ac.cr',
]);
const sector = (s) => {
  const h = String(s).replace(/^www\./, '').toLowerCase();
  if (/\.go\.cr$|\.sa\.cr$|\.or\.cr$/.test(h)) return 'público';
  if (UNIVERSIDADES_ESTATALES.has(h)) return 'público';
  return 'privado';
};
const porSector = { 'público': [], 'privado': [] };
for (const f of validos) porSector[sector(f.d.sitio)].push(f.d.sitio);

const rnd = aleatorio(SEMILLA);
const barajar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const seleccion = [];
for (const s of ['público', 'privado']) {
  const cuota = Math.round(TAMANO * porSector[s].length / validos.length);
  seleccion.push(...barajar(porSector[s]).slice(0, cuota).map((x) => ({ sitio: x, sector: s })));
}

console.log('\nSUBMUESTRA DE VERIFICACIÓN MANUAL');
console.log('─'.repeat(76));
console.log(`  semilla declarada                ${SEMILLA}   (reproducible)`);
console.log(`  tamaño                           ${seleccion.length} de ${validos.length} auditados`);
console.log(`  reparto                          ${seleccion.filter((x) => x.sector === 'público').length} públicos / ${seleccion.filter((x) => x.sector === 'privado').length} privados`);

// Sitios ya confirmados a mano durante el piloto
const YA = new Set(['hacienda.go.cr', 'ccss.sa.cr', 'mep.go.cr', 'tse.go.cr', 'aya.go.cr',
  'ministeriodesalud.go.cr', 'ucr.ac.cr', 'presidencia.go.cr', 'nacion.com', 'teletica.com',
  'larepublica.net', 'elfinancierocr.com', 'bancobcr.com', 'automercado.cr', 'gollo.com',
  'bncr.fi.cr']);

const hechos = seleccion.filter((x) => YA.has(x.sitio));
const faltan = seleccion.filter((x) => !YA.has(x.sitio));
console.log(`  ya confirmados en el piloto      ${hechos.length}`);
console.log(`  PENDIENTES                       ${faltan.length}   (~${Math.round(faltan.length * 2)} min de trabajo)`);

fs.writeFileSync('submuestra-pendientes.txt',
  `# Submuestra de verificación manual — ${faltan.length} sitios pendientes\n` +
  `# Selección aleatoria con semilla ${SEMILLA}, reproducible.\n` +
  `# Método: ventana privada, esperar 20 s sin tocar nada, desplazarse al pie.\n` +
  `# Anotar para cada uno: ¿hay aviso de cookies? sí / no\n#\n` +
  faltan.map((x) => `[ ] ${x.sitio.padEnd(34)} (${x.sector})`).join('\n') + '\n');
console.log(`\n  lista escrita en: submuestra-pendientes.txt`);

console.log('\nPARA QUÉ SIRVE ESTA SUBMUESTRA');
console.log('─'.repeat(76));
console.log('  Confirmar los 211 sitios sin banner llevaría unas siete horas. No hace');
console.log('  falta: con esta submuestra se estima la TASA DE ACIERTO del detector');
console.log('  y se extrapola al resto con su intervalo de confianza. Si de los 60');
console.log('  verificados el detector acertó en todos, puede afirmar el hallazgo');
console.log('  sobre el corpus completo con el intervalo correspondiente. Es además');
console.log('  la medida de validez concurrente que el plan de validación ya exige,');
console.log('  de modo que un mismo esfuerzo cubre las dos cosas.');
console.log('═'.repeat(76));
