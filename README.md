# Gestión de cookies en el entorno web de Costa Rica

Evidencia, instrumentos y datos de la Investigación Práctica Aplicada *Gestión de
cookies en el entorno web de Costa Rica: análisis comparativo de cumplimiento
normativo en materia de privacidad*.

**Gabriel Camacho Guillén** · Maestría en Ciberseguridad · Instituto Tecnológico
de Costa Rica · Profesor asesor: Herson Esquivel Vargas

Este repositorio existe para que cualquiera pueda comprobar los resultados sin
tener que creerlos. Contiene los programas que recogieron las observaciones, las
listas de sitios auditados, el corpus de evidencia y los procedimientos de
clasificación y de validación.

---

## Resultados del levantamiento

Recolección de noviembre de 2026.

| | |
|---|---|
| Dominios en el marco de partida | 324 |
| Sitios auditables | **301** (92,9 %) |
| Pérdida muestral | 23 (7,1 %) |
| Verificados visualmente por una persona | 251 (83,4 % del corpus) |
| **Sin ningún mecanismo de consentimiento** | **227 de 251 — 90,4 %** |
| Con mecanismo de consentimiento | 24 (9,6 %) |
| Instalan al menos una cookie | 258 |
| No instalan ninguna | 43 |
| Instalación previa al consentimiento (V1) | 233 — 90,3 % de los que instalan |
| Cookies observadas | 22 458 (263 artefactos sin nombre, base 22 195) |
| Cookies indeterminadas | 1 498 — **6,7 %**, bajo el umbral del 10 % |

La proporción de sitios sin mecanismo **no está extrapolada**: procede del examen
visual, sitio por sitio, de 251 interfaces. El detector automático se emplea para
cribado y su acierto se reporta con intervalo de confianza, no como supuesto.

### Validación del instrumento

| Medida | Valor | n |
|---|---|---|
| Acierto del detector de aviso | 96,4 % (IC 95 %: 93,3–98,1) | 251 |
| Sensibilidad | 79,2 % (IC 95 %: 59,5–90,8) | 24 |
| Especificidad | 98,2 % (IC 95 %: 95,6–99,3) | 227 |
| Coeficiente de variación entre repeticiones | 0,51 % | 9 pares |

La sensibilidad no alcanza el umbral de 0,80 del plan de validación, y por eso el
hallazgo principal descansa en la verificación humana. El examen de los cinco
falsos negativos apunta a una causa común: el indicador de presencia se calcula
sobre el escenario E0 con una espera fija de siete segundos, de modo que un aviso
de carga diferida queda fuera de la ventana de observación. El alcance real del
detector no es la presencia de un aviso, sino su presencia dentro de esa ventana.

---

## Diseño

Cada sitio se visita seis veces, siempre desde un perfil de navegador limpio e
independiente, aplicando en cada visita un tratamiento distinto.

| | Escenario | Qué mide |
|---|---|---|
| E0 | Carga sin interacción | qué se instala antes de que el usuario decida nada |
| E1 | Aceptar todo | universo de referencia: todo lo que el sitio está dispuesto a activar |
| E2 | Rechazar todo | si el rechazo se respeta |
| E3 | Selección granular | si las finalidades rechazadas se respetan |
| E4 | Ignorar el aviso y navegar | si la navegación se interpreta como consentimiento |
| E5 | Revisita tras rechazo | si el rechazo persiste entre visitas |

El aislamiento entre escenarios es un contexto de navegador independiente por
visita. Sin él, el estado de una visita contaminaría la siguiente y ninguna
comparación entre escenarios significaría nada.

---

## Cómo reproducir

Requiere Node.js 18 o superior.

```bash
npm install playwright
npx playwright install chromium
```

### 1. Comprobar qué dominios responden

```bash
node verificar.js sitios.txt --salida sitios-validos.txt
```

Distingue cuatro situaciones: responde, redirige, no resuelve y caído. Un dominio
inexistente es un defecto del marco muestral y no una pérdida, y mezclarlos
distorsionaría un indicador de calidad del levantamiento.

### 2. Auditar

```bash
node auditor.js --lista sitios-validos.txt --salida corpus
```

Escribe una ficha JSON por sitio con las cookies observadas en cada escenario, las
violaciones derivadas y las capturas de pantalla.

### 3. Verificar a mano

```bash
node confirmar.js --todos --min 5 --max 14
```

Abre cada sitio en una ventana visible y pregunta si hay aviso de cookies. **La
verificación es ciega**: nunca muestra lo que opinó el detector, o dejaría de
medir al instrumento. La regla C1 del manual de codificación prohíbe dar por buena
una ausencia de aviso sin que una persona la confirme.

### 4. Clasificar y validar

```bash
node clasificar.js corpus          # reparte por carpetas y tría los no verificables
node acierto.js                    # validez concurrente con intervalo de Wilson
node reclasificar.js --aplicar     # aplica las bases públicas sin volver a auditar
node tabla20.js corpus-reclasificado
node indeterminadas.js corpus-reclasificado
```

