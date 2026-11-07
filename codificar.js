/**
 * codificar.js — Codificación manual de los requisitos que exigen juicio.
 *
 *   node codificar.js
 *   node codificar.js --solo-banner        únicamente los sitios con mecanismo
 *
 * Abre cada sitio en SU Chrome, el de verdad, mediante el comando del sistema.
 * No hay automatización de por medio: ni navegador instrumentado, ni esperas,
 * ni detección de bots. La pregunta aparece en el terminal en cuanto se lanza
 * el sitio, y el tiempo lo pone usted: mire con calma, desplácese, abra la
 * política, y responda cuando haya visto lo suficiente. El programa no corre.
 *
 * Qué pregunta y a quién. A los sitios con mecanismo de consentimiento, los
 * siete requisitos que no se derivan de la observación. A los que no tienen
 * mecanismo pero sí política enlazada, solo los cuatro de la dimensión D2,
 * porque los otros tres ya quedaron determinados por la ausencia de banner.
 *
 * Los descriptores de nivel se muestran íntegros en cada pregunta. Codificar
 * de memoria es la vía más rápida a una concordancia baja: el nivel debe
 * reconocerse en el descriptor, no recordarse.
 *
 * Teclas:  0 1 2 3 = nivel · n = no aplicable · ? = repetir descriptores
 *          v = volver a abrir el sitio · s = saltar este sitio · q = salir
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const args = process.argv.slice(2);
const SOLO_BANNER = args.includes('--solo-banner');
const REGISTRO = 'codificacion.json';

// ── Descriptores del Anexo B ───────────────────────────────────────────────
const RUBRICA = {
  R02: { t: 'Acto afirmativo inequívoco', d: [
    'El sitio asume el consentimiento por la mera carga de la página.',
    'El sitio deduce el consentimiento del desplazamiento o de la continuación de la navegación.',
    'Se exige acción afirmativa, pero el sitio la interpreta de forma extensiva, como un clic fuera del banner.',
    'El consentimiento se registra únicamente tras una acción deliberada e inequívoca del usuario.'] },
  R06: { t: 'Identificación de los terceros receptores', d: [
    'No se menciona la existencia de terceros receptores.',
    'Se alude a categorías genéricas de terceros, sin identificarlos.',
    'Se enumeran nominalmente los terceros, sin detallar la finalidad de cada uno.',
    'Se enumeran nominalmente todos los terceros y se indica la finalidad de cada uno.'] },
  R07: { t: 'Información sobre la duración', d: [
    'No se informa duración alguna.',
    'Se distingue entre cookies de sesión y persistentes sin cuantificar plazos.',
    'Se indica la duración por categoría de cookie, no por cookie individual.',
    'Se indica la duración de cada cookie de forma individual y coincide con la observada.'] },
  R11: { t: 'Ausencia de muro de cookies', d: [
    'El acceso al contenido exige aceptar, o la única alternativa es un muro de pago.',
    'El sitio insiste con avisos recurrentes o restringe parcialmente el contenido tras el rechazo.',
    'El contenido es accesible, pero se degradan funciones no esenciales y se advierte de forma neutral.',
    'El contenido es plenamente accesible con independencia de la decisión del usuario.'] },
  R12: { t: 'Correspondencia entre política y realidad', d: [
    'No existe política de cookies, o la omisión supera el 30 %.',
    'La política omite entre el 10 % y el 30 % de las cookies observadas.',
    'La política omite cookies no esenciales observadas en una proporción inferior al 10 %.',
    'Toda cookie observada figura en la política y no se declaran cookies inexistentes.'] },
  R13: { t: 'Visibilidad efectiva del banner', d: [
    'El banner no es perceptible sin desplazarse, o queda tapado por otro elemento.',
    'El banner queda parcialmente cubierto, o su contraste dificulta leer los controles.',
    'El banner es legible, pero comparte espacio con otros avisos que compiten por la atención.',
    'El banner es legible en su totalidad y ningún elemento se superpone a sus controles.'] },
  R15: { t: 'Claridad del lenguaje', d: [
    'El texto es ambiguo o induce a confusión sobre el efecto de los controles.',
    'El texto recurre a jerga jurídica o técnica que exige conocimiento previo.',
    'El texto es comprensible pero emplea fórmulas genéricas que no explican las consecuencias de elegir.',
    'El texto es directo, sin tecnicismos innecesarios, y explica qué ocurre con cada opción.'] },
};
const CON_BANNER = ['R13', 'R02', 'R11', 'R06', 'R07', 'R12', 'R15'];
const SOLO_D2 = ['R06', 'R07', 'R12', 'R15'];

// ── A quién preguntar ──────────────────────────────────────────────────────
if (!fs.existsSync('icc.csv')) { console.log('Falta icc.csv. Corra antes: node icc.js corpus-reclasificado --csv icc.csv'); process.exit(1); }
const campos = (l) => (l.match(/"((?:[^"]|"")*)"/g) || []).map((c) => c.slice(1, -1).replace(/""/g, '"'));
const politicas = fs.existsSync('politicas.json') ? JSON.parse(fs.readFileSync('politicas.json', 'utf8')) : {};
const confirm = fs.existsSync('confirmaciones.json') ? JSON.parse(fs.readFileSync('confirmaciones.json', 'utf8')) : {};

const cola = [];
for (const l of fs.readFileSync('icc.csv', 'utf8').replace(/^﻿/, '').split('\n').slice(1)) {
  const c = campos(l);
  if (c.length < 6 || !c[5].includes('–')) continue;          // solo bandas indeterminadas
  const conBanner = c[2] === 'sí';
  if (SOLO_BANNER && !conBanner) continue;
  const pol = politicas[c[0]] || {};
  cola.push({ sitio: c[0], conBanner, politica: pol.cookies || pol.privacidad || null,
              reqs: conBanner ? CON_BANNER : SOLO_D2, banda: c[5] });
}
cola.sort((a, b) => (b.conBanner - a.conBanner) || a.sitio.localeCompare(b.sitio));

let hecho = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : {};
const faltan = cola.filter((s) => !hecho[s.sitio] || Object.keys(hecho[s.sitio]).length < s.reqs.length);

if (!faltan.length) { console.log('No queda ningún sitio por codificar.'); process.exit(0); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (q) => new Promise((r) => rl.question(q, r));
const abrir = (url) => new Promise((r) => exec(`start "" chrome "${url}"`, () => r()));

(async () => {
  const conB = faltan.filter((s) => s.conBanner).length;
  console.log(`\nSitios por codificar: ${faltan.length}  (${conB} con mecanismo, ${faltan.length - conB} solo D2)`);
  console.log('Cada sitio se abre en su Chrome. Tómese el tiempo que necesite: el programa espera.');
  console.log('Teclas:  0 1 2 3 = nivel   n = no aplicable   ? = repetir   v = reabrir   s = saltar   q = salir\n');

  let n = 0, salir = false;
  for (const [i, s] of faltan.entries()) {
    if (salir) break;
    console.log('\n' + '═'.repeat(74));
    console.log(`[${i + 1}/${faltan.length}]  ${s.sitio}` +
                `   ${s.conBanner ? 'CON mecanismo' : 'sin mecanismo, solo D2'}   banda actual: ${s.banda}`);
    if (s.politica) console.log(`  política: ${s.politica}`);
    console.log('═'.repeat(74));

    await abrir('https://' + s.sitio);
    if (s.politica) { await new Promise((r) => setTimeout(r, 800)); await abrir(s.politica); }

    hecho[s.sitio] = hecho[s.sitio] || {};
    for (const rid of s.reqs) {
      if (hecho[s.sitio][rid] !== undefined) continue;
      const r = RUBRICA[rid];
      const mostrar = () => {
        console.log(`\n  ${rid}. ${r.t}`);
        for (let k = 3; k >= 0; k--) console.log(`     ${k}  ${r.d[k]}`);
      };
      mostrar();
      let resp = null;
      while (resp === null) {
        const a = (await preguntar('     → ')).trim().toLowerCase();
        if (a === 'q') { salir = true; break; }
        if (a === 's') { resp = 'SALTADO'; break; }
        if (a === '?') { mostrar(); continue; }
        if (a === 'v') { await abrir('https://' + s.sitio); continue; }
        if (a === 'n') { resp = 'NA'; break; }
        if (['0', '1', '2', '3'].includes(a)) { resp = Number(a); break; }
        console.log('     (0, 1, 2, 3, n, ?, v, s o q)');
      }
      if (salir) break;
      if (resp === 'SALTADO') break;
      hecho[s.sitio][rid] = resp;
      fs.writeFileSync(REGISTRO, JSON.stringify(hecho, null, 2));
    }
    if (Object.keys(hecho[s.sitio]).length === s.reqs.length) n++;
  }

  rl.close();
  const completos = cola.filter((s) => hecho[s.sitio] && Object.keys(hecho[s.sitio]).length === s.reqs.length).length;
  console.log(`\n\nCodificados en esta sesión: ${n}.`);
  console.log(`Sitios completos en total:  ${completos} de ${cola.length}.`);
  console.log(`\nGuardado en ${REGISTRO}. Para recalcular:  node icc.js corpus-reclasificado --csv icc.csv`);
})();
