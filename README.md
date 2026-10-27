# Panel de control TI

Sistema de inventario de activos y servicios de TI. Sustituye los cinco archivos de Excel
descritos en `../ANALISIS_INVENTARIO_TI.md`.

Registra **empleados**, los **activos** que tienen asignados —equipos de cómputo, teléfonos y
tabletas— y los **servicios** que usan: licencias Microsoft, licencias Norton y cuentas de
Google Workspace. Las licencias y los correos no cuentan como activos: el tablero, los
reportes y los totales por persona los muestran por separado. Una persona puede tener
todos, uno solo o ninguno.

La interfaz se adapta a computadora, tablet y teléfono: en pantallas angostas el menú se
abre desde el botón superior y las tablas se muestran como tarjetas.

## Interfaz

- **Menú lateral** agrupado en Principal, Inventario, Servicios, Control y Administración,
  con íconos. En computadora se reduce a sólo íconos con el botón ☰; la preferencia se
  recuerda.
- **Barra superior** con la sección actual, búsqueda global (personas, equipos, líneas,
  correos y licencias; atajo `/`), avisos con contador, selector de tema y menú de cuenta.
- **Tablero** con indicadores que llevan a su sección, accesos rápidos para las altas más
  comunes, atención inmediata, activos por departamento, vencimientos de licencias,
  movimientos y actividad reciente de la bitácora.
- **Temas**: Noche, Aurora, Carmesí, Grafito y Claro. Cada navegador recuerda el
  suyo. Los colores de gráfica de cada tema están validados contra su fondo para visión
  normal y daltonismo; se definen en `theme.css` (`--graf-1` a `--graf-3`).

Cada tipo vive en su propia sección con alta, consulta, edición y baja independientes. Al dar
de alta una PC se pueden capturar de una vez su correo y sus licencias: se crean como
registros separados y quedan asignados a la misma persona.

La ubicación (sucursal, departamento y locación) pertenece a la persona. Los activos son objetos que
se asignan; su ubicación es la de quien los tiene.

Las tabletas llevan SIM, así que se registran con los datos de un teléfono (IMEI, número,
ICCID, plan) y los de un equipo de cómputo (serie, procesador, RAM, almacenamiento, sistema
operativo).

Los correos son siempre de Google Workspace; cada cuenta se marca como activa o desactivada.

Ningún dispositivo maneja fecha de vencimiento: equipos de cómputo, teléfonos y tabletas no
piden vencimiento ni generan alertas por ello. Las únicas renovaciones que se siguen son las
de las licencias, que toman la fecha de su familia.

---

## Producción en Render

El sistema puede publicarse en **Render** como servicio web con el `Dockerfile` de este
repositorio. Cada cambio que entra a `main` genera una nueva versión del servicio.

| Concepto | Valor |
|---|---|
| Tipo de servicio | Web Service (Docker) |
| Repositorio | `<organización>/<repositorio>`, rama `main` |
| Disco persistente | Montado en `/datos` (base, adjuntos y llave) |
| Zona horaria | Según la región del cliente (variable `TZ`) |
| Credenciales y accesos | Resguardar en un gestor de contraseñas |

Variables de entorno del servicio:

```
INVENTARIO_ADMIN_PASSWORD=<contraseña inicial del admin>
INVENTARIO_LLAVE=<llave Fernet>
INVENTARIO_COOKIE_SEGURA=1
```

El disco en `/datos` es lo que conserva la información entre versiones: sin él, cada
despliegue arrancaría con una base vacía.

---

## Arrancar en local (simulación antes del NAS)

Requiere Python 3.11 o superior.

**La forma fácil:** doble clic en **`iniciar.bat`**.

Instala las dependencias la primera vez, arranca el servidor y abre el navegador solo.
Si ya está corriendo en otra ventana, lo detecta y solo abre el navegador en lugar de fallar.
Hay que dejar esa ventana abierta mientras se usa el sistema.

**Desde la terminal**, si se prefiere control manual o se está editando el código:

```bash
cd inventario-app
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8801
```

`--reload` reinicia el servidor solo cuando cambia un archivo del código. Útil al desarrollar;
en el NAS no se usa.

Abrir **http://127.0.0.1:8801**

