"""API y servidor web del Panel de control TI."""

from __future__ import annotations

import datetime as dt
import functools
import io
from urllib.parse import quote, urlparse
import mimetypes
import re
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from . import schemas
from .auth import (
    COOKIE,
    cerrar_otras_sesiones,
    cerrar_sesion,
    crear_sesion,
    hashear_password,
    poner_cookie,
    quitar_cookie,
    registrar,
    requiere_admin,
    requiere_captura,
    requiere_rehash,
    usuario_actual,
    verificar_password,
    verificar_senuelo,
)
from .auditoria import DIAS_SIN_ACTIVIDAD, PLANTILLAS, construir_items, semana_de
from .database import RUTA_DATOS, SessionLocal, crear_esquema, obtener_sesion
from .models import (
    Activo,
    AlcanceRed,
    Asignacion,
    Auditoria,
    Bitacora,
    Bodega,
    CuentaLicencia,
    Departamento,
    DetalleComputo,
    DetalleCorreo,
    DetalleLicencia,
    DetalleMovil,
    Empleado,
    EstadoAuditoria,
    EstadoDocumento,
    EstadoItem,
    EstadoNota,
    EstatusActivo,
    EstatusEmpleado,
    EvidenciaAuditoria,
    Impresora,
    ItemAuditoria,
    LineaVerificacion,
    Nota,
    Planta,
    PropietarioImpresora,
    RedWifi,
    RolUsuario,
    Sesion,
    AccesoSistema,
    SistemaInterno,
    Sucursal,
    TipoActivo,
    TipoAuditoria,
    Usuario,
    VerificacionNumero,
    a_hora_local,
    ahora_local,
    clave_nombre,
    hoy as hoy_local,
)
from .cifrado import cifrar, cifrar_bytes, descifrar, descifrar_bytes, es_cifrado
from .limite import fallos_por_ip, fallos_por_usuario, peticiones_por_ip, subidas_por_ip
from .seed import PASSWORD_DE_FABRICA, sembrar

ESTATICOS = Path(__file__).parent / "static"
ADJUNTOS = RUTA_DATOS / "adjuntos"
ADJUNTOS.mkdir(parents=True, exist_ok=True)

EXTENSIONES_PERMITIDAS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
FIRMAS_ARCHIVO = {
    ".pdf": b"%PDF-",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".png": b"\x89PNG\r\n\x1a\n",
    ".webp": b"RIFF",
}
NOMBRE_ADJUNTO = re.compile(r"^[0-9a-f]{32}\.(pdf|jpg|jpeg|png|webp)$")
# A partir de cuántos días una responsiva enviada a firmar se considera atrasada
DIAS_ESPERA_RESPONSIVA = 21
TAMANO_MAXIMO = 10 * 1024 * 1024  # 10 MB

PREFIJO_CODIGO = {
    TipoActivo.COMPUTO: "PC",
    TipoActivo.TELEFONO: "TEL",
    TipoActivo.TABLETA: "TAB",
    TipoActivo.LICENCIA_MICROSOFT: "MS",
    TipoActivo.LICENCIA_NORTON: "NOR",
    TipoActivo.CORREO_WORKSPACE: "GW",
}

# Sólo teléfonos, computadoras y tabletas generan responsiva
TIPOS_CON_RESPONSIVA = {TipoActivo.COMPUTO, TipoActivo.TABLETA, TipoActivo.TELEFONO}
# La INE sólo se pide para telefonía
TIPOS_CON_INE = {TipoActivo.TELEFONO}
# Activos son sólo los equipos físicos; licencias y correos son servicios asignados
TIPOS_FISICOS = [TipoActivo.COMPUTO, TipoActivo.TELEFONO, TipoActivo.TABLETA]
TIPOS_LICENCIA = {TipoActivo.LICENCIA_MICROSOFT, TipoActivo.LICENCIA_NORTON}
# Ningún dispositivo vence; las licencias toman la renovación de su familia
TIPOS_SIN_VENCIMIENTO = {
    TipoActivo.COMPUTO, TipoActivo.TELEFONO, TipoActivo.TABLETA, TipoActivo.CORREO_WORKSPACE
} | TIPOS_LICENCIA

OPERADOR_TELEFONIA = "Telcel"
ESQUEMA_TELEFONIA = "Plazo Forzoso con Equipo"
# Días sin iniciar sesión a partir de los cuales un correo se considera en desuso
DIAS_DESUSO_CORREO = 20

