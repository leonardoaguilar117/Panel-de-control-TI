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