Usuario `admin`. En una base nueva la contraseña es la de `INVENTARIO_ADMIN_PASSWORD`; si no
está definida es `admin1234`, y en el primer acceso la app obliga a cambiarla antes de dejar
usar cualquier otra pantalla.

En el primer arranque se crea `data/inventario.db` con el usuario administrador. **No se
cargan catálogos, empleados ni activos**: sucursales, departamentos y locaciones se
capturan desde Catálogos, y el resto desde la aplicación.

### Empezar de cero

Borrar `data/inventario.db` y volver a arrancar. Se regeneran los catálogos y el usuario admin.

---

## Alternativa: Synology DS925+

El DS925+ tiene Container Manager, así que corre la misma imagen sin cambios.

**1. Crear la carpeta en el NAS**

En *File Station*, dentro de la carpeta compartida `docker`, crear:

```
/volume1/docker/inventario-ti/
/volume1/docker/inventario-ti/datos/
```

**2. Copiar el proyecto**

Subir a `/volume1/docker/inventario-ti/` las carpetas y archivos: `app/`, `Dockerfile`,
`docker-compose.yml`, `requirements.txt`, `.env.example`. El contenedor corre como usuario
no root (UID/GID 1000 por defecto; se cambian con `INVENTARIO_UID` e `INVENTARIO_GID` en `.env`): la
carpeta de datos del NAS debe poder escribirla ese usuario. **No subir `data/`** — la base del NAS
se crea sola y es independiente de la de pruebas locales.

**3. Crear el `.env`**

Copiar `.env.example` como `.env` en la misma carpeta y llenar la contraseña inicial:

```
INVENTARIO_DATOS=/volume1/docker/inventario-ti/datos
INVENTARIO_ADMIN_PASSWORD=<una contraseña propia>
INVENTARIO_LLAVE=<salida de: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
INVENTARIO_COOKIE_SEGURA=0
```

El `.env` no se sube al repositorio. `INVENTARIO_COOKIE_SEGURA=1` solo si se publica por HTTPS.

**4. Levantar el contenedor**

En *Container Manager → Proyecto → Crear*, apuntar a la carpeta
`/volume1/docker/inventario-ti` y usar su `docker-compose.yml`.

Queda disponible en **http://<ip-del-NAS>:8800**

**5. Acceso remoto**

Dos caminos, de menor a mayor exposición:

- **VPN del Synology** (recomendado): activar *VPN Server* en DSM y conectarse a la red del
  NAS desde fuera. El inventario nunca queda expuesto a Internet.
- **Reverse proxy de DSM** con HTTPS: *Panel de control → Portal de inicio de sesión →
  Avanzado → Proxy inverso*, apuntando a `localhost:8800` con un certificado Let's Encrypt.

Si se publica a Internet, activar también el bloqueo automático de IP en DSM.

---

## Respaldos

La base entera es **un solo archivo**: `datos/inventario.db`. Respaldarla es copiarlo.

- **Render**: la carpeta `/datos` vive en el disco persistente del servicio; Render guarda
  instantáneas diarias del disco. Para una copia propia, descargar `/datos` desde el *Shell*
  del servicio.

- **Hyper Backup** sobre `/volume1/docker/inventario-ti/datos` — es suficiente: esa carpeta
  contiene tanto la base de datos como las responsivas adjuntas.
- Los *snapshots* de Btrfs del DS925+ también la cubren.

Para restaurar: detener el contenedor, reemplazar el archivo, volver a arrancar.

> Con la base en modo WAL existen también `inventario.db-wal` y `inventario.db-shm`.
> Si se copia en caliente, incluir los tres o detener el contenedor antes de copiar.

> Las contraseñas de redes, las claves de Windows y los adjuntos van cifrados con
> `INVENTARIO_LLAVE` (o `datos/llave.key` si no está definida). Sin esa llave no se pueden
> leer: respaldarla por separado de la base y no subirla al repositorio.

---

## Qué resuelve