# Agrupaciones que usa la interfaz para separar el inventario por secciones
GRUPOS = {
    "equipos": [TipoActivo.COMPUTO],
    "tabletas": [TipoActivo.TABLETA],
    "telefonia": [TipoActivo.TELEFONO],
    "licencias": [TipoActivo.LICENCIA_MICROSOFT, TipoActivo.LICENCIA_NORTON],
    "correos": [TipoActivo.CORREO_WORKSPACE],
}


@asynccontextmanager
async def ciclo_vida(app: FastAPI):
    crear_esquema()
    _cifrar_adjuntos()
    with SessionLocal() as db:
        creados = sembrar(db)
        if any(creados.values()):
            print(f"[inventario] catálogos sembrados: {creados}")
    yield


app = FastAPI(
    title="Panel de control TI",
    version="0.3.0",
    lifespan=ciclo_vida,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def ip_cliente(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def _cifrar_adjuntos() -> None:
    """Cifra los adjuntos que se guardaron antes de existir el cifrado."""
    for ruta in ADJUNTOS.iterdir():
        if ruta.is_file() and NOMBRE_ADJUNTO.match(ruta.name):
            contenido = ruta.read_bytes()
            if not es_cifrado(contenido):
                temporal = ruta.with_name(ruta.name + ".tmp")
                temporal.write_bytes(cifrar_bytes(contenido))
                temporal.replace(ruta)


CABECERAS_SEGURIDAD = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; "
        "form-action 'self'; frame-ancestors 'none'"
    ),
}


@app.middleware("http")
async def revalidar_interfaz(request: Request, call_next):
    es_api = request.url.path.startswith("/api/")
    if es_api:
        espera = peticiones_por_ip.consumir(ip_cliente(request))
        if espera is not None:
            return JSONResponse(
                {"detail": "Demasiadas solicitudes. Intenta de nuevo en un momento."},
                status_code=429,
                headers={"Retry-After": str(int(espera))},
            )
    respuesta = await call_next(request)
    for nombre, valor in CABECERAS_SEGURIDAD.items():
        respuesta.headers.setdefault(nombre, valor)
    # Sin no-cache el navegador puede mezclar un index.html nuevo con CSS o JS viejos
    respuesta.headers["Cache-Control"] = "no-store" if es_api else "no-cache"
    return respuesta


def patron_busqueda(q: str) -> str:
    """Patrón LIKE en el que los comodines escritos por el usuario se buscan literalmente."""
    texto = q.strip().upper().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{texto}%"


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------


# Los códigos consecutivos (EMP-0001, PC-0001) se calculan leyendo el último y sumando uno.
# Dos altas simultáneas leerían el mismo último, así que se hacen de una en una (una sola
# instancia atiende la aplicación, por eso basta un candado en memoria).
_candado_altas = threading.Lock()


def un_alta_a_la_vez(funcion):
    @functools.wraps(funcion)
    def envuelta(*args, **kwargs):
        with _candado_altas:
            return funcion(*args, **kwargs)

    return envuelta


def siguiente_codigo(db: Session, tipo: TipoActivo) -> str:
    prefijo = PREFIJO_CODIGO[tipo]
    ultimo = (
        db.query(Activo.codigo)
        .filter(Activo.codigo.like(f"{prefijo}-%"))
        .order_by(Activo.codigo.desc())
        .first()
    )
    consecutivo = 1
    if ultimo:
        try:
            consecutivo = int(ultimo[0].split("-")[-1]) + 1
        except ValueError:
            consecutivo = db.query(Activo).filter(Activo.tipo == tipo).count() + 1
    return f"{prefijo}-{consecutivo:04d}"


def siguiente_codigo_empleado(db: Session) -> str:
    ultimo = db.query(Empleado.codigo).order_by(Empleado.codigo.desc()).first()
    consecutivo = 1
    if ultimo:
        try:
            consecutivo = int(ultimo[0].split("-")[-1]) + 1
        except ValueError:
            consecutivo = db.query(Empleado).count() + 1
    return f"EMP-{consecutivo:04d}"


def asignacion_vigente(db: Session, activo_id: int) -> Asignacion | None:
    return (
        db.query(Asignacion)
        .filter(Asignacion.activo_id == activo_id, Asignacion.fecha_devolucion.is_(None))
        .first()
    )


