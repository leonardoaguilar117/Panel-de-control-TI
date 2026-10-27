"use strict";

const estado = { usuario: null, catalogos: null, vista: "tablero" };

const TIPOS = {
  COMPUTO: "Cómputo",
  TELEFONO: "Teléfono",
  TABLETA: "Tableta",
  LICENCIA_MICROSOFT: "Licencia Microsoft",
  LICENCIA_NORTON: "Licencia Norton",
  CORREO_WORKSPACE: "Correo Workspace",
};

// El ciclo real de una responsiva: se imprime, se manda a la sucursal, la firman
// y regresa. ENVIADA es esa espera, que antes no se podía representar.
const ESTADOS_DOC = {
  PENDIENTE: { etiqueta: "Pendiente de enviar", insignia: "alerta" },
  ENVIADA: { etiqueta: "En espera de firma", insignia: "acento" },
  FIRMADA: { etiqueta: "Firmada", insignia: "ok" },
  NO_APLICA: { etiqueta: "No aplica", insignia: "neutra" },
};

// Sólo lo que se entrega en mano genera responsiva
const LLEVAN_RESPONSIVA = ["COMPUTO", "TABLETA", "TELEFONO"];
const LLEVAN_INE = ["TELEFONO"];
// Activos son los equipos físicos; licencias y correos son servicios
const TIPOS_FISICOS = ["COMPUTO", "TELEFONO", "TABLETA"];

const EXPORTABLES = ["equipos", "tabletas", "telefonia"];

const INSIGNIA_ESTATUS = {
  ASIGNADO: "ok",
  DISPONIBLE: "acento",
  EN_REPARACION: "alerta",
  EXTRAVIADO: "peligro",
  ROBADO: "peligro",
  SUSPENDIDO: "alerta",
  BAJA: "neutra",
};

// Cada sección del inventario: qué tipos incluye y cómo se ve su tabla
const SECCIONES = {
  equipos: {
    titulo: "Equipos de cómputo",
    sub: "Laptops y equipos de escritorio",
    tipos: ["COMPUTO"],
    tipoNuevo: "COMPUTO",
    columnas: ["Código", "Marca y modelo", "Número de serie", "Procesador", "Asignado a", "Responsiva", "Estatus"],
    fila: (a) => [
      `<span class="codigo">${esc(a.codigo)}</span>`,
      esc([a.computo?.marca, a.computo?.modelo].filter(Boolean).join(" ") || a.descripcion || "—"),
      a.computo?.numero_serie
        ? `<span style="font-family:var(--mono);font-size:14px">${esc(a.computo.numero_serie)}</span>`
        : '<span class="insignia alerta">Sin serie</span>',
      esc(a.computo?.procesador || "—"),
      celdaAsignado(a),
      insigniaDocumento(a.asignado_a, "responsiva"),
      insigniaEstatus(a),
    ],
  },
  tabletas: {
    titulo: "Tablets",
    sub: "Tabletas de la empresa",
    tipos: ["TABLETA"],
    tipoNuevo: "TABLETA",
    columnas: ["Código", "Marca y modelo", "Número de serie", "Procesador", "Asignado a", "Responsiva", "Estatus"],
    fila: (a) => [
      `<span class="codigo">${esc(a.codigo)}</span>`,
      esc([a.computo?.marca, a.computo?.modelo].filter(Boolean).join(" ") || a.descripcion || "—"),
      a.computo?.numero_serie
        ? `<span style="font-family:var(--mono);font-size:14px">${esc(a.computo.numero_serie)}</span>`
        : '<span class="insignia alerta">Sin serie</span>',
      esc(a.computo?.procesador || "—"),
      celdaAsignado(a),
      insigniaDocumento(a.asignado_a, "responsiva"),
      insigniaEstatus(a),
    ],
  },
  telefonia: {
    titulo: "Telefonía",
    sub: "Teléfonos con línea",
    tipos: ["TELEFONO"],
    tipoNuevo: "TELEFONO",
    columnas: ["Código", "Tipo", "Equipo", "Teléfono", "IMEI", "Asignado a", "Responsiva", "INE", "Estatus"],
    fila: (a) => [
      `<span class="codigo">${esc(a.codigo)}</span>`,
      esc(TIPOS[a.tipo]),
      esc([a.movil?.marca, a.movil?.modelo].filter(Boolean).join(" ") || a.descripcion || "—"),
      esc(a.movil?.numero_telefonico || "—"),
      `<span style="font-family:var(--mono);font-size:14px">${esc(a.movil?.imei || "—")}</span>`,
      celdaAsignado(a),
      a.lleva_responsiva ? insigniaDocumento(a.asignado_a, "responsiva") : "—",
      a.lleva_ine ? insigniaDocumento(a.asignado_a, "ine") : "—",
      insigniaEstatus(a),
    ],
  },
  licencias: {
    titulo: "Licencias",
    sub: "Microsoft 365 y Norton 360, agrupadas por familia",
    tipos: ["LICENCIA_MICROSOFT", "LICENCIA_NORTON"],
    tipoNuevo: "LICENCIA_MICROSOFT",
    columnas: ["Código", "Producto", "Familia", "Correo de la familia",
               "Correo / identificador", "Asignado a", "Estatus"],
    fila: (a) => [
      `<span class="codigo">${esc(a.codigo)}</span>`,
      esc(TIPOS[a.tipo]),
      a.licencia?.familia
        ? `<span class="insignia acento">${esc(a.licencia.familia)}</span>`
        : '<span class="insignia alerta">Sin familia</span>',
      `<span style="font-family:var(--mono);font-size:14px">${esc(
        a.licencia?.correo_familia || "—"
      )}</span>`,
      esc(a.licencia?.correo_licencia || a.licencia?.identificador_dispositivo || "—"),
      celdaAsignado(a),
      insigniaEstatus(a),
    ],
  },
  correos: {
    titulo: "Correos",
    sub: "Cuentas de Google Workspace",
    tipos: ["CORREO_WORKSPACE"],
    tipoNuevo: "CORREO_WORKSPACE",
    columnas: ["Código", "Dirección", "Cuenta", "Último acceso", "Almacenamiento", "Asignado a", "Estatus"],
    fila: (a) => [
      `<span class="codigo">${esc(a.codigo)}</span>`,
      esc(a.correo?.direccion || "—"),
      a.correo?.habilitada === false
        ? '<span class="insignia peligro">Desactivada</span>'
        : '<span class="insignia ok">Activa</span>',
      celdaUltimoAcceso(a.correo),
      a.correo?.almacenamiento_gb != null ? `${a.correo.almacenamiento_gb.toFixed(2)} GB` : "—",
      celdaAsignado(a),
      insigniaEstatus(a),
    ],
  },
};

// ---------------------------------------------------------------- íconos

const ICONOS = {
  tablero: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  empleados: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  equipos: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/><path d="M9 16v4"/><path d="M15 16v4"/>',
  telefonia: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  tabletas: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 18h2"/>',
  impresoras: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  licencias: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/>',
  correos: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  auditorias: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  notificaciones: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  notas: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
  alertas: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  contrasenas: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>',
  reportes: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  catalogos: '<path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  usuarios: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><circle cx="12" cy="10" r="3"/><path d="M7.5 17a5 5 0 0 1 9 0"/>',
  bitacora: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  tema: '<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 2a10 10 0 0 0 0 20c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C22 6 17.5 2 12 2Z"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  llave: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  flecha: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  mas: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  asignar: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  eliminar: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  verificacion: '<rect x="3" y="2" width="11" height="20" rx="2.5"/><path d="M7.5 18h2"/><path d="m16 12 2 2 4-4"/>',
  whatsapp: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
};