| Problema en los Excel | Cómo lo resuelve el sistema |
|---|---|
| Los archivos se cruzan por el nombre escrito a mano | `EMP-0001` como llave estable; el nombre puede corregirse sin romper nada |
| Las laptops no tienen identificador físico | Campo de número de serie, único a nivel de base de datos |
| Tres equipos con el mismo IMEI | La base rechaza IMEI, serie, teléfono, ICCID y correo duplicados |
| El activo pierde su rastro cuando la persona sale | Tabla de asignaciones con historial: un activo acumula todos sus portadores |
| El ciclo de vida metido en el nombre (`LIBRE`, `ANTERIOR(...)`) | Campo de estatus propio, con historial de asignaciones |
| Contraseñas en texto plano | El sistema **no almacena contraseñas de servicios**: solo una referencia al gestor |
| El estatus vive en el color de la celda | `ASIGNADO`, `DISPONIBLE`, `EN_REPARACION`, `EXTRAVIADO`, `ROBADO`, `SUSPENDIDO`, `BAJA` |
| 56% de equipos sin responsiva y nadie lo notaba | Alerta permanente, y la responsiva se adjunta y se ve dentro del sistema |
| Nadie se entera de una renovación hasta que vence | Alertas de renovación de licencias con 60 días de anticipación |
| No había forma de saber si una responsiva iba en camino | Cuatro estados, con destino, fecha y aviso a las tres semanas |
| La revisión semanal vivía en la memoria de quien la hacía | Auditoría como checklist, con incidencias y responsable |

---

## Roles

| Rol | Puede |
|---|---|
| `ADMIN` | Todo: personal de TI, y programar, reasignar o eliminar auditorías |
| `CAPTURA` | Alta y edición de empleados, activos y asignaciones; resuelve las auditorías que se le asignan |
| `CONSULTA` | Solo ver y descargar reportes |

Las cuentas del equipo se administran en **Personal de TI**. El primer administrador es el
**administrador principal**: nadie más puede modificar su cuenta, y sólo él crea
administradores o edita a otros administradores. Los demás administradores gestionan
cuentas de captura y consulta. Desactivar una cuenta o cambiarle la contraseña cierra sus
sesiones abiertas.

Todo movimiento queda en la **bitácora** con usuario, fecha y detalle.

---

## Accesos a sistemas internos

Cada persona tiene un checklist de credenciales entregadas para los sistemas propios
—se definen desde Catálogos—. Registra si se entregó,
cuándo, con qué usuario y quién lo marcó. Se agregan más sistemas desde Catálogos.

---

## Licencias por familia

Los planes familiares de Microsoft 365 agrupan hasta 6 miembros bajo una cuenta
`<cuenta-familiar>@outlook.*`. Cada familia se registra una vez, con su correo y sus
ranuras contratadas, y cada licencia se liga a ella.

| Producto | Licencias por familia |
|---|---|
| Microsoft 365 | 6 |
| Norton 360 | 10 |

Una familia no acepta más licencias que ese tope ni que sus ranuras contratadas, y una
licencia de Norton no puede ligarse a una familia de Microsoft (ni al revés). En los
formularios las familias completas aparecen como *llena* y no se pueden elegir.

Cuando una familia (o una licencia suelta) vence en **60 días o menos**, aparece en Alertas,
en la campana de avisos y en un aviso al iniciar sesión. A 30 días o menos, o ya vencida,
cuenta como alerta crítica.

La sección Licencias separa Microsoft 365 y Norton 360 en pestañas y presenta cada familia
como en la relación de Excel: encabezado con el correo de la familia, renovación y ranuras
usadas, y debajo una fila por licencia con nombre, correo (o usuario del equipo en Norton),
sucursal, locación y departamento de quien la tiene. Las ranuras vacías aparecen como
*Libre* y desde ahí se agrega la licencia a esa familia.

El correo de cada persona es la cuenta de Google Workspace que tiene asignada en Correos;
el empleado ya no guarda un correo propio.

---

## Responsivas e INE

Llevan responsiva los equipos de cómputo, las tabletas y los teléfonos. La INE sólo se pide
para telefonía: la tabla de esa sección muestra el estado de responsiva e INE de cada línea.
Correos y licencias no llevan ninguna de las dos.