---

## Bases de clasificación

Las reglas RC-1 a RC-3 se apoyan en dos listas públicas que se importan íntegras.
`listas.js` registra de cada una su origen, su fecha de descarga y la huella
SHA-256 del archivo empleado, de modo que la clasificación es reproducible sobre
la misma versión de las listas y no sobre «una lista parecida».

| Fuente | Contenido | Uso |
|---|---|---|
| [Open Cookie Database](https://github.com/jkwakman/Open-Cookie-Database) | 2 288 nombres de cookie con su finalidad declarada | RC-1 y RC-2 |
| [Disconnect Tracking Protection](https://github.com/disconnectme/disconnect-tracking-protection) | 4 438 dominios de rastreo por finalidad | RC-3 |

De Disconnect se excluyen las categorías *Anti-fraud* y *ConsentManagers*: la
prevención de fraude y las propias plataformas de consentimiento no son rastreo, y
contarlas como tal penalizaría precisamente a los sitios que sí preguntan.

Cuando ninguna de las dos bases resuelve un nombre, interviene la regla **RC-7**,
que adjudica por plataforma. Se incorporó tras el levantamiento, por el mismo
procedimiento de ampliación del manual con que se incorporó RC-5b durante el
piloto, y responde a una constatación empírica: las cookies sin resolver no eran
cientos de casos independientes, sino un número reducido de plataformas cuyas
cookies comparten un prefijo. El agrupamiento se derivó de los datos y la
adjudicación de cada grupo se ancla en el [Dictamen 4/2012 del Grupo de Trabajo
del Artículo 29](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_es.pdf),
que fija la lista de supuestos exentos del artículo 5.3 de la Directiva ePrivacy.

| Grupo | Plataformas | Clasificación |
|---|---|---|
| RC-7a | F5/Shape, BIG-IP, Imperva, Cloudflare, Akamai, balanceadores | esencial |
| RC-7b | Liferay, CakePHP, Laravel, WordPress, Magento, VTEX, ASP.NET | esencial |
| RC-7c | Complianz, CookieYes, SAP Commerce | esencial |
| RC-7d | PixelYourSite, Criteo, Prebid, FullStory, Piano, New Relic, mPulse, GA4 de primera parte | **no esencial** |

RC-7 se evalúa después de RC-1, RC-2 y RC-3 —el catálogo explícito y la condición
de tercero son evidencia más fuerte— y antes de RC-5. Ese último orden no es
arbitrario: una cookie de sesión de Liferay es persistente y de alta entropía, y
RC-5 la declararía no esencial por error si se evaluara primero.

Una cookie **sin nombre** queda fuera del denominador por la regla RC-0: no
almacena nada, luego no puede rastrear ni ser necesaria. Son cabeceras
`Set-Cookie` malformadas, 263 apariciones en el corpus, y contarlas como
indeterminadas inflaba un indicador de incertidumbre con algo que no lo es. La
regla es general y no se escribió para ningún sitio en particular.

Las categorías *Functional* y *Personalization* de la primera base **no se
imputan**. La exención del artículo 5.3 de la Directiva ePrivacy alcanza solo a lo
estrictamente necesario, y que una cookie sea funcional no basta para situarla
ahí; pero tampoco basta para declararla de rastreo. Quedan como indeterminadas y
no reciben violación alguna.

---

## Estructura

```
auditor.js          recolección de los seis escenarios y derivación de violaciones
listas.js           bases públicas importadas, con procedencia y huella
rc7.js              regla RC-7: adjudicación por plataforma, con su fundamento
verificar.js        comprobación previa de dominios
confirmar.js        asistente de verificación visual (ciega)
confirmar-chrome.js el mismo asistente, con el Chrome del sistema
acierto.js          validez concurrente: acierto, sensibilidad, especificidad
clasificar.js       reparto por carpetas y triaje de los no verificables
reclasificar.js     reclasificación sobre el corpus ya recogido
indeterminadas.js   análisis de las cookies que ninguna regla resuelve
familias.js         agrupa las indeterminadas por familia de plataforma
evidencia.js        capturas de los sitios con aviso confirmado
reintentar.js       devuelve a la cola las mediciones fallidas
submuestra.js       depuración del marco y submuestra con semilla fija
resumen.js          agregación de resultados
tabla20.js          cifras por escenario listas para el informe
variacion.js        estabilidad entre repeticiones

sitios/             listas de dominios por lote, con sus descartes
control/            ficha del control positivo
corpus/             fichas tal como se recogieron
corpus-reclasificado/  fichas con las bases públicas aplicadas
corpus-rep2/        segunda medición de diez sitios, para la estabilidad
confirmaciones.json verificación humana, sitio por sitio
evidencia-banners/  capturas de los sitios con mecanismo de consentimiento
```

`sitios/` conserva las listas en sus tres estados: los dominios candidatos de
cada lote, los que quedaron tras comprobar cuáles resuelven, y los descartados
con su motivo. Las tres hacen falta: sin ellas, la afirmación de que la muestra
se construyó por muestreo estratificado y no se escogió después de ver los
resultados no es comprobable por nadie.

`control/` contiene la ficha de un sitio con aviso de cookies conocido, auditado
como control positivo. Sirve para demostrar que el instrumento interactúa de
verdad con un banner —que lo localiza, lo pulsa y observa el cambio en las
cookies— y no que simplemente no encuentra nada en ninguna parte. Un detector
averiado y un entorno web sin avisos producen la misma salida; el control
positivo es lo que distingue un caso del otro.

Las capturas de pantalla de los seis escenarios no se publican. Son 1 669
imágenes que suman 812 MB, frente a los 10 MB de las fichas JSON que contienen
las observaciones; quien las necesite las regenera corriendo el auditor sobre
las mismas listas de dominios. Sí se publican las 23 capturas de
`evidencia-banners/`: son las que sostienen la afirmación de que un sitio
concreto pide consentimiento, y esa no se puede dar por buena sin la imagen.

El corpus se conserva en dos versiones a propósito. La observación y su
interpretación son operaciones distintas: `corpus/` es la evidencia y no se
modifica aunque las reglas de clasificación evolucionen, de modo que un revisor
puede rehacer la segunda sin depender de que el investigador haya acertado con las
primeras.

---

## Decisiones de método que conviene conocer

**Las mediciones fallidas se repiten, no se descartan en silencio.** Un sitio que
registró 96 cookies en una pasada y ninguna en la siguiente, sin devolver error,
describe un fallo del instrumento y no una propiedad del sitio; se excluyó del
cálculo de estabilidad y queda documentado. Otro sitio cuya carga se agotó por
tiempo se volvió a medir con una ventana ampliada y confirmó el resultado
original, que por tanto se mantiene. El criterio quita unas veces y confirma
otras: uno que solo quitara sería un sesgo.

**La aleatorización es reproducible.** La submuestra de verificación se selecciona
con semilla declarada (20261105) mediante un generador xorshift32. `Math.random()`
no sirve para esto: nadie podría repetir la selección.

**Las cookies indeterminadas no reciben violación.** En la primera lectura del
corpus, el 28,2 % quedó sin resolver. Dos medidas posteriores lo redujeron al
**6,7 %** sin volver a recoger un solo dato: importar las bases públicas en lugar
de las listas escritas a mano, y la regla RC-7, que adjudica por plataforma con
fundamento en el Dictamen 4/2012 del Grupo de Trabajo del Artículo 29. Lo que
permanece indeterminado es personalización de interfaz e idioma, cuya exención
exige acreditar que el usuario eligió el ajuste y que dura la sesión: ninguna de
las dos cosas puede establecerse por observación instrumentada. Como a una cookie
indeterminada no se le imputa nada, esa proporción no introduce falsos positivos;
vuelve conservadoras las cifras de violación, que son cotas inferiores.

**Reclasificar no disparó los incumplimientos.** La reasignación de 4 826 cookies
movió el recuento de sitios con V1 de 229 a 233, y esos cuatro vinieron de las
bases públicas, no de RC-7. Es la comprobación que importa: si una regla que
reinterpreta una cuarta parte del corpus hubiera hecho saltar las violaciones,
habría motivo para sospechar que se diseñó para producir ese efecto.

---

## Limitaciones

Cincuenta sitios del corpus no pudieron verificarse visualmente. Veinticuatro
presentan protección contra automatización que el navegador instrumentado no
supera, pese a abrir con normalidad en uno convencional. Esa exclusión **no es
aleatoria y su sesgo tiene dirección conocida**: se trata de organizaciones con
infraestructura cuidada, que es el perfil con más probabilidad de haber implantado
un aviso, de modo que excluirlas desplaza la estimación hacia un incumplimiento
mayor que el real. Los veintiséis restantes fallaron de forma persistente en la
resolución de nombres o en la conexión durante la verificación, con errores
idénticos en dos intentos separados pese a haberse auditado con éxito días antes:
el patrón apunta al punto de observación y no a los sitios.

El índice ICC-CR por sitio no está calculado. Exige codificar a mano dieciocho
requisitos por sitio contra la rúbrica del instrumento, y esa codificación está
completa únicamente para la submuestra del piloto. Lo que este repositorio
documenta es la capa de cumplimiento efectivo, que se deriva de la observación.

---

## Consideraciones éticas

La auditoría se limita a la navegación pública, sin autenticación, sin eludir
controles de acceso y sin recoger datos personales de terceros. El agente de
usuario identifica el origen académico de la petición, de modo que un
administrador pueda reconocerlo en sus registros.

Los resultados se publican identificando cada sitio. Un informe anonimizado no
permitiría a la organización afectada comprobar ni rebatir el hallazgo que le
concierne, y es precisamente esa posibilidad la que distingue una auditoría de una
acusación.
