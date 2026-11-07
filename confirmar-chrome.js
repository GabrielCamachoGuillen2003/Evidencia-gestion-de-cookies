/**
 * confirmar-chrome.js — Verificación visual de los sitios que quedaron dudosos.
 *
 *   node confirmar-chrome.js
 *   node confirmar-chrome.js --espera 25
 *
 * Los sitios marcados como no verificables lo son por dos motivos: un reto
 * contra automatización que el Chromium de Playwright no supera, o un fallo de
 * red en el momento de mirarlos. Los primeros abren con normalidad en un
 * navegador corriente, y ahí está la salida: este programa usa el Chrome que
 * usted ya tiene instalado en lugar del Chromium empaquetado. No elude ningún
 * control ni resuelve ningún reto; se limita a esperar, igual que esperaría una
 * persona que abre la página, que es exactamente lo que haría si fuera sitio
 * por sitio a mano. Lo único que cambia es que la respuesta queda registrada
 * con el mismo procedimiento que las otras 251, en vez de en un papel aparte.
 *
 * Cada sitio usa un perfil nuevo y desechable. Sin eso, el estado dejado por un
 * sitio podría alterar lo que se observa en el siguiente, y la comparación con
 * las verificaciones anteriores dejaría de ser válida.
 *
 * La verificación sigue siendo CIEGA: nunca se muestra lo que opinó el
 * detector. Y sigue rigiendo la regla C1: una ausencia de aviso solo se da por
 * buena si una persona la confirma.
 *
 * Teclas:  s = sí hay aviso · n = no hay · d = sigue sin poder verse
 *          r = repetir · q = salir (el avance queda guardado)
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const iE = args.indexOf('--espera');
const ESPERA = (iE >= 0 ? parseFloat(args[iE + 1]) : 18) * 1000;
const REGISTRO = 'confirmaciones.json';

if (!fs.existsSync(REGISTRO)) { console.log(`No existe ${REGISTRO}.`); process.exit(1); }
const hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));

// Los dudosos son los que quedaron con banner === null
const pendientes = Object.entries(hechas)
  .filter(([, r]) => r && r.banner === null)
  .map(([s]) => s)
  .sort();

if (!pendientes.length) {
  console.log('No queda ningún sitio dudoso: todos están resueltos.');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  console.log(`Sitios dudosos pendientes: ${pendientes.length}`);
  console.log(`Espera de hasta ${ESPERA / 1000} s por sitio, para dar tiempo a que`);
  console.log('un reto de verificación se resuelva solo, si es que va a resolverse.');
  console.log('Teclas:  s=sí hay aviso   n=no hay   d=sigue sin verse   r=repetir   q=salir\n');

  // Comprobar que el Chrome del sistema está disponible antes de empezar
  let canal = 'chrome';
  try {
    const prueba = await chromium.launch({ channel: 'chrome', headless: true });
    await prueba.close();
    console.log('Usando el Chrome instalado en el sistema.\n');
  } catch {
    canal = undefined;
    console.log('⚠ No se encontró Chrome instalado; se usa el Chromium de Playwright.');
    console.log('  Los sitios con protección contra automatización probablemente');
    console.log('  seguirán sin poder verse. Instale Chrome para resolverlos.\n');
  }

  const t0 = Date.now();
  let n = 0;

  for (let i = 0; i < pendientes.length; i++) {
    const sitio = pendientes[i];
    let respuesta = null;

    while (respuesta === null) {
      const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-'));
      let ctx = null, error = null;
      const inicio = Date.now();
      try {
        ctx = await chromium.launchPersistentContext(perfil, {
          headless: false,
          channel: canal,
          viewport: { width: 1366, height: 820 },
          locale: 'es-CR',
          timezoneId: 'America/Costa_Rica',
          ignoreHTTPSErrors: true,
        });
        const page = ctx.pages()[0] || await ctx.newPage();
        try {
          await page.goto('https://' + sitio, { waitUntil: 'domcontentloaded', timeout: 40000 });
        } catch (e) { error = e.message.split('\n')[0]; }

        await page.waitForTimeout(Math.min(6000, ESPERA)).catch(() => {});
        const resto = ESPERA - (Date.now() - inicio);
        if (resto > 0) await page.waitForLoadState('networkidle', { timeout: resto }).catch(() => {});
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
        await page.waitForTimeout(1500).catch(() => {});
      } catch (e) {
        error = error || e.message.split('\n')[0];
      }

      const seg = ((Date.now() - inicio) / 1000).toFixed(1);
      const restantes = pendientes.length - i - 1;
      const ritmo = n ? (Date.now() - t0) / n : 30000;
      process.stdout.write(
        `[${i + 1}/${pendientes.length}] ${sitio}  ${seg}s` +
        `${error ? '  (' + error.slice(0, 30) + ')' : ''}  ~${Math.round(restantes * ritmo / 60000)} min`);

      const r = (await preguntar('  ¿aviso? [s/n/d/r/q] ')).trim().toLowerCase();
      if (ctx) await ctx.close().catch(() => {});
      fs.rmSync(perfil, { recursive: true, force: true });

      if (r === 'q') { console.log('\nInterrumpido. El avance queda guardado; relance para continuar.'); break; }
      if (r === 'r') continue;
      if (['s', 'n', 'd'].includes(r)) {
        respuesta = {
          banner: r === 's' ? true : r === 'd' ? null : false,
          error, esperaSeg: parseFloat(seg),
          en: new Date().toISOString(),
          via: canal === 'chrome' ? 'chrome-sistema' : 'chromium-playwright',
        };
      } else {
        console.log('  (respuesta no reconocida; se repite el sitio)');
      }
    }

    if (respuesta === null) break;
    hechas[sitio] = respuesta;
    n++;
    fs.writeFileSync(REGISTRO, JSON.stringify(hechas, null, 2));
  }

  rl.close();
  const sinResolver = Object.values(hechas).filter((r) => r && r.banner === null).length;
  console.log(`\nResueltos en esta sesión: ${n}.`);
  console.log(`Siguen sin poder verse: ${sinResolver}.`);
  console.log('\nPara recalcular:  node acierto.js   y   node clasificar.js corpus-reclasificado');
})();