La responsiva pertenece a la asignación, no al activo ni a la persona por separado: es el
mismo registro visto desde dos lados. Lo que se adjunta o cambia desde la ficha del activo
aparece en la ficha del empleado, y al revés. En ambas fichas el historial conserva la
responsiva e INE de cada asignación anterior, con acceso a sus archivos.

Las responsivas casi nunca se firman en TI: se envían a la sucursal, ahí las firman y
después regresan. Por eso el documento tiene cuatro estados, no un sí/no:

| Estado | Qué significa |
|---|---|
| **Pendiente de enviar** | Todavía no sale de TI |
| **En espera de firma** | Enviada a firmar. Guarda a dónde y desde cuándo |
| **Firmada** | De regreso y en resguardo |
| **No aplica** | No corresponde para ese activo |

El sistema cuenta solo los días que lleva fuera y **avisa cuando pasa de tres semanas**
sin regresar, diciendo a qué sucursal se mandó. El umbral se ajusta en `main.py`,
constante `DIAS_ESPERA_RESPONSIVA`.

La sección **Notificaciones** reúne todas las responsivas por recibir —sin enviar y en espera
de firma—, con el contador en la barra lateral y acceso directo a sus documentos.

El documento se guarda de dos formas que pueden convivir:

- **Archivo adjunto**: se sube al sistema (PDF, JPG, PNG o WEBP, hasta 10 MB) y se abre
  dentro de la aplicación, sin salir a otra pestaña
- **Enlace externo**: para los documentos que ya viven en Google Drive

Los archivos se guardan en `datos/adjuntos/`, con nombre generado por el servidor. Entran en
el mismo respaldo que la base de datos.

---

## Auditoría semanal

Checklist semanal para **correo** y para **Norton**. El administrador programa la auditoría
y la asigna a un analista de TI, que es quien resuelve el checklist. Se elige cualquier día
de la semana y el sistema toma el periodo de lunes a domingo.

El checklist se arma solo, con dos clases de puntos:

- **De plantilla**: los fijos a revisar cada semana (altas y bajas, seguridad, uso,
  categorías web, tiempo de dispositivos)
- **Automáticos**: los que el sistema detecta leyendo el inventario y que nacen marcados
  como incidencia — cuentas suspendidas o sin acceso reciente, sin responsable asignado,
  bajas de personal con dispositivos aún asignados

Cada punto se marca como **conforme**, **incidencia** o **no aplica**, y queda registrado
quién lo revisó. Una incidencia exige que se describa qué pasó. La auditoría no se cierra
con puntos sin revisar, pero sí con incidencias abiertas: documentarlas es el objetivo.
Una auditoría cerrada queda bloqueada y puede reabrirse.

La de **Norton** revisa seguridad de la información, categorías web, tiempo de
dispositivos (horario laboral y dispositivos sin actividad en los días indicados al
programarla) y bajas / altas. Las altas y bajas de personal
de la semana se agregan como puntos; una baja con dispositivos aún asignados entra como
incidencia.

Las evidencias son enlaces a archivos de Google Drive. En la de Norton solo se agregan a
los puntos con incidencia.

El **reporte mensual** (Excel) se genera al elegir las 4 auditorías semanales del mes:
resumen por semana, concentrado de puntos contra semanas, detalle y evidencias.

Si una auditoría sigue abierta después de terminar su semana, aparece en Alertas.

## Verificación de números

Checklist mensual de las líneas de la empresa. Cada número tiene un botón que abre
WhatsApp con el mensaje de verificación listo para enviarse al titular; al pulsarlo queda
registrada la fecha de envío. Cuando el titular confirma su nombre, la línea se marca como
verificada (con quién y cuándo) y se le puede anotar una observación.

La lista se alimenta de un Excel de líneas y se
completa sola con las líneas de Telefonía. En las que están en el inventario, el titular,
la sucursal y el departamento salen de la asignación vigente. Cada mes arranca en ceros y
los meses anteriores se consultan con el selector de mes.

---

## Notas y pendientes

Recados del área visibles para todo el equipo, con prioridad, estado y registro de quién
los escribió y quién los resolvió. Pueden ligarse a una persona. El menú marca cuántos
siguen abiertos.

## Exportar a Excel

Empleados, Equipos de cómputo, Tablets y Telefonía tienen el botón **Exportar a Excel**. El
archivo respeta los filtros aplicados en pantalla.

