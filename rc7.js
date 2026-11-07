/**
 * rc7.js — Regla RC-7: identificación por plataforma.
 *
 * Incorporada tras el levantamiento de noviembre de 2026, por el mismo
 * procedimiento de ampliación del manual de codificación con que se incorporó
 * RC-5b durante la prueba piloto.
 *
 * PROBLEMA QUE RESUELVE. Tras aplicar las bases públicas F1 y F2, el 18,7 % de
 * las cookies observadas seguía sin resolverse. El análisis de esas 4 189
 * apariciones mostró que no eran 370 casos independientes: la mitad procedía de
 * un número reducido de plataformas que bautizan sus cookies con un prefijo
 * común. Adjudicar la plataforma entera es una decisión; adjudicar 370 nombres
 * sueltos no es practicable y tampoco sería más riguroso.
 *
 * FUNDAMENTO JURÍDICO. Cada grupo se apoya en el Dictamen 4/2012 del Grupo de
 * Trabajo del Artículo 29 (WP 194), que fija la lista de supuestos exentos del
 * requisito de consentimiento del artículo 5.3 de la Directiva ePrivacy y
 * señala expresamente cuáles no lo están. La clasificación no descansa en el
 * criterio técnico del investigador sino en esa lista: sin un anclaje así, una
 * regla que reasigna dos mil observaciones sería indefendible.
 *
 * PRECEDENCIA. RC-7 se evalúa después de RC-1, RC-2 y RC-3 —el catálogo
 * explícito de nombres y la condición de tercero son evidencia más fuerte— y
 * antes de RC-5, que es una presunción por entropía y duración. El orden
 * importa: una cookie de sesión de Liferay es persistente y de alta entropía, y
 * RC-5 la declararía no esencial por error si se evaluara primero.
 *
 * LO QUE RC-7 NO HACE. No resuelve la personalización de interfaz. La exención
 * de ese supuesto exige acreditar que el usuario eligió el ajuste y que este
 * dura la sesión, y la observación instrumentada no permite establecer ninguna
 * de las dos cosas. Esas cookies siguen indeterminadas y no reciben violación.
 */
'use strict';

/**
 * Cada grupo declara los patrones que lo componen, la clase que se les asigna,
 * las plataformas reconocidas y el fundamento concreto del dictamen.
 * El orden dentro del arreglo es el orden de evaluación.
 */