def correos_asignados(db: Session, empleado_ids: list[int]) -> dict[int, list[str]]:
    """Cuentas de Workspace vigentes de cada persona: el correo sale de lo asignado."""
    if not empleado_ids:
        return {}
    salida: dict[int, list[str]] = {}
    for empleado_id, direccion in (
        db.query(Asignacion.empleado_id, DetalleCorreo.direccion)
        .join(DetalleCorreo, DetalleCorreo.activo_id == Asignacion.activo_id)
        .filter(Asignacion.empleado_id.in_(empleado_ids), Asignacion.fecha_devolucion.is_(None))
        .order_by(DetalleCorreo.direccion)
    ):
        salida.setdefault(empleado_id, []).append(direccion)
    return salida


def filtro_ubicacion(
    sucursal_id: int | None,
    departamento_id: int | None,
    bodega_id: int | None,
    planta_id: int | None,
) -> list:
    """Condiciones sobre Empleado para cada catálogo de ubicación elegido."""
    condiciones = []
    if sucursal_id:
        condiciones.append(Empleado.sucursal_id == sucursal_id)
    if departamento_id:
        condiciones.append(Empleado.departamento_id == departamento_id)
    if bodega_id:
        condiciones.append(Empleado.bodega_id == bodega_id)
    if planta_id:
        condiciones.append(Empleado.planta_id == planta_id)
    return condiciones


def dic_empleado(e: Empleado, con_activos: bool = False, db: Session | None = None) -> dict:
    datos = {
        "id": e.id,
        "codigo": e.codigo,
        "nombres": e.nombres,
        "apellidos": e.apellidos,
        "nombre_completo": e.nombre_completo,
        "puesto": e.puesto,
        "sucursal_id": e.sucursal_id,
        "sucursal": e.sucursal.nombre if e.sucursal else None,
        "departamento_id": e.departamento_id,
        "departamento": e.departamento.nombre if e.departamento else None,
        "bodega_id": e.bodega_id,
        "bodega": e.bodega.nombre if e.bodega else None,
        "planta_id": e.planta_id,
        "planta": e.planta.nombre if e.planta else None,
        "estatus": e.estatus.value,
        "fecha_ingreso": e.fecha_ingreso,
        "fecha_baja": e.fecha_baja,
        "notas": e.notas,
    }
    if con_activos and db is not None:
        vigentes = (
            db.query(Asignacion)
            .filter(Asignacion.empleado_id == e.id, Asignacion.fecha_devolucion.is_(None))
            .all()
        )
        datos["activos"] = [dic_asignacion(a) for a in vigentes]
        datos["correos"] = correos_asignados(db, [e.id]).get(e.id, [])
        historial = (
            db.query(Asignacion)
            .filter(Asignacion.empleado_id == e.id, Asignacion.fecha_devolucion.isnot(None))
            .order_by(Asignacion.fecha_devolucion.desc())
            .all()
        )
        datos["historial"] = [dic_asignacion(a) for a in historial]
        datos["accesos"] = accesos_de(db, e.id)
    return datos


def accesos_de(db: Session, empleado_id: int) -> list[dict]:
    """Checklist de sistemas internos, con todos los sistemas activos presentes."""
    registrados = {
        a.sistema_id: a
        for a in db.query(AccesoSistema).filter(AccesoSistema.empleado_id == empleado_id)
    }
    salida = []
    for s in (
        db.query(SistemaInterno)
        .filter_by(activo=True)
        .order_by(SistemaInterno.orden, SistemaInterno.nombre)
    ):
        a = registrados.get(s.id)
        salida.append(
            {
                "sistema_id": s.id,
                "sistema": s.nombre,
                "clave": s.clave,
                "descripcion": s.descripcion,
                "entregado": bool(a and a.entregado),
                "fecha_entrega": a.fecha_entrega if a else None,
                "usuario_sistema": a.usuario_sistema if a else None,
                "notas": a.notas if a else None,
                "actualizado_por": a.actualizado_por if a else None,
                "actualizado_en": a.actualizado_en if a else None,
            }
        )
    return salida


