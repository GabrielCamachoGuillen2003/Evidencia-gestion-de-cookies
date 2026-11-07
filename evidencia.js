/**
 * evidencia.js — Captura la prueba gráfica de los sitios con banner.
 *
 *   node evidencia.js              solo los confirmados con banner
 *   node evidencia.js --espera 10  si algún sitio tarda en mostrar el aviso
 *
 * Una afirmación del tipo «este sitio sí pide consentimiento» se sostiene mejor
 * con la imagen que con la palabra del investigador. Abre cada sitio que usted
 * confirmó con banner, espera a que el aviso aparezca y guarda la captura en
 * evidencia-banners/. Esas imágenes son el anexo documental del informe.
 *
 * Guarda dos cosas por sitio: la ventana tal como se ve al entrar, que es donde
 * aparece el aviso, y la página completa. No desplaza ni hace clic en nada: una
 * captura que muestre el banner ya cerrado no prueba nada.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const args = process.argv.slice(2);
const i = args.indexOf('--espera');
const ESPERA = (i >= 0 ? parseFloat(args[i + 1]) : 8) * 1000;
const REGISTRO = 'confirmaciones.json';
const DESTINO = 'evidencia-banners';

if (!fs.existsSync(REGISTRO)) { console.log(`No existe ${REGISTRO}.`); process.exit(1); }
const hechas = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));
const sitios = Object.entries(hechas).filter(([, r]) => r.banner === true).map(([s]) => s).sort();

if (!sitios.length) { console.log('No hay sitios confirmados con banner.'); process.exit(0); }
fs.mkdirSync(DESTINO, { recursive: true });

(async () => {
  console.log(`Capturando ${sitios.length} sitios con banner confirmado.`);
  console.log(`Espera de ${ESPERA / 1000} s por sitio. Destino: ${DESTINO}/\n`);
  const browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
  let ok = 0;
  const fallidos = [];

  for (let k = 0; k < sitios.length; k++) {
    const sitio = sitios[k];
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 820 },
      locale: 'es-CR', timezoneId: 'America/Costa_Rica', ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    let nota = '';
    try {
      await page.goto('https://' + sitio, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(ESPERA);
      await page.screenshot({ path: `${DESTINO}/${sitio}.png` });
      await page.screenshot({ path: `${DESTINO}/${sitio}-completa.png`, fullPage: true }).catch(() => {});
      ok++;
    } catch (e) {
      nota = '  ✗ ' + e.message.split('\n')[0].slice(0, 44);
      fallidos.push(sitio);
    }
    console.log(`[${k + 1}/${sitios.length}] ${sitio}${nota}`);
    await ctx.close();
  }
  await browser.close();

  console.log(`\nCapturas guardadas: ${ok} de ${sitios.length}.`);
  if (fallidos.length) {
    console.log(`Sin captura (${fallidos.length}): ${fallidos.join(', ')}`);
    console.log('A esos tómeles usted el pantallazo desde su navegador y guárdelos');
    console.log(`en ${DESTINO}/ con el nombre del sitio. El dato ya está confirmado;`);
    console.log('lo que falta es solo la imagen.');
  }
})();