const GRUPOS = [
  {
    regla: 'RC-7a',
    clase: 'esencial',
    plataformas: 'F5/Shape, BIG-IP, Imperva Incapsula, Cloudflare, Akamai, Stingray',
    fundamento: 'WP 194: cookies de seguridad centradas en el usuario y de balanceo de carga, exentas',
    patrones: [
      /^__uzm/, /^uzmx/, /^__ssds$/, /^__ssuzjsr/,      // F5 / Shape Security
      /^TS[0-9a-f]{6,}/, /^TSf[0-9a-f]+/,                // BIG-IP ASM
      /^incap_ses_/, /^visid_incap_/, /^nlbi_/, /^incap-resubmit-token$/,
      /^__cf_ob$/, /^__cflb$/, /^_cfuvid$/, /^__cf_bm$/, // Cloudflare
      /^AKA_A2$/,                                        // Akamai: enrutado de borde
      /^X-Mapping-/, /^cookiesession1$/,                 // balanceadores
      /^___utmvc$/,                                      // Imperva, pese al parecido con urchin
      // Añadidos tras revisar lo que quedaba indeterminado: son del mismo tipo
      // de infraestructura que los de arriba y los patrones iniciales no los
      // capturaban. No amplían el fundamento, lo completan.
      /^f5avr/, /^BIGipServer/,                          // F5 y BIG-IP, otras formas
      /^affinity$/, /^aff[0-9a-f]{20,}$/,                // afinidad de sesión del balanceador
      /^nitroCachedPage$/,                               // caché de borde NitroPack
    ],
    // RT no entra aquí aunque también sea de Akamai: es mPulse, medición de
    // rendimiento del lado del usuario, y la analítica no está exenta. Va a RC-7d.
  },
  {
    regla: 'RC-7b',
    clase: 'esencial',
    plataformas: 'Liferay, CakePHP, Laravel, WordPress, Magento, VTEX, LiteSpeed, ASP.NET',
    fundamento: 'WP 194: cookies de entrada del usuario e identificadores de sesión necesarios para mantener el estado',
    patrones: [
      /^LFR_SESSION_STATE_/, /^GUEST_LANGUAGE_ID$/, /^COOKIE_SUPPORT$/,   // Liferay
      // El patrón de sesión se acota a los marcos reconocidos. Uno genérico del
      // tipo /_session$/ capturaría poptin_session, que es de marketing, y la
      // declararía esencial: el error iría justo en la dirección que oculta
      // incumplimientos.
      /^CakeCookie\[/, /^CAKEPHP$/,                                        // CakePHP
      /^muni[a-z_]*_session$/i, /^municipalidad_[a-z]+_session$/i,         // portales municipales
      /^laravel[-_]session$/i,
      /^wp_[a-z]+_session/i, /^wp_wpfileupload_/, /^wp_ticket_com_emd_wp_session$/,
      /^mage-/, /^X-Magento-Vary$/,                                        // Magento
      /^vtex[-_]/i, /^Vtex(Workspace|RCSessionIdv)/, /^Checkout(Locale|OrderFormOwnership)$/,
      /^checkout\.vtex\.com$/,
      /^_lscache_vary$/,                                                   // LiteSpeed
      /^\.ASPXANONYMOUS$/,                                                 // ASP.NET: sesión anónima
      /^galaxy-session-cookie/, /^lp_session_guest$/,                      // sesiones de otros marcos
      /^section_data_ids$/,                                                // Magento: estado de sección
    ],
  },
  {
    regla: 'RC-7c',
    clase: 'esencial',
    plataformas: 'Complianz, CookieYes y otras plataformas de gestión del consentimiento',
    fundamento: 'WP 194: guardar la decisión del usuario es condición para respetarla',
    patrones: [
      /^cmplz_/, /^cookieyes-consent$/, /^cookie-notification$/,
      /^anonymous-consents$/,                    // registro de consentimiento de SAP Commerce
    ],
  },
  {
    regla: 'RC-7d',
    clase: 'no_esencial',
    plataformas: 'PixelYourSite, Criteo, Prebid, FullStory, Piano, New Relic, mPulse, ' +
                 'Google Analytics de primera parte, Kameleoon, Kampyle, Poptin, Unomi, Browsi, Shopify',
    fundamento: 'WP 194: la publicidad de terceros y la analítica, incluida la de primera parte, NO están exentas',
    patrones: [
      /^pys/, /^last_pys/,                       // PixelYourSite
      /^cto_b/,                                  // Criteo
      /^_pubcid$/,                               // Prebid
      /^fs_(uid|lua)$/,                          // FullStory
      /^_pc(id|tx)$/, /^pvisitor$/, /^__tbc$/, /^xbc$/,   // Piano / Tinypass
      /^___nrbi/,                                // New Relic Browser
      /^RT$/,                                    // Akamai mPulse
      /^FPGSID$/, /^FPID$/,                      // GA4 en primera parte
      /^kameleoon/i, /^kampyle/i,
      /^poptin_/,
      /^_tccl_/,
      /^tracker[-_]?(context|Unomi)/i, /^traffic_target$/,
      /^__blockify/, /^__browsiSessionID$/,
      /^shopify_client_id$/,
      /^gclid$/,                                 // identificador de clic de Google Ads
      /^sjrn_/,                                  // Sojern: publicidad de viajes
      /^TawkConnectionTime$/, /^twk_/,           // Tawk.to: identifica al visitante entre sesiones
    ],
  },
];

/**
 * Cookies sin nombre. No almacenan nada, luego no pueden rastrear ni ser
 * necesarias: son cabeceras Set-Cookie malformadas que el navegador registró.
 * Se marcan como artefacto y quedan FUERA del denominador, porque contarlas
 * como indeterminadas inflaría un indicador de incertidumbre con algo que no
 * es incertidumbre. La regla es general y no se aplica a ningún sitio en
 * particular, que es lo que la hace defendible.
 */
function esArtefacto(cookie) {
  const n = String(cookie.name || '').trim();
  return n === '';
}

/** Devuelve el grupo de RC-7 que corresponde al nombre, o null. */
function clasificarPorPlataforma(nombre) {
  for (const g of GRUPOS) {
    if (g.excepciones && g.excepciones.some((rx) => rx.test(nombre))) continue;
    if (g.patrones.some((rx) => rx.test(nombre))) {
      return { clase: g.clase, regla: g.regla,
               motivo: `${g.plataformas.split(',')[0].trim()} u otra plataforma del grupo ${g.regla}` };
    }
  }
  return null;
}

module.exports = { GRUPOS, clasificarPorPlataforma, esArtefacto };
