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

// ---------------------------------------------------------------- empleados

async function verEmpleados() {
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Empleados</h2><p>Personas y los activos que tienen asignados</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-secundario" id="btn-exportar">Exportar a Excel</button>
        ${puedeEditar() ? `<button class="btn-primario" id="btn-nuevo">Nuevo empleado</button>` : ""}
      </div>
    </div>
    <div class="filtros">
      <div class="campo busqueda"><label>Buscar</label>
        <input id="f-q" placeholder="Nombre, código o correo…"></div>
      ${filtrosUbicacion("f")}
      <div class="campo"><label>Estatus</label>
        <select id="f-est"><option value="">Todos</option><option value="ACTIVO">Activo</option><option value="BAJA">Baja</option></select></div>
    </div>
    <div id="tabla-empleados"></div>`;

  $("#btn-exportar").onclick = () => (location.href = "/api/empleados/exportar?" + filtrosEmpleados());
  if (puedeEditar()) $("#btn-nuevo").onclick = () => modalEmpleado();
  ["f-q", "f-est"].forEach((id) => {
    const el = $("#" + id);
    el.oninput = cargarEmpleados;
    el.onchange = cargarEmpleados;
  });
  enlazarUbicacion("f", cargarEmpleados);
  cargarEmpleados();
}

function filtrosEmpleados() {
  const params = new URLSearchParams();
  const q = $("#f-q").value.trim();
  if (q) params.set("q", q);
  Object.entries(valoresUbicacion("f")).forEach(([k, v]) => params.set(k, v));
  if ($("#f-est").value) params.set("estatus", $("#f-est").value);
  return params;
}

async function cargarEmpleados() {
  const empleados = await api("/api/empleados?" + filtrosEmpleados());
  $("#tabla-empleados").innerHTML = empleados.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Departamento</th><th>Sucursal</th>
        <th>Locación</th><th>Estatus</th><th class="num">Activos</th><th class="num">Licencias y correos</th></tr></thead>
        <tbody>${empleados
          .map(
            (e) => `<tr class="clicable" data-id="${e.id}">
            <td class="codigo">${esc(e.codigo)}</td>
            <td>${esc(e.nombre_completo)}</td>
            <td>${esc(e.departamento || "—")}</td>
            <td>${esc(e.sucursal || "—")}</td>
            <td>${esc(e.bodega || e.planta || "—")}</td>
            <td><span class="insignia ${e.estatus === "ACTIVO" ? "ok" : "neutra"}">${e.estatus}</span></td>
            <td class="num">${e.total_activos}</td>
            <td class="num">${e.total_servicios}</td></tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">No hay empleados que coincidan.</div></div>`;

  document
    .querySelectorAll("#tabla-empleados tr.clicable")
    .forEach((tr) => (tr.onclick = () => verFichaEmpleado(tr.dataset.id)));
}