function icono(nombre) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ""}</svg>`;
}

function pintarIconos(raiz = document) {
  raiz.querySelectorAll("i[data-icono]").forEach((i) => {
    i.outerHTML = icono(i.dataset.icono);
  });
}

const ICONO_TIPO = {
  COMPUTO: "equipos", TELEFONO: "telefonia", TABLETA: "tabletas",
  LICENCIA_MICROSOFT: "licencias", LICENCIA_NORTON: "licencias", CORREO_WORKSPACE: "correos",
};
const SECCION_TIPO = {
  COMPUTO: "equipos", TELEFONO: "telefonia", TABLETA: "tabletas",
  LICENCIA_MICROSOFT: "licencias", LICENCIA_NORTON: "licencias", CORREO_WORKSPACE: "correos",
};

// ---------------------------------------------------------------- utilidades

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (t) =>
  t === null || t === undefined
    ? ""
    : String(t).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
      );

const ZONA_HORARIA = "America/Mexico_City";
// El servidor guarda las marcas de tiempo en UTC sin zona
const comoUTC = (f) => new Date(f + (/[zZ]|[+-]\d\d:?\d\d$/.test(f) ? "" : "Z"));
const fecha = (f) => (f ? new Date(f + "T00:00:00").toLocaleDateString("es-MX") : "—");
const fechaHora = (f) => (f ? comoUTC(f).toLocaleString("es-MX", { timeZone: ZONA_HORARIA }) : "—");
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
const moneda = (n) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const celdaAsignado = (a) =>
  a.asignado_a
    ? esc(a.asignado_a.empleado)
    : '<span style="color:var(--texto-tenue)">Libre</span>';

const insigniaDocumento = (asignacion, cual) => {
  if (!asignacion) return '<span style="color:var(--texto-tenue)">—</span>';
  const info = ESTADOS_DOC[asignacion[`${cual}_estado`]] || ESTADOS_DOC.PENDIENTE;
  return `<span class="insignia ${info.insignia}">${esc(info.etiqueta)}</span>`;
};

/** Responsiva e INE de una asignación pasada, con acceso a sus archivos. */
function celdaDocumentosHistorial(h) {
  if (!LLEVAN_RESPONSIVA.includes(h.activo_tipo)) return "—";
  const docs = LLEVAN_INE.includes(h.activo_tipo) ? ["responsiva", "ine"] : ["responsiva"];
  return docs
    .map((cual) => {
      const hay = h[`${cual}_archivo`] || h[`${cual}_url`];
      return `<span style="white-space:nowrap">${cual === "ine" ? "INE " : ""}${insigniaDocumento(h, cual)}${
        hay
          ? ` <button class="btn-secundario btn-mini" data-ver="${cual}" data-asig="${h.id}">Ver</button>`
          : ""
      }</span>`;
    })
    .join(" ");
}

const DIAS_DESUSO_CORREO = 20;

function celdaUltimoAcceso(c) {
  if (!c) return "—";
  if (c.nunca_accedio) return '<span class="insignia peligro">Nunca</span>';
  if (!c.ultimo_acceso) return "—";
  const dia = new Date(c.ultimo_acceso).toLocaleDateString("es-MX");
  return c.habilitada && c.dias_sin_acceso >= DIAS_DESUSO_CORREO
    ? `${dia} <span class="insignia alerta">${c.dias_sin_acceso} días sin uso</span>`
    : dia;
}

const insigniaEstatus = (a) =>
  `<span class="insignia ${INSIGNIA_ESTATUS[a.estatus] || "neutra"}">${a.estatus}</span>`;

/** Velo de carga con el logo girando. Se muestra si la espera se alarga. */
let cargasAbiertas = 0;
let temporizadorVelo = null;

function mostrarVelo() {
  cargasAbiertas += 1;
  if (cargasAbiertas > 1 || temporizadorVelo) return;
  temporizadorVelo = setTimeout(() => {
    temporizadorVelo = null;
    if (cargasAbiertas <= 0) return;
    let velo = $("#velo");
    if (!velo) {
      velo = document.createElement("div");
      velo.id = "velo";
      velo.className = "velo";
      velo.innerHTML = `
        <div class="velo-caja">
          <div class="aro-logo">
            <svg viewBox="0 0 100 100" class="aro">
              <circle cx="50" cy="50" r="44" />
            </svg>
            <img src="/img/logo.png" alt="" width="58" height="58">
          </div>
          <span>Cargando…</span>
        </div>`;
      document.body.append(velo);
    }
    velo.classList.add("visible");
  }, 320);
}

function ocultarVelo() {
  cargasAbiertas = Math.max(0, cargasAbiertas - 1);
  if (cargasAbiertas > 0) return;
  if (temporizadorVelo) {
    clearTimeout(temporizadorVelo);
    temporizadorVelo = null;
  }
  const velo = $("#velo");
  if (velo) velo.classList.remove("visible");
}

function toast(mensaje, tipo = "", alPulsar = null) {
  const div = document.createElement("div");
  div.className = `toast ${tipo}`;
  div.textContent = mensaje;
  if (alPulsar) {
    div.classList.add("pulsable");
    div.onclick = () => {
      div.remove();
      alPulsar();
    };
  }
  $("#toasts").append(div);
  setTimeout(() => div.remove(), alPulsar ? 9000 : 4200);
}

// El último botón pulsado. Permite mostrarle el aro de carga durante la
// petición que dispara, sin tener que envolver cada manejador uno por uno.
let botonPulsado = null;
document.addEventListener(
  "pointerdown",
  (e) => {
    const b = e.target.closest("button");
    botonPulsado =
      b && !b.classList.contains("cerrar") && !b.closest("#nav, .barra-superior") ? b : null;
  },
  true
);

async function api(ruta, { silencioso = false, ...opciones } = {}) {
  const boton = silencioso ? null : botonPulsado;
  if (!silencioso) botonPulsado = null;
  // Sólo se muestra si la respuesta tarda: evita el parpadeo en lo instantáneo
  const retardo = boton ? setTimeout(() => boton.classList.add("cargando"), 180) : null;
  // Sin botón de por medio (cambios de vista, cargas iniciales) se usa el velo
  const conVelo = !boton && !silencioso;
  if (conVelo) mostrarVelo();

  try {
    const esFormData = opciones.body instanceof FormData;
    const resp = await fetch(ruta, {
      headers: esFormData ? {} : { "Content-Type": "application/json" },
      ...opciones,
    });
    if (resp.status === 401 && ruta !== "/api/login") {
      estado.usuario = null;
      mostrarLogin();
      throw new Error("Sesión expirada");
    }
    if (!resp.ok) {
      let detalle = `Error ${resp.status}`;
      try {
        const cuerpo = await resp.json();
        detalle = typeof cuerpo.detail === "string" ? cuerpo.detail : detalle;
      } catch (_) {}
      throw new Error(detalle);
    }
    return resp.status === 204 ? null : resp.json();
  } finally {
    if (retardo) clearTimeout(retardo);
    if (boton) boton.classList.remove("cargando");
    else if (conVelo) ocultarVelo();
  }
}

// Las cifras de las tarjetas cuentan hacia arriba en vez de aparecer estáticas
function animarCifra(el) {
  if (el.dataset.animado) return;
  const destino = parseInt(el.textContent.replace(/[^\d-]/g, ""), 10);
  if (Number.isNaN(destino)) return;
  el.dataset.animado = "1";
  const inicio = performance.now();
  const duracion = 550;
  function paso(ahora) {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suavizado = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(destino * suavizado).toLocaleString("es-MX");
    if (t < 1) requestAnimationFrame(paso);
    else el.textContent = destino.toLocaleString("es-MX");
  }
  requestAnimationFrame(paso);
}

// En pantallas angostas cada fila se muestra como tarjeta con el nombre de su columna
function etiquetarTabla(tabla) {
  const titulos = [...tabla.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  tabla.querySelectorAll("tbody tr").forEach((tr) =>
    [...tr.children].forEach((td, i) => {
      if (titulos[i] && td.colSpan === 1) td.dataset.label = titulos[i];
      else td.classList.add("sin-etiqueta");
    })
  );
}

const observador = new MutationObserver((mutaciones) => {
  for (const m of mutaciones) {
    for (const nodo of m.addedNodes) {
      if (nodo.nodeType !== 1) continue;
      if (nodo.matches?.(".tarjeta .valor")) animarCifra(nodo);
      nodo.querySelectorAll?.(".tarjeta .valor").forEach(animarCifra);
      if (nodo.matches?.("table")) etiquetarTabla(nodo);
      nodo.querySelectorAll?.("table").forEach(etiquetarTabla);
    }
  }
});
observador.observe($("#vista"), { childList: true, subtree: true });
observador.observe($("#modal"), { childList: true, subtree: true });

function cerrarModal() {
  $("#modal").innerHTML = "";
}

function abrirModal(titulo, cuerpoHtml, pieHtml = "", ancho = false) {
  $("#modal").innerHTML = `
    <div class="fondo-modal">
      <div class="modal ${ancho ? "ancho" : ""}">
        <header>
          <h3>${esc(titulo)}</h3>
          <button class="cerrar" type="button">&times;</button>
        </header>
        <div class="cuerpo">${cuerpoHtml}</div>
        ${pieHtml ? `<footer>${pieHtml}</footer>` : ""}
      </div>
    </div>`;
  $("#modal .cerrar").onclick = cerrarModal;
  cerrarAlPulsarFondo($("#modal .fondo-modal"), cerrarModal);
}

/** Cierra solo si el clic empezó y terminó en el fondo (no al arrastrar una selección). */
function cerrarAlPulsarFondo(fondo, cerrar) {
  let pulsadoEnFondo = false;
  fondo.onmousedown = (e) => {
    pulsadoEnFondo = e.target === e.currentTarget;
  };
  fondo.onclick = (e) => {
    if (pulsadoEnFondo && e.target === e.currentTarget) cerrar();
  };
}

const puedeEditar = () => estado.usuario && estado.usuario.rol !== "CONSULTA";
const esAdmin = () => estado.usuario && estado.usuario.rol === "ADMIN";

function opciones(lista, seleccionado, vacio = "— Sin especificar —") {
  return (
    (vacio ? `<option value="">${vacio}</option>` : "") +
    lista
      .map(
        (o) =>
          `<option value="${o.id ?? o}" ${
            String(o.id ?? o) === String(seleccionado ?? "") ? "selected" : ""
          }>${esc(o.nombre ?? TIPOS[o] ?? o)}</option>`
      )
      .join("")
  );
}

const UBICACIONES = [
  { sufijo: "suc", campo: "sucursal_id", etiqueta: "Sucursal", catalogo: "sucursales", vacio: "Todas" },
  { sufijo: "dep", campo: "departamento_id", etiqueta: "Departamento", catalogo: "departamentos", vacio: "Todos" },
  { sufijo: "bod", campo: "bodega_id", etiqueta: "Locación", catalogo: "bodegas", vacio: "Todas" },
];

function filtrosUbicacion(prefijo) {
  return UBICACIONES.map(
    (u) => `<div class="campo"><label>${u.etiqueta}</label>
      <select id="${prefijo}-${u.sufijo}">${opciones(estado.catalogos[u.catalogo], "", u.vacio)}</select></div>`
  ).join("");
}

function valoresUbicacion(prefijo) {
  const valores = {};
  UBICACIONES.forEach((u) => {
    const v = $(`#${prefijo}-${u.sufijo}`).value;
    if (v) valores[u.campo] = v;
  });
  return valores;
}

