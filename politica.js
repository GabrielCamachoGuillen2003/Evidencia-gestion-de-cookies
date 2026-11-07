/**
 * politica.js — ¿Informa el sitio algo sobre cookies, en alguna parte?
 *
 *   node politica.js corpus-reclasificado
 *   node politica.js corpus-reclasificado --solo-indeterminados icc.csv
 *
 * La dimensión D2 del índice mide la calidad de la información: si se declaran
 * los terceros receptores, si se declara la duración de cada cookie, si la
 * política coincide con lo observado y si el lenguaje es comprensible. Evaluar
 * esas cuatro cosas exige leer la política, y eso no se automatiza.
 *
 * Pero hay una pregunta previa que sí: ¿existe la política? Un sitio que no
 * presenta aviso de cookies NI enlaza a ninguna política no informa nada sobre
 * cookies en ninguna parte, y entonces los cuatro requisitos valen cero por
 * ausencia de vehículo, no por mala redacción. Eso deja de ser un juicio sobre
 * el contenido y pasa a ser una comprobación de existencia.
 *
 * El programa NO lee la política ni la evalúa. Solo registra si hay un enlace
 * a ella y cuál es, para que la codificación manual posterior sepa dónde mirar.
 * Y registra la ausencia con cuidado: un enlace no encontrado no prueba que la
 * política no exista, solo que no es alcanzable desde la portada. Esa distinción
 * va en el resultado y debe ir también en el informe.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CORPUS = args.find((a) => !a.startsWith('--') && !a.endsWith('.csv')) || 'corpus-reclasificado';
const iSolo = args.indexOf('--solo-indeterminados');
const CSV = iSolo >= 0 ? args[iSolo + 1] : null;
const SALIDA = 'politicas.json';

const RX_COOKIES = /cookie/i;
const RX_PRIVACIDAD = /pol[ií]tica\s+de\s+privacidad|aviso\s+de\s+privacidad|protecci[óo]n\s+de\s+datos|privacy\s*polic|datos\s+personales/i;

// ── Qué sitios revisar ─────────────────────────────────────────────────────
let sitios = [];
if (CSV && fs.existsSync(CSV)) {
  const lineas = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').split('\n').slice(1);
  for (const l of lineas) {
    const celdas = l.match(/"((?:[^"]|"")*)"/g);
    if (!celdas || celdas.length < 6) continue;
    const limpio = (i) => celdas[i].slice(1, -1).replace(/""/g, '"');
    if (limpio(5).includes('–')) sitios.push(limpio(0));   // banda indeterminada
  }
  console.log(`De ${CSV}: ${sitios.length} sitios con banda indeterminada.`);
} else {
  sitios = fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8')).sitio).filter(Boolean);
}

let previo = {};
if (fs.existsSync(SALIDA)) previo = JSON.parse(fs.readFileSync(SALIDA, 'utf8'));
const faltan = sitios.filter((s) => !(s in previo));
if (!faltan.length) { console.log('Todos los sitios ya están revisados. Borre politicas.json para rehacerlo.'); process.exit(0); }

(async () => {
  console.log(`Revisando ${faltan.length} sitios. Solo se carga la portada y se leen sus enlaces.\n`);
  const browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
  let n = 0;

  for (const sitio of faltan) {
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 820 }, locale: 'es-CR',
      timezoneId: 'America/Costa_Rica', ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    const reg = { cookies: null, privacidad: null, error: null, en: new Date().toISOString() };
    try {
      await page.goto('https://' + sitio, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3500);
      const enlaces = await page.$$eval('a[href]', (as) => as.map((a) => ({
        texto: (a.textContent || '').trim().slice(0, 120),
        href: typeof a.href === 'string' ? a.href : '',
      })).filter((x) => x.href)).catch(() => []);
      for (const e of enlaces) {
        const donde = e.texto + ' ' + e.href;
        if (!reg.cookies && RX_COOKIES.test(donde)) reg.cookies = e.href.slice(0, 300);
        if (!reg.privacidad && RX_PRIVACIDAD.test(donde)) reg.privacidad = e.href.slice(0, 300);
      }
      reg.enlacesRevisados = enlaces.length;
    } catch (e) {
      reg.error = e.message.split('\n')[0].slice(0, 80);
    }
    await ctx.close();

    previo[sitio] = reg;
    n++;
    fs.writeFileSync(SALIDA, JSON.stringify(previo, null, 2));
    const marca = reg.error ? '!' : (reg.cookies ? 'C' : (reg.privacidad ? 'p' : '·'));
    process.stdout.write(`${marca}`);
    if (n % 60 === 0) process.stdout.write(`  ${n}/${faltan.length}\n`);
  }
  await browser.close();

  const vals = Object.values(previo);
  const conC = vals.filter((v) => v.cookies).length;
  const soloP = vals.filter((v) => !v.cookies && v.privacidad).length;
  const nada = vals.filter((v) => !v.cookies && !v.privacidad && !v.error).length;
  const err = vals.filter((v) => v.error).length;
  const pc = (x) => (100 * x / vals.length).toFixed(1).replace('.', ',') + ' %';
  console.log(`\n\n${'─'.repeat(74)}`);
  console.log(`  sitios revisados                       ${vals.length}`);
  console.log(`  enlazan una política de cookies        ${conC}   ${pc(conC)}`);
  console.log(`  solo una política de privacidad        ${soloP}   ${pc(soloP)}`);
  console.log(`  ninguna de las dos desde la portada    ${nada}   ${pc(nada)}   ← D2 sin vehículo`);
  console.log(`  no se pudieron revisar                 ${err}   ${pc(err)}`);
  console.log(`\n  escrito en ${SALIDA}`);
  console.log('\n  Un enlace no hallado no prueba que la política no exista: prueba que no');
  console.log('  es alcanzable desde la portada. Esa distinción debe figurar en el informe.');
  console.log('─'.repeat(74));
})();