def dic_activo(
    a: Activo, db: Session | None = None, vigentes: dict[int, Asignacion] | None = None
) -> dict:
    datos = {
        "id": a.id,
        "codigo": a.codigo,
        "tipo": a.tipo.value,
        "estatus": a.estatus.value,
        "descripcion": a.descripcion,
        "fecha_adquisicion": a.fecha_adquisicion,
        "fecha_vencimiento": a.fecha_vencimiento,
        "lleva_responsiva": a.tipo in TIPOS_CON_RESPONSIVA,
        "lleva_ine": a.tipo in TIPOS_CON_INE,
        "notas": a.notas,
    }
    if a.detalle_computo:
        d = a.detalle_computo
        datos["computo"] = {
            "marca": d.marca,
            "modelo": d.modelo,
            "numero_serie": d.numero_serie,
            "procesador": d.procesador,
            "ram_gb": d.ram_gb,
            "almacenamiento": d.almacenamiento,
            "sistema_operativo": d.sistema_operativo,
            "clave_windows": d.clave_windows,
        }
    if a.detalle_movil:
        d = a.detalle_movil
        datos["movil"] = {
            "marca": d.marca,
            "modelo": d.modelo,
            "imei": d.imei,
            "numero_telefonico": d.numero_telefonico,
            "iccid": d.iccid,
            "operador": d.operador,
            "precio_plan": float(d.precio_plan) if d.precio_plan is not None else None,
            "esquema": d.esquema,
            "esim": d.esim,
            "cuenta_operador": d.cuenta_operador,
        }
    if a.detalle_licencia:
        d = a.detalle_licencia
        datos["licencia"] = {
            "cuenta_id": d.cuenta_id,
            "familia": d.cuenta.nombre if d.cuenta else None,
            "correo_familia": d.cuenta.correo_cuenta if d.cuenta else None,
            "ranuras_familia": d.cuenta.ranuras_totales if d.cuenta else None,
            "correo_licencia": d.correo_licencia,
            "identificador_dispositivo": d.identificador_dispositivo,
        }
    if a.detalle_correo:
        d = a.detalle_correo
        datos["correo"] = {
            "direccion": d.direccion,
            "habilitada": d.habilitada,
            "ultimo_acceso": d.ultimo_acceso,
            "almacenamiento_gb": float(d.almacenamiento_gb)
            if d.almacenamiento_gb is not None
            else None,
            "alias_de": d.alias_de,
            "actividad_importada_en": d.actividad_importada_en,
            "dias_sin_acceso": dias_sin_acceso(d),
            "nunca_accedio": d.actividad_importada_en is not None and d.ultimo_acceso is None,
        }
    if vigentes is not None:
        vig = vigentes.get(a.id)
        datos["asignado_a"] = dic_asignacion(vig) if vig else None
    elif db is not None:
        vig = asignacion_vigente(db, a.id)
        datos["asignado_a"] = dic_asignacion(vig) if vig else None
    return datos


def asignaciones_vigentes(db: Session, activo_ids: list[int]) -> dict[int, Asignacion]:
    """Asignación vigente de cada activo en pocas consultas, en lugar de una por activo."""
    vigentes: dict[int, Asignacion] = {}
    for i in range(0, len(activo_ids), 500):
        lote = activo_ids[i : i + 500]
        for asig in (
            db.query(Asignacion)
            .options(joinedload(Asignacion.empleado))
            .filter(Asignacion.activo_id.in_(lote), Asignacion.fecha_devolucion.is_(None))
        ):
            vigentes.setdefault(asig.activo_id, asig)
    return vigentes


def dias_sin_acceso(d: DetalleCorreo) -> int | None:
    if d.ultimo_acceso is None:
        return None
    return (ahora_local() - d.ultimo_acceso).days


def correo_en_desuso(d: DetalleCorreo) -> bool:
    if not d.habilitada:
        return False
    dias = dias_sin_acceso(d)
    if dias is None:
        return d.actividad_importada_en is not None
    return dias >= DIAS_DESUSO_CORREO