function enlazarUbicacion(prefijo, alCambiar) {
  const suc = $(`#${prefijo}-suc`);
  const bod = $(`#${prefijo}-bod`);
  suc.addEventListener("change", () => {
    const bodegas = estado.catalogos.bodegas.filter(
      (b) => !suc.value || String(b.sucursal_id) === suc.value
    );
    const actual = bodegas.some((b) => String(b.id) === bod.value) ? bod.value : "";
    bod.innerHTML = opciones(bodegas, actual, "Todas");
  });
  UBICACIONES.forEach((u) => $(`#${prefijo}-${u.sufijo}`).addEventListener("change", alCambiar));
}

function recolectar(form) {
  const datos = {};
  new FormData(form).forEach((valor, clave) => {
    if (valor instanceof File) return;
    const v = typeof valor === "string" ? valor.trim() : valor;
    if (v === "") datos[clave] = null;
    else if (clave.endsWith("_id") || clave === "ram_gb" || clave === "ranuras_totales")
      datos[clave] = Number(v);
    else if (clave === "almacenamiento_gb" || clave === "precio_plan") datos[clave] = Number(v);
    else datos[clave] = v;
  });
  form.querySelectorAll('input[type="checkbox"]').forEach((ch) => {
    datos[ch.name] = ch.checked;
  });
  return datos;
}

function interruptor(nombre, encendido = true, textos = ["Activo", "Desactivado"]) {
  return `<label class="interruptor">
      <input type="checkbox" name="${nombre}" ${encendido ? "checked" : ""}
             onchange="this.parentElement.querySelector('.texto-interruptor').textContent = this.checked ? '${textos[0]}' : '${textos[1]}'">
      <span class="riel"><span class="perilla"></span></span>
      <span class="texto-interruptor">${encendido ? textos[0] : textos[1]}</span>
    </label>`;
}

async function confirmar(mensaje, textoBoton = "Eliminar") {
  return new Promise((resolve) => {
    abrirModal(
      "Confirmar",
      `<p style="margin:0">${esc(mensaje)}</p>`,
      `<button class="btn-secundario" id="no">Cancelar</button>
       <button class="btn-peligro" id="si">${esc(textoBoton)}</button>`
    );
    $("#no").onclick = () => {
      cerrarModal();
      resolve(false);
    };
    $("#si").onclick = () => {
      cerrarModal();
      resolve(true);
    };
  });
}

// ---------------------------------------------------------------- documentos

function abrirVisor(asignacion, cual) {
  const archivo = cual === "ine" ? asignacion.ine_archivo : asignacion.responsiva_archivo;
  const nombre = cual === "ine" ? asignacion.ine_nombre : asignacion.responsiva_nombre;
  const url = cual === "ine" ? asignacion.ine_url : asignacion.responsiva_url;
  const titulo = cual === "ine" ? "INE" : "Responsiva";

  if (!archivo && !url) {
    toast("No hay documento registrado", "error");
    return;
  }

  let cuerpo;
  if (archivo) {
    const ruta = `/api/adjuntos/${encodeURIComponent(archivo)}`;
    const esImagen = /\.(jpe?g|png|webp)$/i.test(archivo);
    cuerpo = esImagen
      ? `<img class="visor-img" src="${ruta}" alt="${esc(nombre || titulo)}">`
      : `<iframe class="visor" src="${ruta}" title="${esc(nombre || titulo)}"></iframe>`;
  } else {
    cuerpo = `<p>Este documento está guardado fuera del sistema.</p>
      <p><a href="${esc(url)}" target="_blank" rel="noopener" class="codigo">${esc(url)}</a></p>`;
  }

  $("#visor").innerHTML = `
    <div class="fondo-modal">
      <div class="modal ancho">
        <header>
          <h3>${esc(titulo)}${nombre ? " — " + esc(nombre) : ""}</h3>
          <button class="cerrar" type="button">&times;</button>
        </header>
        <div class="cuerpo">${cuerpo}</div>
        <footer>
          ${
            archivo
              ? `<a class="boton btn-secundario" style="text-decoration:none"
                   href="/api/adjuntos/${encodeURIComponent(archivo)}" target="_blank"
                   rel="noopener">Abrir en pestaña nueva</a>`
              : ""
          }
          <button class="btn-primario" id="cerrar-visor">Cerrar</button>
        </footer>
      </div>
    </div>`;

  const cerrar = () => ($("#visor").innerHTML = "");
  $("#visor .cerrar").onclick = cerrar;
  $("#cerrar-visor").onclick = cerrar;
  cerrarAlPulsarFondo($("#visor .fondo-modal"), cerrar);
}

/** Bloque de captura de un documento: estado, fechas y archivo. */
function camposDocumento(cual, asignacion = null) {
  const pre = cual === "ine" ? "ine" : "responsiva";
  const esResp = cual === "responsiva";
  const estado = asignacion?.[`${pre}_estado`] || "PENDIENTE";
  const hoy = hoyISO();

  return `
    <div class="campo">
      <label>Estado</label>
      <select name="${pre}_estado" id="sel-${pre}">
        ${Object.entries(ESTADOS_DOC)
          .map(
            ([clave, info]) =>
              `<option value="${clave}" ${clave === estado ? "selected" : ""}>${esc(info.etiqueta)}</option>`
          )
          .join("")}
      </select>
    </div>
    ${
      esResp
        ? `<div class="rejilla" id="extra-responsiva">
             <div class="campo"><label>Enviada a firmar el</label>
               <input name="responsiva_fecha_envio" type="date"
                      value="${asignacion?.responsiva_fecha_envio || hoy}"></div>
             <div class="campo"><label>Enviada a</label>
               <input name="responsiva_destino" placeholder="Sucursal o persona"
                      value="${esc(asignacion?.responsiva_destino || "")}"></div>
             <div class="campo"><label>Firmada el</label>
               <input name="responsiva_fecha_firma" type="date"
                      value="${asignacion?.responsiva_fecha_firma || ""}"></div>
           </div>`
        : ""
    }
    <div class="campo">${zonaSubida(
      pre,
      "Adjuntar archivo (PDF o imagen)",
      asignacion?.[`${pre}_nombre`]
    )}</div>
    <div class="campo"><label>O enlace externo</label>
      <input name="${pre}_url" value="${esc(asignacion?.[`${pre}_url`] || "")}"
             placeholder="https://drive.google.com/…"></div>`;
}

