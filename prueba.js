// Prueba del motor de detección con un sitio simulado que incumple.
// No necesita red: alimenta al derivador la misma estructura que produce
// la captura real, para comprobar que las reglas disparan donde deben.
const { derivarViolaciones, clasificar } = require('./auditor.js');

const HOST = 'ejemplo.cr';
const ck = (name, domain, dias = 365, len = 22) => ({
  name, domain, expires: Math.floor(Date.now() / 1000) + dias * 86400,
  duracionDias: dias, secure: true, httpOnly: false, sameSite: 'Lax', valorLongitud: len,
  value: 'GA1.2.1983475' + name.length + 'xZ9kQ',
});

const E = {
  // E0: el sitio instala Google Analytics ANTES de que el usuario decida nada
  E0: { escenario:'E0', banner:{presente:true}, peticionesRastreo:['google-analytics.com'],
        terceros:['google-analytics.com','fonts.gstatic.com'],
        cookies:[ ck('_ga','.ejemplo.cr'), ck('PHPSESSID','ejemplo.cr',0,26) ] },

  // E1: acepta todo → universo de referencia
  E1: { escenario:'E1', banner:{presente:true}, interaccionLograda:true, peticionesRastreo:['google-analytics.com','doubleclick.net','connect.facebook.net'],
        terceros:['google-analytics.com','doubleclick.net','connect.facebook.net'],
        cookies:[ ck('_ga','.ejemplo.cr'), ck('_gid','.ejemplo.cr',1), ck('_fbp','.ejemplo.cr',90),
                  ck('IDE','.doubleclick.net',390), ck('PHPSESSID','ejemplo.cr',0,26) ] },

  // E2: rechaza todo → PERO sobreviven _ga y _fbp del universo de referencia
  E2: { escenario:'E2', banner:{presente:true}, interaccionLograda:true, rechazoEnPrimeraCapa:false,
        peticionesRastreo:['google-analytics.com'], terceros:['google-analytics.com'],
        cookies:[ ck('_ga','.ejemplo.cr'), ck('_fbp','.ejemplo.cr',90),
                  ck('PHPSESSID','ejemplo.cr',0,26), ck('OptanonConsent','ejemplo.cr',180) ] },

  // E3: selección granular con casillas premarcadas
  E3: { escenario:'E3', banner:{presente:true}, interaccionLograda:true, casillas:[{id:'analitica',marcada:true},{id:'publicidad',marcada:true}],
        premarcadas:2, peticionesRastreo:[], terceros:[],
        cookies:[ ck('_ga','.ejemplo.cr'), ck('PHPSESSID','ejemplo.cr',0,26) ] },

  // E4: ignora el banner y navega → igual le instalan rastreo
  E4: { escenario:'E4', banner:{presente:true}, peticionesRastreo:['doubleclick.net'], terceros:['doubleclick.net'],
        cookies:[ ck('_ga','.ejemplo.cr'), ck('IDE','.doubleclick.net',390) ] },

  // E5: revisita tras rechazo → el banner reaparece
  E5: { escenario:'E5', banner:{presente:true}, interaccionLograda:true, bannerReaparece:true,
        peticionesRastreo:['google-analytics.com'], terceros:['google-analytics.com'],
        cookies:[ ck('_ga','.ejemplo.cr'), {name:'pref_idioma',domain:'ejemplo.cr',expires:Math.floor(Date.now()/1000)+30*86400,duracionDias:30,secure:true,httpOnly:false,sameSite:'Lax',value:'es',valorLongitud:2} ] },
};

console.log('CLASIFICACIÓN DE CADA COOKIE OBSERVADA EN E1');
console.log('─'.repeat(74));
for (const c of E.E1.cookies) {
  const k = clasificar(c, HOST);
  console.log(`  ${c.name.padEnd(12)} ${String(c.domain).padEnd(20)} ${k.clase.padEnd(14)} ${k.regla}  ${k.motivo}`);
}

const r = derivarViolaciones(E, HOST);

console.log('\nVIOLACIONES DERIVADAS DEL CONTRASTE');
console.log('─'.repeat(74));
for (const v of r.violaciones) {
  console.log(`  ${v.id}  [${v.gravedad}]  ${v.nombre}${v.requiereConfirmacionManual ? '  (confirmar a mano)' : ''}`);
  console.log(`      regla:     ${v.regla}`);
  console.log(`      evidencia: ${v.evidencia.join(', ')}`);
}
if (r.omitidas.length) {
  console.log('\nNO EVALUABLES POR FALTA DE TRATAMIENTO EFECTIVO');
  for (const o of r.omitidas) console.log(`  ${o.id}  ${o.motivo}`);
}
console.log('\nPENDIENTES DE EVALUACIÓN NO AUTOMATIZABLE');
for (const p of r.pendientes) console.log(`  ${p.id}  [${p.modo}]  ${p.razon}`);
console.log('\nCOOKIES INDETERMINADAS (nunca imputan violación)');
console.log('  ' + (r.indeterminadas.length
  ? [...new Set(r.indeterminadas.map(i => i.cookie))].join(', ')
  : 'ninguna'));


// ── Caso 2: sitio sin banner (como los costarricenses del piloto) ──────────
console.log('\n' + '='.repeat(74));
console.log('CASO 2 — SITIO SIN BANNER: ninguna interacción fue posible');
console.log('='.repeat(74));
const SIN = {};
for (const k of Object.keys(E)) {
  SIN[k] = { ...E[k], banner: { presente: false }, interaccionLograda: false, bannerReaparece: false };
}
const r2 = derivarViolaciones(SIN, HOST);
console.log('  violaciones imputadas :', r2.violaciones.map(v => v.id).join(', ') || 'ninguna');
console.log('  no evaluables         :', r2.omitidas.map(o => o.id).join(', ') || 'ninguna');
for (const rv of r2.revisionManual) console.log(`  revisión manual [${rv.regla}]: ${rv.asunto}`);
