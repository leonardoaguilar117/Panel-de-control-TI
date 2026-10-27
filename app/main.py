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


# --------------------------------------------------------------------------
# Catalogos
# --------------------------------------------------------------------------


@app.get("/api/catalogos")
def catalogos(db: Session = Depends(obtener_sesion), _=Depends(usuario_actual)):
    return {
        "sucursales": [
            {"id": s.id, "nombre": s.nombre, "clave": s.clave}
            for s in db.query(Sucursal).filter_by(activo=True).order_by(Sucursal.nombre)
        ],
        "departamentos": [
            {"id": d.id, "nombre": d.nombre, "clave": d.clave}
            for d in db.query(Departamento).filter_by(activo=True).order_by(Departamento.nombre)
        ],
        "bodegas": [
            {"id": b.id, "nombre": b.nombre, "sucursal_id": b.sucursal_id}
            for b in db.query(Bodega).filter_by(activo=True).order_by(Bodega.nombre)
        ],
        "plantas": [
            {"id": p.id, "nombre": p.nombre}
            for p in db.query(Planta).filter_by(activo=True).order_by(Planta.nombre)
        ],
        "cuentas_licencia": [
            {
                "id": c.id,
                "nombre": c.nombre,
                "producto": c.producto,
                "correo_cuenta": c.correo_cuenta,
                "referencia_credencial": c.referencia_credencial,
                "ranuras_totales": c.ranuras_totales,
                "ranuras_usadas": db.query(DetalleLicencia).filter_by(cuenta_id=c.id).count(),
                "fecha_renovacion": c.fecha_renovacion,
                "notas": c.notas,
            }
            for c in db.query(CuentaLicencia).filter_by(activo=True).order_by(CuentaLicencia.nombre)
        ],
        "sistemas": [
            {
                "id": s.id,
                "nombre": s.nombre,
                "clave": s.clave,
                "descripcion": s.descripcion,
                "orden": s.orden,
            }
            for s in db.query(SistemaInterno)
            .filter_by(activo=True)
            .order_by(SistemaInterno.orden, SistemaInterno.nombre)
        ],
        "analistas": [
            {"id": u.id, "nombre": u.nombre, "username": u.username, "rol": u.rol.value}
            for u in db.query(Usuario)
            .filter(Usuario.activo.is_(True))
            .order_by(Usuario.nombre)
        ],
        "tipos_activo": [t.value for t in TipoActivo],
        "estatus_activo": [e.value for e in EstatusActivo],
    }