async function verFichaEmpleado(id) {
  const e = await api(`/api/empleados/${id}`);

  const bloqueActivo = (a) => `
    <div class="panel" style="margin-bottom:12px;padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span class="codigo">${esc(a.activo_codigo)}</span>
        <span class="insignia neutra">${esc(TIPOS[a.activo_tipo] || a.activo_tipo)}</span>
        <span>${esc(a.activo_descripcion || "")}</span>
        <span style="color:var(--texto-tenue);font-size:14px">desde ${fecha(a.fecha_asignacion)}</span>
        ${
          puedeEditar()
            ? `<span style="margin-left:auto;display:flex;gap:8px">
                 ${
                   LLEVAN_RESPONSIVA.includes(a.activo_tipo)
                     ? `<button class="btn-secundario btn-mini" data-docs="${a.id}">Documentos</button>`
                     : ""
                 }
                 <button class="btn-peligro btn-mini" data-devolver="${a.id}">Devolver</button>
               </span>`
            : ""
        }
      </div>
      ${LLEVAN_RESPONSIVA.includes(a.activo_tipo) ? filaDocumento(a, "responsiva") : ""}
      ${LLEVAN_INE.includes(a.activo_tipo) ? filaDocumento(a, "ine") : ""}
    </div>`;
  const fisicos = e.activos.filter((a) => TIPOS_FISICOS.includes(a.activo_tipo));
  const servicios = e.activos.filter((a) => !TIPOS_FISICOS.includes(a.activo_tipo));

  abrirModal(
    e.nombre_completo,
    `<div class="rejilla">
      <div class="campo"><label>Código</label><div class="codigo">${esc(e.codigo)}</div></div>
      <div class="campo"><label>Estatus</label><div><span class="insignia ${
        e.estatus === "ACTIVO" ? "ok" : "neutra"
      }">${esc(e.estatus)}</span></div></div>
      <div class="campo"><label>Correo</label><div>${
        e.correos?.length
          ? e.correos.map((c) => `<div class="codigo" style="white-space:normal">${esc(c)}</div>`).join("")
          : "—"
      }</div></div>
      <div class="campo"><label>Puesto</label><div>${esc(e.puesto || "—")}</div></div>
      <div class="campo"><label>Departamento</label><div>${esc(e.departamento || "—")}</div></div>
      <div class="campo"><label>Sucursal</label><div>${esc(e.sucursal || "—")}</div></div>
      <div class="campo"><label>Locación</label><div>${esc(e.bodega || e.planta || "—")}</div></div>
    </div>

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 10px">
      Accesos a sistemas</h3>
    <div class="tabla-wrap" style="margin-bottom:8px">
      ${(e.accesos || [])
        .map(
          (s) => `<div class="doc-fila">
            <strong style="min-width:220px">${esc(s.sistema)}</strong>
            <span class="insignia ${s.entregado ? "ok" : "alerta"}">${
              s.entregado ? "Entregado" : "Pendiente"
            }</span>
            ${
              s.fecha_entrega
                ? `<span style="color:var(--texto-tenue);font-size:14px">${fecha(s.fecha_entrega)}</span>`
                : ""
            }
            <span class="nombre-doc ${s.usuario_sistema ? "" : "sin-doc"}">${
              s.usuario_sistema ? esc(s.usuario_sistema) : "Sin usuario registrado"
            }</span>
          </div>`
        )
        .join("") || '<div class="vacio" style="padding:16px">No hay sistemas configurados.</div>'}
    </div>
    ${
      puedeEditar()
        ? `<button class="btn-secundario btn-mini" id="btn-accesos">Editar accesos</button>`
        : ""
    }

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 10px">
      Activos asignados (${fisicos.length})</h3>
    ${
      fisicos.length
        ? fisicos.map(bloqueActivo).join("")
        : `<div class="vacio" style="padding:20px">Sin activos asignados.</div>`
    }

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 10px">
      Licencias y correos (${servicios.length})</h3>
    ${
      servicios.length
        ? servicios.map(bloqueActivo).join("")
        : `<div class="vacio" style="padding:20px">Sin licencias ni correos.</div>`
    }

    ${
      e.historial.length
        ? `<h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 8px">
           Historial (${e.historial.length})</h3>
           <div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Documentos</th></tr></thead>
           <tbody>${e.historial
             .map(
               (h) => `<tr><td class="codigo">${esc(h.activo_codigo)}</td>
               <td>${esc(TIPOS[h.activo_tipo] || h.activo_tipo)}</td>
               <td>${fecha(h.fecha_asignacion)}</td><td>${fecha(h.fecha_devolucion)}</td>
               <td>${esc(h.motivo_devolucion || "—")}</td>
               <td>${celdaDocumentosHistorial(h)}</td></tr>`
             )
             .join("")}</tbody></table></div>`
        : ""
    }`,
    puedeEditar()
      ? `<button class="btn-peligro" id="btn-borrar-emp">Eliminar</button>
         <button class="btn-primario" id="btn-asignar-a">Asignar activo</button>
         <button class="btn-secundario" id="btn-editar-emp">Editar</button>`
      : "",
    true
  );

  activarBotonesDocumento([...e.activos, ...e.historial]);

  if (puedeEditar()) {
    $("#btn-editar-emp").onclick = () => modalEmpleado(e);
    $("#btn-asignar-a").onclick = () => modalAsignar(null, e);
    const bAcc = $("#btn-accesos");
    if (bAcc) bAcc.onclick = () => modalAccesos(e);
    document.querySelectorAll("[data-devolver]").forEach((b) => {
      b.onclick = () => modalDevolver(b.dataset.devolver);
    });
    document.querySelectorAll("[data-docs]").forEach((b) => {
      b.onclick = () => {
        const asig = e.activos.find((a) => String(a.id) === b.dataset.docs);
        modalDocumentos(asig);
      };
    });
    $("#btn-borrar-emp").onclick = async () => {
      if (
        await confirmar(
          `¿Eliminar a ${e.nombre_completo}? Esta acción no se puede deshacer.`
        )
      ) {
        try {
          await api(`/api/empleados/${e.id}`, { method: "DELETE" });
          cerrarModal();
          toast("Empleado eliminado");
          verEmpleados();
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  }
}

async function modalAccesos(empleado) {
  const accesos = await api(`/api/empleados/${empleado.id}/accesos`);
  const hoy = hoyISO();

  abrirModal(
    `Accesos de ${empleado.nombre_completo}`,
    `<form id="form-accesos">
      ${accesos
        .map(
          (s, i) => `<div class="bloque" style="margin-bottom:12px">
          <div class="contenido-bloque">
            <div class="campo check" style="margin-bottom:12px">
              <input type="checkbox" id="acc-${i}" data-acc="${i}" ${s.entregado ? "checked" : ""}>
              <label for="acc-${i}"><b>${esc(s.sistema)}</b>${
                s.descripcion ? ` — ${esc(s.descripcion)}` : ""
              }</label>
            </div>
            <div class="rejilla" id="det-${i}" ${s.entregado ? "" : "hidden"}>
              <div class="campo"><label>Usuario en el sistema</label>
                <input name="usuario_${i}" value="${esc(s.usuario_sistema || "")}"></div>
              <div class="campo"><label>Fecha de entrega</label>
                <input name="fecha_${i}" type="date" value="${s.fecha_entrega || hoy}"></div>
            </div>
            <div class="campo" id="nota-${i}" ${s.entregado ? "" : "hidden"}>
              <label>Notas</label>
              <input name="notas_${i}" value="${esc(s.notas || "")}"></div>
            ${
              s.actualizado_por
                ? `<div style="font-size:13px;color:var(--texto-tenue)">
                     Última actualización: ${esc(s.actualizado_por)} · ${fechaHora(s.actualizado_en)}</div>`
                : ""
            }
          </div>
        </div>`
        )
        .join("")}
      ${accesos.length ? "" : '<div class="vacio">No hay sistemas configurados. Agrégalos desde Catálogos.</div>'}
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`,
    true
  );

  document.querySelectorAll("[data-acc]").forEach((ch) => {
    ch.onchange = () => {
      const i = ch.dataset.acc;
      $(`#det-${i}`).hidden = !ch.checked;
      $(`#nota-${i}`).hidden = !ch.checked;
    };
  });

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-accesos");
    const datos = {
      accesos: accesos.map((s, i) => ({
        sistema_id: s.sistema_id,
        entregado: $(`#acc-${i}`).checked,
        usuario_sistema: form[`usuario_${i}`] ? form[`usuario_${i}`].value.trim() || null : null,
        fecha_entrega: form[`fecha_${i}`] ? form[`fecha_${i}`].value || null : null,
        notas: form[`notas_${i}`] ? form[`notas_${i}`].value.trim() || null : null,
      })),
    };
    try {
      await api(`/api/empleados/${empleado.id}/accesos`, {
        method: "PUT",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast("Accesos actualizados");
      verFichaEmpleado(empleado.id);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

function modalEmpleado(e = null) {
  const c = estado.catalogos;
  abrirModal(
    e ? "Editar empleado" : "Nuevo empleado",
    `<form id="form-emp">
      <div class="rejilla">
        <div class="campo"><label>Nombre(s) *</label><input name="nombres" required value="${esc(e?.nombres || "")}"></div>
        <div class="campo"><label>Apellidos *</label><input name="apellidos" required value="${esc(e?.apellidos || "")}"></div>
        <div class="campo"><label>Puesto</label><input name="puesto" value="${esc(e?.puesto || "")}"></div>
        <div class="campo"><label>Sucursal</label><select name="sucursal_id">${opciones(c.sucursales, e?.sucursal_id)}</select></div>
        <div class="campo"><label>Departamento</label><select name="departamento_id">${opciones(c.departamentos, e?.departamento_id)}</select></div>
        <div class="campo"><label>Locación</label><select name="bodega_id">${opciones(c.bodegas, e?.bodega_id)}</select></div>
        <div class="campo"><label>Estatus</label><select name="estatus">
          <option value="ACTIVO" ${e?.estatus !== "BAJA" ? "selected" : ""}>Activo</option>
          <option value="BAJA" ${e?.estatus === "BAJA" ? "selected" : ""}>Baja</option></select></div>
        <div class="campo"><label>Fecha de ingreso</label><input name="fecha_ingreso" type="date" value="${e?.fecha_ingreso || ""}"></div>
        <div class="campo"><label>Fecha de baja</label><input name="fecha_baja" type="date" value="${e?.fecha_baja || ""}"></div>
      </div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-emp");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    try {
      await api(e ? `/api/empleados/${e.id}` : "/api/empleados", {
        method: e ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(e ? "Empleado actualizado" : "Empleado creado");
      verEmpleados();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- licencias por familia

const PRODUCTOS = {
  microsoft: { titulo: "Microsoft 365", tipo: "LICENCIA_MICROSOFT", producto: "Microsoft 365" },
  norton: { titulo: "Norton 360", tipo: "LICENCIA_NORTON", producto: "Norton 360" },
};

async function verLicencias() {
  const clave = estado.licencias || "microsoft";
  const p = PRODUCTOS[clave];
  const grupos = await api(`/api/licencias/familias?producto=${clave}`);
  const conCuenta = grupos.filter((g) => g.cuenta);
  const total = grupos.reduce((s, g) => s + g.licencias.length, 0);
  const asignadas = grupos.reduce((s, g) => s + g.licencias.filter((l) => l.empleado).length, 0);
  const libres = conCuenta.reduce(
    (s, g) => s + Math.max(0, g.cuenta.ranuras_totales - g.licencias.length), 0
  );
  const excedidas = conCuenta.filter((g) => g.licencias.length > g.cuenta.ranuras_totales).length;

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Licencias</h2><p>${esc(p.titulo)} por familia</p></div>
      ${
        puedeEditar()
          ? `<div style="display:flex;gap:10px;flex-wrap:wrap">
               <button class="btn-secundario" id="btn-familias">Familias</button>
               <button class="btn-secundario" id="btn-nueva-fam">Nueva familia</button>
               <button class="btn-primario" id="btn-nueva-lic">Nueva licencia</button>
             </div>`
          : ""
      }
    </div>

    <div class="pestanas" role="tablist">
      ${Object.entries(PRODUCTOS)
        .map(
          ([k, v]) => `<button role="tab" data-producto="${k}" class="${k === clave ? "activa" : ""}"
                         aria-selected="${k === clave}">${esc(v.titulo)}</button>`
        )
        .join("")}
    </div>

    <div class="tarjetas">
      <div class="tarjeta cyan"><div class="etiqueta">Familias</div><div class="valor">${conCuenta.length}</div></div>
      <div class="tarjeta"><div class="etiqueta">Licencias</div><div class="valor">${total}</div>
        <div class="pie">${asignadas} asignadas · ${total - asignadas} sin asignar</div></div>
      <div class="tarjeta ${libres ? "amarillo" : "cyan"}"><div class="etiqueta">Ranuras libres</div><div class="valor">${libres}</div></div>
      <div class="tarjeta ${excedidas ? "rojo" : "cyan"}"><div class="etiqueta">Familias excedidas</div><div class="valor">${excedidas}</div></div>
    </div>

    <div class="filtros">
      <div class="campo busqueda"><label>Buscar</label>
        <input id="l-q" placeholder="${clave === "norton" ? "Nombre, usuario o código…" : "Nombre, correo o código…"}"></div>
      ${filtrosUbicacion("l")}
      <div class="campo check" style="padding-bottom:8px">
        <input type="checkbox" id="l-libres"><label for="l-libres">Solo sin asignar</label></div>
    </div>
    <div id="familias"></div>`;

  document.querySelectorAll("[data-producto]").forEach((b) => {
    b.onclick = () => {
      estado.licencias = b.dataset.producto;
      verLicencias();
    };
  });
  const volver = () => {
    cerrarModal();
    verLicencias();
  };
  if (puedeEditar()) {
    $("#btn-familias").onclick = modalCuentasLicencia;
    $("#btn-nueva-fam").onclick = () => modalCuenta(null, volver, p.producto);
    $("#btn-nueva-lic").onclick = () => modalActivo(null, p.tipo, [p.tipo]);
  }

  const pintar = () => {
    const q = $("#l-q").value.trim().toLowerCase();
    const soloLibres = $("#l-libres").checked;
    const ubicacion = Object.entries(valoresUbicacion("l"));
    const filtrando = q || soloLibres || ubicacion.length;
    const coincide = (l) =>
      (!soloLibres || !l.empleado) &&
      ubicacion.every(([campo, v]) => String(l[campo]) === v) &&
      (!q ||
        [l.codigo, l.empleado, l.correo_licencia, l.identificador]
          .filter(Boolean)
          .some((t) => t.toLowerCase().includes(q)));

    const html = grupos
      .map((g, i) => bloqueFamilia(g, i + 1, clave, g.licencias.filter(coincide), filtrando))
      .filter(Boolean)
      .join("");
    $("#familias").innerHTML =
      html || `<div class="panel"><div class="vacio">No hay licencias que coincidan.</div></div>`;

    document.querySelectorAll("#familias tr[data-lic]").forEach((tr) => {
      tr.onclick = () => verFichaActivo(tr.dataset.lic, "licencias");
    });
    if (!puedeEditar()) return;
    const cuentaDe = (id) => grupos.find((g) => g.cuenta && String(g.cuenta.id) === id).cuenta;
    const agregar = (id) =>
      modalActivo(null, p.tipo, [p.tipo], { licencia: { cuenta_id: Number(id) } });
    document.querySelectorAll("#familias [data-agregar]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        agregar(b.dataset.agregar);
      };
    });
    document.querySelectorAll("#familias tr[data-ranura]").forEach((tr) => {
      tr.onclick = () => agregar(tr.dataset.ranura);
    });
    document.querySelectorAll("#familias [data-editar-fam]").forEach((b) => {
      b.onclick = () => modalCuenta(cuentaDe(b.dataset.editarFam), volver);
    });
  };
  $("#l-q").oninput = pintar;
  $("#l-libres").onchange = pintar;
  enlazarUbicacion("l", pintar);
  pintar();
}

function bloqueFamilia(g, numero, clave, licencias, filtrando) {
  const c = g.cuenta;
  if (filtrando && !licencias.length) return "";
  const norton = clave === "norton";
  const columnas = norton
    ? ["#", "Código", "Nombre", "Usuario", "Sucursal", "Locación", "Depto", "Estatus"]
    : ["#", "Código", "Nombre", "Correo", "Sucursal", "Locación", "Depto", "Estatus"];
  const tope = LICENCIAS_POR_FAMILIA[PRODUCTOS[clave].tipo];
  const ranuras = c ? c.ranuras_totales : licencias.length;
  const cupo = c ? Math.min(tope, ranuras) : 0;
  const usadas = g.licencias.length;
  const excedida = c && usadas > ranuras;

  const fila = (l, n) => `<tr class="clicable ${c && n > ranuras ? "excedente" : ""}" data-lic="${l.id}">
      <td class="num-ranura">${n}</td>
      <td><span class="codigo">${esc(l.codigo)}</span></td>
      <td>${l.empleado ? esc(l.empleado) : '<span class="sin-asignar">Sin asignar</span>'}</td>
      <td class="mono-celda">${esc((norton ? l.identificador : l.correo_licencia) || "—")}</td>
      <td>${esc(l.sucursal || "—")}</td>
      <td>${esc(l.bodega || l.planta || "—")}</td>
      <td>${esc(l.departamento || "—")}</td>
      <td><span class="insignia ${INSIGNIA_ESTATUS[l.estatus] || "neutra"}">${esc(l.estatus)}</span></td>
    </tr>`;

  const vacias =
    c && !filtrando
      ? Array.from({ length: Math.max(0, ranuras - usadas) }, (_, k) =>
          `<tr class="ranura-libre ${puedeEditar() ? "clicable" : ""}" data-ranura="${c.id}">
             <td class="num-ranura">${usadas + k + 1}</td>
             <td colspan="${columnas.length - 1}">Libre</td></tr>`
        ).join("")
      : "";

  const renovacion = c?.fecha_renovacion
    ? (() => {
        const dias = Math.round((new Date(c.fecha_renovacion + "T00:00:00") - new Date()) / 864e5);
        const tono = dias < 0 ? "peligro" : dias <= 60 ? "alerta" : "ok";
        return `<span class="insignia ${tono}">Renueva ${fecha(c.fecha_renovacion)}</span>`;
      })()
    : c
    ? '<span class="insignia neutra">Sin fecha de renovación</span>'
    : "";

  return `<section class="familia ${excedida ? "excedida" : ""} ${c ? "" : "sin-familia"}">
    <header class="familia-cab">
      <div class="familia-titulo">
        <span class="familia-num">${c ? numero : "?"}</span>
        <div>
          <b>${esc(c ? c.nombre : "Sin familia")}</b>
          ${c?.correo_cuenta ? `<span class="familia-correo">${esc(c.correo_cuenta)}</span>` : ""}
        </div>
      </div>
      <div class="familia-datos">
        ${renovacion}
        ${
          c
            ? `<div class="familia-uso" title="${usadas} de ${ranuras} ranuras">
                 <div class="pista"><div class="relleno" style="width:${Math.min(100, (usadas / Math.max(1, ranuras)) * 100)}%"></div></div>
                 <span>${usadas}/${ranuras}</span></div>`
            : ""
        }
        ${
          c && puedeEditar()
            ? `<button class="btn-secundario btn-mini" data-agregar="${c.id}"
                 ${usadas >= cupo ? `disabled title="Familia completa: ${cupo} de ${cupo}"` : ""}>${
                   usadas >= cupo ? "Familia completa" : "Agregar licencia"
                 }</button>
               <button class="btn-secundario btn-mini" data-editar-fam="${c.id}">Editar</button>`
            : ""
        }
      </div>
    </header>
    <div class="tabla-wrap"><table class="tabla-familia">
      <thead><tr>${columnas.map((x) => `<th>${x}</th>`).join("")}</tr></thead>
      <tbody>${licencias.map((l, k) => fila(l, k + 1)).join("")}${vacias}</tbody>
    </table></div>
  </section>`;
}

// ---------------------------------------------------------------- secciones de activos

async function verSeccion(clave) {
  const s = SECCIONES[clave];

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>${esc(s.titulo)}</h2><p>${esc(s.sub)}</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${
          EXPORTABLES.includes(clave)
            ? `<button class="btn-secundario" id="btn-exportar">Exportar a Excel</button>`
            : ""
        }
        ${
          puedeEditar() && clave === "correos"
            ? `<button class="btn-secundario" id="btn-importar-correos">Importar actividad</button>
               <input type="file" id="archivo-correos" accept=".xlsx" hidden>`
            : ""
        }
        ${
          puedeEditar()
            ? `<button class="btn-primario" id="btn-nuevo-act">${
                clave === "equipos" ? "Nuevo equipo" : clave === "tabletas" ? "Nueva tablet" : "Nuevo registro"
              }</button>`
            : ""
        }
      </div>
    </div>
    <div class="filtros">
      <div class="campo busqueda"><label>Buscar</label>
        <input id="a-q" placeholder="Código, serie, IMEI, teléfono o correo…"></div>
      ${
        s.tipos.length > 1
          ? `<div class="campo"><label>Tipo</label>
             <select id="a-tipo">${opciones(s.tipos, "", "Todos")}</select></div>`
          : ""
      }
      <div class="campo"><label>Estatus</label>
        <select id="a-est">${opciones(estado.catalogos.estatus_activo, "", "Todos")}</select></div>
      ${filtrosUbicacion("a")}
      <div class="campo check" style="padding-bottom:8px">
        <input type="checkbox" id="a-libres"><label for="a-libres">Solo sin asignar</label></div>
    </div>
    <div id="tabla-activos"></div>`;

  const bExp = $("#btn-exportar");
  if (bExp) bExp.onclick = () => (location.href = "/api/activos/exportar?" + filtrosSeccion(clave));
  if (puedeEditar()) {
    $("#btn-nuevo-act").onclick = () =>
      clave === "equipos" || clave === "tabletas"
        ? modalAltaEquipo(s.tipoNuevo)
        : modalActivo(null, s.tipoNuevo, s.tipos);
  }
  if (puedeEditar() && clave === "correos") {
    const archivo = $("#archivo-correos");
    $("#btn-importar-correos").onclick = () => archivo.click();
    archivo.onchange = async () => {
      if (!archivo.files.length) return;
      const datos = new FormData();
      datos.append("archivo", archivo.files[0]);
      archivo.value = "";
      try {
        const r = await api("/api/correos/importar-actividad", { method: "POST", body: datos });
        resumenImportacion(r);
        cargarSeccion(clave);
        refrescarContadorAlertas();
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  ["a-q", "a-tipo", "a-est", "a-libres"].forEach((id) => {
    const el = $("#" + id);
    if (!el) return;
    el.oninput = () => cargarSeccion(clave);
    el.onchange = () => cargarSeccion(clave);
  });
  enlazarUbicacion("a", () => cargarSeccion(clave));
  cargarSeccion(clave);
}

function resumenImportacion(r) {
  abrirModal(
    "Actividad importada",
    `<div class="rejilla">
      <div class="campo"><label>Cuentas actualizadas</label><div>${r.actualizados}</div></div>
      <div class="campo"><label>En desuso (${DIAS_DESUSO_CORREO}+ días)</label><div>${r.en_desuso}</div></div>
      <div class="campo"><label>No registradas</label><div>${r.no_registrados.length}</div></div>
    </div>
    ${
      r.inactivos_no_registrados.length
        ? `<h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:16px 0 8px">
             No registradas con ${DIAS_DESUSO_CORREO}+ días sin acceso (${r.inactivos_no_registrados.length})</h3>
           <div class="tabla-wrap" style="max-height:300px;overflow:auto"><table>
             <thead><tr><th>Correo</th><th>Último acceso</th><th class="num">GB</th></tr></thead>
             <tbody>${r.inactivos_no_registrados
               .map(
                 (c) => `<tr>
                   <td class="codigo">${esc(c.direccion)}</td>
                   <td>${
                     c.ultimo_acceso
                       ? `${new Date(c.ultimo_acceso).toLocaleDateString("es-MX")}
                          <span class="insignia alerta">${c.dias_sin_acceso} días sin uso</span>`
                       : '<span class="insignia peligro">Nunca</span>'
                   }</td>
                   <td class="num">${c.almacenamiento_gb ?? "—"}</td></tr>`
               )
               .join("")}</tbody></table></div>`
        : ""
    }`,
    `<button class="btn-secundario" id="ir-alertas">Ver alertas</button>
     <button class="btn-primario" id="cerrar-resumen">Cerrar</button>`
  );
  $("#cerrar-resumen").onclick = cerrarModal;
  $("#ir-alertas").onclick = () => {
    cerrarModal();
    irA("alertas");
  };
}

function filtrosSeccion(clave) {
  const params = new URLSearchParams({ grupo: clave });
  const q = $("#a-q").value.trim();
  if (q) params.set("q", q);
  const selTipo = $("#a-tipo");
  if (selTipo && selTipo.value) params.set("tipo", selTipo.value);
  if ($("#a-est").value) params.set("estatus", $("#a-est").value);
  if ($("#a-libres").checked) params.set("sin_asignar", "true");
  Object.entries(valoresUbicacion("a")).forEach(([k, v]) => params.set(k, v));
  return params;
}

async function cargarSeccion(clave) {
  const s = SECCIONES[clave];
  const activos = await api("/api/activos?" + filtrosSeccion(clave));
  $("#tabla-activos").innerHTML = activos.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr>${s.columnas.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${activos
          .map(
            (a) =>
              `<tr class="clicable" data-id="${a.id}">${s
                .fila(a)
                .map((celda) => `<td>${celda}</td>`)
                .join("")}</tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">No hay registros que coincidan.</div></div>`;

  document
    .querySelectorAll("#tabla-activos tr.clicable")
    .forEach((tr) => (tr.onclick = () => verFichaActivo(tr.dataset.id, clave)));
}

const ETIQUETAS_DETALLE = {
  marca: "Marca", modelo: "Modelo", numero_serie: "Número de serie",
  procesador: "Procesador", ram_gb: "RAM (GB)", almacenamiento: "Almacenamiento",
  sistema_operativo: "Sistema operativo", clave_windows: "Clave Windows",
  imei: "IMEI", numero_telefonico: "Teléfono",
  iccid: "ICCID", operador: "Operador", precio_plan: "Plan", esquema: "Esquema",
  esim: "eSIM", cuenta_operador: "Cuenta operador",
  direccion: "Dirección", habilitada: "Cuenta activa",
  ultimo_acceso: "Último acceso", almacenamiento_gb: "Almacenamiento (GB)",
  dias_sin_acceso: "Días sin acceso",
  familia: "Familia", correo_familia: "Correo de la familia",
  ranuras_familia: "Ranuras de la familia",
  correo_licencia: "Correo de la licencia",
  identificador_dispositivo: "Identificador",
};

const OCULTOS_FICHA = ["cuenta_id", "actividad_importada_en", "nunca_accedio"];
const FORMATO_DETALLE = { precio_plan: moneda, ultimo_acceso: fechaHora };
// Ningún dispositivo vence, los correos no se renuevan
// y las licencias toman la renovación de su familia
const LICENCIAS = ["LICENCIA_MICROSOFT", "LICENCIA_NORTON"];
const SIN_VENCIMIENTO = ["COMPUTO", "TELEFONO", "TABLETA", "CORREO_WORKSPACE", ...LICENCIAS];

async function verFichaActivo(id, seccion) {
  const a = await api(`/api/activos/${id}`);
  const detalle = { ...a.movil, ...a.computo, ...a.correo, ...a.licencia };

  abrirModal(
    `${a.codigo} — ${TIPOS[a.tipo] || a.tipo}`,
    `<div class="rejilla">
      <div class="campo"><label>Estatus</label><div>${insigniaEstatus(a)}</div></div>
      <div class="campo"><label>Descripción</label><div>${esc(a.descripcion || "—")}</div></div>
      ${
        LICENCIAS.includes(a.tipo)
          ? ""
          : `<div class="campo"><label>Adquisición</label><div>${fecha(a.fecha_adquisicion)}</div></div>`
      }
      ${
        SIN_VENCIMIENTO.includes(a.tipo)
          ? ""
          : `<div class="campo"><label>Vencimiento</label><div>${fecha(a.fecha_vencimiento)}</div></div>`
      }
      ${Object.entries(detalle)
        .filter(([k, v]) => v !== null && v !== undefined && v !== "" && !OCULTOS_FICHA.includes(k))
        .map(
          ([k, v]) =>
            `<div class="campo"><label>${esc(ETIQUETAS_DETALLE[k] || k)}</label><div>${esc(
              typeof v === "boolean" ? (v ? "Sí" : "No") : (FORMATO_DETALLE[k] || String)(v)
            )}</div></div>`
        )
        .join("")}
      ${
        detalle.nunca_accedio
          ? `<div class="campo"><label>Último acceso</label><div>Nunca ha iniciado sesión</div></div>`
          : ""
      }
    </div>

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:16px 0 10px">
      Asignación vigente</h3>
    ${
      a.asignado_a
        ? `<div style="margin-bottom:10px">${esc(a.asignado_a.empleado)}
             <span class="codigo">(${esc(a.asignado_a.codigo_empleado)})</span>
             desde ${fecha(a.asignado_a.fecha_asignacion)}</div>
           ${
             a.lleva_responsiva
               ? filaDocumento(a.asignado_a, "responsiva") +
                 (a.lleva_ine ? filaDocumento(a.asignado_a, "ine") : "")
               : `<div style="color:var(--texto-tenue);font-size:15px">Sin responsiva.</div>`
           }`
        : `<div class="vacio" style="padding:16px">Este activo está libre.</div>`
    }

    ${
      a.historial.length
        ? `<h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 8px">
           Historial de asignaciones</h3>
           <div class="tabla-wrap"><table><thead><tr><th>Empleado</th><th>Desde</th><th>Hasta</th><th>Motivo</th>${
             a.lleva_responsiva ? "<th>Documentos</th>" : ""
           }</tr></thead>
           <tbody>${a.historial
             .map(
               (h) => `<tr><td>${esc(h.empleado)}</td><td>${fecha(h.fecha_asignacion)}</td>
               <td>${h.fecha_devolucion ? fecha(h.fecha_devolucion) : '<span class="insignia ok">Vigente</span>'}</td>
               <td>${esc(h.motivo_devolucion || "—")}</td>${
                 a.lleva_responsiva ? `<td>${celdaDocumentosHistorial(h)}</td>` : ""
               }</tr>`
             )
             .join("")}</tbody></table></div>`
        : ""
    }`,
    puedeEditar()
      ? `<button class="btn-peligro" id="btn-borrar-act">Eliminar</button>
         ${
           a.asignado_a
             ? `${a.lleva_responsiva ? '<button class="btn-secundario" id="btn-docs">Documentos</button>' : ""}
                <button class="btn-secundario" id="btn-dev">Devolver</button>`
             : `<button class="btn-primario" id="btn-asig">Asignar</button>`
         }
         <button class="btn-secundario" id="btn-edit-act">Editar</button>`
      : "",
    true
  );

  if (a.lleva_responsiva)
    activarBotonesDocumento([...(a.asignado_a ? [a.asignado_a] : []), ...a.historial]);

  if (puedeEditar()) {
    $("#btn-edit-act").onclick = () => modalActivo(a, a.tipo, SECCIONES[seccion].tipos);
    const bAsig = $("#btn-asig");
    if (bAsig) bAsig.onclick = () => modalAsignar(a);
    const bDev = $("#btn-dev");
    if (bDev) bDev.onclick = () => modalDevolver(a.asignado_a.id);
    const bDocs = $("#btn-docs");
    if (bDocs) bDocs.onclick = () => modalDocumentos(a.asignado_a);
    $("#btn-borrar-act").onclick = async () => {
      const aviso = a.historial.length
        ? `¿Eliminar ${a.codigo}? Se borrará también su historial de ${a.historial.length} asignación(es). No se puede deshacer.`
        : `¿Eliminar ${a.codigo}? Esta acción no se puede deshacer.`;
      if (await confirmar(aviso)) {
        try {
          await api(`/api/activos/${a.id}`, { method: "DELETE" });
          cerrarModal();
          toast("Registro eliminado");
          irA(seccion);
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  }
}

function camposComputo(d, conMarca = true) {
  return `
      ${
        conMarca
          ? `<div class="campo"><label>Marca</label><input name="marca" value="${esc(d.marca || "")}"></div>
             <div class="campo"><label>Modelo</label><input name="modelo" value="${esc(d.modelo || "")}"></div>`
          : ""
      }
      <div class="campo"><label>Número de serie</label><input name="numero_serie" value="${esc(d.numero_serie || "")}" placeholder="Etiqueta del fabricante"></div>
      <div class="campo"><label>Procesador</label><input name="procesador" value="${esc(d.procesador || "")}"></div>
      <div class="campo"><label>RAM (GB)</label><input name="ram_gb" type="number" value="${d.ram_gb || ""}"></div>
      <div class="campo"><label>Almacenamiento</label><input name="almacenamiento" value="${esc(d.almacenamiento || "")}" placeholder="512 GB SSD"></div>
      <div class="campo"><label>Sistema operativo</label><input name="sistema_operativo" value="${esc(d.sistema_operativo || "")}"></div>`;
}

// Tope de licencias por familia según el plan
const LICENCIAS_POR_FAMILIA = { LICENCIA_MICROSOFT: 6, LICENCIA_NORTON: 10 };

function familiasDe(tipo) {
  const patron = tipo === "LICENCIA_NORTON" ? /norton/i : /microsoft|365|office/i;
  return estado.catalogos.cuentas_licencia.filter((c) => patron.test(c.producto || ""));
}

function opcionesFamilia(tipo, seleccionada = null) {
  const tope = LICENCIAS_POR_FAMILIA[tipo] || 6;
  return (
    `<option value="">— Sin familia —</option>` +
    familiasDe(tipo)
      .map((c) => {
        const cupo = Math.min(tope, c.ranuras_totales);
        const propia = String(c.id) === String(seleccionada);
        const llena = c.ranuras_usadas >= cupo && !propia;
        return `<option value="${c.id}" ${propia ? "selected" : ""} ${llena ? "disabled" : ""}>
          ${esc(c.nombre)} · ${c.ranuras_usadas}/${cupo}${llena ? " · llena" : ""}</option>`;
      })
      .join("")
  );
}

function camposPorTipo(tipo, a) {
  const d = { ...a?.movil, ...a?.computo, ...a?.correo, ...a?.licencia };
  if (tipo === "COMPUTO" || tipo === "TABLETA") return camposComputo(d);

  if (tipo === "TELEFONO")
    return `
      <div class="campo"><label>Marca</label><input name="marca" value="${esc(d.marca || "")}"></div>
      <div class="campo"><label>Modelo</label><input name="modelo" value="${esc(d.modelo || "")}"></div>
      <div class="campo"><label>IMEI</label><input name="imei" value="${esc(d.imei || "")}"></div>
      <div class="campo"><label>Número telefónico</label><input name="numero_telefonico" value="${esc(d.numero_telefonico || "")}"></div>
      <div class="campo"><label>ICCID</label><input name="iccid" value="${esc(d.iccid || "")}"></div>
      <div class="campo"><label>Operador</label><input value="Telcel" disabled></div>
      <div class="campo"><label>Plan</label>
        <div class="entrada-moneda"><span>$</span><input name="precio_plan" type="number" min="0" step="0.01" value="${d.precio_plan ?? ""}" placeholder="0.00"></div></div>
      <div class="campo"><label>Esquema</label><input value="Plazo Forzoso con Equipo" disabled></div>
      <div class="campo check"><input type="checkbox" name="esim" id="chk-esim" ${d.esim ? "checked" : ""}><label for="chk-esim">Es eSIM</label></div>`;

  if (tipo === "CORREO_WORKSPACE")
    return `
      <div class="campo"><label>Dirección *</label><input name="direccion" required value="${esc(d.direccion || "")}"></div>
      <div class="campo"><label>Estatus</label>${interruptor("habilitada", d.habilitada !== false)}</div>
      <div class="campo"><label>Almacenamiento (GB)</label><input name="almacenamiento_gb" type="number" step="0.01" value="${d.almacenamiento_gb ?? ""}"></div>`;

  return `
    <div class="campo"><label>Familia</label>
      <select name="cuenta_id">${opcionesFamilia(tipo, d.cuenta_id)}</select></div>
    <div class="campo"><label>Correo de la licencia</label><input name="correo_licencia" value="${esc(d.correo_licencia || "")}"></div>
    <div class="campo"><label>Identificador del dispositivo</label>
      <input name="identificador_dispositivo" value="${esc(d.identificador_dispositivo || "")}" placeholder="TOL-FIN-1"></div>`;
}

function armarActivo(plano, tipo) {
  const soloDe = (campos) =>
    Object.fromEntries(campos.filter((k) => k in plano).map((k) => [k, plano[k]]));

  const base = {
    tipo,
    codigo: plano.codigo,
    estatus: plano.estatus,
    descripcion: plano.descripcion,
    fecha_adquisicion: plano.fecha_adquisicion,
    fecha_vencimiento: plano.fecha_vencimiento,
    notas: plano.notas,
  };

  const deComputo = ["marca", "modelo", "numero_serie", "procesador", "ram_gb",
    "almacenamiento", "sistema_operativo", "clave_windows"];
  const deMovil = ["marca", "modelo", "imei", "numero_telefonico", "iccid",
    "precio_plan", "esim", "cuenta_operador"];

  if (tipo === "COMPUTO" || tipo === "TABLETA") base.computo = soloDe(deComputo);
  if (tipo === "TELEFONO") base.movil = soloDe(deMovil);
  if (tipo === "CORREO_WORKSPACE")
    base.correo = soloDe(["direccion", "habilitada", "almacenamiento_gb", "alias_de"]);
  if (tipo === "LICENCIA_MICROSOFT" || tipo === "LICENCIA_NORTON")
    base.licencia = soloDe(["cuenta_id", "correo_licencia", "identificador_dispositivo"]);

  return base;
}

function modalActivo(a = null, tipoInicial = "COMPUTO", tiposPermitidos = null, inicial = null) {
  const c = estado.catalogos;
  const tipo = a?.tipo || tipoInicial;
  void c;
  const lista = tiposPermitidos || Object.keys(TIPOS);

  abrirModal(
    a ? `Editar ${a.codigo}` : "Nuevo registro",
    `<form id="form-act">
      <div class="rejilla">
        ${
          lista.length > 1
            ? `<div class="campo"><label>Tipo *</label>
                 <select name="tipo" id="sel-tipo" ${a ? "disabled" : ""}>${opciones(lista, tipo, "")}</select></div>`
            : `<input type="hidden" name="tipo" id="sel-tipo" value="${tipo}">`
        }
        <div class="campo"><label>Código</label>
          <input name="codigo" value="${esc(a?.codigo || "")}" placeholder="Se genera solo"></div>
        <div class="campo"><label>Estatus</label>
          <select name="estatus">${opciones(c.estatus_activo, a?.estatus || "DISPONIBLE", "")}</select></div>
        <div class="campo"><label>Descripción</label><input name="descripcion" value="${esc(a?.descripcion || "")}"></div>
        ${
          LICENCIAS.includes(tipo)
            ? ""
            : `<div class="campo"><label>Fecha de adquisición</label><input name="fecha_adquisicion" type="date" value="${a?.fecha_adquisicion || ""}"></div>`
        }
        ${
          SIN_VENCIMIENTO.includes(tipo)
            ? ""
            : `<div class="campo"><label>Vencimiento / renovación</label><input name="fecha_vencimiento" type="date" value="${a?.fecha_vencimiento || ""}"></div>`
        }
      </div>
      <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:14px 0 10px">
        Datos específicos</h3>
      <div class="rejilla" id="campos-tipo">${camposPorTipo(tipo, a || inicial)}</div>
      <div class="campo"><label>Notas</label><textarea name="notas" rows="2">${esc(a?.notas || "")}</textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  const sel = $("#sel-tipo");
  if (sel && sel.tagName === "SELECT") {
    sel.onchange = (e) => ($("#campos-tipo").innerHTML = camposPorTipo(e.target.value, null));
  }
  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-act");
    if (!form.reportValidity()) return;
    const plano = recolectar(form);
    try {
      await api(a ? `/api/activos/${a.id}` : "/api/activos", {
        method: a ? "PUT" : "POST",
        body: JSON.stringify(armarActivo(plano, a?.tipo || plano.tipo)),
      });
      cerrarModal();
      toast(a ? "Registro actualizado" : "Registro creado");
      await recargarCatalogos();
      irA(estado.vista);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- alta combinada de equipo

async function modalAltaEquipo(tipo = "COMPUTO") {
  const c = estado.catalogos;
  const tablet = tipo === "TABLETA";
  const empleados = await api("/api/empleados?estatus=ACTIVO");
  const hoy = hoyISO();

  abrirModal(
    tablet ? "Nueva tablet" : "Nuevo equipo de cómputo",
    `<form id="form-alta">
      <div class="rejilla">
        <div class="campo"><label>Código</label><input name="codigo" placeholder="Se genera solo"></div>
        <div class="campo"><label>Descripción</label><input name="descripcion" placeholder="${tablet ? "Samsung Galaxy Tab A9+" : "HP ProBook 445 G10"}"></div>
        <div class="campo"><label>Fecha de adquisición</label><input name="fecha_adquisicion" type="date"></div>
        <div class="campo"><label>Marca</label><input name="marca"></div>
        <div class="campo"><label>Modelo</label><input name="modelo"></div>
        <div class="campo"><label>Número de serie</label><input name="numero_serie" placeholder="Etiqueta del fabricante"></div>
        <div class="campo"><label>Procesador</label><input name="procesador"></div>
        <div class="campo"><label>RAM (GB)</label><input name="ram_gb" type="number"></div>
        <div class="campo"><label>Almacenamiento</label><input name="almacenamiento" placeholder="${tablet ? "128 GB" : "512 GB SSD"}"></div>
        <div class="campo"><label>Sistema operativo</label><input name="sistema_operativo"></div>
      </div>

      <details class="bloque">
        <summary>Cuenta de correo (opcional)</summary>
        <div class="contenido-bloque"><div class="rejilla">
          <div class="campo"><label>Dirección</label><input name="correo_direccion" type="email" placeholder="usuario@empresa.com"></div>
          <div class="campo"><label>Estatus</label>${interruptor("correo_habilitada", true)}</div>
        </div></div>
      </details>

      <details class="bloque">
        <summary>Licencia Microsoft 365 (opcional)</summary>
        <div class="contenido-bloque"><div class="rejilla">
          <div class="campo"><label>Cuenta</label>
            <select name="ms_cuenta_id">${opcionesFamilia("LICENCIA_MICROSOFT")}</select></div>
          <div class="campo"><label>Correo de la licencia</label><input name="ms_correo"></div>
          <div class="campo"><label>Identificador</label><input name="ms_identificador"></div>
        </div></div>
      </details>

      <details class="bloque">
        <summary>Licencia Norton 360 (opcional)</summary>
        <div class="contenido-bloque"><div class="rejilla">
          <div class="campo"><label>Cuenta</label>
            <select name="nor_cuenta_id">${opcionesFamilia("LICENCIA_NORTON")}</select></div>
          <div class="campo"><label>Correo de la licencia</label><input name="nor_correo"></div>
          <div class="campo"><label>Identificador</label><input name="nor_identificador" placeholder="TOL-FIN-1"></div>
        </div></div>
      </details>

      <details class="bloque" open>
        <summary>Asignación y documentos (opcional)</summary>
        <div class="contenido-bloque">
          <div class="rejilla">
            <div class="campo"><label>Asignar a</label>
              <select name="empleado_id">${opciones(
                empleados.map((e) => ({ id: e.id, nombre: `${e.nombre_completo} (${e.codigo})` })),
                "",
                "— No asignar por ahora —"
              )}</select></div>
            <div class="campo"><label>Fecha de asignación</label>
              <input name="fecha_asignacion" type="date" value="${hoy}"></div>
          </div>
          <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:14px 0 10px">Responsiva</h3>
          ${camposDocumento("responsiva")}
        </div>
      </details>

      <div class="campo"><label>Notas</label><textarea name="notas" rows="2"></textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`,
    true
  );

  activarSubida("responsiva");
  activarEstadoDocumento();
  $("#cancelar").onclick = cerrarModal;

  $("#guardar").onclick = async () => {
    const form = $("#form-alta");
    if (!form.reportValidity()) return;
    const p = recolectar(form);

    const cuerpo = {
      equipo: {
        tipo,
        codigo: p.codigo,
        estatus: "DISPONIBLE",
        descripcion: p.descripcion,
        fecha_adquisicion: p.fecha_adquisicion,
        notas: p.notas,
        computo: {
          marca: p.marca, modelo: p.modelo, numero_serie: p.numero_serie,
          procesador: p.procesador, ram_gb: p.ram_gb, almacenamiento: p.almacenamiento,
          sistema_operativo: p.sistema_operativo,
        },
      },
      empleado_id: p.empleado_id || null,
      fecha_asignacion: p.fecha_asignacion,
      responsiva_estado: p.responsiva_estado,
      responsiva_fecha_envio: p.responsiva_fecha_envio,
      responsiva_fecha_firma: p.responsiva_fecha_firma,
      responsiva_destino: p.responsiva_destino,
      responsiva_archivo: p.responsiva_archivo,
      responsiva_nombre: p.responsiva_nombre,
      responsiva_url: p.responsiva_url,
    };

    if (p.correo_direccion)
      cuerpo.correo = {
        direccion: p.correo_direccion,
        habilitada: p.correo_habilitada,
      };
    if (p.ms_cuenta_id || p.ms_correo || p.ms_identificador)
      cuerpo.licencia_microsoft = {
        cuenta_id: p.ms_cuenta_id,
        correo_licencia: p.ms_correo,
        identificador_dispositivo: p.ms_identificador,
      };
    if (p.nor_cuenta_id || p.nor_correo || p.nor_identificador)
      cuerpo.licencia_norton = {
        cuenta_id: p.nor_cuenta_id,
        correo_licencia: p.nor_correo,
        identificador_dispositivo: p.nor_identificador,
      };

    try {
      const r = await api("/api/altas/equipo", {
        method: "POST",
        body: JSON.stringify(cuerpo),
      });
      cerrarModal();
      toast(
        `${r.creados.length} registro(s) creado(s)` +
          (r.asignados ? ` y asignado(s)` : "")
      );
      await recargarCatalogos();
      await refrescarContadorAlertas();
      irA(tablet ? "tabletas" : "equipos");
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- asignaciones y documentos

function tipoLlevaResponsiva(tipo) {
  return LLEVAN_RESPONSIVA.includes(tipo);
}

async function modalAsignar(activo = null, empleado = null) {
  const [activos, empleados] = await Promise.all([
    activo ? Promise.resolve([activo]) : api("/api/activos?sin_asignar=true"),
    empleado ? Promise.resolve([empleado]) : api("/api/empleados?estatus=ACTIVO"),
  ]);

  if (!activos.length) {
    toast("No hay activos libres para asignar", "error");
    return;
  }

  abrirModal(
    "Asignar activo",
    `<form id="form-asig">
      <div class="campo"><label>Activo *</label>
        <select name="activo_id" required ${activo ? "disabled" : ""}>
          ${activos
            .map(
              (a) =>
                `<option value="${a.id}">${esc(a.codigo)} — ${esc(TIPOS[a.tipo] || a.tipo)}${
                  a.descripcion ? " — " + esc(a.descripcion) : ""
                }</option>`
            )
            .join("")}
        </select></div>
      <div class="campo"><label>Empleado *</label>
        <select name="empleado_id" required ${empleado ? "disabled" : ""}>
          ${empleados
            .map(
              (e) => `<option value="${e.id}">${esc(e.nombre_completo)} (${esc(e.codigo)})</option>`
            )
            .join("")}
        </select></div>
      <div class="campo"><label>Fecha de asignación</label>
        <input name="fecha_asignacion" type="date" value="${hoyISO()}"></div>

      <div id="bloque-responsiva">
        <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:16px 0 10px">Responsiva</h3>
        ${camposDocumento("responsiva")}
      </div>

      <div id="bloque-ine">
        <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 10px">INE</h3>
        ${camposDocumento("ine")}
      </div>

      <div class="campo"><label>Notas</label><textarea name="notas" rows="2"></textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Asignar</button>`,
    true
  );

  activarSubida("responsiva");
  activarSubida("ine");
  activarEstadoDocumento();

  const selActivo = $('#form-asig [name="activo_id"]');
  const mostrarDocumentos = () => {
    const tipo = activos.find((x) => String(x.id) === selActivo.value)?.tipo;
    $("#bloque-responsiva").hidden = !tipoLlevaResponsiva(tipo);
    $("#bloque-ine").hidden = !LLEVAN_INE.includes(tipo);
  };
  selActivo.onchange = mostrarDocumentos;
  mostrarDocumentos();

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-asig");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    datos.activo_id = Number(activo ? activo.id : datos.activo_id);
    datos.empleado_id = Number(empleado ? empleado.id : datos.empleado_id);
    try {
      await api("/api/asignaciones", { method: "POST", body: JSON.stringify(datos) });
      cerrarModal();
      toast("Activo asignado");
      await refrescarContadorAlertas();
      irA(estado.vista);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

function modalDocumentos(asignacion, conIne = true) {
  const ine = conIne && LLEVAN_INE.includes(asignacion.activo_tipo);
  abrirModal(
    `Documentos de ${asignacion.activo_codigo}`,
    `<form id="form-docs">
      <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:0 0 10px">Responsiva</h3>
      ${camposDocumento("responsiva", asignacion)}

      ${
        ine
          ? `<h3 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-tenue);margin:18px 0 10px">INE</h3>
             ${camposDocumento("ine", asignacion)}`
          : ""
      }

      <div class="campo"><label>Notas</label><textarea name="notas" rows="2">${esc(asignacion.notas || "")}</textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`,
    true
  );

  activarSubida("responsiva");
  activarSubida("ine");
  activarEstadoDocumento();
  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const datos = recolectar($("#form-docs"));
    // Si no se subió archivo nuevo, se conserva el que ya estaba
    datos.responsiva_archivo = datos.responsiva_archivo || asignacion.responsiva_archivo;
    datos.responsiva_nombre = datos.responsiva_nombre || asignacion.responsiva_nombre;
    datos.ine_archivo = datos.ine_archivo || asignacion.ine_archivo;
    datos.ine_nombre = datos.ine_nombre || asignacion.ine_nombre;
    if (!ine) {
      datos.ine_estado = asignacion.ine_estado;
      datos.ine_url = asignacion.ine_url;
    }
    try {
      await api(`/api/asignaciones/${asignacion.id}`, {
        method: "PUT",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast("Documentos actualizados");
      await refrescarContadorAlertas();
      irA(estado.vista);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

function modalDevolver(asignacionId) {
  abrirModal(
    "Registrar devolución",
    `<form id="form-dev">
      <div class="rejilla">
        <div class="campo"><label>Fecha de devolución</label>
          <input name="fecha_devolucion" type="date" value="${hoyISO()}"></div>
        <div class="campo"><label>Nuevo estatus del activo</label>
          <select name="nuevo_estatus_activo">${opciones(
            estado.catalogos.estatus_activo.filter((e) => e !== "ASIGNADO"),
            "DISPONIBLE",
            ""
          )}</select></div>
      </div>
      <div class="campo"><label>Motivo</label>
        <input name="motivo_devolucion" placeholder="Baja del empleado, cambio de equipo, robo…"></div>
      <div class="campo"><label>Notas</label><textarea name="notas" rows="2"></textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Registrar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    try {
      await api(`/api/asignaciones/${asignacionId}/devolver`, {
        method: "POST",
        body: JSON.stringify(recolectar($("#form-dev"))),
      });
      cerrarModal();
      toast("Devolución registrada");
      await refrescarContadorAlertas();
      irA(estado.vista);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- cuentas de licencia

function modalCuentasLicencia() {
  const cuentas = estado.catalogos.cuentas_licencia;
  abrirModal(
    "Familias de licencias",
    `${
      cuentas.length
        ? `<div class="tabla-wrap" style="margin-bottom:14px"><table>
            <thead><tr><th>Nombre</th><th>Producto</th><th class="num">Uso</th><th>Renovación</th><th></th></tr></thead>
            <tbody>${cuentas
              .map(
                (c) => `<tr>
                <td>${esc(c.nombre)}</td>
                <td>${esc(c.producto)}</td>
                <td class="num"><span class="insignia ${
                  c.ranuras_usadas > c.ranuras_totales ? "peligro" : "ok"
                }">${c.ranuras_usadas}/${c.ranuras_totales}</span></td>
                <td>${fecha(c.fecha_renovacion)}</td>
                <td style="display:flex;gap:6px">
                  <button class="btn-secundario btn-mini" data-editar-cuenta="${c.id}">Editar</button>
                  <button class="btn-peligro btn-mini" data-borrar-cuenta="${c.id}">Eliminar</button>
                </td></tr>`
              )
              .join("")}</tbody></table></div>`
        : `<div class="vacio">Aún no hay cuentas registradas.</div>`
    }`,
    `<button class="btn-secundario" id="cerrar-c">Cerrar</button>
     <button class="btn-primario" id="nueva-cuenta">Nueva cuenta</button>`,
    true
  );

  $("#cerrar-c").onclick = () => {
    cerrarModal();
    irA(estado.vista);
  };
  $("#nueva-cuenta").onclick = () => modalCuenta();
  document.querySelectorAll("[data-editar-cuenta]").forEach((b) => {
    b.onclick = () =>
      modalCuenta(cuentas.find((c) => String(c.id) === b.dataset.editarCuenta));
  });
  document.querySelectorAll("[data-borrar-cuenta]").forEach((b) => {
    b.onclick = async () => {
      const c = cuentas.find((x) => String(x.id) === b.dataset.borrarCuenta);
      if (await confirmar(`¿Eliminar la cuenta "${c.nombre}"?`)) {
        try {
          await api(`/api/cuentas-licencia/${c.id}`, { method: "DELETE" });
          toast("Cuenta eliminada");
          await recargarCatalogos();
          modalCuentasLicencia();
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  });
}

function modalCuenta(c = null, alTerminar = modalCuentasLicencia, productoInicial = "") {
  abrirModal(
    c ? `Editar ${c.nombre}` : "Nueva familia de licencias",
    `<form id="form-cuenta">
      <div class="rejilla">
        <div class="campo"><label>Nombre *</label><input name="nombre" required value="${esc(c?.nombre || "")}"></div>
        <div class="campo"><label>Producto *</label>
          <input name="producto" required list="productos" value="${esc(c?.producto || productoInicial)}" placeholder="Microsoft 365">
          <datalist id="productos"><option>Microsoft 365</option><option>Norton 360</option></datalist></div>
        <div class="campo"><label>Correo de la cuenta</label><input name="correo_cuenta" value="${esc(c?.correo_cuenta || "")}"></div>
        <div class="campo"><label>Ranuras contratadas *</label>
          <input name="ranuras_totales" id="ranuras-familia" type="number" min="1" required
                 value="${c?.ranuras_totales ?? (/norton/i.test(productoInicial) ? 10 : 6)}"></div>
        <div class="campo"><label>Fecha de renovación</label>
          <input name="fecha_renovacion" type="date" value="${c?.fecha_renovacion || ""}"></div>
      </div>
      <div class="campo"><label>Dónde está la contraseña</label>
        <input name="referencia_credencial" value="${esc(c?.referencia_credencial || "")}"
               placeholder="Bitwarden &gt; Norton TI"></div>
      <div class="campo"><label>Notas</label><textarea name="notas" rows="2">${esc(c?.notas || "")}</textarea></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  const producto = $('#form-cuenta [name="producto"]');
  const ranuras = $("#ranuras-familia");
  const ajustarTope = () => {
    const tope = /norton/i.test(producto.value)
      ? LICENCIAS_POR_FAMILIA.LICENCIA_NORTON
      : /microsoft|365|office/i.test(producto.value)
      ? LICENCIAS_POR_FAMILIA.LICENCIA_MICROSOFT
      : null;
    if (tope) {
      ranuras.max = tope;
      if (Number(ranuras.value) > tope) ranuras.value = tope;
    } else ranuras.removeAttribute("max");
  };
  producto.oninput = ajustarTope;
  ajustarTope();

  $("#cancelar").onclick = () => alTerminar();
  $("#guardar").onclick = async () => {
    const form = $("#form-cuenta");
    if (!form.reportValidity()) return;
    try {
      await api(c ? `/api/cuentas-licencia/${c.id}` : "/api/cuentas-licencia", {
        method: c ? "PUT" : "POST",
        body: JSON.stringify(recolectar(form)),
      });
      toast(c ? "Familia actualizada" : "Familia creada");
      await recargarCatalogos();
      alTerminar();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- impresoras

const PROPIETARIOS_IMPRESORA = [
  { id: "PROVEEDOR", nombre: "Proveedor" },
  { id: "PROPIA", nombre: "Propia" },
];

async function verImpresoras() {
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Impresoras</h2><p>Inventario de impresoras</p></div>
      ${puedeEditar() ? `<button class="btn-primario" id="btn-nueva-imp">Nueva impresora</button>` : ""}
    </div>
    <div class="filtros">
      <div class="campo busqueda"><label>Buscar</label>
        <input id="i-q" placeholder="Serie, locación o identificador del proveedor…"></div>
      <div class="campo"><label>Propietario</label>
        <select id="i-prop">${opciones(PROPIETARIOS_IMPRESORA, "", "Todos")}</select></div>
      ${filtrosUbicacion("i")}
    </div>
    <div id="tabla-impresoras"></div>`;

  if (puedeEditar()) $("#btn-nueva-imp").onclick = () => modalImpresora();
  ["i-q", "i-prop"].forEach((id) => {
    $("#" + id).oninput = cargarImpresoras;
    $("#" + id).onchange = cargarImpresoras;
  });
  enlazarUbicacion("i", cargarImpresoras);
  cargarImpresoras();
}

async function cargarImpresoras() {
  const params = new URLSearchParams();
  const q = $("#i-q").value.trim();
  if (q) params.set("q", q);
  if ($("#i-prop").value) params.set("propietario", $("#i-prop").value);
  Object.entries(valoresUbicacion("i")).forEach(([k, v]) => params.set(k, v));

  const lista = await api("/api/impresoras?" + params);
  const mono = (t) => `<span style="font-family:var(--mono);font-size:14px">${esc(t || "—")}</span>`;
  $("#tabla-impresoras").innerHTML = lista.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Número de serie</th><th>Propietario</th><th>Locación</th>
          <th>Sucursal / locación</th><th>Departamentos</th>
          <th>Serie proveedor</th><th>Identificador del proveedor</th></tr></thead>
        <tbody>${lista
          .map(
            (i) => `<tr class="clicable" data-id="${i.id}">
              <td>${mono(i.numero_serie)}</td>
              <td><span class="insignia ${i.propietario === "PROVEEDOR" ? "acento" : "ok"}">${
                i.propietario === "PROVEEDOR" ? "Proveedor" : "Propia"
              }</span></td>
              <td>${esc(i.locacion || "—")}</td>
              <td>${esc([i.sucursal, i.bodega].filter(Boolean).join(" · ") || "—")}</td>
              <td>${i.departamentos.length ? i.departamentos.map((d) => esc(d.nombre)).join(", ") : "—"}</td>
              <td>${mono(i.numero_serie_proveedor)}</td>
              <td>${mono(i.identificador_proveedor)}</td>
            </tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">No hay impresoras que coincidan.</div></div>`;

  if (!puedeEditar()) return;
  document.querySelectorAll("#tabla-impresoras tr.clicable").forEach((tr) => {
    tr.onclick = () => modalImpresora(lista.find((i) => String(i.id) === tr.dataset.id));
  });
}

function modalImpresora(imp = null) {
  const elegidos = new Set((imp?.departamento_ids || []).map(String));
  abrirModal(
    imp ? `Editar impresora ${imp.numero_serie}` : "Nueva impresora",
    `<form id="form-imp">
      <div class="rejilla">
        <div class="campo"><label>Número de serie *</label>
          <input name="numero_serie" required value="${esc(imp?.numero_serie || "")}"></div>
        <div class="campo"><label>Proveedor / propietario *</label>
          <select name="propietario" required>${opciones(PROPIETARIOS_IMPRESORA, imp?.propietario, "— Selecciona —")}</select></div>
        <div class="campo"><label>Locación</label>
          <input name="locacion" value="${esc(imp?.locacion || "")}"></div>
        <div class="campo"><label>Sucursal</label>
          <select name="sucursal_id">${opciones(estado.catalogos.sucursales, imp?.sucursal_id)}</select></div>
        <div class="campo"><label>Locación</label>
          <select name="bodega_id">${opciones(estado.catalogos.bodegas, imp?.bodega_id)}</select></div>
        <div class="campo"><label>Número de serie del proveedor</label>
          <input name="numero_serie_proveedor" value="${esc(imp?.numero_serie_proveedor || "")}"></div>
        <div class="campo"><label>Identificador del proveedor *</label>
          <input name="identificador_proveedor" required value="${esc(imp?.identificador_proveedor || "")}"></div>
      </div>
      <div class="campo"><label>Departamentos que la usan</label>
        <div class="casillas">${estado.catalogos.departamentos
          .map(
            (d) => `<label class="casilla"><input type="checkbox" data-depto="${d.id}" ${
              elegidos.has(String(d.id)) ? "checked" : ""
            }><span>${esc(d.nombre)}</span></label>`
          )
          .join("")}</div></div>
    </form>`,
    `${imp ? '<button class="btn-peligro" id="borrar-imp">Eliminar</button>' : ""}
     <button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-imp");
    if (!form.reportValidity()) return;
    const datos = {};
    new FormData(form).forEach((v, k) => (datos[k] = v.trim() || null));
    ["sucursal_id", "bodega_id"].forEach((k) => datos[k] && (datos[k] = Number(datos[k])));
    datos.departamento_ids = [...form.querySelectorAll("[data-depto]:checked")].map((c) =>
      Number(c.dataset.depto)
    );
    try {
      await api(imp ? `/api/impresoras/${imp.id}` : "/api/impresoras", {
        method: imp ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(imp ? "Impresora actualizada" : "Impresora registrada");
      cargarImpresoras();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  if (imp)
    $("#borrar-imp").onclick = async () => {
      if (!(await confirmar(`¿Eliminar la impresora ${imp.numero_serie}?`))) return;
      try {
        await api(`/api/impresoras/${imp.id}`, { method: "DELETE" });
        toast("Impresora eliminada");
        cargarImpresoras();
      } catch (err) {
        toast(err.message, "error");
      }
    };
}

// ---------------------------------------------------------------- contraseñas

const ALCANCES_RED = {
  LOCAL: { titulo: "SSID Locales", vacio: "No hay redes locales registradas." },
  FORANEA: { titulo: "SSID Foráneas", vacio: "No hay redes foráneas registradas." },
};
const PROVEEDORES_RED = [
  { id: "TELMEX", nombre: "Telmex" },
  { id: "TOTALPLAY", nombre: "Totalplay" },
  { id: "MEGACABLE", nombre: "Megacable" },
  { id: "OTRO", nombre: "Otro" },
];
const INSIGNIA_PROVEEDOR = { TELMEX: "acento", TOTALPLAY: "ok", MEGACABLE: "alerta", OTRO: "neutra" };

async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

async function verContrasenas() {
  const alcance = estado.alcanceRed || "LOCAL";
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Contraseñas</h2><p>${ALCANCES_RED[alcance].titulo}</p></div>
      ${esAdmin() ? `<button class="btn-primario" id="btn-nueva-red">Nueva red</button>` : ""}
    </div>
    <div class="pestanas" role="tablist">
      ${Object.entries(ALCANCES_RED)
        .map(
          ([k, v]) => `<button role="tab" data-alcance="${k}" class="${k === alcance ? "activa" : ""}"
                         aria-selected="${k === alcance}">${esc(v.titulo)}</button>`
        )
        .join("")}
    </div>
    <div class="filtros">
      <div class="campo busqueda"><label>Buscar</label>
        <input id="r-q" placeholder="Ubicación, SSID o número de cuenta…"></div>
      <div class="campo"><label>Proveedor</label>
        <select id="r-prov">${opciones(PROVEEDORES_RED, "", "Todos")}</select></div>
    </div>
    <div id="tabla-redes"></div>`;

  document.querySelectorAll("[data-alcance]").forEach((b) => {
    b.onclick = () => {
      estado.alcanceRed = b.dataset.alcance;
      verContrasenas();
    };
  });
  if (esAdmin()) $("#btn-nueva-red").onclick = () => modalRed(null, alcance);

  const lista = await api(`/api/redes?alcance=${alcance}`);
  const pintar = () => {
    const q = $("#r-q").value.trim().toLowerCase();
    const prov = $("#r-prov").value;
    pintarRedes(
      lista.filter(
        (r) =>
          (!prov || r.proveedor === prov) &&
          (!q || [r.ubicacion, r.ssid, r.numero_cuenta].some((t) => (t || "").toLowerCase().includes(q)))
      ),
      alcance
    );
  };
  $("#r-q").oninput = pintar;
  $("#r-prov").onchange = pintar;
  pintar();
}

function pintarRedes(lista, alcance) {
  const mono = (t) => `<span style="font-family:var(--mono);font-size:14px">${esc(t || "—")}</span>`;
  $("#tabla-redes").innerHTML = lista.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Ubicación de la red</th><th>SSID</th><th>Contraseña</th>
          <th>Número de cuenta</th><th>Proveedor</th></tr></thead>
        <tbody>${lista
          .map(
            (r) => `<tr class="${esAdmin() ? "clicable" : ""}" data-id="${r.id}">
              <td>${esc(r.ubicacion)}</td>
              <td>${mono(r.ssid)}</td>
              <td><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="secreto" style="font-family:var(--mono);font-size:14px">${
                  r.contrasena === null ? "—" : "••••••••"
                }</span>
                ${
                  r.contrasena === null
                    ? ""
                    : `<button class="btn-secundario btn-mini" data-ver="${r.id}">Ver</button>
                       <button class="btn-secundario btn-mini" data-copiar="${r.id}">Copiar</button>`
                }</div></td>
              <td>${mono(r.numero_cuenta)}</td>
              <td><span class="insignia ${INSIGNIA_PROVEEDOR[r.proveedor] || "neutra"}">${esc(
                PROVEEDORES_RED.find((p) => p.id === r.proveedor)?.nombre || r.proveedor
              )}</span></td>
            </tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">${ALCANCES_RED[alcance].vacio}</div></div>`;

  const red = (id) => lista.find((r) => String(r.id) === String(id));
  document.querySelectorAll("#tabla-redes [data-ver]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const celda = b.parentElement.querySelector(".secreto");
      const oculta = b.textContent === "Ver";
      celda.textContent = oculta ? red(b.dataset.ver).contrasena : "••••••••";
      b.textContent = oculta ? "Ocultar" : "Ver";
    };
  });
  document.querySelectorAll("#tabla-redes [data-copiar]").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      try {
        await copiarTexto(red(b.dataset.copiar).contrasena);
        toast("Contraseña copiada");
      } catch {
        toast("No se pudo copiar", "error");
      }
    };
  });
  if (!esAdmin()) return;
  document.querySelectorAll("#tabla-redes tr.clicable").forEach((tr) => {
    tr.onclick = () => modalRed(red(tr.dataset.id), alcance);
  });
}

function modalRed(r, alcance) {
  const alcances = Object.entries(ALCANCES_RED).map(([id, v]) => ({ id, nombre: v.titulo }));
  abrirModal(
    r ? `Editar red ${r.ssid}` : "Nueva red",
    `<form id="form-red">
      <div class="rejilla">
        <div class="campo"><label>Tipo *</label>
          <select name="alcance" required>${opciones(alcances, r?.alcance || alcance, "")}</select></div>
        <div class="campo"><label>Ubicación de la red *</label>
          <input name="ubicacion" required maxlength="160" value="${esc(r?.ubicacion || "")}"></div>
        <div class="campo"><label>SSID *</label>
          <input name="ssid" required maxlength="80" value="${esc(r?.ssid || "")}"></div>
        <div class="campo"><label>Contraseña *</label>
          <input name="contrasena" required maxlength="128" autocomplete="off" spellcheck="false"
                 value="${esc(r?.contrasena || "")}"></div>
        <div class="campo"><label>Número de cuenta</label>
          <input name="numero_cuenta" maxlength="60" value="${esc(r?.numero_cuenta || "")}"></div>
        <div class="campo"><label>Proveedor *</label>
          <select name="proveedor" required>${opciones(PROVEEDORES_RED, r?.proveedor, "— Selecciona —")}</select></div>
      </div>
    </form>`,
    `${r ? '<button class="btn-peligro" id="borrar-red">Eliminar</button>' : ""}
     <button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-red");
    if (!form.reportValidity()) return;
    const datos = {};
    new FormData(form).forEach((v, k) => (datos[k] = k === "contrasena" ? v : v.trim() || null));
    try {
      await api(r ? `/api/redes/${r.id}` : "/api/redes", {
        method: r ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(r ? "Red actualizada" : "Red registrada");
      estado.alcanceRed = datos.alcance;
      verContrasenas();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  if (r)
    $("#borrar-red").onclick = async () => {
      if (!(await confirmar(`¿Eliminar la red ${r.ssid} de ${r.ubicacion}?`))) return;
      try {
        await api(`/api/redes/${r.id}`, { method: "DELETE" });
        toast("Red eliminada");
        verContrasenas();
      } catch (err) {
        toast(err.message, "error");
      }
    };
}

// ---------------------------------------------------------------- alertas

function itemAlerta(a, i) {
  return `<div class="alerta-item ${a.severidad} con-destino" data-alerta="${i}" role="button" tabindex="0">
    <div><div class="titulo">${esc(a.titulo)}</div>
    <div class="detalle">${esc(a.detalle || "")}</div></div></div>`;
}

async function abrirAlerta(a) {
  cerrarFlotantes();
  switch (a.tipo) {
    case "licencia_por_vencer":
    case "sobreasignacion":
      if (!a.cuenta_id && a.activo_id) return verFichaActivo(a.activo_id);
      estado.licencias = a.producto === "norton" ? "norton" : "microsoft";
      return irA("licencias");
    case "correo_sin_uso":
      return verFichaActivo(a.activo_id);
    case "baja_con_activos":
      return verFichaEmpleado(a.empleado_id);
    case "responsiva_atrasada":
      if (puedeEditar()) {
        const lista = await api("/api/notificaciones");
        const asignacion = lista.find((n) => n.id === a.asignacion_id);
        if (asignacion) return modalDocumentos(asignacion, false);
      }
      return verFichaActivo(a.activo_id);
    case "responsiva":
      return irA("notificaciones");
    case "auditoria":
      return verAuditoria(a.auditoria_id);
    case "reemplazo":
      return irA("equipos");
  }
}

function activarAlertas(contenedor, alertas) {
  contenedor.querySelectorAll("[data-alerta]").forEach((el) => {
    const abrir = () => abrirAlerta(alertas[Number(el.dataset.alerta)]);
    el.onclick = abrir;
    el.onkeydown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrir();
      }
    };
  });
}

async function verAlertas() {
  const alertas = await api("/api/alertas?dias=60");
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Alertas</h2><p>Vencimientos de los próximos 60 días, faltantes y riesgos detectados</p></div>
    </div>
    <div class="panel">
      ${alertas.length ? alertas.map(itemAlerta).join("") : `<div class="vacio">Todo en orden. Sin alertas.</div>`}
    </div>`;
  activarAlertas($("#vista"), alertas);
}

// ---------------------------------------------------------------- notificaciones

async function verNotificaciones() {
  const lista = await api("/api/notificaciones");
  const enEspera = lista.filter((n) => n.responsiva_estado === "ENVIADA");
  const porEnviar = lista.filter((n) => n.responsiva_estado === "PENDIENTE");
  const atrasadas = enEspera.filter((n) => n.atrasada).length;

  const item = (n) => {
    const info = ESTADOS_DOC[n.responsiva_estado];
    const envio =
      n.responsiva_estado === "ENVIADA"
        ? ` · enviada${n.responsiva_destino ? " a " + n.responsiva_destino : ""}${
            n.dias_en_espera != null ? ` hace ${n.dias_en_espera} días` : ""
          }`
        : "";
    return `<div class="alerta-item notif con-destino ${
      n.atrasada ? "critica" : n.responsiva_estado === "ENVIADA" ? "media" : "baja"
    }" data-notif-activo="${n.activo_id}" role="button" tabindex="0">
      <div style="flex:1;min-width:0">
        <div class="titulo"><span class="codigo">${esc(n.activo_codigo)}</span>
          · ${esc(TIPOS[n.activo_tipo] || n.activo_tipo)}${
            n.activo_descripcion ? " · " + esc(n.activo_descripcion) : ""
          }</div>
        <div class="detalle">${esc(
          `${n.empleado} (${n.codigo_empleado}) · entregado el ${fecha(n.fecha_asignacion)}${envio}`
        )}</div>
      </div>
      <span class="insignia ${n.atrasada ? "peligro" : info.insignia}">${
        n.atrasada ? "Atrasada" : esc(info.etiqueta)
      }</span>
      ${
        puedeEditar()
          ? `<button class="btn-secundario btn-mini" data-notif="${n.id}">Documentos</button>`
          : ""
      }
    </div>`;
  };

  const bloque = (titulo, filas) =>
    filas.length ? `<div class="panel"><h3>${titulo}</h3>${filas.map(item).join("")}</div>` : "";

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Notificaciones</h2><p>Responsivas por recibir</p></div>
    </div>
    <div class="tarjetas">
      <div class="tarjeta ${lista.length ? "rosa" : "cyan"}"><div class="etiqueta">Por recibir</div>
        <div class="valor">${lista.length}</div></div>
      <div class="tarjeta"><div class="etiqueta">En espera de firma</div>
        <div class="valor">${enEspera.length}</div></div>
      <div class="tarjeta amarillo"><div class="etiqueta">Sin enviar</div>
        <div class="valor">${porEnviar.length}</div></div>
      <div class="tarjeta ${atrasadas ? "rojo" : "cyan"}"><div class="etiqueta">Atrasadas</div>
        <div class="valor">${atrasadas}</div></div>
    </div>
    ${
      lista.length
        ? bloque("En espera de firma", enEspera) + bloque("Sin enviar", porEnviar)
        : `<div class="panel"><div class="vacio">Todas las responsivas están firmadas.</div></div>`
    }`;

  document.querySelectorAll("[data-notif]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      modalDocumentos(lista.find((n) => String(n.id) === b.dataset.notif), false);
    };
  });
  document.querySelectorAll("[data-notif-activo]").forEach((el) => {
    el.onclick = () => verFichaActivo(el.dataset.notifActivo);
    el.onkeydown = (ev) => {
      if (ev.target === el && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        verFichaActivo(el.dataset.notifActivo);
      }
    };
  });
}

// ---------------------------------------------------------------- personal de TI

const ROLES = { ADMIN: "Administrador", CAPTURA: "Captura", CONSULTA: "Consulta" };
const INSIGNIA_ROL = { ADMIN: "acento", CAPTURA: "ok", CONSULTA: "neutra" };

async function verUsuarios() {
  const usuarios = await api("/api/usuarios");
  const yo = estado.usuario.id;
  const soyPrincipal = usuarios.some((u) => u.principal && u.id === yo);
  const gestionable = (u) =>
    u.id !== yo && !u.principal && (soyPrincipal || u.rol !== "ADMIN");
  const activos = usuarios.filter((u) => u.activo);
  const contar = (rol) => activos.filter((u) => u.rol === rol).length;

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Personal de TI</h2><p>Cuentas con acceso al inventario</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-secundario" id="btn-mi-pass">Mi contraseña</button>
        <button class="btn-primario" id="btn-nuevo-usr">Agregar integrante</button>
      </div>
    </div>
    <div class="tarjetas">
      <div class="tarjeta cyan"><div class="etiqueta">Cuentas activas</div><div class="valor">${activos.length}</div>
        <div class="pie">${usuarios.length - activos.length} desactivadas</div></div>
      <div class="tarjeta rosa"><div class="etiqueta">Administradores</div><div class="valor">${contar("ADMIN")}</div></div>
      <div class="tarjeta"><div class="etiqueta">Captura</div><div class="valor">${contar("CAPTURA")}</div></div>
      <div class="tarjeta"><div class="etiqueta">Consulta</div><div class="valor">${contar("CONSULTA")}</div></div>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estatus</th><th>Último acceso</th><th></th></tr></thead>
      <tbody>${usuarios
        .map(
          (u) => `<tr>
          <td class="codigo">${esc(u.username)}</td>
          <td>${htmlAvatar(u, "chico")} ${esc(u.nombre)}
            ${u.principal ? '<span class="insignia acento" style="margin-left:6px">Principal</span>' : ""}
            ${u.id === yo ? '<span class="insignia neutra" style="margin-left:6px">Tú</span>' : ""}</td>
          <td><span class="insignia ${INSIGNIA_ROL[u.rol]}">${ROLES[u.rol]}</span></td>
          <td><span class="insignia ${u.activo ? "ok" : "peligro"}">${u.activo ? "Activo" : "Desactivado"}</span></td>
          <td>${fechaHora(u.ultimo_acceso)}</td>
          <td>${
            gestionable(u)
              ? `<button class="btn-secundario btn-mini" data-usr="${u.id}">Editar</button>`
              : ""
          }</td></tr>`
        )
        .join("")}</tbody></table></div>`;

  $("#btn-mi-pass").onclick = () => modalPassword();
  $("#btn-nuevo-usr").onclick = () => modalUsuario(null, soyPrincipal);
  document.querySelectorAll("[data-usr]").forEach((b) => {
    b.onclick = () =>
      modalUsuario(usuarios.find((u) => String(u.id) === b.dataset.usr), soyPrincipal);
  });
}

function modalUsuario(u, soyPrincipal) {
  const roles = soyPrincipal ? ["ADMIN", "CAPTURA", "CONSULTA"] : ["CAPTURA", "CONSULTA"];
  const rolActual = u?.rol || "CAPTURA";

  abrirModal(
    u ? `Editar ${u.username}` : "Agregar integrante de TI",
    `<form id="form-usr">
      <div class="rejilla">
        ${
          u
            ? ""
            : `<div class="campo"><label>Usuario *</label>
                 <input name="username" required minlength="3" maxlength="40" autocomplete="off"
                        placeholder="nombre.apellido"></div>`
        }
        <div class="campo"><label>Nombre completo *</label>
          <input name="nombre" required value="${esc(u?.nombre || "")}"></div>
        <div class="campo"><label>Rol *</label>
          <select name="rol">${roles
            .map((r) => `<option value="${r}" ${r === rolActual ? "selected" : ""}>${ROLES[r]}</option>`)
            .join("")}</select></div>
        <div class="campo"><label>${u ? "Nueva contraseña" : "Contraseña *"}</label>
          <input name="password" type="password" minlength="8" autocomplete="new-password"
                 ${u ? 'placeholder="Sin cambios"' : "required"}></div>
        ${u ? `<div class="campo"><label>Estatus</label>${interruptor("activo", u.activo)}</div>` : ""}
      </div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-usr");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    try {
      await api(u ? `/api/usuarios/${u.id}` : "/api/usuarios", {
        method: u ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(u ? "Cuenta actualizada" : "Integrante agregado");
      verUsuarios();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- reportes

async function verReportes() {
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Reportes</h2><p>Distribución del inventario y exportación a Excel</p></div>
      <a class="boton btn-primario" href="/api/reportes/exportar"
         style="text-decoration:none;display:inline-block">Descargar Excel</a>
    </div>
    <div class="filtros">
      <div class="campo"><label>Agrupar por</label>
        <select id="r-grupo">
          <option value="sucursal">Sucursal</option>
          <option value="departamento">Departamento</option>
          <option value="tipo">Tipo de activo</option>
          <option value="estatus">Estatus</option>
        </select></div>
    </div>
    <div id="tabla-reporte"></div>`;

  $("#r-grupo").onchange = cargarReporte;
  cargarReporte();
}

async function cargarReporte() {
  const filas = await api(`/api/reportes/inventario?agrupar_por=${$("#r-grupo").value}`);
  const total = filas.reduce((s, f) => s + f.activos, 0);
  const maximo = Math.max(1, ...filas.map((f) => f.activos));

  $("#tabla-reporte").innerHTML = filas.length
    ? `<div class="panel">
        ${filas
          .map(
            (f, i) => `<div class="barra-fila">
          <div class="nombre">${esc(f.grupo)}</div>
          <div class="pista"><div class="relleno" style="width:${(f.activos / maximo) * 100}%;animation-delay:${i * 50}ms"></div></div>
          <div class="cifra">${f.activos}</div></div>`
          )
          .join("")}
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);
                    display:flex;justify-content:space-between;font-weight:600">
          <span>TOTAL</span><span>${total}</span></div>
      </div>`
    : `<div class="panel"><div class="vacio">Sin datos para reportar todavía.</div></div>`;
}

// ---------------------------------------------------------------- bitácora

async function verBitacora() {
  const registros = await api("/api/bitacora?limite=200");
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Bitácora</h2><p>Quién hizo qué y cuándo</p></div>
    </div>
    ${
      registros.length
        ? `<div class="tabla-wrap"><table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
            <tbody>${registros
              .map(
                (r) => `<tr><td>${fechaHora(r.fecha)}</td><td>${esc(r.usuario || "—")}</td>
                <td><span class="insignia neutra">${esc(r.accion)}</span></td>
                <td>${esc(r.entidad)}</td><td>${esc(r.detalle || "—")}</td></tr>`
              )
              .join("")}</tbody></table></div>`
        : `<div class="panel"><div class="vacio">Sin movimientos registrados.</div></div>`
    }`;
}


// ---------------------------------------------------------------- notas y pendientes

const ESTADOS_NOTA = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  RESUELTA: "Resuelta",
};

async function verNotas() {
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Notas y pendientes</h2><p>Recados del área, visibles para todo el equipo de TI</p></div>
      ${puedeEditar() ? `<button class="btn-primario" id="btn-nueva-nota">Nueva nota</button>` : ""}
    </div>
    <div class="filtros">
      <div class="campo"><label>Estado</label>
        <select id="n-estado">
          <option value="">Abiertas y resueltas</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="EN_PROCESO">En proceso</option>
          <option value="RESUELTA">Resueltas</option>
        </select></div>
    </div>
    <div id="lista-notas"></div>`;

  if (puedeEditar()) $("#btn-nueva-nota").onclick = () => modalNota();
  $("#n-estado").onchange = cargarNotas;
  cargarNotas();
}

async function cargarNotas() {
  const estado = $("#n-estado").value;
  const notas = await api("/api/notas" + (estado ? `?estado=${estado}` : ""));

  $("#lista-notas").innerHTML = notas.length
    ? notas
        .map(
          (n) => `<div class="nota ${n.prioridad} ${n.estado === "RESUELTA" ? "resuelta" : ""}">
        <div class="cabecera">
          <b>${esc(n.titulo)}</b>
          <span class="insignia ${
            n.estado === "RESUELTA" ? "ok" : n.estado === "EN_PROCESO" ? "acento" : "alerta"
          }">${ESTADOS_NOTA[n.estado]}</span>
          <span class="insignia ${
            n.prioridad === "ALTA" ? "peligro" : n.prioridad === "MEDIA" ? "alerta" : "neutra"
          }">${n.prioridad}</span>
          ${n.empleado ? `<span class="insignia neutra">${esc(n.empleado)}</span>` : ""}
          ${n.activo ? `<span class="codigo">${esc(n.activo)}</span>` : ""}
          ${
            puedeEditar()
              ? `<span style="margin-left:auto;display:flex;gap:6px">
                   ${
                     n.estado !== "RESUELTA"
                       ? `<button class="btn-secundario btn-mini" data-resolver="${n.id}">Resolver</button>`
                       : ""
                   }
                   <button class="btn-secundario btn-mini" data-editar-nota="${n.id}">Editar</button>
                   <button class="btn-peligro btn-mini" data-borrar-nota="${n.id}">Eliminar</button>
                 </span>`
              : ""
          }
        </div>
        ${n.contenido ? `<div class="cuerpo">${esc(n.contenido)}</div>` : ""}
        <div class="meta">
          ${esc(n.autor_nombre || "—")} · ${fechaHora(n.creado_en)}
          ${n.resuelta_por ? ` · resuelta por ${esc(n.resuelta_por)} el ${fechaHora(n.resuelta_en)}` : ""}
        </div>
      </div>`
        )
        .join("")
    : `<div class="panel"><div class="vacio">No hay notas. Úsalas para dejar pendientes que otros deban ver.</div></div>`;

  if (!puedeEditar()) return;
  document.querySelectorAll("[data-editar-nota]").forEach((b) => {
    b.onclick = () => modalNota(notas.find((n) => String(n.id) === b.dataset.editarNota));
  });
  document.querySelectorAll("[data-resolver]").forEach((b) => {
    b.onclick = async () => {
      const n = notas.find((x) => String(x.id) === b.dataset.resolver);
      try {
        await api(`/api/notas/${n.id}`, {
          method: "PUT",
          body: JSON.stringify({
            titulo: n.titulo,
            contenido: n.contenido,
            estado: "RESUELTA",
            prioridad: n.prioridad,
            empleado_id: n.empleado_id,
            activo_id: n.activo_id,
          }),
        });
        toast("Nota resuelta");
        await refrescarContadorAlertas();
        cargarNotas();
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });
  document.querySelectorAll("[data-borrar-nota]").forEach((b) => {
    b.onclick = async () => {
      const n = notas.find((x) => String(x.id) === b.dataset.borrarNota);
      if (await confirmar(`¿Eliminar la nota "${n.titulo}"?`)) {
        try {
          await api(`/api/notas/${n.id}`, { method: "DELETE" });
          toast("Nota eliminada");
          await refrescarContadorAlertas();
          cargarNotas();
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  });
}

async function modalNota(n = null) {
  const empleados = await api("/api/empleados");
  abrirModal(
    n ? "Editar nota" : "Nueva nota",
    `<form id="form-nota">
      <div class="campo"><label>Título *</label>
        <input name="titulo" required maxlength="160" value="${esc(n?.titulo || "")}"
               placeholder="Pendiente, recado o seguimiento"></div>
      <div class="campo"><label>Detalle</label>
        <textarea name="contenido" rows="4">${esc(n?.contenido || "")}</textarea></div>
      <div class="rejilla">
        <div class="campo"><label>Prioridad</label>
          <select name="prioridad">
            ${["ALTA", "MEDIA", "BAJA"]
              .map(
                (x) =>
                  `<option value="${x}" ${x === (n?.prioridad || "MEDIA") ? "selected" : ""}>${x}</option>`
              )
              .join("")}
          </select></div>
        <div class="campo"><label>Estado</label>
          <select name="estado">
            ${Object.entries(ESTADOS_NOTA)
              .map(
                ([k, v]) =>
                  `<option value="${k}" ${k === (n?.estado || "PENDIENTE") ? "selected" : ""}>${v}</option>`
              )
              .join("")}
          </select></div>
        <div class="campo"><label>Relacionada con</label>
          <select name="empleado_id">${opciones(
            empleados.map((e) => ({ id: e.id, nombre: `${e.nombre_completo} (${e.codigo})` })),
            n?.empleado_id,
            "— Ninguna persona —"
          )}</select></div>
      </div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-nota");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    datos.activo_id = n?.activo_id || null;
    try {
      await api(n ? `/api/notas/${n.id}` : "/api/notas", {
        method: n ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(n ? "Nota actualizada" : "Nota creada");
      await refrescarContadorAlertas();
      cargarNotas();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- auditoría

const TIPOS_AUDITORIA = { CORREO: "Correo", NORTON: "Supervisión" };

const ESTADOS_ITEM = {
  PENDIENTE: "Pendiente",
  CONFORME: "Conforme",
  INCIDENCIA: "Incidencia",
  NO_APLICA: "No aplica",
};

async function verAuditorias() {
  const auditorias = await api("/api/auditorias");

  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Auditoría</h2><p>Revisión semanal de correo y supervisión, como checklist</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-secundario" id="btn-aud-mensual">Reporte mensual</button>
        ${
          esAdmin()
            ? `<button class="btn-secundario" id="btn-aud-correo">Programar correo</button>
               <button class="btn-primario" id="btn-aud-norton">Programar supervisión</button>`
            : ""
        }
      </div>
    </div>
    ${
      auditorias.length
        ? `<div class="tabla-wrap"><table>
            <thead><tr><th>Semana</th><th>Tipo</th><th>Analista asignado</th><th>Avance</th>
            <th class="num">Incidencias</th><th>Estado</th></tr></thead>
            <tbody>${auditorias
              .map(
                (a) => `<tr class="clicable" data-id="${a.id}">
                <td>${fecha(a.fecha_inicio)} — ${fecha(a.fecha_fin)}</td>
                <td>${TIPOS_AUDITORIA[a.tipo] || a.tipo}</td>
                <td>${
                  a.analista
                    ? `<span class="insignia acento">${esc(a.analista)}</span>`
                    : '<span style="color:var(--texto-tenue)">Sin asignar</span>'
                }</td>
                <td style="min-width:130px">
                  <div style="font-size:14px">${a.revisados}/${a.total}</div>
                  <div class="avance"><div style="width:${a.avance}%"></div></div>
                </td>
                <td class="num">${
                  a.incidencias
                    ? `<span class="insignia peligro">${a.incidencias}</span>`
                    : '<span style="color:var(--texto-tenue)">0</span>'
                }</td>
                <td><span class="insignia ${a.estado === "CERRADA" ? "ok" : "alerta"}">${
                  a.estado === "CERRADA" ? "Cerrada" : "En proceso"
                }</span></td></tr>`
              )
              .join("")}</tbody></table></div>`
        : `<div class="panel"><div class="vacio">
             Aún no hay auditorías programadas.
           </div></div>`
    }`;

  $("#btn-aud-mensual").onclick = () => modalReporteMensual(auditorias);
  if (esAdmin()) {
    $("#btn-aud-correo").onclick = () => crearAuditoria("CORREO");
    $("#btn-aud-norton").onclick = () => crearAuditoria("NORTON");
  }
  document
    .querySelectorAll("#vista tr.clicable")
    .forEach((tr) => (tr.onclick = () => verAuditoria(tr.dataset.id)));
}

async function crearAuditoria(tipo) {
  const hoy = hoyISO();
  const analistas = estado.catalogos.analistas || [];

  abrirModal(
    `Programar ${tipo === "CORREO" ? "correo" : "supervisión"}`,
    `<form id="form-aud">
      <div class="rejilla">
        <div class="campo"><label>Semana a auditar</label>
          <input name="fecha" type="date" value="${hoy}"></div>
        <div class="campo"><label>Analista asignado *</label>
          <select name="analista_id" required>
            ${analistas
              .map((u) => `<option value="${u.id}">${esc(u.nombre)} · ${esc(u.rol)}</option>`)
              .join("")}
          </select></div>
        ${
          tipo === "NORTON"
            ? `<div class="campo"><label>Días sin actividad</label>
                 <input name="dias_sin_actividad" type="number" min="1" max="365" value="7"></div>`
            : ""
        }
      </div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Programar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-aud");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    datos.tipo = tipo;
    if (datos.dias_sin_actividad) datos.dias_sin_actividad = Number(datos.dias_sin_actividad);
    try {
      const a = await api("/api/auditorias", { method: "POST", body: JSON.stringify(datos) });
      cerrarModal();
      toast(`Auditoría programada para ${a.analista} · ${a.total} puntos`);
      await refrescarContadorAlertas();
      verAuditoria(a.id);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

async function verAuditoria(id) {
  const a = await api(`/api/auditorias/${id}`);
  const cerrada = a.estado === "CERRADA";
  const editable = puedeEditar() && !cerrada;

  let html = "";
  let categoriaActual = null;
  for (const item of a.items) {
    if (item.categoria !== categoriaActual) {
      categoriaActual = item.categoria;
      html += `<div class="grupo-categoria">${esc(categoriaActual)}</div>`;
    }
    html += `<div class="item-check ${item.estado}">
      <div class="texto">
        <div class="desc">${esc(item.descripcion)}
          ${item.automatico ? '<span class="insignia acento">Detectado</span>' : ""}</div>
        ${item.observacion ? `<div class="obs">${esc(item.observacion)}</div>` : ""}
        ${
          item.evidencias.length
            ? `<div class="evidencias">${item.evidencias
                .map(
                  (ev) => `<span class="evidencia">
                    <a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.nombre)}</a>
                    ${
                      editable
                        ? `<button type="button" class="quitar" data-quitar-evidencia="${ev.id}"
                             title="Quitar">&times;</button>`
                        : ""
                    }</span>`
                )
                .join("")}</div>`
            : ""
        }
        ${
          item.actualizado_por
            ? `<div style="font-size:13px;color:var(--texto-tenue);margin-top:4px">
                 ${esc(item.actualizado_por)} · ${fechaHora(item.actualizado_en)}</div>`
            : ""
        }
      </div>
      ${
        editable
          ? `<div class="acciones">
               ${["CONFORME", "INCIDENCIA", "NO_APLICA"]
                 .map(
                   (e) =>
                     `<button class="btn-secundario ${item.estado === e ? "sel" : ""}"
                        data-item="${item.id}" data-estado="${e}">${ESTADOS_ITEM[e]}</button>`
                 )
                 .join("")}
               ${
                 a.tipo !== "NORTON" || item.estado === "INCIDENCIA"
                   ? `<button class="btn-secundario" data-evidencia="${item.id}">Evidencia</button>`
                   : ""
               }
             </div>`
          : `<span class="insignia ${
              item.estado === "CONFORME" ? "ok" : item.estado === "INCIDENCIA" ? "peligro" : "neutra"
            }">${ESTADOS_ITEM[item.estado]}</span>`
      }
    </div>`;
  }

  abrirModal(
    `${a.tipo === "CORREO" ? "Correo" : "Supervisión"} · semana del ${fecha(a.fecha_inicio)}`,
    `<div class="rejilla">
      <div class="campo"><label>Periodo</label><div>${fecha(a.fecha_inicio)} — ${fecha(a.fecha_fin)}</div></div>
      <div class="campo"><label>Analista asignado</label>
        <div>${
          a.analista
            ? `<span class="insignia acento">${esc(a.analista)}</span>`
            : "—"
        }</div></div>
      <div class="campo"><label>Programada por</label><div>${esc(a.programada_por || "—")}</div></div>
      <div class="campo"><label>Estado</label><div><span class="insignia ${
        cerrada ? "ok" : "alerta"
      }">${cerrada ? "Cerrada" : "En proceso"}</span></div></div>
      <div class="campo"><label>Avance</label>
        <div>${a.revisados} de ${a.total}<div class="avance"><div style="width:${a.avance}%"></div></div></div></div>
    </div>

    <div class="tarjetas" style="margin:16px 0">
      <div class="tarjeta cyan"><div class="etiqueta">Conformes</div><div class="valor">${a.conteo.CONFORME}</div></div>
      <div class="tarjeta rojo"><div class="etiqueta">Incidencias</div><div class="valor">${a.conteo.INCIDENCIA}</div></div>
      <div class="tarjeta amarillo"><div class="etiqueta">Sin revisar</div><div class="valor">${a.conteo.PENDIENTE}</div></div>
      <div class="tarjeta"><div class="etiqueta">No aplican</div><div class="valor">${a.conteo.NO_APLICA}</div></div>
    </div>

    <div class="tabla-wrap" style="margin-bottom:16px">${html}</div>

    <div class="campo"><label>Observaciones generales de la semana</label>
      <textarea id="aud-obs" rows="3" ${cerrada ? "disabled" : ""}>${esc(a.observaciones || "")}</textarea></div>
    ${
      cerrada
        ? `<div class="aviso info">Cerrada por ${esc(a.cerrada_por || "—")} el ${fechaHora(a.fecha_cierre)}</div>`
        : ""
    }`,
    puedeEditar()
      ? `${esAdmin() ? '<button class="btn-peligro" id="aud-borrar">Eliminar</button>' : ""}
         ${
           esAdmin() && !cerrada
             ? '<button class="btn-secundario" id="aud-reasignar">Reasignar</button>'
             : ""
         }
         ${
           editable
             ? `<button class="btn-secundario" id="aud-agregar">Agregar punto</button>
                <button class="btn-secundario" id="aud-guardar">Guardar observaciones</button>
                <button class="btn-primario" id="aud-cerrar">Cerrar auditoría</button>`
             : `<button class="btn-secundario" id="aud-reabrir">Reabrir</button>`
         }`
      : "",
    true
  );

  if (!puedeEditar()) return;

  document.querySelectorAll("[data-item]").forEach((b) => {
    b.onclick = async () => {
      const nuevoEstado = b.dataset.estado;
      const item = a.items.find((i) => String(i.id) === b.dataset.item);
      let observacion = item.observacion;

      if (nuevoEstado === "INCIDENCIA") {
        observacion = await pedirTexto(
          "Describe la incidencia",
          "¿Qué se encontró? ¿Qué falta por hacer?",
          item.observacion || ""
        );
        if (observacion === null) return;
        if (!observacion.trim()) {
          toast("Una incidencia necesita descripción", "error");
          return;
        }
      }
      try {
        await api(`/api/auditorias/items/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ estado: nuevoEstado, observacion }),
        });
        verAuditoria(id);
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });

  document.querySelectorAll("[data-evidencia]").forEach((b) => {
    b.onclick = async () => {
      const datos = await pedirEvidencia();
      if (!datos) return;
      try {
        await api(`/api/auditorias/items/${b.dataset.evidencia}/evidencias`, {
          method: "POST",
          body: JSON.stringify(datos),
        });
        toast("Evidencia agregada");
        verAuditoria(id);
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });

  document.querySelectorAll("[data-quitar-evidencia]").forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmar("¿Quitar esta evidencia?"))) return;
      try {
        await api(`/api/auditorias/evidencias/${b.dataset.quitarEvidencia}`, { method: "DELETE" });
        verAuditoria(id);
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });

  const guardarObs = async (estadoNuevo) => {
    try {
      await api(`/api/auditorias/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          estado: estadoNuevo,
          analista_id: a.analista_id,
          observaciones: $("#aud-obs") ? $("#aud-obs").value : a.observaciones,
        }),
      });
      return true;
    } catch (err) {
      toast(err.message, "error");
      return false;
    }
  };

  const bGuardar = $("#aud-guardar");
  if (bGuardar)
    bGuardar.onclick = async () => {
      if (await guardarObs("EN_PROCESO")) {
        toast("Observaciones guardadas");
        verAuditoria(id);
      }
    };

  const bCerrar = $("#aud-cerrar");
  if (bCerrar)
    bCerrar.onclick = async () => {
      if (await guardarObs("CERRADA")) {
        toast("Auditoría cerrada");
        await refrescarContadorAlertas();
        verAuditoria(id);
      }
    };

  const bReabrir = $("#aud-reabrir");
  if (bReabrir)
    bReabrir.onclick = async () => {
      if (await guardarObs("EN_PROCESO")) {
        toast("Auditoría reabierta");
        verAuditoria(id);
      }
    };

  const bAgregar = $("#aud-agregar");
  if (bAgregar)
    bAgregar.onclick = async () => {
      const texto = await pedirTexto("Agregar punto al checklist", "Qué hay que revisar", "");
      if (!texto || !texto.trim()) return;
      try {
        await api(`/api/auditorias/${id}/items`, {
          method: "POST",
          body: JSON.stringify({ categoria: "Agregado", descripcion: texto.trim() }),
        });
        verAuditoria(id);
      } catch (err) {
        toast(err.message, "error");
      }
    };

  const bReasignar = $("#aud-reasignar");
  if (bReasignar)
    bReasignar.onclick = async () => {
      const analistas = estado.catalogos.analistas || [];
      const elegido = await pedirOpcion(
        "Reasignar auditoría",
        "Analista responsable",
        analistas.map((u) => ({ id: u.id, nombre: `${u.nombre} (${u.rol})` })),
        a.analista_id
      );
      if (!elegido) return;
      try {
        await api(`/api/auditorias/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            estado: a.estado,
            analista_id: Number(elegido),
            observaciones: a.observaciones,
          }),
        });
        toast("Auditoría reasignada");
        verAuditoria(id);
      } catch (err) {
        toast(err.message, "error");
      }
    };

  const bBorrar = $("#aud-borrar");
  if (bBorrar)
    bBorrar.onclick = async () => {
    if (await confirmar("¿Eliminar esta auditoría y todo su checklist?")) {
      try {
        await api(`/api/auditorias/${id}`, { method: "DELETE" });
        cerrarModal();
        toast("Auditoría eliminada");
        verAuditorias();
      } catch (err) {
        toast(err.message, "error");
      }
    }
  };
}

/** Enlace y nombre de un archivo de Drive. Devuelve null si se cancela. */
function pedirEvidencia() {
  return new Promise((resolve) => {
    $("#visor").innerHTML = `
      <div class="fondo-modal">
        <div class="modal">
          <header><h3>Agregar evidencia</h3><button class="cerrar" type="button">&times;</button></header>
          <div class="cuerpo">
            <form id="form-evidencia">
              <div class="campo"><label>Enlace de Google Drive *</label>
                <input name="url" type="url" required
                       placeholder="https://drive.google.com/file/d/…"></div>
              <div class="campo"><label>Nombre del archivo</label>
                <input name="nombre" maxlength="200"></div>
            </form>
          </div>
          <footer>
            <button class="btn-secundario" id="ev-cancelar">Cancelar</button>
            <button class="btn-primario" id="ev-ok">Guardar</button>
          </footer>
        </div>
      </div>`;
    const cerrar = (resultado) => {
      $("#visor").innerHTML = "";
      resolve(resultado);
    };
    $("#visor .cerrar").onclick = () => cerrar(null);
    $("#ev-cancelar").onclick = () => cerrar(null);
    $("#ev-ok").onclick = () => {
      const form = $("#form-evidencia");
      if (!form.reportValidity()) return;
      cerrar(recolectar(form));
    };
    $("#form-evidencia [name=url]").focus();
  });
}

const REPORTES_POR_MES = 4;

function modalReporteMensual(auditorias) {
  const mesActual = hoyISO().slice(0, 7);
  abrirModal(
    "Reporte mensual de auditoría",
    `<form id="form-mensual">
      <div class="rejilla">
        <div class="campo"><label>Auditoría</label>
          <select name="tipo">${Object.entries(TIPOS_AUDITORIA)
            .map(([k, v]) => `<option value="${k}" ${k === "NORTON" ? "selected" : ""}>${v}</option>`)
            .join("")}</select></div>
        <div class="campo"><label>Mes</label>
          <input name="mes" type="month" value="${mesActual}"></div>
      </div>
    </form>
    <div id="mensual-semanas"></div>
    <div id="mensual-cuenta" style="margin-top:10px;color:var(--texto-tenue)"></div>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="descargar-mensual">Generar reporte</button>`
  );

  const form = $("#form-mensual");
  const elegidas = () =>
    [...document.querySelectorAll("[data-semana]:checked")].map((c) => Number(c.dataset.semana));
  const contar = () => {
    const n = elegidas().length;
    $("#mensual-cuenta").textContent = `${n} de ${REPORTES_POR_MES} semanas seleccionadas`;
    $("#descargar-mensual").disabled = n !== REPORTES_POR_MES;
  };
  const pintar = () => {
    const { tipo, mes } = recolectar(form);
    const lista = auditorias
      .filter((a) => a.tipo === tipo && (!mes || a.fecha_inicio.slice(0, 7) <= mes))
      .sort((x, y) => y.fecha_inicio.localeCompare(x.fecha_inicio));
    // Se proponen las cuatro semanas más recientes del mes elegido
    const propuestas = new Set(
      lista
        .filter((a) => mes && (a.fecha_inicio.startsWith(mes) || a.fecha_fin.startsWith(mes)))
        .slice(0, REPORTES_POR_MES)
        .map((a) => a.id)
    );
    $("#mensual-semanas").innerHTML = lista.length
      ? `<div class="tabla-wrap" style="max-height:340px;overflow:auto"><table>
          <thead><tr><th></th><th>Semana</th><th>Analista</th><th>Avance</th>
          <th class="num">Incidencias</th><th>Estado</th></tr></thead>
          <tbody>${lista
            .map(
              (a) => `<tr>
              <td><input type="checkbox" data-semana="${a.id}" ${propuestas.has(a.id) ? "checked" : ""}></td>
              <td>${fecha(a.fecha_inicio)} — ${fecha(a.fecha_fin)}</td>
              <td>${esc(a.analista || "—")}</td>
              <td>${a.revisados}/${a.total}</td>
              <td class="num">${a.incidencias}</td>
              <td><span class="insignia ${a.estado === "CERRADA" ? "ok" : "alerta"}">${
                a.estado === "CERRADA" ? "Cerrada" : "En proceso"
              }</span></td></tr>`
            )
            .join("")}</tbody></table></div>`
      : `<div class="vacio">Sin auditorías registradas.</div>`;
    document.querySelectorAll("[data-semana]").forEach((c) => (c.onchange = contar));
    contar();
  };
  form.onchange = pintar;
  pintar();

  $("#cancelar").onclick = cerrarModal;
  $("#descargar-mensual").onclick = () => {
    const ids = elegidas();
    if (ids.length !== REPORTES_POR_MES) return;
    const params = new URLSearchParams();
    ids.forEach((id) => params.append("ids", id));
    location.href = `/api/auditorias/reporte-mensual?${params}`;
    cerrarModal();
  };
}

/** Pide elegir una opción en un modal. Devuelve null si se cancela. */
function pedirOpcion(titulo, etiqueta, lista, seleccionado) {
  return new Promise((resolve) => {
    $("#visor").innerHTML = `
      <div class="fondo-modal">
        <div class="modal">
          <header><h3>${esc(titulo)}</h3><button class="cerrar" type="button">&times;</button></header>
          <div class="cuerpo">
            <div class="campo"><label>${esc(etiqueta)}</label>
              <select id="sel-pedido">${opciones(lista, seleccionado, "")}</select></div>
          </div>
          <footer>
            <button class="btn-secundario" id="sel-cancelar">Cancelar</button>
            <button class="btn-primario" id="sel-ok">Guardar</button>
          </footer>
        </div>
      </div>`;
    const cerrar = (r) => {
      $("#visor").innerHTML = "";
      resolve(r);
    };
    $("#visor .cerrar").onclick = () => cerrar(null);
    $("#sel-cancelar").onclick = () => cerrar(null);
    $("#sel-ok").onclick = () => cerrar($("#sel-pedido").value);
  });
}

/** Pide un texto en un modal. Devuelve null si se cancela. */
function pedirTexto(titulo, etiqueta, valor = "") {
  return new Promise((resolve) => {
    const previo = $("#modal").innerHTML;
    $("#visor").innerHTML = `
      <div class="fondo-modal">
        <div class="modal">
          <header><h3>${esc(titulo)}</h3><button class="cerrar" type="button">&times;</button></header>
          <div class="cuerpo">
            <div class="campo"><label>${esc(etiqueta)}</label>
              <textarea id="txt-pedido" rows="4">${esc(valor)}</textarea></div>
          </div>
          <footer>
            <button class="btn-secundario" id="txt-cancelar">Cancelar</button>
            <button class="btn-primario" id="txt-ok">Guardar</button>
          </footer>
        </div>
      </div>`;
    const cerrar = (resultado) => {
      $("#visor").innerHTML = "";
      resolve(resultado);
    };
    $("#visor .cerrar").onclick = () => cerrar(null);
    $("#txt-cancelar").onclick = () => cerrar(null);
    $("#txt-ok").onclick = () => cerrar($("#txt-pedido").value);
    $("#txt-pedido").focus();
  });
}

// ---------------------------------------------------------------- verificación de números

const MENSAJE_VERIFICACION =
  "Hola, buen día. Te contactamos del departamento de TI para realizar la verificación " +
  "mensual de líneas telefónicas. ¿Nos podrías confirmar tu nombre completo para validar esta línea, por favor?" +
  "\n\nAprovechamos para compartirte una actualización en nuestros canales de soporte. Para brindarles un " +
  "mejor servicio y que todo el equipo de TI pueda dar seguimiento a sus solicitudes, a partir de ahora " +
  "nuestro canal oficial de atención será el chat corporativo (usando tu correo institucional):" +
  "\n\nWhatsApp quedará exclusivamente para procesos de verificación en dos pasos o colaboradores sin correo corporativo." +
  "\n\n¡Agradecemos mucho tu apoyo y comprensión!";

const enlaceWhatsApp = (numero) =>
  `https://wa.me/52${numero}?text=${encodeURIComponent(MENSAJE_VERIFICACION)}`;

const numeroLegible = (n) => (n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n);

const nombreMes = (periodo) => {
  const [a, m] = periodo.split("-").map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

async function verVerificacion() {
  const periodo = estado.periodoVerificacion || hoyISO().slice(0, 7);
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Verificación de números</h2><p>${esc(nombreMes(periodo))}</p></div>
      ${puedeEditar() ? `<button class="btn-primario" id="btn-nuevo-numero">Agregar número</button>` : ""}
    </div>
    <div id="resumen-verificacion"></div>
    <div class="filtros">
      <div class="campo"><label>Mes</label>
        <input id="v-mes" type="month" value="${periodo}" max="${hoyISO().slice(0, 7)}"></div>
      <div class="campo busqueda"><label>Buscar</label>
        <input id="v-q" placeholder="Número, titular, sucursal o departamento…"></div>
      <div class="campo"><label>Estado</label>
        <select id="v-estado">
          <option value="">Todos</option>
          <option value="PENDIENTE">Sin verificar</option>
          <option value="ENVIADO">Mensaje enviado</option>
          <option value="VERIFICADA">Verificados</option>
        </select></div>
    </div>
    <div id="tabla-verificacion"></div>`;

  $("#v-mes").onchange = () => {
    if (!$("#v-mes").value) return;
    estado.periodoVerificacion = $("#v-mes").value;
    verVerificacion();
  };
  if (puedeEditar()) $("#btn-nuevo-numero").onclick = () => modalNumero();

  const lista = await api(`/api/verificacion-numeros?periodo=${periodo}`);
  const pintar = () => {
    const q = $("#v-q").value.trim().toLowerCase();
    const filtro = $("#v-estado").value;
    pintarResumenVerificacion(lista);
    pintarVerificacion(
      lista.filter(
        (l) =>
          (!filtro ||
            (filtro === "VERIFICADA" && l.verificada) ||
            (filtro === "ENVIADO" && !l.verificada && l.enviado_en) ||
            (filtro === "PENDIENTE" && !l.verificada)) &&
          (!q ||
            [l.numero, l.titular, l.sucursal, l.departamento].some((t) => (t || "").toLowerCase().includes(q)))
      ),
      lista,
      periodo,
      pintar
    );
  };
  $("#v-q").oninput = pintar;
  $("#v-estado").onchange = pintar;
  pintar();
}

function pintarResumenVerificacion(lista) {
  const total = lista.length;
  const verificados = lista.filter((l) => l.verificada).length;
  const enviados = lista.filter((l) => !l.verificada && l.enviado_en).length;
  const avance = total ? Math.round((verificados / total) * 100) : 0;
  $("#resumen-verificacion").innerHTML = `
    <div class="tarjetas">
      <div class="tarjeta"><div class="etiqueta">Números</div><div class="valor">${total}</div></div>
      <div class="tarjeta cyan"><div class="etiqueta">Verificados</div><div class="valor">${verificados}</div>
        <div class="avance"><div style="width:${avance}%"></div></div></div>
      <div class="tarjeta rosa"><div class="etiqueta">Mensaje enviado</div><div class="valor">${enviados}</div></div>
      <div class="tarjeta amarillo"><div class="etiqueta">Sin respuesta</div>
        <div class="valor">${total - verificados}</div></div>
    </div>`;
}

function pintarVerificacion(filas, lista, periodo, repintar) {
  const editable = puedeEditar();
  const tenue = (t) => `<span style="color:var(--texto-tenue)">${t}</span>`;
  $("#tabla-verificacion").innerHTML = filas.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Verificado</th><th>Número</th><th>Titular</th><th>Sucursal</th>
          <th>Departamento</th><th>WhatsApp</th><th>Observación</th>${editable ? "<th></th>" : ""}</tr></thead>
        <tbody>${filas
          .map(
            (l) => `<tr class="${l.verificada ? "verificada" : ""}">
              <td><label class="casilla-verificacion">
                <input type="checkbox" data-verificar="${l.id}" ${l.verificada ? "checked" : ""}
                  ${editable ? "" : "disabled"} aria-label="Verificado">
                ${
                  l.verificada
                    ? `<small>${esc(l.verificada_por || "")}<br>${fechaHora(l.verificada_en)}</small>`
                    : ""
                }</label></td>
              <td><span style="font-family:var(--mono);font-size:14px;white-space:nowrap">${esc(
                numeroLegible(l.numero)
              )}</span>${l.activo_codigo ? `<div><span class="codigo">${esc(l.activo_codigo)}</span></div>` : ""}</td>
              <td>${l.titular ? esc(l.titular) : tenue("Sin titular")}</td>
              <td>${esc(l.sucursal || "—")}</td>
              <td>${esc(l.departamento || "—")}</td>
              <td><a class="boton btn-secundario btn-mini btn-whatsapp" href="${enlaceWhatsApp(l.numero)}" target="_blank" rel="noopener"
                     data-enviar="${l.id}">${icono("whatsapp")}Enviar WhatsApp</a>
                ${
                  l.enviado_en
                    ? `<div style="font-size:13px;color:var(--texto-tenue);margin-top:4px">
                         Enviado ${fechaHora(l.enviado_en)}</div>`
                    : ""
                }</td>
              <td>${l.observacion ? esc(l.observacion) : "—"}</td>
              ${
                editable
                  ? `<td><div style="display:flex;gap:6px;justify-content:flex-end">
                      <button class="btn-secundario btn-mini" data-observacion="${l.id}">Observación</button>
                    </div></td>`
                  : ""
              }
            </tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">Sin números.</div></div>`;

  const linea = (id) => lista.find((l) => String(l.id) === String(id));
  const guardar = async (l, cambios) => {
    const r = await api(`/api/verificacion-numeros/${l.id}/${periodo}`, {
      method: "PUT",
      body: JSON.stringify(cambios),
      silencioso: true,
    });
    Object.assign(l, r);
    repintar();
  };

  if (!editable) return;
  document.querySelectorAll("#tabla-verificacion [data-enviar]").forEach((a) => {
    a.addEventListener("click", () => {
      guardar(linea(a.dataset.enviar), { enviado: true }).catch((err) => toast(err.message, "error"));
    });
  });
  document.querySelectorAll("#tabla-verificacion [data-verificar]").forEach((ch) => {
    ch.onchange = async () => {
      const l = linea(ch.dataset.verificar);
      try {
        await guardar(l, { verificada: ch.checked });
      } catch (err) {
        ch.checked = !ch.checked;
        toast(err.message, "error");
      }
    };
  });
  document.querySelectorAll("#tabla-verificacion [data-observacion]").forEach((b) => {
    b.onclick = async () => {
      const l = linea(b.dataset.observacion);
      const texto = await pedirTexto(`Observación · ${numeroLegible(l.numero)}`, "Observación", l.observacion || "");
      if (texto === null) return;
      try {
        await guardar(l, { observacion: texto });
        toast("Observación guardada");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });
}

function modalNumero() {
  abrirModal(
    "Agregar número",
    `<form id="form-numero">
      <div class="rejilla">
        <div class="campo"><label>Número *</label>
          <input name="numero" required inputmode="numeric" maxlength="20"></div>
        <div class="campo"><label>Titular</label>
          <input name="titular" maxlength="180"></div>
        <div class="campo"><label>Sucursal</label>
          <input name="sucursal" maxlength="80"></div>
        <div class="campo"><label>Departamento</label>
          <input name="departamento" maxlength="80"></div>
      </div>
    </form>`,
    `<button class="btn-secundario" id="num-cancelar">Cancelar</button>
     <button class="btn-primario" id="num-guardar">Guardar</button>`
  );

  $("#num-cancelar").onclick = cerrarModal;
  $("#num-guardar").onclick = async () => {
    const form = $("#form-numero");
    if (!form.reportValidity()) return;
    try {
      await api("/api/verificacion-numeros", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      cerrarModal();
      toast("Número agregado");
      verVerificacion();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

// ---------------------------------------------------------------- catálogos

const CATALOGOS = {
  sucursales: { titulo: "Sucursales", nuevo: "Nueva sucursal", clave: true },
  departamentos: { titulo: "Departamentos", nuevo: "Nuevo departamento", clave: true },
  bodegas: { titulo: "Locaciones", nuevo: "Nueva locación", clave: false, sucursal: true },
  sistemas: { titulo: "Sistemas internos", nuevo: "Nuevo sistema", clave: true, propio: true },
};

async function verCatalogos(entidad = "sucursales") {
  $("#vista").innerHTML = `
    <div class="encabezado">
      <div><h2>Catálogos</h2><p>Sucursales, departamentos y locaciones</p></div>
      ${puedeEditar() ? `<button class="btn-primario" id="btn-nuevo-cat">${CATALOGOS[entidad].nuevo}</button>` : ""}
    </div>
    <div class="filtros">
      <div class="campo"><label>Catálogo</label>
        <select id="c-entidad">
          ${Object.entries(CATALOGOS)
            .map(
              ([k, v]) => `<option value="${k}" ${k === entidad ? "selected" : ""}>${v.titulo}</option>`
            )
            .join("")}
        </select></div>
    </div>
    <div id="tabla-catalogo"></div>`;

  $("#c-entidad").onchange = () => {
    const actual = $("#c-entidad").value;
    if (puedeEditar()) $("#btn-nuevo-cat").textContent = CATALOGOS[actual].nuevo;
    cargarCatalogo(actual);
  };
  if (puedeEditar())
    $("#btn-nuevo-cat").onclick = () => modalCatalogo($("#c-entidad").value);
  cargarCatalogo(entidad);
}

async function cargarCatalogo(entidad) {
  const cfg = CATALOGOS[entidad];
  if (cfg.propio) return cargarSistemas();
  const filas = await api(`/api/catalogos/${entidad}/uso`);

  $("#tabla-catalogo").innerHTML = filas.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr>
          ${cfg.clave ? "<th>Clave</th>" : ""}
          <th>Nombre</th>
          ${cfg.sucursal ? "<th>Sucursal</th>" : ""}
          <th class="num">Empleados</th><th class="num">Activos</th>
          <th>Estado</th><th></th>
        </tr></thead>
        <tbody>${filas
          .map(
            (f) => `<tr>
            ${cfg.clave ? `<td class="codigo">${esc(f.clave || "—")}</td>` : ""}
            <td>${esc(f.nombre)}</td>
            ${cfg.sucursal ? `<td>${esc(f.sucursal || "—")}</td>` : ""}
            <td class="num">${f.empleados}</td>
            <td class="num">${f.activos}</td>
            <td><span class="insignia ${f.activo ? "ok" : "neutra"}">${
              f.activo ? "Activo" : "Oculto"
            }</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              ${
                puedeEditar()
                  ? `<button class="btn-secundario btn-mini" data-editar="${f.id}">Editar</button>
                     <button class="btn-secundario btn-mini" data-alternar="${f.id}">${
                       f.activo ? "Ocultar" : "Activar"
                     }</button>
                     <button class="btn-peligro btn-mini" data-borrar="${f.id}"
                       ${f.en_uso ? "disabled title='Está en uso'" : ""}>Eliminar</button>`
                  : ""
              }
            </td></tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">Este catálogo está vacío.</div></div>`;

  if (!puedeEditar()) return;
  document.querySelectorAll("[data-editar]").forEach((b) => {
    b.onclick = () =>
      modalCatalogo(entidad, filas.find((f) => String(f.id) === b.dataset.editar));
  });
  document.querySelectorAll("[data-alternar]").forEach((b) => {
    b.onclick = async () => {
      try {
        await api(`/api/catalogos/${entidad}/${b.dataset.alternar}/activo`, { method: "POST" });
        await recargarCatalogos();
        cargarCatalogo(entidad);
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });
  document.querySelectorAll("[data-borrar]").forEach((b) => {
    if (b.disabled) return;
    b.onclick = async () => {
      const f = filas.find((x) => String(x.id) === b.dataset.borrar);
      if (await confirmar(`¿Eliminar "${f.nombre}"?`)) {
        try {
          await api(`/api/catalogos/${entidad}/${f.id}`, { method: "DELETE" });
          toast("Registro eliminado");
          await recargarCatalogos();
          cargarCatalogo(entidad);
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  });
}

async function cargarSistemas() {
  const filas = await api("/api/sistemas");

  $("#tabla-catalogo").innerHTML = filas.length
    ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Clave</th><th>Nombre</th><th>Descripción</th>
        <th class="num">Orden</th><th class="num">Entregados</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas
          .map(
            (f) => `<tr>
            <td class="codigo">${esc(f.clave)}</td>
            <td>${esc(f.nombre)}</td>
            <td>${esc(f.descripcion || "—")}</td>
            <td class="num">${f.orden}</td>
            <td class="num">${f.entregados}</td>
            <td><span class="insignia ${f.activo ? "ok" : "neutra"}">${
              f.activo ? "Activo" : "Oculto"
            }</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              ${
                puedeEditar()
                  ? `<button class="btn-secundario btn-mini" data-editar-sis="${f.id}">Editar</button>
                     <button class="btn-peligro btn-mini" data-borrar-sis="${f.id}"
                       ${f.entregados ? "disabled title='Hay accesos registrados'" : ""}>Eliminar</button>`
                  : ""
              }
            </td></tr>`
          )
          .join("")}</tbody></table></div>`
    : `<div class="panel"><div class="vacio">No hay sistemas registrados.</div></div>`;

  if (!puedeEditar()) return;
  document.querySelectorAll("[data-editar-sis]").forEach((b) => {
    b.onclick = () => modalSistema(filas.find((f) => String(f.id) === b.dataset.editarSis));
  });
  document.querySelectorAll("[data-borrar-sis]").forEach((b) => {
    if (b.disabled) return;
    b.onclick = async () => {
      const f = filas.find((x) => String(x.id) === b.dataset.borrarSis);
      if (await confirmar(`¿Eliminar el sistema "${f.nombre}"?`)) {
        try {
          await api(`/api/sistemas/${f.id}`, { method: "DELETE" });
          toast("Sistema eliminado");
          await recargarCatalogos();
          cargarSistemas();
        } catch (err) {
          toast(err.message, "error");
        }
      }
    };
  });
}

function modalSistema(f = null) {
  abrirModal(
    f ? `Editar ${esc(f.nombre)}` : "Nuevo sistema interno",
    `<form id="form-sis">
      <div class="rejilla">
        <div class="campo"><label>Nombre *</label>
          <input name="nombre" required value="${esc(f?.nombre || "")}"
                 placeholder="SISTEMA DE GASTOS"></div>
        <div class="campo"><label>Clave *</label>
          <input name="clave" required maxlength="20" value="${esc(f?.clave || "")}"
                 placeholder="GASTOS"></div>
        <div class="campo"><label>Orden en el checklist</label>
          <input name="orden" type="number" value="${f?.orden ?? 0}"></div>
      </div>
      <div class="campo"><label>Descripción</label>
        <input name="descripcion" value="${esc(f?.descripcion || "")}"></div>
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-sis");
    if (!form.reportValidity()) return;
    const datos = recolectar(form);
    datos.orden = Number(datos.orden || 0);
    try {
      await api(f ? `/api/sistemas/${f.id}` : "/api/sistemas", {
        method: f ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      cerrarModal();
      toast(f ? "Sistema actualizado" : "Sistema creado");
      await recargarCatalogos();
      cargarSistemas();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

function modalCatalogo(entidad, f = null) {
  if (CATALOGOS[entidad].propio) return modalSistema(f);
  const cfg = CATALOGOS[entidad];
  abrirModal(
    f ? `Editar ${esc(f.nombre)}` : cfg.nuevo,
    `<form id="form-cat">
      <div class="campo"><label>Nombre *</label>
        <input name="nombre" required value="${esc(f?.nombre || "")}"></div>
      ${
        cfg.clave
          ? `<div class="campo"><label>Clave *</label>
               <input name="clave" required maxlength="12" value="${esc(f?.clave || "")}"
                      placeholder="TOL, FIN, RH…"></div>`
          : ""
      }
      ${
        cfg.sucursal
          ? `<div class="campo"><label>Sucursal *</label>
               <select name="sucursal_id" required>${opciones(
                 estado.catalogos.sucursales,
                 f?.sucursal_id
               )}</select></div>`
          : ""
      }
    </form>`,
    `<button class="btn-secundario" id="cancelar">Cancelar</button>
     <button class="btn-primario" id="guardar">Guardar</button>`
  );

  $("#cancelar").onclick = cerrarModal;
  $("#guardar").onclick = async () => {
    const form = $("#form-cat");
    if (!form.reportValidity()) return;
    try {
      await api(
        f ? `/api/catalogos/${entidad}/${f.id}` : `/api/catalogos/${entidad}`,
        { method: f ? "PUT" : "POST", body: JSON.stringify(recolectar(form)) }
      );
      cerrarModal();
      toast(f ? "Registro actualizado" : "Registro creado");
      await recargarCatalogos();
      cargarCatalogo(entidad);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