/** Muestra u oculta las fechas de la responsiva según el estado elegido. */
function activarEstadoDocumento() {
  const sel = $("#sel-responsiva");
  const extra = $("#extra-responsiva");
  if (!sel || !extra) return;
  const refrescar = () => {
    extra.hidden = sel.value === "PENDIENTE" || sel.value === "NO_APLICA";
  };
  sel.onchange = refrescar;
  refrescar();
}

/** Zona de carga de archivo. Guarda el resultado en un campo oculto del formulario. */
function zonaSubida(prefijo, etiqueta, actual = null) {
  return `
    <label class="subida ${actual ? "cargado" : ""}" id="zona-${prefijo}">
      <input type="file" id="file-${prefijo}" accept=".pdf,.jpg,.jpeg,.png,.webp">
      <span id="texto-${prefijo}">${
        actual ? "Adjunto: " + esc(actual) : etiqueta
      }</span>
    </label>
    <input type="hidden" name="${prefijo}_archivo" id="hid-${prefijo}-archivo">
    <input type="hidden" name="${prefijo}_nombre" id="hid-${prefijo}-nombre">`;
}

function activarSubida(prefijo) {
  const input = $(`#file-${prefijo}`);
  if (!input) return;
  input.onchange = async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    const texto = $(`#texto-${prefijo}`);
    texto.textContent = "Subiendo…";
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const r = await api("/api/adjuntos", { method: "POST", body: fd });
      $(`#hid-${prefijo}-archivo`).value = r.archivo;
      $(`#hid-${prefijo}-nombre`).value = r.nombre;
      texto.textContent = "Adjunto: " + r.nombre;
      $(`#zona-${prefijo}`).classList.add("cargado");
    } catch (e) {
      texto.textContent = "Error: " + e.message;
      toast(e.message, "error");
    }
  };
}

function filaDocumento(asignacion, cual) {
  const pre = cual === "ine" ? "ine" : "responsiva";
  const estado = asignacion[`${pre}_estado`] || "PENDIENTE";
  const archivo = asignacion[`${pre}_archivo`];
  const nombre = asignacion[`${pre}_nombre`];
  const url = asignacion[`${pre}_url`];
  const info = ESTADOS_DOC[estado] || ESTADOS_DOC.PENDIENTE;
  const hay = archivo || url;

  let detalle = "";
  if (cual === "responsiva" && estado === "ENVIADA") {
    const partes = [];
    if (asignacion.responsiva_destino) partes.push("a " + asignacion.responsiva_destino);
    if (asignacion.dias_en_espera != null) partes.push(`${asignacion.dias_en_espera} días`);
    if (partes.length) detalle = `<span style="color:var(--texto-tenue);font-size:14px">${esc(partes.join(" · "))}</span>`;
  }
  if (cual === "responsiva" && estado === "FIRMADA" && asignacion.responsiva_fecha_firma)
    detalle = `<span style="color:var(--texto-tenue);font-size:14px">${fecha(asignacion.responsiva_fecha_firma)}</span>`;

  const atrasada =
    cual === "responsiva" && estado === "ENVIADA" && asignacion.dias_en_espera > 21;

  return `<div class="doc-fila">
    <strong style="min-width:92px">${cual === "ine" ? "INE" : "Responsiva"}</strong>
    <span class="insignia ${atrasada ? "peligro" : info.insignia}">${
      atrasada ? "Atrasada" : info.etiqueta
    }</span>
    ${detalle}
    <span class="nombre-doc ${hay ? "" : "sin-doc"}">${
      hay ? esc(nombre || url) : "Sin documento adjunto"
    }</span>
    ${
      hay
        ? `<button class="btn-secundario btn-mini" data-ver="${cual}" data-asig="${asignacion.id}">Ver</button>`
        : ""
    }
  </div>`;
}

function activarBotonesDocumento(asignaciones) {
  document.querySelectorAll("[data-ver]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const asig = asignaciones.find((a) => String(a.id) === b.dataset.asig);
      if (asig) abrirVisor(asig, b.dataset.ver);
    };
  });
}

// ---------------------------------------------------------------- sesión

function mostrarLogin() {
  $("#login").hidden = false;
  $("#app").hidden = true;
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  $("#error-login").innerHTML = "";
  try {
    estado.usuario = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#usuario").value.trim(),
        password: $("#password").value,
      }),
    });
    if (estado.usuario.password_por_defecto) return cambioObligatorio();
    await arrancar();
  } catch (e) {
    $("#error-login").innerHTML = `<div class="aviso error">${esc(e.message)}</div>`;
  }
}

const ROL_TEXTO = { ADMIN: "Administrador", CAPTURA: "Captura", CONSULTA: "Consulta" };

// Foto de perfil si la tiene; si no, las iniciales
function pintarAvatar(el, u) {
  el.classList.toggle("con-foto", Boolean(u.foto));
  el.style.backgroundImage = u.foto ? `url("/api/adjuntos/${u.foto}")` : "";
  el.textContent = u.foto ? "" : iniciales(u.nombre);
}

const htmlAvatar = (u, clase = "") =>
  u.foto
    ? `<span class="avatar con-foto ${clase}" style="background-image:url('/api/adjuntos/${esc(u.foto)}')"></span>`
    : `<span class="avatar ${clase}">${esc(iniciales(u.nombre))}</span>`;

function iniciales(nombre) {
  return (nombre || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

async function arrancar() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  const u = estado.usuario;
  $("#sesion-nombre").textContent = u.nombre;
  $("#sesion-rol").textContent = ROL_TEXTO[u.rol] || u.rol;
  $("#nombre-barra").textContent = u.nombre.split(" ")[0];
  $("#nombre-menu-usuario").textContent = u.nombre;
  $("#rol-menu-usuario").textContent = `${u.username} · ${ROL_TEXTO[u.rol] || u.rol}`;
  ["#avatar-menu", "#avatar-barra", "#avatar-menu-usuario"].forEach((s) => pintarAvatar($(s), u));
  $("#nav-usuarios").hidden = !esAdmin();
  $("#nav-contrasenas").hidden = !puedeEditar();
  await recargarCatalogos();
  await refrescarContadorAlertas();
  irA(estado.vista);
  avisarVencimientos();
}

// Una vez por sesión: licencias que vencen en 60 días o menos
function avisarVencimientos() {
  const a = estado.avisos;
  if (!a || !a.porVencer) return;
  try {
    if (sessionStorage.getItem("aviso-vencimientos")) return;
    sessionStorage.setItem("aviso-vencimientos", "1");
  } catch (_) {}
  const cuando = a.proxima < 0 ? "una ya venció" : `la más próxima en ${a.proxima} día(s)`;
  toast(`${a.porVencer} familia(s) de licencias vencen en 60 días o menos · ${cuando}`,
    a.proxima <= 30 ? "error" : "aviso", () => irA("alertas"));
}

async function recargarCatalogos() {
  estado.catalogos = await api("/api/catalogos");
}

async function refrescarContadorAlertas() {
  try {
    const [alertas, notas, notif] = await Promise.all([
      api("/api/alertas"),
      api("/api/notas"),
      api("/api/notificaciones"),
    ]);
    const cnf = $("#cont-notif");
    cnf.textContent = notif.length;
    cnf.hidden = notif.length === 0;
    const criticas = alertas.filter((a) => a.severidad === "critica").length;
    const contador = $("#cont-alertas");
    contador.textContent = criticas;
    contador.hidden = criticas === 0;

    const abiertas = notas.filter((n) => n.estado !== "RESUELTA").length;
    const cn = $("#cont-notas");
    cn.textContent = abiertas;
    cn.hidden = abiertas === 0;

    const porVencer = alertas.filter((a) => a.tipo === "licencia_por_vencer");
    const porVencerMedias = porVencer.filter((a) => a.severidad !== "critica").length;
    estado.avisos = {
      notif: notif.length, criticas, notas: abiertas, alertas: alertas.length,
      porVencer: porVencer.length,
      proxima: porVencer.reduce((m, a) => Math.min(m, a.dias), Infinity),
    };
    const total = notif.length + criticas + porVencerMedias;
    const campana = $("#cont-campana");
    campana.textContent = total > 99 ? "99+" : total;
    campana.hidden = total === 0;
  } catch (_) {}
}

// ---------------------------------------------------------------- barra superior

const TEMAS = {
  neon: { nombre: "Noche", muestras: ["#00D1FF", "#FF3D9A", "#1E1A38"] },
  aurora: { nombre: "Aurora", muestras: ["#00FF9F", "#00B8FF", "#BD00FF"] },
  carmesi: { nombre: "Carmesí", muestras: ["#55EAD4", "#C5003C", "#F3E600"] },
  grafito: { nombre: "Grafito", muestras: ["#46EBEB", "#FB0A26", "#192F22"] },
  claro: { nombre: "Claro", muestras: ["#0284C7", "#D6246E", "#F1F4F9"] },
};

function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch (_) {}
}