@app.post("/api/catalogos/{entidad}")
def crear_catalogo(
    entidad: str,
    datos: schemas.CatalogoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    modelos = {
        "sucursales": Sucursal,
        "departamentos": Departamento,
        "bodegas": Bodega,
        "plantas": Planta,
    }
    if entidad not in modelos:
        raise HTTPException(404, "Catálogo desconocido")

    Modelo = modelos[entidad]
    kwargs: dict = {"nombre": datos.nombre.strip().upper()}
    if entidad in ("sucursales", "departamentos"):
        if not datos.clave:
            raise HTTPException(400, "La clave es obligatoria")
        kwargs["clave"] = datos.clave.strip().upper()
    if entidad == "bodegas":
        kwargs["sucursal_id"] = datos.sucursal_id

    registro = Modelo(**kwargs)
    db.add(registro)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe un registro con ese nombre o clave")
    registrar(db, usuario, "CREAR", entidad, registro.id, datos.nombre)
    db.commit()
    return {"id": registro.id, "nombre": registro.nombre}


# Tope de licencias por familia según el plan de cada producto
LICENCIAS_POR_FAMILIA = {TipoActivo.LICENCIA_MICROSOFT: 6, TipoActivo.LICENCIA_NORTON: 10}
NOMBRE_PRODUCTO = {TipoActivo.LICENCIA_MICROSOFT: "Microsoft 365", TipoActivo.LICENCIA_NORTON: "Norton 360"}


def tipo_de_producto(producto: str | None) -> TipoActivo | None:
    texto = (producto or "").lower()
    if "norton" in texto:
        return TipoActivo.LICENCIA_NORTON
    if "microsoft" in texto or "365" in texto or "office" in texto:
        return TipoActivo.LICENCIA_MICROSOFT
    return None


def validar_ranuras(datos: schemas.CuentaLicenciaIn, en_uso: int = 0) -> None:
    tipo = tipo_de_producto(datos.producto)
    if tipo and datos.ranuras_totales > LICENCIAS_POR_FAMILIA[tipo]:
        raise HTTPException(
            400,
            f"Una familia de {NOMBRE_PRODUCTO[tipo]} admite hasta "
            f"{LICENCIAS_POR_FAMILIA[tipo]} licencias",
        )
    if datos.ranuras_totales < en_uso:
        raise HTTPException(
            409, f"La familia ya tiene {en_uso} licencias; no puede quedar con menos ranuras"
        )


def validar_cupo_familia(db: Session, activo: Activo, tipo: TipoActivo, cuenta_id: int) -> None:
    """Impide ligar una licencia a una familia llena o de otro producto."""
    cuenta = db.get(CuentaLicencia, cuenta_id)
    if cuenta is None:
        raise HTTPException(404, "Familia de licencias no encontrada")
    producto = tipo_de_producto(cuenta.producto)
    if producto and producto != tipo:
        raise HTTPException(
            409, f"{cuenta.nombre} es una familia de {NOMBRE_PRODUCTO[producto]}"
        )
    tope = min(LICENCIAS_POR_FAMILIA[tipo], cuenta.ranuras_totales)
    ocupadas = (
        db.query(DetalleLicencia)
        .filter(DetalleLicencia.cuenta_id == cuenta_id, DetalleLicencia.activo_id != activo.id)
        .count()
    )
    if ocupadas >= tope:
        raise HTTPException(
            409, f"{cuenta.nombre} ya tiene sus {tope} licencias; elige otra familia"
        )


@app.post("/api/cuentas-licencia")
def crear_cuenta_licencia(
    datos: schemas.CuentaLicenciaIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    validar_ranuras(datos)
    cuenta = CuentaLicencia(**datos.model_dump())
    db.add(cuenta)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese nombre")
    registrar(db, usuario, "CREAR", "cuenta_licencia", cuenta.id, datos.nombre)
    db.commit()
    return {"id": cuenta.id, "nombre": cuenta.nombre}


@app.put("/api/cuentas-licencia/{cuenta_id}")
def editar_cuenta_licencia(
    cuenta_id: int,
    datos: schemas.CuentaLicenciaIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    cuenta = db.get(CuentaLicencia, cuenta_id)
    if cuenta is None:
        raise HTTPException(404, "Cuenta no encontrada")
    validar_ranuras(datos, db.query(DetalleLicencia).filter_by(cuenta_id=cuenta_id).count())
    for campo, valor in datos.model_dump().items():
        setattr(cuenta, campo, valor)
    registrar(db, usuario, "EDITAR", "cuenta_licencia", cuenta.id, cuenta.nombre)
    db.commit()
    return {"id": cuenta.id, "nombre": cuenta.nombre}


@app.delete("/api/cuentas-licencia/{cuenta_id}")
def eliminar_cuenta_licencia(
    cuenta_id: int,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    cuenta = db.get(CuentaLicencia, cuenta_id)
    if cuenta is None:
        raise HTTPException(404, "Cuenta no encontrada")
    en_uso = db.query(DetalleLicencia).filter_by(cuenta_id=cuenta_id).count()
    if en_uso:
        raise HTTPException(
            409, f"La cuenta tiene {en_uso} licencia(s) registrada(s). Elimínalas primero."
        )
    nombre = cuenta.nombre
    db.delete(cuenta)
    registrar(db, usuario, "ELIMINAR", "cuenta_licencia", cuenta_id, nombre)
    db.commit()
    return {"ok": True}


PRODUCTOS_LICENCIA = {
    "microsoft": (TipoActivo.LICENCIA_MICROSOFT, "microsoft"),
    "norton": (TipoActivo.LICENCIA_NORTON, "norton"),
}


@app.get("/api/licencias/familias")
def licencias_por_familia(
    producto: str = Query("microsoft", pattern="^(microsoft|norton)$"),
    db: Session = Depends(obtener_sesion),
    _=Depends(usuario_actual),
):
    """Licencias agrupadas por familia (cuenta), con quién las usa y dónde está."""
    tipo, palabra = PRODUCTOS_LICENCIA[producto]
    licencias = (
        db.query(Activo)
        .join(DetalleLicencia)
        .filter(Activo.tipo == tipo)
        .order_by(Activo.codigo)
        .all()
    )
    grupos: dict[int | None, list[dict]] = {}
    for a in licencias:
        d = a.detalle_licencia
        vig = asignacion_vigente(db, a.id)
        e = vig.empleado if vig else None
        grupos.setdefault(d.cuenta_id, []).append(
            {
                "id": a.id,
                "codigo": a.codigo,
                "estatus": a.estatus.value,
                "correo_licencia": d.correo_licencia,
                "identificador": d.identificador_dispositivo,
                "fecha_adquisicion": a.fecha_adquisicion,
                "fecha_vencimiento": a.fecha_vencimiento,
                "asignacion_id": vig.id if vig else None,
                "empleado_id": e.id if e else None,
                "empleado": e.nombre_completo if e else None,
                "sucursal": e.sucursal.nombre if e and e.sucursal else None,
                "bodega": e.bodega.nombre if e and e.bodega else None,
                "departamento": e.departamento.nombre if e and e.departamento else None,
                "planta": e.planta.nombre if e and e.planta else None,
                "sucursal_id": e.sucursal_id if e else None,
                "departamento_id": e.departamento_id if e else None,
                "bodega_id": e.bodega_id if e else None,
                "planta_id": e.planta_id if e else None,
            }
        )

    cuentas = [
        c
        for c in db.query(CuentaLicencia).order_by(CuentaLicencia.id)
        if c.id in grupos or (c.activo and palabra in (c.producto or "").lower())
    ]
    salida = [
        {
            "cuenta": {
                "id": c.id,
                "nombre": c.nombre,
                "producto": c.producto,
                "correo_cuenta": c.correo_cuenta,
                "referencia_credencial": c.referencia_credencial,
                "ranuras_totales": c.ranuras_totales,
                "fecha_renovacion": c.fecha_renovacion,
                "notas": c.notas,
            },
            "licencias": grupos.get(c.id, []),
        }
        for c in cuentas
    ]
    if grupos.get(None):
        salida.append({"cuenta": None, "licencias": grupos[None]})
    return salida


# --------------------------------------------------------------------------
# Empleados
# --------------------------------------------------------------------------


@app.get("/api/empleados")
def listar_empleados(
    q: str | None = Query(None, max_length=100),
    sucursal_id: int | None = None,
    departamento_id: int | None = None,
    bodega_id: int | None = None,
    planta_id: int | None = None,
    estatus: EstatusEmpleado | None = None,
    db: Session = Depends(obtener_sesion),
    _=Depends(usuario_actual),
):
    consulta = db.query(Empleado)
    if q:
        patron = patron_busqueda(q)
        consulta = consulta.filter(
            or_(
                func.upper(Empleado.nombre_completo).like(patron, escape="\\"),
                func.upper(Empleado.codigo).like(patron, escape="\\"),
                Empleado.id.in_(
                    db.query(Asignacion.empleado_id)
                    .join(DetalleCorreo, DetalleCorreo.activo_id == Asignacion.activo_id)
                    .filter(
                        Asignacion.fecha_devolucion.is_(None),
                        func.upper(DetalleCorreo.direccion).like(patron, escape="\\"),
                    )
                ),
            )
        )
    consulta = consulta.filter(*filtro_ubicacion(sucursal_id, departamento_id, bodega_id, planta_id))
    if estatus:
        consulta = consulta.filter(Empleado.estatus == estatus)

    empleados = consulta.order_by(Empleado.nombre_completo).all()
    ids = [e.id for e in empleados]
    def contar(fisicos: bool) -> dict:
        if not ids:
            return {}
        filtro = Activo.tipo.in_(TIPOS_FISICOS) if fisicos else Activo.tipo.notin_(TIPOS_FISICOS)
        return dict(
            db.query(Asignacion.empleado_id, func.count(Asignacion.id))
            .join(Activo, Activo.id == Asignacion.activo_id)
            .filter(
                Asignacion.empleado_id.in_(ids),
                Asignacion.fecha_devolucion.is_(None),
                filtro,
            )
            .group_by(Asignacion.empleado_id)
            .all()
        )

    activos, servicios = contar(True), contar(False)
    correos = correos_asignados(db, ids)
    salida = []
    for e in empleados:
        d = dic_empleado(e)
        d["total_activos"] = activos.get(e.id, 0)
        d["total_servicios"] = servicios.get(e.id, 0)
        d["correos"] = correos.get(e.id, [])
        salida.append(d)
    return salida


ESTADO_DOC_TEXTO = {
    "PENDIENTE": "Pendiente de enviar",
    "ENVIADA": "En espera de firma",
    "FIRMADA": "Firmada",
    "NO_APLICA": "No aplica",
}

TIPO_ACTIVO_TEXTO = {
    TipoActivo.COMPUTO: "Equipo de cómputo",
    TipoActivo.TABLETA: "Tablet",
    TipoActivo.TELEFONO: "Teléfono",
}


def _neutralizar_formulas(wb) -> None:
    """Un texto que empieza con = + - @ se abriría como fórmula en Excel: se antepone una comilla."""
    for hoja in wb.worksheets:
        for fila in hoja.iter_rows():
            for celda in fila:
                if celda.data_type in ("s", "f") and isinstance(celda.value, str) \
                        and celda.value[:1] in ("=", "+", "-", "@", "\t", "\r"):
                    celda.value = "'" + celda.value
                    celda.data_type = "s"


def _descarga_excel(hoja_titulo: str, columnas: list[str], filas: list[list], anchos: list[int], nombre: str):
    """Una hoja con encabezado fijo y filtros. Una celda (texto, url) se escribe como enlace."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    hoja = wb.active
    hoja.title = hoja_titulo
    hoja.append(columnas)
    for celda in hoja[1]:
        celda.font = Font(bold=True)
        celda.fill = PatternFill("solid", fgColor="DDEBF7")
        celda.alignment = Alignment(vertical="center", wrap_text=True)

    for n, fila in enumerate(filas, start=2):
        for col, valor in enumerate(fila, start=1):
            if isinstance(valor, tuple):
                texto, url = valor
                celda = hoja.cell(row=n, column=col, value=texto)
                if url:
                    celda.hyperlink = url
                    celda.font = Font(color="0563C1", underline="single")
            else:
                celda = hoja.cell(row=n, column=col, value=valor)
            if isinstance(valor, dt.date):
                celda.number_format = "DD/MM/YYYY"
            celda.alignment = Alignment(vertical="top", wrap_text=True)

    for i, ancho in enumerate(anchos, start=1):
        hoja.column_dimensions[get_column_letter(i)].width = ancho
    hoja.freeze_panes = "A2"
    hoja.auto_filter.ref = hoja.dimensions

    _neutralizar_formulas(wb)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}_{hoy_local():%Y%m%d}.xlsx"'},
    )


def _enlace_documento(request: Request, asignacion: dict | None, cual: str):
    """Liga del PDF o imagen de una responsiva o INE, o vacío si no hay."""
    if not asignacion:
        return ""
    archivo = asignacion[f"{cual}_archivo"]
    if archivo:
        url = f"{str(request.base_url).rstrip('/')}/api/adjuntos/{quote(archivo)}"
        return (asignacion[f"{cual}_nombre"] or archivo, url)
    url = asignacion[f"{cual}_url"]
    return (url, url) if url else ""


@app.get("/api/empleados/exportar")
def exportar_empleados(
    q: str | None = Query(None, max_length=100),
    sucursal_id: int | None = None,
    departamento_id: int | None = None,
    bodega_id: int | None = None,
    planta_id: int | None = None,
    estatus: EstatusEmpleado | None = None,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    empleados = listar_empleados(
        q, sucursal_id, departamento_id, bodega_id, planta_id, estatus, db, usuario
    )
    ids = [e["id"] for e in empleados]
    equipos: dict[int, list[str]] = {}
    if ids:
        for a in (
            db.query(Asignacion)
            .join(Activo, Activo.id == Asignacion.activo_id)
            .filter(
                Asignacion.empleado_id.in_(ids),
                Asignacion.fecha_devolucion.is_(None),
                Activo.tipo.in_(TIPOS_FISICOS),
            )
            .order_by(Activo.codigo)
        ):
            texto = f"{a.activo.codigo} ({TIPO_ACTIVO_TEXTO.get(a.activo.tipo, a.activo.tipo.value)})"
            if a.activo.tipo in TIPOS_CON_RESPONSIVA:
                texto += f" · Responsiva: {ESTADO_DOC_TEXTO[a.responsiva_estado.value]}"
            equipos.setdefault(a.empleado_id, []).append(texto)

    filas = [
        [
            e["codigo"], e["nombre_completo"], "\n".join(e["correos"]), e["puesto"],
            e["departamento"], e["sucursal"], e["bodega"] or e["planta"], e["estatus"],
            e["fecha_ingreso"], e["fecha_baja"], e["total_activos"],
            "\n".join(equipos.get(e["id"], [])), e["total_servicios"],
        ]
        for e in empleados
    ]
    return _descarga_excel(
        "Empleados",
        ["Código", "Nombre completo", "Correos", "Puesto", "Departamento", "Sucursal",
         "Locación", "Estatus", "Fecha de ingreso", "Fecha de baja", "Activos",
         "Equipos asignados", "Licencias y correos"],
        filas,
        [12, 34, 32, 24, 22, 18, 24, 11, 14, 14, 9, 52, 12],
        "empleados",
    )


@app.get("/api/empleados/{empleado_id}")
def ver_empleado(
    empleado_id: int, db: Session = Depends(obtener_sesion), _=Depends(usuario_actual)
):
    empleado = db.get(Empleado, empleado_id)
    if empleado is None:
        raise HTTPException(404, "Empleado no encontrado")
    return dic_empleado(empleado, con_activos=True, db=db)


def lugar_trabajo(e: Empleado) -> str:
    if e.bodega:
        return e.bodega.nombre
    return e.planta.nombre if e.planta else ""


def nombre_completo(datos: schemas.EmpleadoIn) -> str:
    return " ".join(f"{datos.apellidos} {datos.nombres}".split()).upper()


def validar_lugar_trabajo(datos: schemas.EmpleadoIn) -> None:
    if datos.bodega_id and datos.planta_id:
        raise HTTPException(422, "Un empleado solo puede tener bodega o planta, no ambas")


def validar_empleado_unico(db: Session, clave: str, excluir_id: int | None = None) -> None:
    consulta = db.query(Empleado).filter(Empleado.nombre_clave == clave)
    if excluir_id is not None:
        consulta = consulta.filter(Empleado.id != excluir_id)
    existente = consulta.first()
    if existente:
        raise HTTPException(
            409,
            f"{existente.nombre_completo} ya está registrado como {existente.codigo} "
            f"({existente.estatus.value})",
        )


@app.post("/api/empleados")
@un_alta_a_la_vez
def crear_empleado(
    datos: schemas.EmpleadoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    validar_lugar_trabajo(datos)
    clave = clave_nombre(datos.nombres, datos.apellidos)
    validar_empleado_unico(db, clave)
    empleado = Empleado(
        codigo=siguiente_codigo_empleado(db),
        nombre_completo=nombre_completo(datos),
        nombre_clave=clave,
        **datos.model_dump(),
    )
    db.add(empleado)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe un empleado con ese código o nombre")
    registrar(db, usuario, "CREAR", "empleado", empleado.id, empleado.nombre_completo)
    db.commit()
    return dic_empleado(empleado)


@app.put("/api/empleados/{empleado_id}")
def editar_empleado(
    empleado_id: int,
    datos: schemas.EmpleadoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    empleado = db.get(Empleado, empleado_id)
    if empleado is None:
        raise HTTPException(404, "Empleado no encontrado")
    validar_lugar_trabajo(datos)
    clave = clave_nombre(datos.nombres, datos.apellidos)
    validar_empleado_unico(db, clave, excluir_id=empleado_id)
    for campo, valor in datos.model_dump().items():
        setattr(empleado, campo, valor)
    empleado.nombre_completo = nombre_completo(datos)
    empleado.nombre_clave = clave
    registrar(db, usuario, "EDITAR", "empleado", empleado.id, empleado.nombre_completo)
    db.commit()
    return dic_empleado(empleado)


@app.delete("/api/empleados/{empleado_id}")
def eliminar_empleado(
    empleado_id: int,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    empleado = db.get(Empleado, empleado_id)
    if empleado is None:
        raise HTTPException(404, "Empleado no encontrado")

    total = db.query(Asignacion).filter(Asignacion.empleado_id == empleado_id).count()
    if total:
        raise HTTPException(
            409,
            f"Tiene {total} asignación(es) en su historial. "
            "Para conservar el rastro de los activos, márcalo como BAJA en lugar de eliminarlo.",
        )
    nombre = empleado.nombre_completo
    db.delete(empleado)
    registrar(db, usuario, "ELIMINAR", "empleado", empleado_id, nombre)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------
# Activos
# --------------------------------------------------------------------------


def _aplicar_detalle(db: Session, activo: Activo, datos: schemas.ActivoIn) -> None:
    """Crea o actualiza las tablas de detalle que corresponden al tipo.

    La tableta lleva SIM y también es equipo de cómputo: usa ambas.
    """
    if datos.tipo in (TipoActivo.COMPUTO, TipoActivo.TABLETA) and datos.computo:
        destino = activo.detalle_computo or DetalleComputo(activo_id=activo.id)
        for campo, valor in datos.computo.model_dump().items():
            setattr(destino, campo, valor)
        activo.detalle_computo = destino

    if datos.tipo in (TipoActivo.TELEFONO, TipoActivo.TABLETA) and datos.movil:
        destino = activo.detalle_movil or DetalleMovil(activo_id=activo.id)
        for campo, valor in datos.movil.model_dump().items():
            setattr(destino, campo, valor)
        if datos.tipo == TipoActivo.TELEFONO:
            destino.operador = OPERADOR_TELEFONIA
            destino.esquema = ESQUEMA_TELEFONIA
        activo.detalle_movil = destino

    if (
        datos.tipo in (TipoActivo.LICENCIA_MICROSOFT, TipoActivo.LICENCIA_NORTON)
        and datos.licencia
    ):
        cuenta_nueva = datos.licencia.cuenta_id
        if cuenta_nueva and (
            activo.detalle_licencia is None or activo.detalle_licencia.cuenta_id != cuenta_nueva
        ):
            validar_cupo_familia(db, activo, datos.tipo, cuenta_nueva)
        destino = activo.detalle_licencia or DetalleLicencia(activo_id=activo.id)
        for campo, valor in datos.licencia.model_dump().items():
            setattr(destino, campo, valor)
        activo.detalle_licencia = destino

    elif datos.tipo == TipoActivo.CORREO_WORKSPACE and datos.correo:
        destino = activo.detalle_correo or DetalleCorreo(activo_id=activo.id)
        for campo, valor in datos.correo.model_dump().items():
            setattr(destino, campo, valor)
        activo.detalle_correo = destino


def _crear_activo(db: Session, datos: schemas.ActivoIn) -> Activo:
    if datos.tipo in TIPOS_SIN_VENCIMIENTO:
        datos.fecha_vencimiento = None
    if datos.tipo in TIPOS_LICENCIA:
        datos.fecha_adquisicion = None
    activo = Activo(
        codigo=datos.codigo.strip().upper() if datos.codigo else siguiente_codigo(db, datos.tipo),
        tipo=datos.tipo,
        estatus=datos.estatus,
        descripcion=datos.descripcion,
        fecha_adquisicion=datos.fecha_adquisicion,
        fecha_vencimiento=datos.fecha_vencimiento,
        notas=datos.notas,
    )
    db.add(activo)
    db.flush()
    _aplicar_detalle(db, activo, datos)
    db.flush()
    return activo


def _normalizar_documentos(datos, tipo: TipoActivo) -> None:
    """Deja en NO_APLICA los documentos que el tipo de activo no requiere."""
    if tipo not in TIPOS_CON_RESPONSIVA:
        datos.responsiva_estado = EstadoDocumento.NO_APLICA
        datos.responsiva_fecha_envio = None
        datos.responsiva_fecha_firma = None
        datos.responsiva_destino = None
        datos.responsiva_url = None
        datos.responsiva_archivo = None
        datos.responsiva_nombre = None
    if tipo not in TIPOS_CON_INE:
        datos.ine_estado = EstadoDocumento.NO_APLICA
        datos.ine_url = None
        datos.ine_archivo = None
        datos.ine_nombre = None


def _mensaje_duplicado(exc: IntegrityError) -> str:
    texto = str(exc.orig)
    for campo, etiqueta in (
        ("numero_serie", "el número de serie"),
        ("imei", "el IMEI"),
        ("numero_telefonico", "el número telefónico"),
        ("iccid", "el ICCID"),
        ("direccion", "la dirección de correo"),
        ("codigo", "el código"),
    ):
        if campo in texto:
            return f"{etiqueta} ya está registrado en otro activo"
    return "ya existe un registro con ese valor"


@app.get("/api/activos")
def listar_activos(
    q: str | None = Query(None, max_length=100),
    tipo: TipoActivo | None = None,
    grupo: str | None = None,
    estatus: EstatusActivo | None = None,
    cuenta_id: int | None = None,
    sin_asignar: bool = False,
    sucursal_id: int | None = None,
    departamento_id: int | None = None,
    bodega_id: int | None = None,
    planta_id: int | None = None,
    db: Session = Depends(obtener_sesion),
    _=Depends(usuario_actual),
):
    consulta = db.query(Activo)
    if grupo:
        if grupo not in GRUPOS:
            raise HTTPException(400, "Grupo desconocido")
        consulta = consulta.filter(Activo.tipo.in_(GRUPOS[grupo]))
    if tipo:
        consulta = consulta.filter(Activo.tipo == tipo)
    if estatus:
        consulta = consulta.filter(Activo.estatus == estatus)
    if cuenta_id:
        consulta = consulta.join(DetalleLicencia).filter(DetalleLicencia.cuenta_id == cuenta_id)
    ubicacion = filtro_ubicacion(sucursal_id, departamento_id, bodega_id, planta_id)
    if ubicacion:
        # Los activos no tienen ubicación propia: se filtran por la persona que los tiene
        consulta = consulta.filter(
            Activo.id.in_(
                db.query(Asignacion.activo_id)
                .join(Empleado, Empleado.id == Asignacion.empleado_id)
                .filter(Asignacion.fecha_devolucion.is_(None), *ubicacion)
            )
        )
    if q:
        patron = patron_busqueda(q)
        consulta = (
            consulta.outerjoin(DetalleComputo)
            .outerjoin(DetalleMovil)
            .outerjoin(DetalleCorreo)
            .outerjoin(DetalleLicencia)
            .filter(
                or_(
                    func.upper(Activo.codigo).like(patron, escape="\\"),
                    func.upper(Activo.descripcion).like(patron, escape="\\"),
                    func.upper(DetalleComputo.numero_serie).like(patron, escape="\\"),
                    func.upper(DetalleMovil.imei).like(patron, escape="\\"),
                    func.upper(DetalleMovil.numero_telefonico).like(patron, escape="\\"),
                    func.upper(DetalleCorreo.direccion).like(patron, escape="\\"),
                    func.upper(DetalleLicencia.correo_licencia).like(patron, escape="\\"),
                    func.upper(DetalleLicencia.identificador_dispositivo).like(patron, escape="\\"),
                )
            )
        )

    # Los detalles y las asignaciones se traen por lotes: una consulta por tabla, no por activo
    activos = (
        consulta.options(
            selectinload(Activo.detalle_computo),
            selectinload(Activo.detalle_movil),
            selectinload(Activo.detalle_licencia).selectinload(DetalleLicencia.cuenta),
            selectinload(Activo.detalle_correo),
        )
        .order_by(Activo.codigo)
        .all()
    )
    vigentes = asignaciones_vigentes(db, [a.id for a in activos])
    salida = [dic_activo(a, db, vigentes) for a in activos]
    if sin_asignar:
        salida = [a for a in salida if a["asignado_a"] is None]
    return salida


@app.get("/api/activos/exportar")
def exportar_activos(
    request: Request,
    grupo: str,
    q: str | None = Query(None, max_length=100),
    tipo: TipoActivo | None = None,
    estatus: EstatusActivo | None = None,
    sin_asignar: bool = False,
    sucursal_id: int | None = None,
    departamento_id: int | None = None,
    bodega_id: int | None = None,
    planta_id: int | None = None,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(usuario_actual),
):
    if grupo not in ("equipos", "tabletas", "telefonia"):
        raise HTTPException(400, "Grupo desconocido")
    activos = listar_activos(
        q, tipo, grupo, estatus, None, sin_asignar,
        sucursal_id, departamento_id, bodega_id, planta_id, db, usuario,
    )
    empleados = {
        e.id: e
        for e in db.query(Empleado).filter(
            Empleado.id.in_([a["asignado_a"]["empleado_id"] for a in activos if a["asignado_a"]])
        )
    }

    def asignacion(a: dict) -> list:
        vig = a["asignado_a"]
        emp = empleados.get(vig["empleado_id"]) if vig else None
        return [
            vig["empleado"] if vig else "",
            vig["codigo_empleado"] if vig else "",
            emp.departamento.nombre if emp and emp.departamento else "",
            emp.sucursal.nombre if emp and emp.sucursal else "",
            vig["fecha_asignacion"] if vig else None,
        ]

    def responsiva(a: dict) -> list:
        vig = a["asignado_a"]
        if not vig:
            return ["", None, "", None, ""]
        return [
            ESTADO_DOC_TEXTO[vig["responsiva_estado"]],
            vig["responsiva_fecha_envio"],
            vig["responsiva_destino"],
            vig["responsiva_fecha_firma"],
            _enlace_documento(request, vig, "responsiva"),
        ]

    columnas_asignacion = ["Asignado a", "Código empleado", "Departamento", "Sucursal", "Asignado desde"]
    columnas_responsiva = ["Responsiva", "Enviada a firmar", "Enviada a", "Firmada el", "Documento responsiva"]

    if grupo == "telefonia":
        filas = []
        for a in activos:
            m = a.get("movil") or {}
            vig = a["asignado_a"]
            filas.append(
                [
                    a["codigo"], m.get("marca"), m.get("modelo"), m.get("numero_telefonico"),
                    m.get("imei"), m.get("iccid"), m.get("operador"), m.get("precio_plan"),
                    m.get("esquema"), "Sí" if m.get("esim") else "No", m.get("cuenta_operador"),
                    a["estatus"], *asignacion(a), *responsiva(a),
                    ESTADO_DOC_TEXTO[vig["ine_estado"]] if vig else "",
                    _enlace_documento(request, vig, "ine"), a["notas"],
                ]
            )
        return _descarga_excel(
            "Telefonía",
            ["Código", "Marca", "Modelo", "Teléfono", "IMEI", "ICCID", "Operador", "Plan",
             "Esquema", "eSIM", "Cuenta operador", "Estatus", *columnas_asignacion,
             *columnas_responsiva, "INE", "Documento INE", "Notas"],
            filas,
            [12, 14, 22, 14, 18, 22, 12, 10, 16, 7, 16, 13, 30, 14, 20, 16, 13,
             20, 14, 20, 13, 30, 20, 30, 30],
            "telefonia",
        )

    filas = []
    for a in activos:
        c = a.get("computo") or {}
        filas.append(
            [
                a["codigo"], c.get("marca"), c.get("modelo"), c.get("numero_serie"),
                c.get("procesador"), c.get("ram_gb"), c.get("almacenamiento"),
                c.get("sistema_operativo"), a["fecha_adquisicion"], a["estatus"],
                *asignacion(a), *responsiva(a), a["notas"],
            ]
        )
    return _descarga_excel(
        "Tablets" if grupo == "tabletas" else "Equipos de cómputo",
        ["Código", "Marca", "Modelo", "Número de serie", "Procesador", "RAM (GB)",
         "Almacenamiento", "Sistema operativo", "Fecha de adquisición", "Estatus",
         *columnas_asignacion, *columnas_responsiva, "Notas"],
        filas,
        [12, 14, 22, 20, 26, 9, 15, 18, 14, 13, 30, 14, 20, 16, 13, 20, 14, 20, 13, 30, 30],
        grupo,
    )


@app.get("/api/activos/{activo_id}")
def ver_activo(activo_id: int, db: Session = Depends(obtener_sesion), _=Depends(usuario_actual)):
    activo = db.get(Activo, activo_id)
    if activo is None:
        raise HTTPException(404, "Activo no encontrado")
    datos = dic_activo(activo, db)
    datos["historial"] = [
        dic_asignacion(a)
        for a in db.query(Asignacion)
        .filter(Asignacion.activo_id == activo_id)
        .order_by(Asignacion.fecha_asignacion.desc())
        .all()
    ]
    return datos


@app.post("/api/activos")
@un_alta_a_la_vez
def crear_activo(
    datos: schemas.ActivoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    try:
        activo = _crear_activo(db, datos)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Dato duplicado: {_mensaje_duplicado(exc)}")
    registrar(db, usuario, "CREAR", "activo", activo.id, activo.codigo)
    db.commit()
    return dic_activo(activo, db)


@app.put("/api/activos/{activo_id}")
def editar_activo(
    activo_id: int,
    datos: schemas.ActivoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    activo = db.get(Activo, activo_id)
    if activo is None:
        raise HTTPException(404, "Activo no encontrado")

    activo.estatus = datos.estatus
    activo.descripcion = datos.descripcion
    activo.fecha_adquisicion = None if activo.tipo in TIPOS_LICENCIA else datos.fecha_adquisicion
    activo.fecha_vencimiento = (
        None if activo.tipo in TIPOS_SIN_VENCIMIENTO else datos.fecha_vencimiento
    )
    activo.notas = datos.notas
    if datos.codigo:
        activo.codigo = datos.codigo.strip().upper()

    try:
        _aplicar_detalle(db, activo, datos)
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Dato duplicado: {_mensaje_duplicado(exc)}")
    registrar(db, usuario, "EDITAR", "activo", activo.id, activo.codigo)
    db.commit()
    return dic_activo(activo, db)


@app.delete("/api/activos/{activo_id}")
def eliminar_activo(
    activo_id: int,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    activo = db.get(Activo, activo_id)
    if activo is None:
        raise HTTPException(404, "Activo no encontrado")

    codigo = activo.codigo
    # Se borra también su historial de asignaciones: la interfaz avisa antes.
    db.query(Asignacion).filter(Asignacion.activo_id == activo_id).delete()
    db.delete(activo)
    registrar(db, usuario, "ELIMINAR", "activo", activo_id, codigo)
    db.commit()
    return {"ok": True}


COLUMNAS_REPORTE_CORREO = {
    "direccion": "email address",
    "ultimo_acceso": "last sign in",
    "almacenamiento": "email usage",
}
# Columnas C, E y F del reporte de Google Workspace
POSICION_REPORTE_CORREO = {"direccion": 2, "ultimo_acceso": 4, "almacenamiento": 5}
UNIDADES_GB = {"KB": 1 / 1024**2, "MB": 1 / 1024, "GB": 1, "TB": 1024}


def _leer_ultimo_acceso(valor) -> tuple[bool, dt.datetime | None]:
    """(se pudo leer, fecha). Las cuentas que nunca han entrado dan (True, None)."""
    if isinstance(valor, dt.datetime):
        return True, valor
    texto = str(valor or "").strip()
    if not texto or texto.lower().startswith("never"):
        return True, None
    for formato in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return True, dt.datetime.strptime(texto, formato)
        except ValueError:
            pass
    return False, None


def _leer_almacenamiento(valor) -> float | None:
    if isinstance(valor, (int, float)):
        return float(valor)
    coincidencia = re.match(r"^\s*([\d.,]+)\s*([KMGT]B)?\s*$", str(valor or ""), re.IGNORECASE)
    if not coincidencia:
        return None
    numero = float(coincidencia.group(1).replace(",", ""))
    return round(numero * UNIDADES_GB[(coincidencia.group(2) or "GB").upper()], 2)


@app.post("/api/correos/importar-actividad")
async def importar_actividad_correos(
    archivo: UploadFile = File(...),
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    """Carga el reporte de usuarios de Google Workspace: último acceso y almacenamiento."""
    from openpyxl import load_workbook

    if Path(archivo.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(400, "El reporte debe ser un archivo .xlsx")
    contenido = await archivo.read()
    if len(contenido) > TAMANO_MAXIMO:
        raise HTTPException(400, "El archivo supera los 10 MB")
    try:
        libro = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(400, "No se pudo leer el archivo de Excel")

    filas = libro.active.iter_rows(values_only=True)
    encabezado = [str(c or "").strip().lower() for c in next(filas, [])]
    indices = {}
    for clave, prefijo in COLUMNAS_REPORTE_CORREO.items():
        indice = next((i for i, c in enumerate(encabezado) if c.startswith(prefijo)), None)
        indices[clave] = POSICION_REPORTE_CORREO[clave] if indice is None else indice

    cuentas = {d.direccion.strip().lower(): d for d in db.query(DetalleCorreo).all()}
    momento = dt.datetime.now(dt.timezone.utc)
    actualizados = 0
    no_registrados: list[str] = []
    inactivos_no_registrados: list[dict] = []
    ahora = ahora_local()
    for fila in filas:
        if not fila or len(fila) <= max(indices.values()):
            continue
        direccion = str(fila[indices["direccion"]] or "").strip().lower()
        if not direccion:
            continue
        leido, ultimo = _leer_ultimo_acceso(fila[indices["ultimo_acceso"]])
        cuenta = cuentas.get(direccion)
        if cuenta is None:
            no_registrados.append(direccion)
            dias = (ahora - ultimo).days if ultimo else None
            if leido and (dias is None or dias >= DIAS_DESUSO_CORREO):
                inactivos_no_registrados.append(
                    {
                        "direccion": direccion,
                        "ultimo_acceso": ultimo,
                        "dias_sin_acceso": dias,
                        "almacenamiento_gb": _leer_almacenamiento(fila[indices["almacenamiento"]]),
                    }
                )
            continue
        if leido:
            cuenta.ultimo_acceso = ultimo
        almacenamiento = _leer_almacenamiento(fila[indices["almacenamiento"]])
        if almacenamiento is not None:
            cuenta.almacenamiento_gb = almacenamiento
        cuenta.actividad_importada_en = momento
        actualizados += 1
    libro.close()

    registrar(
        db, usuario, "EDITAR", "correos", None,
        f"actividad importada de {archivo.filename}: {actualizados} cuenta(s)",
    )
    db.commit()
    return {
        "actualizados": actualizados,
        "no_registrados": sorted(no_registrados),
        "inactivos_no_registrados": sorted(
            inactivos_no_registrados,
            key=lambda c: -1 if c["dias_sin_acceso"] is None else -c["dias_sin_acceso"],
        ),
        "en_desuso": sum(1 for d in cuentas.values() if correo_en_desuso(d)),
    }


@app.post("/api/altas/equipo")
@un_alta_a_la_vez
def alta_equipo(
    datos: schemas.AltaEquipoIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    """Da de alta una PC o una tableta y, opcionalmente, su correo y sus licencias.

    Todo se asigna al mismo empleado. Cada pieza queda como activo propio,
    editable y dable de baja por separado.
    """
    if datos.equipo.tipo not in (TipoActivo.COMPUTO, TipoActivo.TABLETA):
        raise HTTPException(400, "Esta alta es sólo para equipos de cómputo y tabletas")

    empleado = None
    if datos.empleado_id:
        empleado = db.get(Empleado, datos.empleado_id)
        if empleado is None:
            raise HTTPException(404, "Empleado no encontrado")
        if empleado.estatus == EstatusEmpleado.BAJA:
            raise HTTPException(409, "No se puede asignar a un empleado dado de baja")

    creados: list[Activo] = []
    try:
        creados.append(_crear_activo(db, datos.equipo))

        comunes = {"estatus": EstatusActivo.DISPONIBLE}

        if datos.correo and datos.correo.direccion:
            creados.append(
                _crear_activo(
                    db,
                    schemas.ActivoIn(
                        tipo=TipoActivo.CORREO_WORKSPACE,
                        descripcion=datos.correo.direccion,
                        correo=datos.correo,
                        **comunes,
                    ),
                )
            )

        for licencia, tipo, etiqueta in (
            (datos.licencia_microsoft, TipoActivo.LICENCIA_MICROSOFT, "Microsoft 365"),
            (datos.licencia_norton, TipoActivo.LICENCIA_NORTON, "Norton 360"),
        ):
            if licencia and (
                licencia.cuenta_id
                or licencia.correo_licencia
                or licencia.identificador_dispositivo
            ):
                creados.append(
                    _crear_activo(
                        db,
                        schemas.ActivoIn(
                            tipo=tipo,
                            descripcion=licencia.correo_licencia or etiqueta,
                            licencia=licencia,
                            **comunes,
                        ),
                    )
                )
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Dato duplicado: {_mensaje_duplicado(exc)}")

    asignados = 0
    if empleado:
        for activo in creados:
            lleva = activo.tipo in TIPOS_CON_RESPONSIVA
            lleva_ine = activo.tipo in TIPOS_CON_INE
            db.add(
                Asignacion(
                    activo_id=activo.id,
                    empleado_id=empleado.id,
                    fecha_asignacion=datos.fecha_asignacion or hoy_local(),
                    responsiva_estado=datos.responsiva_estado
                    if lleva
                    else EstadoDocumento.NO_APLICA,
                    responsiva_fecha_envio=datos.responsiva_fecha_envio if lleva else None,
                    responsiva_fecha_firma=datos.responsiva_fecha_firma if lleva else None,
                    responsiva_destino=datos.responsiva_destino if lleva else None,
                    responsiva_url=datos.responsiva_url if lleva else None,
                    responsiva_archivo=datos.responsiva_archivo if lleva else None,
                    responsiva_nombre=datos.responsiva_nombre if lleva else None,
                    ine_estado=datos.ine_estado if lleva_ine else EstadoDocumento.NO_APLICA,
                    ine_url=datos.ine_url if lleva_ine else None,
                    ine_archivo=datos.ine_archivo if lleva_ine else None,
                    ine_nombre=datos.ine_nombre if lleva_ine else None,
                )
            )
            activo.estatus = EstatusActivo.ASIGNADO
            asignados += 1
        db.flush()

    registrar(
        db,
        usuario,
        "CREAR",
        "alta_equipo",
        creados[0].id,
        f"{', '.join(a.codigo for a in creados)}"
        + (f" → {empleado.nombre_completo}" if empleado else ""),
    )
    db.commit()
    return {
        "creados": [dic_activo(a, db) for a in creados],
        "asignados": asignados,
    }


# --------------------------------------------------------------------------
# Asignaciones
# --------------------------------------------------------------------------


@app.post("/api/asignaciones")
def asignar(
    datos: schemas.AsignacionIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    activo = db.get(Activo, datos.activo_id)
    empleado = db.get(Empleado, datos.empleado_id)
    if activo is None:
        raise HTTPException(404, "Activo no encontrado")
    if empleado is None:
        raise HTTPException(404, "Empleado no encontrado")
    if asignacion_vigente(db, activo.id):
        raise HTTPException(
            409, f"{activo.codigo} ya está asignado. Regístralo como devuelto primero."
        )
    if empleado.estatus == EstatusEmpleado.BAJA:
        raise HTTPException(409, "No se puede asignar a un empleado dado de baja")

    _normalizar_documentos(datos, activo.tipo)
    asignacion = Asignacion(
        activo_id=datos.activo_id,
        empleado_id=datos.empleado_id,
        fecha_asignacion=datos.fecha_asignacion or hoy_local(),
        responsiva_estado=datos.responsiva_estado,
        responsiva_fecha_envio=datos.responsiva_fecha_envio,
        responsiva_fecha_firma=datos.responsiva_fecha_firma,
        responsiva_destino=datos.responsiva_destino,
        responsiva_url=datos.responsiva_url,
        responsiva_archivo=datos.responsiva_archivo,
        responsiva_nombre=datos.responsiva_nombre,
        ine_estado=datos.ine_estado,
        ine_url=datos.ine_url,
        ine_archivo=datos.ine_archivo,
        ine_nombre=datos.ine_nombre,
        notas=datos.notas,
    )
    db.add(asignacion)
    activo.estatus = EstatusActivo.ASIGNADO
    db.flush()
    registrar(
        db,
        usuario,
        "ASIGNAR",
        "asignacion",
        asignacion.id,
        f"{activo.codigo} → {empleado.nombre_completo}",
    )
    db.commit()
    return dic_asignacion(asignacion)


@app.put("/api/asignaciones/{asignacion_id}")
def editar_asignacion(
    asignacion_id: int,
    datos: schemas.AsignacionEditarIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    asignacion = db.get(Asignacion, asignacion_id)
    if asignacion is None:
        raise HTTPException(404, "Asignación no encontrada")
    _normalizar_documentos(datos, asignacion.activo.tipo)
    for campo, valor in datos.model_dump().items():
        setattr(asignacion, campo, valor)
    registrar(
        db, usuario, "EDITAR", "asignacion", asignacion.id, f"documentación de {asignacion.activo.codigo}"
    )
    db.commit()
    return dic_asignacion(asignacion)


@app.post("/api/asignaciones/{asignacion_id}/devolver")
def devolver(
    asignacion_id: int,
    datos: schemas.DevolucionIn,
    db: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(requiere_captura),
):
    asignacion = db.get(Asignacion, asignacion_id)
    if asignacion is None:
        raise HTTPException(404, "Asignación no encontrada")
    if asignacion.fecha_devolucion is not None:
        raise HTTPException(409, "Esta asignación ya fue cerrada")

    asignacion.fecha_devolucion = datos.fecha_devolucion or hoy_local()
    asignacion.motivo_devolucion = datos.motivo_devolucion
    if datos.notas:
        asignacion.notas = f"{asignacion.notas or ''}\n{datos.notas}".strip()
    asignacion.activo.estatus = datos.nuevo_estatus_activo

    registrar(
        db,
        usuario,
        "DEVOLVER",
        "asignacion",
        asignacion.id,
        f"{asignacion.activo.codigo} ← {asignacion.empleado.nombre_completo}",
    )
    db.commit()
    return dic_asignacion(asignacion)