def dic_asignacion(a: Asignacion) -> dict:
    return {
        "id": a.id,
        "activo_id": a.activo_id,
        "activo_codigo": a.activo.codigo,
        "activo_tipo": a.activo.tipo.value,
        "activo_descripcion": a.activo.descripcion,
        "empleado_id": a.empleado_id,
        "empleado": a.empleado.nombre_completo,
        "codigo_empleado": a.empleado.codigo,
        "fecha_asignacion": a.fecha_asignacion,
        "fecha_devolucion": a.fecha_devolucion,
        "responsiva_estado": a.responsiva_estado.value,
        "responsiva_fecha_envio": a.responsiva_fecha_envio,
        "responsiva_fecha_firma": a.responsiva_fecha_firma,
        "responsiva_destino": a.responsiva_destino,
        "responsiva_url": a.responsiva_url,
        "responsiva_archivo": a.responsiva_archivo,
        "responsiva_nombre": a.responsiva_nombre,
        "dias_en_espera": (
            (hoy_local() - a.responsiva_fecha_envio).days
            if a.responsiva_estado == EstadoDocumento.ENVIADA and a.responsiva_fecha_envio
            else None
        ),
        "ine_estado": a.ine_estado.value,
        "ine_url": a.ine_url,
        "ine_archivo": a.ine_archivo,
        "ine_nombre": a.ine_nombre,
        "motivo_devolucion": a.motivo_devolucion,
        "notas": a.notas,
    }


# --------------------------------------------------------------------------
# Sesion
# --------------------------------------------------------------------------


def _perfil(usuario: Usuario) -> dict:
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.nombre,
        "rol": usuario.rol.value,
        "foto": usuario.foto,
        "correo": usuario.correo,
        "telefono": usuario.telefono,
        "puesto": usuario.puesto,
        "password_por_defecto": usuario.debe_cambiar_password,
    }