function aplicarTema(clave) {
  document.documentElement.dataset.tema = clave;
  guardarPreferencia("tema", clave);
  cerrarFlotantes();
  if (estado.usuario) irA(estado.vista);
}

function cerrarFlotantes(excepto = null) {
  document.querySelectorAll(".flotante").forEach((f) => {
    if (f !== excepto) f.hidden = true;
  });
}

function alternarFlotante(id, pintar) {
  const f = $(id);
  const abrir = f.hidden;
  cerrarFlotantes(f);
  if (abrir && pintar) pintar(f);
  f.hidden = !abrir;
}

function pintarMenuTema(f) {
  const actual = document.documentElement.dataset.tema || "neon";
  f.innerHTML =
    `<div class="flotante-titulo">Tema de color</div>` +
    Object.entries(TEMAS)
      .map(
        ([clave, t]) => `<button class="opcion ${clave === actual ? "activa" : ""}" data-elegir-tema="${clave}">
          ${clave === actual ? icono("check") : '<svg viewBox="0 0 24 24"></svg>'}
          <span>${esc(t.nombre)}</span>
          <span class="muestras">${t.muestras.map((c) => `<i style="background:${c}"></i>`).join("")}</span>
        </button>`
      )
      .join("");
  f.querySelectorAll("[data-elegir-tema]").forEach(
    (b) => (b.onclick = () => aplicarTema(b.dataset.elegirTema))
  );
}

function pintarMenuCampana(f) {
  const a = estado.avisos || { notif: 0, criticas: 0, notas: 0, alertas: 0, porVencer: 0 };
  const fila = (vista, ico, titulo, detalle, cifra) => `
    <button class="opcion" data-ir="${vista}">
      <span class="ico">${icono(ico)}</span>
      <span class="texto-opcion"><b>${titulo}</b><small>${detalle}</small></span>
      <span class="cifra-opcion">${cifra}</span>
    </button>`;
  f.innerHTML =
    `<div class="flotante-titulo">Avisos</div>` +
    fila("licencias", "calendario", "Licencias por vencer",
      a.porVencer
        ? `La más próxima ${a.proxima < 0 ? "ya venció" : `en ${a.proxima} día(s)`}`
        : "Ninguna en los próximos 60 días",
      a.porVencer) +
    fila("notificaciones", "documento", "Responsivas por recibir", "Sin enviar o en espera de firma", a.notif) +
    fila("alertas", "alertas", "Alertas críticas", `${a.alertas} alertas en total`, a.criticas) +
    fila("notas", "notas", "Notas abiertas", "Pendientes del equipo", a.notas);
  f.querySelectorAll("[data-ir]").forEach((b) => {
    b.onclick = () => {
      cerrarFlotantes();
      irA(b.dataset.ir);
    };
  });
}

let temporizadorBusqueda = null;
let resultadosBusqueda = [];

async function buscarGlobal() {
  const q = $("#busqueda-global").value.trim();
  const caja = $("#resultados-busqueda");
  if (q.length < 2) {
    caja.hidden = true;
    return;
  }
  const consulta = encodeURIComponent(q);
  const [personas, activos] = await Promise.all([
    api(`/api/empleados?q=${consulta}`, { silencioso: true }).catch(() => []),
    api(`/api/activos?q=${consulta}`, { silencioso: true }).catch(() => []),
  ]);
  if ($("#busqueda-global").value.trim() !== q) return;

  resultadosBusqueda = [
    ...personas.slice(0, 5).map((e) => ({
      grupo: "Personas",
      ico: "empleados",
      titulo: e.nombre_completo,
      detalle: [e.codigo, e.departamento, e.sucursal].filter(Boolean).join(" · "),
      abrir: () => verFichaEmpleado(e.id),
    })),
    ...activos.slice(0, 7).map((a) => ({
      grupo: "Activos y servicios",
      ico: ICONO_TIPO[a.tipo] || "equipos",
      titulo: `${a.codigo} · ${a.descripcion || TIPOS[a.tipo]}`,
      detalle: `${TIPOS[a.tipo] || a.tipo} · ${a.asignado_a ? a.asignado_a.empleado : "Sin asignar"}`,
      abrir: () => verFichaActivo(a.id, SECCION_TIPO[a.tipo] || "equipos"),
    })),
  ];

  let grupo = "";
  caja.innerHTML = resultadosBusqueda.length
    ? resultadosBusqueda
        .map((r, i) => {
          const cab = r.grupo !== grupo ? `<div class="flotante-titulo">${r.grupo}</div>` : "";
          grupo = r.grupo;
          return `${cab}<button class="opcion ${i === 0 ? "enfocada" : ""}" data-res="${i}">
            <span class="ico">${icono(r.ico)}</span>
            <span class="texto-opcion"><b>${esc(r.titulo)}</b><small>${esc(r.detalle)}</small></span>
          </button>`;
        })
        .join("")
    : `<div class="vacio">Sin resultados para «${esc(q)}».</div>`;
  caja.hidden = false;
  caja.querySelectorAll("[data-res]").forEach((b) => {
    b.onclick = () => abrirResultado(Number(b.dataset.res));
  });
}

function abrirResultado(i) {
  const r = resultadosBusqueda[i];
  if (!r) return;
  $("#resultados-busqueda").hidden = true;
  $("#busqueda-global").value = "";
  $("#busqueda-global").blur();
  r.abrir();
}

function moverSeleccion(paso) {
  const opciones = [...document.querySelectorAll("#resultados-busqueda [data-res]")];
  if (!opciones.length) return;
  const actual = opciones.findIndex((o) => o.classList.contains("enfocada"));
  const siguiente = (actual + paso + opciones.length) % opciones.length;
  opciones.forEach((o, i) => o.classList.toggle("enfocada", i === siguiente));
  opciones[siguiente].scrollIntoView({ block: "nearest" });
}

function iniciarBarraSuperior() {
  const entrada = $("#busqueda-global");
  entrada.oninput = () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(buscarGlobal, 220);
  };
  entrada.onfocus = () => {
    if (entrada.value.trim().length >= 2) buscarGlobal();
  };
  entrada.onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moverSeleccion(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moverSeleccion(-1); }
    else if (e.key === "Enter") {
      const enfocada = $("#resultados-busqueda .enfocada");
      if (enfocada) abrirResultado(Number(enfocada.dataset.res));
    }
  };

  $("#btn-tema").onclick = () => alternarFlotante("#menu-tema", pintarMenuTema);
  $("#btn-campana").onclick = () => alternarFlotante("#menu-campana", pintarMenuCampana);
  $("#btn-usuario").onclick = () => alternarFlotante("#menu-usuario");
  $("#btn-mi-perfil").onclick = () => {
    cerrarFlotantes();
    modalPerfil();
  };
  $("#btn-mi-password").onclick = () => {
    cerrarFlotantes();
    modalPassword();
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ancla, .buscador-global")) cerrarFlotantes();
  });
  document.addEventListener("keydown", (e) => {
    const escribiendo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    if (e.key === "/" && !escribiendo && estado.usuario && !$("#modal").innerHTML) {
      e.preventDefault();
      entrada.focus();
    }
    if (e.key === "Escape") cerrarFlotantes();
  });

  // Título y ruta de la barra según el grupo del menú
  let grupo = "";
  estado.titulos = {};
  document.querySelectorAll("#nav > *").forEach((el) => {
    if (el.classList.contains("nav-grupo")) grupo = el.textContent.trim();
    else if (el.dataset.vista) {
      const texto = el.querySelector("span").textContent.trim();
      estado.titulos[el.dataset.vista] = { texto, grupo };
      el.title = texto;
    }
  });
}

