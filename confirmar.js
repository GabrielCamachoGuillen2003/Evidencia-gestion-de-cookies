/**
 * confirmar.js — Asistente de verificación manual (regla C1).
 *
 *   node confirmar.js --todos                 verifica TODO el corpus pendiente
 *   node confirmar.js submuestra-pendientes.txt
 *   node confirmar.js --todos --min 4 --max 14
 *
 * Abre cada sitio en una ventana visible con perfil limpio y pregunta si hay
 * aviso de cookies. El juicio es humano: la regla C1 prohíbe dar por buena una
 * ausencia de banner sin que una persona la confirme.
 *
 * ESPERA ADAPTATIVA. En lugar de contar un número fijo de segundos, aguarda a
 * que la red se calme, con un mínimo y un máximo. Un sitio ligero queda listo
 * en cuatro o cinco segundos; uno con publicidad pesada se toma los que
 * necesite. Una espera fija corta produce falsos «no hay banner» justo en los
 * sitios con más publicidad, que son los que más rastreadores cargan, y ese
 * sesgo apuntaría en contra del propio hallazgo.
 *
 * El verificador NO ve lo que opinó el detector automático: la validación
 * tiene que ser ciega o deja de medir al instrumento.
 *
 * Teclas:  s = sí hay banner · n = no hay · d = dudoso · r = repetir · q = salir
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const opt = (n, def) => { const i = args.indexOf(n); return i >= 0 ? parseFloat(args[i + 1]) : def; };
const MIN = opt('--min', 4) * 1000;
const MAX = opt('--max', 16) * 1000;
const CORPUS = 'corpus';
const REGISTRO = 'confirmaciones.json';

// ── Qué sitios hay que verificar ───────────────────────────────────────────
let sitios = [];
if (args.includes('--todos')) {
  for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
    const esc = d.escenarios || {};
    const ESC = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];
    if (!d.sitio) continue;
    if (ESC.every((e) => (esc[e] || {}).error)) continue;   // no auditable: nada que mirar
    sitios.push(d.sitio);
  }
  sitios.sort();
} else {
  const lista = args.find((a) => !a.startsWith('--') && isNaN(parseFloat(a))) || 'submuestra-pendientes.txt';
  sitios = fs.readFileSync(lista, 'utf8').split('\n')
    .map((l) => { const m = l.match(/^\[\s*\]\s+(\S+)/) || l.match(/^(\S+\.\w+)\s*$/); return m ? m[1] : null; })
    .filter((s) => s && !s.startsWith('#'));
}

let hechas = {};
if (fs.existsSync(REGISTRO)) hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));
const faltan = sitios.filter((s) => !(s in hechas));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  console.log(`Sitios auditables: ${sitios.length}   ya confirmados: ${Object.keys(hechas).length}   pendientes: ${faltan.length}`);
  if (!faltan.length) { console.log('No queda nada pendiente. Corra: node acierto.js'); rl.close(); return; }
  console.log(`Espera adaptativa: entre ${MIN / 1000} y ${MAX / 1000} s según lo que tarde cada sitio.`);
  console.log('Teclas:  s=sí hay banner   n=no hay   d=dudoso   r=repetir   q=salir\n');

  const browser = await chromium.launch({ headless: false, args: ['--disable-http2'] });
  const t0 = Date.now();
  let n = 0;

  for (let i = 0; i < faltan.length; i++) {
    const sitio = faltan[i];
    let respuesta = null;
    while (respuesta === null) {
      const ctx = await browser.newContext({
        viewport: { width: 1366, height: 820 },
        locale: 'es-CR', timezoneId: 'America/Costa_Rica', ignoreHTTPSErrors: true,
      });
      const page = await ctx.newPage();
      let error = null;
      const inicio = Date.now();
      try {
        await page.goto('https://' + sitio, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (e) { error = e.message.split('\n')[0]; }

      // Espera adaptativa: mínimo fijo, luego hasta que la red se calme
      await page.waitForTimeout(MIN).catch(() => {});
      const resto = MAX - (Date.now() - inicio);
      if (resto > 0) {
        await page.waitForLoadState('networkidle', { timeout: resto }).catch(() => {});
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1200).catch(() => {});

      const seg = ((Date.now() - inicio) / 1000).toFixed(1);
      const restantes = faltan.length - i - 1;
      const ritmo = n ? (Date.now() - t0) / n : 12000;
      const queda = Math.round(restantes * ritmo / 60000);
      process.stdout.write(`[${i + 1}/${faltan.length}] ${sitio}  ${seg}s${error ? '  (' + error.slice(0, 32) + ')' : ''}  ~${queda} min restantes`);

      const r = (await preguntar('  ¿banner? [s/n/d/r/q] ')).trim().toLowerCase();
      await ctx.close();

      if (r === 'q') { console.log('\nInterrumpido. El progreso queda guardado; relance para continuar.'); break; }
      if (r === 'r') continue;
      if (['s', 'n', 'd'].includes(r)) {
        respuesta = { banner: r === 's' ? true : r === 'd' ? null : false, error,
                      esperaSeg: parseFloat(seg), en: new Date().toISOString() };
      } else {
        console.log('  (respuesta no reconocida; se repite el sitio)');
      }
    }
    if (respuesta === null) break;
    hechas[sitio] = respuesta;
    n++;
    fs.writeFileSync(REGISTRO, JSON.stringify(hechas, null, 2));
  }
  await browser.close();
  rl.close();
  console.log(`\nConfirmados en esta sesión: ${n}.  Total acumulado: ${Object.keys(hechas).length}.`);
  console.log('Para el cálculo de validez:  node acierto.js');
})();