@app.post("/api/login")
def login(
    datos: schemas.LoginIn,
    request: Request,
    respuesta: Response,
    db: Session = Depends(obtener_sesion),
):
    username = datos.username.strip().lower()
    ip = ip_cliente(request)
    llave_usuario = f"{ip}|{username}"
    espera = fallos_por_ip.excedido(ip) or fallos_por_usuario.excedido(llave_usuario)
    if espera is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Demasiados intentos fallidos. Intenta de nuevo en {int(espera // 60) + 1} min.",
            headers={"Retry-After": str(int(espera))},
        )

    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if usuario is None:
        verificar_senuelo(datos.password)
    if usuario is None or not verificar_password(datos.password, usuario.password_hash):
        fallos_por_ip.registrar(ip)
        fallos_por_usuario.registrar(llave_usuario)
        registrar(
            db, None, "LOGIN_FALLIDO", "usuario", usuario.id if usuario else None, f"{username} · {ip}"
        )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    if not usuario.activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario desactivado")

    fallos_por_usuario.limpiar(llave_usuario)
    if requiere_rehash(usuario.password_hash):
        usuario.password_hash = hashear_password(datos.password)
    # Bases anteriores: si conserva la contraseña de fábrica, debe cambiarla
    if not usuario.debe_cambiar_password and datos.password == PASSWORD_DE_FABRICA:
        usuario.debe_cambiar_password = True
    token = crear_sesion(db, usuario)
    poner_cookie(respuesta, token)
    return _perfil(usuario)


@app.post("/api/logout")
def logout(request: Request, respuesta: Response, db: Session = Depends(obtener_sesion)):
    token = request.cookies.get(COOKIE)
    if token:
        cerrar_sesion(db, token)
    quitar_cookie(respuesta)
    return {"ok": True}


@app.get("/api/yo")
def yo(usuario: Usuario = Depends(usuario_actual)):
    return _perfil(usuario)


@app.put("/api/yo")
def editar_perfil(
    datos: schemas.PerfilIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    usuario.nombre = datos.nombre.strip()
    usuario.correo = datos.correo
    usuario.telefono = datos.telefono
    usuario.puesto = datos.puesto
    registrar(db, usuario, "EDITAR", "usuario", usuario.id, "perfil")
    db.commit()
    return _perfil(usuario)


FOTO_MAXIMA = 2 * 1024 * 1024  # 2 MB


def _quitar_archivo_foto(nombre: str | None) -> None:
    if nombre and NOMBRE_ADJUNTO.match(nombre):
        (ADJUNTOS / nombre).unlink(missing_ok=True)


@app.post("/api/yo/foto")
async def subir_foto(
    archivo: UploadFile = File(...),
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    extension = Path(archivo.filename or "").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "La foto debe ser JPG, PNG o WEBP")
    contenido = await archivo.read(FOTO_MAXIMA + 1)
    if len(contenido) > FOTO_MAXIMA:
        raise HTTPException(400, "La foto supera los 2 MB")
    if not contenido.startswith(FIRMAS_ARCHIVO[extension]) or (
        extension == ".webp" and contenido[8:12] != b"WEBP"
    ):
        raise HTTPException(400, "El contenido del archivo no corresponde a su formato")

    nombre_disco = f"{secrets.token_hex(16)}{extension}"
    (ADJUNTOS / nombre_disco).write_bytes(cifrar_bytes(contenido))
    _quitar_archivo_foto(usuario.foto)
    usuario.foto = nombre_disco
    registrar(db, usuario, "EDITAR", "usuario", usuario.id, "foto de perfil")
    db.commit()
    return _perfil(usuario)


@app.delete("/api/yo/foto")
def quitar_foto(
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    _quitar_archivo_foto(usuario.foto)
    usuario.foto = None
    registrar(db, usuario, "EDITAR", "usuario", usuario.id, "se quitó la foto de perfil")
    db.commit()
    return _perfil(usuario)


@app.post("/api/yo/password")
def cambiar_password(
    datos: schemas.CambioPasswordIn,
    request: Request,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    llave = f"password|{usuario.id}"
    if fallos_por_usuario.excedido(llave) is not None:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Intenta más tarde.")
    if not verificar_password(datos.password_actual, usuario.password_hash):
        fallos_por_usuario.registrar(llave)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no coincide")
    if datos.password_nueva == PASSWORD_DE_FABRICA:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña nueva no puede ser la de fábrica")
    usuario.password_hash = hashear_password(datos.password_nueva)
    usuario.debe_cambiar_password = False
    cerrar_otras_sesiones(db, usuario, request.cookies.get(COOKIE))
    registrar(db, usuario, "EDITAR", "usuario", usuario.id, "cambio de contraseña")
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------
# Adjuntos: responsivas e INE
# --------------------------------------------------------------------------


@app.post("/api/adjuntos")
async def subir_adjunto(
    request: Request,
    archivo: UploadFile = File(...),
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    if subidas_por_ip.consumir(ip_cliente(request)) is not None:
        raise HTTPException(429, "Demasiados archivos en poco tiempo. Intenta en un momento.")
    extension = Path(archivo.filename or "").suffix.lower()
    if extension not in EXTENSIONES_PERMITIDAS:
        raise HTTPException(
            400, f"Formato no admitido. Se aceptan: {', '.join(sorted(EXTENSIONES_PERMITIDAS))}"
        )

    contenido = await archivo.read(TAMANO_MAXIMO + 1)
    if len(contenido) > TAMANO_MAXIMO:
        raise HTTPException(400, "El archivo supera los 10 MB")
    if not contenido:
        raise HTTPException(400, "El archivo está vacío")
    if not contenido.startswith(FIRMAS_ARCHIVO[extension]) or (
        extension == ".webp" and contenido[8:12] != b"WEBP"
    ):
        raise HTTPException(400, "El contenido del archivo no corresponde a su formato")
    nombre_original = re.sub(r"[^\w .()-]", "_", Path(archivo.filename or "").name)[:200]

    # El nombre en disco lo genera el servidor: nunca se usa el del usuario,
    # que podría contener rutas o caracteres peligrosos.
    nombre_disco = f"{secrets.token_hex(16)}{extension}"
    (ADJUNTOS / nombre_disco).write_bytes(cifrar_bytes(contenido))

    registrar(db, usuario, "SUBIR", "adjunto", None, nombre_original)
    db.commit()
    return {
        "archivo": nombre_disco,
        "nombre": nombre_original,
        "tamano": len(contenido),
    }


@app.get("/api/adjuntos/{nombre}")
def ver_adjunto(nombre: str, _=Depends(usuario_actual)):
    # Solo nombres generados por el servidor: impide rutas tipo ../../
    ruta = ADJUNTOS / nombre
    if not NOMBRE_ADJUNTO.match(nombre) or not ruta.is_file():
        raise HTTPException(404, "Archivo no encontrado")

    tipo, _codificacion = mimetypes.guess_type(ruta.name)
    return Response(
        descifrar_bytes(ruta.read_bytes()),
        media_type=tipo or "application/octet-stream",
        # inline permite verlo dentro de la aplicación en lugar de descargarlo
        headers={"Content-Disposition": f'inline; filename="{ruta.name}"'},
    )


