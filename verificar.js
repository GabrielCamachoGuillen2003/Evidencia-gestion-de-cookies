/**
 * verificar.js — Comprueba qué dominios responden antes de auditarlos.
 *
 *   node verificar.js candidatos.txt --salida sitios-validos.txt
 *
 * Auditar un sitio cuesta dos minutos; comprobar si existe cuesta dos segundos.
 * Sin este filtro, un dominio mal escrito consume el mismo tiempo que uno real
 * y además entra en la tasa de sitios no auditables, que es un indicador de
 * calidad del levantamiento y no debe cargar con errores del marco muestral.
 *
 * Prueba variantes (con y sin www, https y http) y sigue redirecciones, de modo
 * que distingue tres situaciones:
 *   OK         el dominio responde — pasa a la lista de auditables
 *   REDIRIGE   responde en otra dirección — se registra la definitiva
 *   NO EXISTE  no resuelve el nombre — error de marco muestral, no pérdida
 *   CAÍDO      resuelve pero no responde — pérdida muestral legítima
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const entrada = process.argv[2];
const sIdx = process.argv.indexOf('--salida');
const salida = sIdx > 0 ? process.argv[sIdx + 1] : null;
if (!entrada) {
  console.log('uso: node verificar.js candidatos.txt --salida sitios-validos.txt');
  process.exit(1);
}

const candidatos = fs.readFileSync(entrada, 'utf8').split('\n')
  .map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

const host = (u) => u.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function variantes(url) {
  const h = host(url);
  const base = h.replace(/^www\./, '');
  return [`https://${h}`, `https://www.${base}`, `https://${base}`, `http://${h}`];
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const resultados = [];
  let n = 0;

  for (const cand of candidatos) {
    n++;
    let estado = 'CAÍDO', definitiva = cand, detalle = '';
    for (const v of variantes(cand)) {
      const page = await ctx.newPage();
      try {
        const r = await page.goto(v, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (r && r.status() < 500) {
          definitiva = page.url().replace(/\/$/, '');
          estado = host(definitiva) === host(cand) ? 'OK' : 'REDIRIGE';
          detalle = `HTTP ${r.status()}`;
          await page.close();
          break;
        }
        detalle = r ? `HTTP ${r.status()}` : 'sin respuesta';
      } catch (e) {
        const m = e.message;
        if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/.test(m)) { estado = 'NO EXISTE'; detalle = 'el nombre no resuelve'; }
        else if (!detalle) detalle = m.split('\n')[0].slice(0, 46);
      }
      await page.close();
    }
    resultados.push({ cand, estado, definitiva, detalle });
    const marca = { 'OK': '·', 'REDIRIGE': '→', 'NO EXISTE': '✗', 'CAÍDO': '!' }[estado];
    console.log(`${String(n).padStart(3)}/${candidatos.length} ${marca} ${estado.padEnd(10)} ${host(cand).padEnd(30)} ${estado === 'REDIRIGE' ? '→ ' + host(definitiva) : detalle}`);
  }
  await browser.close();

  const cuenta = {};
  for (const r of resultados) cuenta[r.estado] = (cuenta[r.estado] || 0) + 1;
  console.log('\n' + '─'.repeat(70));
  console.log(`  responden (OK + REDIRIGE)   ${(cuenta['OK'] || 0) + (cuenta['REDIRIGE'] || 0)}`);
  console.log(`  no existen                  ${cuenta['NO EXISTE'] || 0}   ← error de marco muestral, NO pérdida`);
  console.log(`  caídos                      ${cuenta['CAÍDO'] || 0}   ← pérdida muestral legítima`);

  if (salida) {
    const buenos = resultados.filter((r) => r.estado === 'OK' || r.estado === 'REDIRIGE');
    fs.writeFileSync(salida,
      '# Dominios verificados que responden\n' +
      `# Generado el ${new Date().toISOString()} a partir de ${entrada}\n` +
      buenos.map((r) => r.definitiva).join('\n') + '\n', 'utf8');
    console.log(`\n  lista de auditables escrita en: ${salida}  (${buenos.length} sitios)`);

    const malos = resultados.filter((r) => r.estado !== 'OK' && r.estado !== 'REDIRIGE');
    if (malos.length) {
      const f = salida.replace(/\.txt$/, '') + '-descartados.txt';
      fs.writeFileSync(f, malos.map((r) => `${r.cand}\t${r.estado}\t${r.detalle}`).join('\n') + '\n', 'utf8');
      console.log(`  descartados documentados en:    ${f}`);
    }
  }
})();