| Sección | Incluye |
|---|---|
| Empleados | Datos de la persona, correos, ubicación, estatus y equipos asignados con el estado de su responsiva |
| Equipos de cómputo y Tablets | Datos del equipo, a quién está asignado y la responsiva con liga a su documento |
| Telefonía | Datos de la línea y del equipo, a quién está asignado, responsiva e INE con liga a sus documentos |

Desde **Reportes** se descarga además el inventario completo en un solo libro (activos,
empleados, historial e impresoras).

## Alertas que genera

- Licencias por renovar o vencidas (ventana de 60 días)
- Cuentas de licencia con más usos que ranuras contratadas
- **Empleados dados de baja que conservan activos**
- Activos entregados sin responsiva
- **Responsivas que llevan más de tres semanas esperando firma**
- Auditorías semanales que quedaron sin cerrar
- Equipos de cómputo con más de 4 años

---

## Estructura

```
inventario-app/
├── app/
│   ├── models.py        Tablas y relaciones
│   ├── database.py      Conexión SQLite (WAL)
│   ├── auth.py          Sesiones, roles, hash scrypt
│   ├── cifrado.py       Cifrado de las contraseñas de redes
│   ├── schemas.py       Validación de entrada
│   ├── seed.py          Catálogos iniciales
│   ├── auditoria.py     Plantillas del checklist y detección de excepciones
│   ├── main.py          API y rutas
│   └── static/          Interfaz (HTML, CSS, JS) y el logo en img/
├── data/                Base de datos y adjuntos locales (no subir al NAS)
│   └── adjuntos/        Responsivas e INE subidas
├── docs/                Guía de entrega y arquitectura en PDF
├── iniciar.bat          Arranque con doble clic (solo Windows local)
├── scripts/
│   └── iniciar.ps1      Lógica del arranque
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

> `iniciar.bat` y `scripts/iniciar.ps1` son para uso local en Windows. En el NAS no hacen falta:
> ahí el contenedor arranca solo.

## Paleta

Fusión de las dos paletas entregadas: base oscura con acentos neón, cyan compartido por ambas.

| Uso | Color |
|---|---|
| Fondo | `#0D0F14` |
| Tarjetas | `#1F2233` |
| Barra lateral | `#1E1A38` |
| Bordes | `#34314F` / `#4E4B6C` |
| Primario / correcto | `#00D1FF` |
| Acento | `#FF3D9A` |
| Advertencia | `#FFE66D` |
| Crítico | `#F03D55` |

Todo vive en `app/static/css/theme.css` como variables CSS.

### Colores de las gráficas

Las series de datos usan **`#00A0C4`** y **`#E5357F`**, no los tonos de la interfaz.
Los originales quedaban fuera de la banda de luminosidad recomendada sobre fondo oscuro;
estos conservan la identidad cyan/rosa y aprueban las comprobaciones de croma, separación
en daltonismo (ΔE 11.1 en deuteranopía) y contraste. Si se cambian, hay que volver a
validarlos antes de usarlos.

---

## Capacidad y usuarios simultáneos

Una sola instancia de la aplicación (un proceso, SQLite en modo WAL) atiende 40 usuarios
simultáneos con holgura. Medido en una PC con 800 empleados, 1 500 equipos y 600 asignaciones,
con 40 usuarios haciendo una acción cada 2 a 5 s (mucho más que el uso real): p95 de 0,44 s y
máximo de 1,1 s. El límite está en unas 15 peticiones por segundo; a 80 usuarios con ese mismo
ritmo agresivo la respuesta se degrada (p95 de 5 s).

Reglas para conservar esa capacidad:

- **Una sola instancia.** Los límites de peticiones y el candado de altas viven en memoria; con
  varios procesos o réplicas dejarían de valer.
- **Detrás de un proxy inverso**, definir `FORWARDED_ALLOW_IPS` con la IP del proxy. Si no, todos
  los usuarios comparten el límite de 600 peticiones por minuto y de 20 inicios de sesión fallidos.
- Los listados devuelven todos los registros sin paginar: conviene revisar la capacidad si el
  inventario supera unos 5 000 activos.