// ---------------------------------------------------------------- navegación

function menuMovil(abrir) {
  document.body.classList.toggle("menu-abierto", abrir);
  $("#btn-menu").setAttribute("aria-expanded", String(abrir));
}

function irA(vista) {
  if (vista === "contrasenas" && !puedeEditar()) vista = "tablero";
  estado.vista = vista;
  menuMovil(false);
  cerrarFlotantes();
  const titulo = estado.titulos?.[vista];
  if (titulo) {
    $("#barra-titulo").textContent = titulo.texto;
    $("#barra-migas").textContent = `Panel · ${titulo.grupo} · ${titulo.texto}`;
    document.title = `${titulo.texto} — Panel de control TI`;
  }
  document
    .querySelectorAll("#nav button")
    .forEach((b) => b.classList.toggle("activo", b.dataset.vista === vista));

  if (vista === "licencias") return verLicencias();
  if (vista === "impresoras") return verImpresoras();
  if (vista === "contrasenas") return verContrasenas();
  if (SECCIONES[vista]) return verSeccion(vista);
  ({
    tablero: verTablero,
    empleados: verEmpleados,
    auditorias: verAuditorias,
    verificacion: verVerificacion,
    notificaciones: verNotificaciones,
    notas: verNotas,
    alertas: verAlertas,
    reportes: verReportes,
    catalogos: verCatalogos,
    usuarios: verUsuarios,
    bitacora: verBitacora,
  })[vista]();
}

// ---------------------------------------------------------------- tablero

async function verTablero() {
  const [t, alertas, bitacora] = await Promise.all([
    api("/api/tablero"),
    api("/api/alertas"),
    api("/api/bitacora?limite=7"),
  ]);
  const criticas = alertas.filter((a) => a.severidad === "critica");
  const porRecibir = t.responsivas_pendientes + t.responsivas_en_espera;
  const renovaciones = t.vencimientos_licencias.filter((v) => v.dias !== null && v.dias <= 60).length;

  const barras = (tipos) => {
    const filas = tipos.map((tipo) => [tipo, t.por_tipo[tipo] || 0]).filter(([, n]) => n);
    const tope = Math.max(1, ...filas.map(([, n]) => n));
    return filas
      .sort((a, b) => b[1] - a[1])
      .map(
        ([tipo, n], i) => `
          <div class="barra-fila">
            <div class="nombre">${esc(TIPOS[tipo] || tipo)}</div>
            <div class="pista"><div class="relleno" style="width:${(n / tope) * 100}%;animation-delay:${i * 60}ms"></div></div>
            <div class="cifra">${n}</div>
          </div>`
      )
      .join("");
  };
  const barrasActivos = barras(TIPOS_FISICOS);
  const barrasServicios = barras(Object.keys(TIPOS).filter((x) => !TIPOS_FISICOS.includes(x)));

  const kpis = [
    { valor: t.empleados_activos, etiqueta: "Empleados activos", pie: `${t.empleados_baja} dados de baja`,
      icono: "empleados", color: "var(--graf-1)", ir: "empleados", enlace: "Ver empleados" },
    { valor: t.total_activos, etiqueta: "Activos registrados",
      pie: `${t.activos_asignados} asignados · ${t.activos_disponibles} libres`,
      icono: "equipos", color: "var(--graf-3)", ir: "equipos", enlace: "Ver equipos" },
    { valor: t.total_servicios, etiqueta: "Licencias y correos", pie: "Microsoft 365, Norton y Workspace",
      icono: "licencias", color: "var(--graf-2)", ir: "licencias", enlace: "Ver licencias" },
    { valor: porRecibir, etiqueta: "Responsivas por recibir",
      pie: `${t.responsivas_pendientes} sin enviar · ${t.responsivas_en_espera} en firma`,
      icono: "documento", color: "var(--alerta)", ir: "notificaciones", enlace: "Ver notificaciones" },
    { valor: renovaciones, etiqueta: "Renovaciones en 60 días", pie: `${t.vencimientos_licencias.length} familias y cuentas`,
      icono: "calendario", color: "var(--acento)", ir: "licencias", enlace: "Ver vencimientos" },
    { valor: criticas.length, etiqueta: "Alertas críticas", pie: `${alertas.length} alertas en total`,
      icono: "alertas", color: "var(--peligro)", ir: "alertas", enlace: "Ver alertas" },
  ];

  const accesos = [
    { texto: "Nuevo empleado", icono: "empleados", c: "var(--graf-1)", accion: () => modalEmpleado() },
    { texto: "Alta de equipo", icono: "equipos", c: "var(--graf-3)", accion: () => modalAltaEquipo() },
    { texto: "Alta de tablet", icono: "tabletas", c: "var(--graf-1)", accion: () => modalAltaEquipo("TABLETA") },
    { texto: "Nueva línea", icono: "telefonia", c: "var(--graf-2)",
      accion: () => modalActivo(null, "TELEFONO", ["TELEFONO"]) },
    { texto: "Asignar activo", icono: "asignar", c: "var(--primario)", accion: () => modalAsignar() },
    { texto: "Nueva licencia", icono: "licencias", c: "var(--graf-1)",
      accion: () => modalActivo(null, "LICENCIA_MICROSOFT", ["LICENCIA_MICROSOFT", "LICENCIA_NORTON"]) },
    { texto: "Nuevo correo", icono: "correos", c: "var(--graf-3)",
      accion: () => modalActivo(null, "CORREO_WORKSPACE", ["CORREO_WORKSPACE"]) },
    { texto: "Nueva nota", icono: "notas", c: "var(--alerta)", accion: () => modalNota() },
    { texto: "Exportar a Excel", icono: "descargar", c: "var(--graf-2)", siempre: true,
      accion: () => (location.href = "/api/reportes/exportar") },
  ].filter((a) => a.siempre || puedeEditar());

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Tablero</h2><p>Resumen general de activos, servicios y pendientes</p></div>
      ${
        estado.usuario.password_por_defecto
          ? `<div class="aviso warn" style="margin:0">La contraseña sigue siendo la de fábrica.
             <button class="btn-secundario btn-mini" id="btn-pass">Cambiarla</button></div>`
          : ""
      }
    </div>

    <div class="kpis">
      ${kpis
        .map(
          (k, i) => `<button class="tarjeta kpi" data-ir="${k.ir}" style="--kpi:${k.color};--i:${i}">
            <div class="kpi-cuerpo">
              <div class="valor">${k.valor}</div>
              <div class="etiqueta">${esc(k.etiqueta)}</div>
              <div class="pie">${esc(k.pie)}</div>
            </div>
            <span class="kpi-pie">${esc(k.enlace)}${icono("flecha")}</span>
          </button>`
        )
        .join("")}
    </div>

    <div class="rejilla-tablero">
      <div class="panel span-8" style="--i:0">
        <h3>Accesos rápidos</h3>
        <div class="accesos">
          ${accesos
            .map(
              (a, i) => `<button class="acceso" data-acceso="${i}" style="--c:${a.c};--i:${i}">
                <span class="ico">${icono(a.icono)}</span>${esc(a.texto)}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="panel span-4" style="--i:1">
        <div class="panel-cab">
          <h3>Atención inmediata</h3>
          <button class="btn-secundario btn-mini" data-ir="alertas">Ver alertas</button>
        </div>
        ${
          criticas.length
            ? criticas.slice(0, 5).map(itemAlerta).join("")
            : `<div class="vacio">Sin alertas críticas.</div>`
        }
      </div>

      <div class="panel span-6" style="--i:2">
        <h3>Activos por departamento</h3>
        <div id="graf-departamentos"></div>
      </div>

      <div class="panel span-6" style="--i:3">
        <div class="panel-cab">
          <h3>Vencimientos de licencias</h3>
          <button class="btn-secundario btn-mini" data-ir="licencias">Ver licencias</button>
        </div>
        <div id="lista-vencimientos"></div>
      </div>

      <div class="panel span-8" style="--i:4">
        <h3>Movimientos de activos</h3>
        <div id="graf-movimientos"><div class="vacio">Cargando…</div></div>
      </div>

      <div class="panel span-4" style="--i:5">
        <div class="panel-cab">
          <h3>Actividad reciente</h3>
          <button class="btn-secundario btn-mini" data-ir="bitacora">Bitácora</button>
        </div>
        <div class="actividad">${
          bitacora.length
            ? bitacora.map(filaActividad).join("")
            : `<div class="vacio">Sin movimientos registrados.</div>`
        }</div>
      </div>

      <div class="panel span-4" style="--i:6">
        <h3>Activos por tipo</h3>
        ${barrasActivos || `<div class="vacio">Aún no hay activos capturados.</div>`}
      </div>

      <div class="panel span-4" style="--i:7">
        <h3>Licencias y correos</h3>
        ${barrasServicios || `<div class="vacio">Aún no hay licencias ni correos.</div>`}
      </div>

      <div class="panel span-4" style="--i:8">
        <h3>Quién concentra más activos</h3>
        <div id="graf-ranking"><div class="vacio">Cargando…</div></div>
      </div>
    </div>`;

  pintarIconos($("#vista"));
  const btnPass = $("#btn-pass");
  if (btnPass) btnPass.onclick = modalPassword;
  document.querySelectorAll("#vista [data-ir]").forEach((b) => (b.onclick = () => irA(b.dataset.ir)));
  activarAlertas($("#vista"), criticas);
  document.querySelectorAll("#vista [data-acceso]").forEach((b) => {
    b.onclick = () => accesos[Number(b.dataset.acceso)].accion();
  });

  dibujarDepartamentos(t.por_departamento);
  dibujarVencimientos(t.vencimientos_licencias);
  cargarGraficas();
}

const ACCIONES_BITACORA = {
  CREAR: { verbo: "registró", icono: "mas", c: "var(--ok)" },
  EDITAR: { verbo: "editó", icono: "editar", c: "var(--primario)" },
  ELIMINAR: { verbo: "eliminó", icono: "eliminar", c: "var(--peligro)" },
  ASIGNAR: { verbo: "asignó", icono: "asignar", c: "var(--acento)", frase: "asignó un activo" },
  DEVOLVER: { verbo: "recibió", icono: "asignar", c: "var(--alerta)", frase: "recibió un activo de vuelta" },
};

const ENTIDADES = {
  empleado: "empleado", activo: "activo", asignacion: "asignación", usuario: "usuario",
  cuenta_licencia: "familia de licencias", nota: "nota", auditoria: "auditoría",
  catalogo: "catálogo", sistema: "sistema", accesos: "accesos",
  impresora: "impresora", correos: "correos", red: "red", verificacion: "número",
};

function hace(fechaTexto) {
  const segundos = Math.max(0, (Date.now() - comoUTC(fechaTexto)) / 1000);
  if (segundos < 60) return "ahora";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias < 30 ? `hace ${dias} d` : comoUTC(fechaTexto).toLocaleDateString("es-MX", { timeZone: ZONA_HORARIA });
}

function filaActividad(b, i) {
  const info = ACCIONES_BITACORA[b.accion] || { verbo: b.accion.toLowerCase(), icono: "bitacora", c: "var(--texto-tenue)" };
  return `<div class="actividad-fila" style="--c:${info.c};--i:${i}">
    <span class="ico">${icono(info.icono)}</span>
    <div style="min-width:0">
      <div class="que"><b>${esc(b.usuario || "Sistema")}</b> ${esc(
        info.frase || `${info.verbo} ${ENTIDADES[b.entidad] || b.entidad}`
      )}</div>
      <small>${esc(b.detalle || "")}</small>
    </div>
    <time>${hace(b.fecha)}</time>
  </div>`;
}

// Los colores de gráfica salen del tema activo; cada tema los valida contra su superficie
const colorTema = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
const serie1 = () => colorTema("--graf-1");
const serie2 = () => colorTema("--graf-2");

function arcoDona(cx, cy, R, r, a0, a1) {
  const punto = (radio, a) => [cx + radio * Math.sin(a), cy - radio * Math.cos(a)];
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = punto(R, a0), [x1, y1] = punto(R, a1);
  const [x2, y2] = punto(r, a1), [x3, y3] = punto(r, a0);
  return `M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2}
          A${r},${r} 0 ${grande} 0 ${x3},${y3} Z`;
}

function dibujarDepartamentos(filas) {
  const caja = $("#graf-departamentos");
  if (!filas.length) {
    caja.innerHTML = `<div class="vacio">Aún no hay activos asignados.</div>`;
    return;
  }
  // Tres departamentos con color propio; el resto se agrupa en "Otros"
  const principales = filas.length > 4 ? filas.slice(0, 3) : filas.slice(0, 4);
  const resto = filas.slice(principales.length);
  const rebanadas = principales.map((f, i) => ({
    nombre: f.departamento,
    valor: f.activos,
    color: colorTema(`--graf-${i + 1}`),
  }));
  if (resto.length)
    rebanadas.push({
      nombre: `Otros (${resto.length})`,
      valor: resto.reduce((s, f) => s + f.activos, 0),
      color: colorTema("--graf-otros"),
      detalle: resto.map((f) => `${esc(f.departamento)}: ${f.activos}`).join("<br>"),
    });
  const total = rebanadas.reduce((s, r) => s + r.valor, 0);

  const C = 110, R = 100, r = 64;
  let angulo = 0;
  const trazos = rebanadas
    .map((s, i) => {
      const barrido = (s.valor / total) * Math.PI * 2;
      const a0 = angulo;
      angulo += barrido;
      const d =
        barrido >= Math.PI * 2 - 1e-6
          ? arcoDona(C, C, R, r, 0, Math.PI) + arcoDona(C, C, R, r, Math.PI, Math.PI * 2)
          : arcoDona(C, C, R, r, a0, angulo);
      return `<path class="rebanada" data-i="${i}" d="${d}" fill="${s.color}"
                style="animation-delay:${i * 70}ms"></path>`;
    })
    .join("");

  const pct = (v) => `${Math.round((v / total) * 100)}%`;
  caja.innerHTML = `
    <div class="dona">
      <svg viewBox="0 0 220 220" class="dona-svg" role="img"
           aria-label="Activos asignados por departamento">
        ${trazos}
        <text x="${C}" y="${C - 4}" text-anchor="middle" class="dona-total">${total}</text>
        <text x="${C}" y="${C + 18}" text-anchor="middle" class="dona-sub">asignados</text>
      </svg>
      <div class="dona-leyenda">
        ${rebanadas
          .map(
            (s, i) => `<div class="dona-fila" data-i="${i}">
              <i style="background:${s.color}"></i>
              <span class="dona-nombre">${esc(s.nombre)}</span>
              <span class="dona-valor">${s.valor}</span>
              <span class="dona-pct">${pct(s.valor)}</span>
            </div>`
          )
          .join("")}
        ${
          resto.length
            ? `<div class="dona-desglose">${resto
                .map((f) => `<div><span>${esc(f.departamento)}</span><span>${f.activos}</span></div>`)
                .join("")}</div>`
            : ""
        }
      </div>
    </div>`;

  const resaltar = (i) =>
    caja.querySelectorAll("[data-i]").forEach((el) =>
      el.classList.toggle("atenuada", i !== null && el.dataset.i !== String(i))
    );
  caja.querySelectorAll("[data-i]").forEach((el) => {
    const s = rebanadas[Number(el.dataset.i)];
    el.onmousemove = (e) => {
      resaltar(el.dataset.i);
      tooltipGrafica(
        `<strong>${esc(s.nombre)}</strong>
         <div><i style="background:${s.color}"></i>${s.valor} activo(s) · ${pct(s.valor)}</div>
         ${s.detalle ? `<div style="display:block;margin-top:4px">${s.detalle}</div>` : ""}`,
        e
      );
    };
    el.onmouseleave = () => {
      resaltar(null);
      ocultarTooltip();
    };
  });
}

function dibujarVencimientos(lista) {
  const caja = $("#lista-vencimientos");
  if (!lista.length) {
    caja.innerHTML = `<div class="vacio">No hay familias de licencias registradas.</div>`;
    return;
  }
  const estadoDe = (v) => {
    if (v.dias === null) return ["neutra", "Sin fecha"];
    const dias = (n) => `${n} día${n === 1 ? "" : "s"}`;
    if (v.dias < 0) return ["peligro", `Venció hace ${dias(-v.dias)}`];
    if (v.dias === 0) return ["peligro", "Vence hoy"];
    if (v.dias <= 30) return ["peligro", `Vence en ${dias(v.dias)}`];
    if (v.dias <= 60) return ["alerta", `Vence en ${dias(v.dias)}`];
    return ["ok", `Vence en ${dias(v.dias)}`];
  };
  caja.innerHTML = lista
    .slice(0, 8)
    .map((v) => {
      const [tono, texto] = estadoDe(v);
      return `<div class="vence-fila">
        <span class="vence-producto ${v.producto === "NORTON" ? "norton" : "microsoft"}">${
          v.producto === "NORTON" ? "Norton" : "Microsoft"
        }</span>
        <div class="vence-cuenta">
          <b>${esc(v.nombre)}</b>
          <small>${esc(v.correo || "")}${v.licencias ? ` · ${v.licencias} licencia(s)` : ""}</small>
        </div>
        <div class="vence-fecha">${v.fecha ? fecha(v.fecha) : "—"}</div>
        <span class="insignia ${tono}">${texto}</span>
      </div>`;
    })
    .join("");
}

async function cargarGraficas() {
  const [mov, top] = await Promise.all([
    api("/api/graficas/movimientos?meses=12"),
    api("/api/graficas/top-empleados?limite=8"),
  ]);
  dibujarMovimientos(mov);
  dibujarRanking(top);
}

// ---------------------------------------------------------------- gráficas


function tooltipGrafica(html, evento) {
  let tip = $("#tip-graf");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tip-graf";
    tip.className = "tooltip-grafica";
    document.body.append(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const ancho = tip.offsetWidth;
  const alto = tip.offsetHeight;
  let x = evento.clientX + 14;
  let y = evento.clientY - alto - 10;
  if (x + ancho > window.innerWidth - 8) x = evento.clientX - ancho - 14;
  if (y < 8) y = evento.clientY + 18;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

function ocultarTooltip() {
  const tip = $("#tip-graf");
  if (tip) tip.hidden = true;
}

/** Barra vertical con el extremo del dato redondeado y la base a ras del eje. */
function barraVertical(x, y, ancho, alto, radio = 4) {
  if (alto <= 0) return "";
  const r = Math.min(radio, ancho / 2, alto);
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y}
          L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r}
          L${x + ancho},${y + alto} Z`;
}

function dibujarMovimientos(datos) {
  const caja = $("#graf-movimientos");
  const serie = datos.serie;
  if (!serie.some((s) => s.asignaciones || s.devoluciones)) {
    caja.innerHTML = `<div class="vacio">Todavía no hay movimientos registrados.</div>`;
    return;
  }

  const W = 900, H = 260;
  const M = { arriba: 16, derecha: 12, abajo: 34, izquierda: 42 };
  const ancho = W - M.izquierda - M.derecha;
  const alto = H - M.arriba - M.abajo;
  const maximo = Math.max(1, ...serie.flatMap((s) => [s.asignaciones, s.devoluciones]));
  // Escala redondeada hacia arriba para que la cuadrícula caiga en números limpios
  const tope = Math.ceil(maximo / 4) * 4 || 4;
  const paso = ancho / serie.length;
  const anchoBarra = Math.max(5, Math.min(16, paso / 2 - 3));

  const y = (v) => M.arriba + alto - (v / tope) * alto;

  let marcas = "";
  for (let i = 0; i <= 4; i++) {
    const v = (tope / 4) * i;
    const py = y(v);
    marcas += `<line class="rejilla" x1="${M.izquierda}" y1="${py}" x2="${W - M.derecha}" y2="${py}"/>
      <text x="${M.izquierda - 9}" y="${py + 4}" text-anchor="end">${v}</text>`;
  }

  let barras = "";
  serie.forEach((s, i) => {
    const centro = M.izquierda + paso * i + paso / 2;
    // 2px de separación entre las dos barras del mismo mes
    const x1 = centro - anchoBarra - 1;
    const x2 = centro + 1;
    const retardo = i * 35;
    barras += `<g class="grupo-barras" data-i="${i}">
      <path class="barra" style="animation-delay:${retardo}ms"
            d="${barraVertical(x1, y(s.asignaciones), anchoBarra, alto - (y(s.asignaciones) - M.arriba))}" fill="${serie1()}"/>
      <path class="barra" style="animation-delay:${retardo + 60}ms"
            d="${barraVertical(x2, y(s.devoluciones), anchoBarra, alto - (y(s.devoluciones) - M.arriba))}" fill="${serie2()}"/>
    </g>
    <rect class="zona-hover" x="${M.izquierda + paso * i}" y="${M.arriba}" width="${paso}" height="${alto}" data-i="${i}"/>
    <text x="${centro}" y="${H - 12}" text-anchor="middle">${esc(s.etiqueta)}</text>`;
  });

  caja.innerHTML = `
    <div class="leyenda">
      <span><i style="background:${serie1()}"></i> Asignaciones</span>
      <span><i style="background:${serie2()}"></i> Devoluciones</span>
    </div>
    <svg class="grafica" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
         role="img" aria-label="Asignaciones y devoluciones por mes">
      ${marcas}
      <line class="eje" x1="${M.izquierda}" y1="${M.arriba + alto}" x2="${W - M.derecha}" y2="${M.arriba + alto}"/>
      ${barras}
    </svg>
    <div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:14.5px;color:var(--texto-tenue)">
      <span><b style="color:var(--texto)">${datos.total_asignaciones}</b> asignaciones en el periodo</span>
      <span><b style="color:var(--texto)">${datos.total_devoluciones}</b> devoluciones</span>
      <span><b style="color:var(--texto)">${datos.activos_reasignados}</b> activos han cambiado de responsable</span>
    </div>`;

  caja.querySelectorAll(".zona-hover").forEach((zona) => {
    const s = serie[Number(zona.dataset.i)];
    zona.onmousemove = (e) =>
      tooltipGrafica(
        `<strong>${esc(s.etiqueta)}</strong>
         <div><i style="background:${serie1()}"></i> ${s.asignaciones} asignaciones</div>
         <div><i style="background:${serie2()}"></i> ${s.devoluciones} devoluciones</div>`,
        e
      );
    zona.onmouseleave = ocultarTooltip;
  });
}

function dibujarRanking(filas) {
  const caja = $("#graf-ranking");
  if (!filas.length) {
    caja.innerHTML = `<div class="vacio">Aún no hay activos asignados.</div>`;
    return;
  }
  const maximo = Math.max(...filas.map((f) => f.total));

  caja.innerHTML = filas
    .map((f, i) => {
      const detalle = Object.entries(f.por_tipo)
        .map(([tipo, n]) => `${TIPOS[tipo] || tipo}: ${n}`)
        .join(" · ");
      return `<div class="fila-ranking" data-i="${i}">
        <div class="puesto">${i + 1}</div>
        <div class="persona">
          <b>${esc(f.nombre)}</b>
          <small>${esc([f.departamento, f.sucursal].filter(Boolean).join(" · ") || f.codigo)}</small>
          <div class="pista" style="margin-top:6px">
            <div class="relleno" style="width:${(f.total / maximo) * 100}%;background:${serie1()};animation-delay:${i * 60}ms"></div>
          </div>
        </div>
        <div style="text-align:right">
          <b style="font-size:19.5px;font-variant-numeric:tabular-nums">${f.total}</b>
          <div style="font-size:13px;color:var(--texto-tenue)">activos</div>
        </div>
      </div>`;
    })
    .join("");

  caja.querySelectorAll(".fila-ranking").forEach((fila) => {
    const f = filas[Number(fila.dataset.i)];
    fila.onmousemove = (e) =>
      tooltipGrafica(
        `<strong>${esc(f.nombre)}</strong>` +
          Object.entries(f.por_tipo)
            .map(([tipo, n]) => `<div><i style="background:${serie1()}"></i> ${esc(TIPOS[tipo] || tipo)}: ${n}</div>`)
            .join(""),
        e
      );
    fila.onmouseleave = ocultarTooltip;
  });
}

