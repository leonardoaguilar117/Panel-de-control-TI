"""Esquemas de entrada (validacion de lo que manda el navegador)."""

from __future__ import annotations

import datetime as dt
import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field

from .models import (
    AlcanceRed,
    EstadoAuditoria,
    EstadoDocumento,
    EstadoItem,
    EstadoNota,
    EstatusActivo,
    EstatusEmpleado,
    Prioridad,
    PropietarioImpresora,
    ProveedorRed,
    RolUsuario,
    TipoActivo,
    TipoAuditoria,
)


def _vacio_a_none(valor):
    if isinstance(valor, str) and not valor.strip():
        return None
    return valor


def _url_web(valor: str) -> str:
    valor = valor.strip()
    if not re.fullmatch(r"https?://[^\s<>\"']+", valor, re.IGNORECASE):
        raise ValueError("Debe ser un enlace http(s) válido")
    return valor


def _sin_control(valor: str) -> str:
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", valor):
        raise ValueError("Contiene caracteres no permitidos")
    return valor


Corto = Annotated[str, Field(max_length=80), AfterValidator(_sin_control)]
Medio = Annotated[str, Field(max_length=200), AfterValidator(_sin_control)]
Largo = Annotated[str, Field(max_length=5000)]
Correo = Annotated[
    str, Field(max_length=160, pattern=r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")
]
CorreoOpcional = Annotated[Correo | None, BeforeValidator(_vacio_a_none)]
Url = Annotated[
    Annotated[str, Field(max_length=600), AfterValidator(_url_web)] | None,
    BeforeValidator(_vacio_a_none),
]
# Nombre que el servidor asignó al guardar el adjunto
Archivo = Annotated[
    Annotated[str, Field(pattern=r"^[0-9a-f]{32}\.(pdf|jpg|jpeg|png|webp)$")] | None,
    BeforeValidator(_vacio_a_none),
]
Password = Annotated[str, Field(min_length=8, max_length=128)]
Id = Annotated[int, Field(ge=1)]


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class EmpleadoIn(BaseModel):
    nombres: str = Field(min_length=1, max_length=80)
    apellidos: str = Field(min_length=1, max_length=80)
    puesto: Corto | None = None
    sucursal_id: Id | None = None
    departamento_id: Id | None = None
    bodega_id: Id | None = None
    planta_id: Id | None = None
    estatus: EstatusEmpleado = EstatusEmpleado.ACTIVO
    fecha_ingreso: dt.date | None = None
    fecha_baja: dt.date | None = None


class ComputoIn(BaseModel):
    marca: Corto | None = None
    modelo: Corto | None = None
    numero_serie: Corto | None = None
    procesador: Corto | None = None
    ram_gb: int | None = Field(default=None, ge=0, le=4096)
    almacenamiento: Corto | None = None
    sistema_operativo: Corto | None = None
    clave_windows: Corto | None = None


class MovilIn(BaseModel):
    marca: Corto | None = None
    modelo: Corto | None = None
    imei: Corto | None = None
    numero_telefonico: Corto | None = None
    iccid: Corto | None = None
    precio_plan: float | None = Field(default=None, ge=0, le=1_000_000)
    esim: bool = False
    cuenta_operador: Corto | None = None


class LicenciaIn(BaseModel):
    cuenta_id: Id | None = None
    correo_licencia: CorreoOpcional = None
    identificador_dispositivo: Corto | None = None


class CorreoIn(BaseModel):
    direccion: Correo
    habilitada: bool = True
    ultimo_acceso: dt.datetime | None = None
    almacenamiento_gb: float | None = Field(default=None, ge=0, le=1_000_000)
    alias_de: CorreoOpcional = None


class ActivoIn(BaseModel):
    tipo: TipoActivo
    codigo: Corto | None = None  # si viene vacio se genera solo
    estatus: EstatusActivo = EstatusActivo.DISPONIBLE
    descripcion: Largo | None = None
    fecha_adquisicion: dt.date | None = None
    fecha_vencimiento: dt.date | None = None
    notas: Largo | None = None

    computo: ComputoIn | None = None
    movil: MovilIn | None = None
    licencia: LicenciaIn | None = None
    correo: CorreoIn | None = None


class AltaEquipoIn(BaseModel):
    """Alta de un equipo de cómputo junto con los servicios que lo acompañan.

    Permite capturar en una sola pantalla la PC y, si aplican, su cuenta de
    correo y sus licencias Microsoft y Norton, asignando todo a la misma
    persona. Cada elemento se crea como un activo independiente, así que
    después puede editarse o darse de baja por separado.
    """

    equipo: ActivoIn
    empleado_id: Id | None = None
    fecha_asignacion: dt.date | None = None

    correo: CorreoIn | None = None
    licencia_microsoft: LicenciaIn | None = None
    licencia_norton: LicenciaIn | None = None

    responsiva_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    responsiva_fecha_envio: dt.date | None = None
    responsiva_fecha_firma: dt.date | None = None
    responsiva_destino: Medio | None = None
    responsiva_url: Url = None
    responsiva_archivo: Archivo = None
    responsiva_nombre: Medio | None = None
    ine_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    ine_url: Url = None
    ine_archivo: Archivo = None
    ine_nombre: Medio | None = None


class AsignacionIn(BaseModel):
    activo_id: Id
    empleado_id: int
    fecha_asignacion: dt.date | None = None
    responsiva_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    responsiva_fecha_envio: dt.date | None = None
    responsiva_fecha_firma: dt.date | None = None
    responsiva_destino: Medio | None = None
    responsiva_url: Url = None
    responsiva_archivo: Archivo = None
    responsiva_nombre: Medio | None = None
    ine_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    ine_url: Url = None
    ine_archivo: Archivo = None
    ine_nombre: Medio | None = None
    notas: Largo | None = None


class AsignacionEditarIn(BaseModel):
    """Actualiza la documentación de una asignación ya existente."""

    responsiva_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    responsiva_fecha_envio: dt.date | None = None
    responsiva_fecha_firma: dt.date | None = None
    responsiva_destino: Medio | None = None
    responsiva_url: Url = None
    responsiva_archivo: Archivo = None
    responsiva_nombre: Medio | None = None
    ine_estado: EstadoDocumento = EstadoDocumento.PENDIENTE
    ine_url: Url = None
    ine_archivo: Archivo = None
    ine_nombre: Medio | None = None
    notas: Largo | None = None


class DevolucionIn(BaseModel):
    fecha_devolucion: dt.date | None = None
    motivo_devolucion: Largo | None = None
    nuevo_estatus_activo: EstatusActivo = EstatusActivo.DISPONIBLE
    notas: Largo | None = None


class CuentaLicenciaIn(BaseModel):
    nombre: Corto
    producto: str
    correo_cuenta: CorreoOpcional = None
    referencia_credencial: Corto | None = None
    ranuras_totales: int = Field(default=1, ge=1, le=10_000)
    fecha_renovacion: dt.date | None = None
    notas: Largo | None = None


class CatalogoIn(BaseModel):
    nombre: Corto
    clave: Corto | None = None
    sucursal_id: Id | None = None


class UsuarioIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    nombre: str = Field(min_length=1, max_length=120)
    password: Password
    rol: RolUsuario = RolUsuario.CONSULTA


class UsuarioEditarIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    rol: RolUsuario
    activo: bool = True
    # Vacío = conservar la contraseña actual
    password: Annotated[Password | None, BeforeValidator(_vacio_a_none)] = None


class PerfilIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    correo: CorreoOpcional = None
    telefono: Annotated[Corto | None, BeforeValidator(_vacio_a_none)] = None
    puesto: Annotated[Corto | None, BeforeValidator(_vacio_a_none)] = None


class CambioPasswordIn(BaseModel):
    password_actual: str = Field(min_length=1, max_length=128)
    password_nueva: Password


class NotaIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=160)
    contenido: Largo | None = None
    estado: EstadoNota = EstadoNota.PENDIENTE
    prioridad: Prioridad = Prioridad.MEDIA
    empleado_id: Id | None = None
    activo_id: Id | None = None


class LineaVerificacionIn(BaseModel):
    numero: str = Field(min_length=10, max_length=20)
    titular: str | None = Field(default=None, max_length=180)
    sucursal: str | None = Field(default=None, max_length=80)
    departamento: str | None = Field(default=None, max_length=80)


class VerificacionIn(BaseModel):
    verificada: bool | None = None
    enviado: bool | None = None
    observacion: Largo | None = None


class AuditoriaIn(BaseModel):
    tipo: TipoAuditoria
    # Cualquier día de la semana a auditar; el servidor calcula lunes y domingo
    fecha: dt.date | None = None
    # Analista de TI responsable de resolver el checklist
    analista_id: Id
    dias_sin_actividad: int | None = Field(default=None, ge=1, le=365)


class AuditoriaEditarIn(BaseModel):
    estado: EstadoAuditoria = EstadoAuditoria.EN_PROCESO
    analista_id: Id | None = None
    observaciones: Largo | None = None


class AccesoSistemaIn(BaseModel):
    sistema_id: Id
    entregado: bool = False
    fecha_entrega: dt.date | None = None
    usuario_sistema: Corto | None = None
    notas: Largo | None = None


class AccesosEmpleadoIn(BaseModel):
    accesos: list[AccesoSistemaIn] = Field(default=[], max_length=200)


class SistemaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    clave: str = Field(min_length=1, max_length=20)
    descripcion: Largo | None = None
    orden: int = Field(default=0, ge=0, le=10_000)


class EvidenciaIn(BaseModel):
    url: str = Field(min_length=1, max_length=600)
    nombre: str | None = Field(default=None, max_length=200)


class ItemAuditoriaIn(BaseModel):
    estado: EstadoItem = EstadoItem.PENDIENTE
    observacion: Largo | None = None


class ImpresoraIn(BaseModel):
    numero_serie: str = Field(min_length=1, max_length=80)
    propietario: PropietarioImpresora
    locacion: str | None = Field(default=None, max_length=160)
    departamento_ids: list[Id] = Field(default=[], max_length=100)
    sucursal_id: Id | None = None
    bodega_id: Id | None = None
    planta_id: Id | None = None
    numero_serie_proveedor: str | None = Field(default=None, max_length=80)
    identificador_proveedor: str = Field(min_length=1, max_length=80)


class RedWifiIn(BaseModel):
    alcance: AlcanceRed
    ubicacion: str = Field(min_length=1, max_length=160)
    ssid: str = Field(min_length=1, max_length=80)
    contrasena: str = Field(min_length=1, max_length=128)
    numero_cuenta: str | None = Field(default=None, max_length=60)
    proveedor: ProveedorRed


class ItemExtraIn(BaseModel):
    categoria: Corto = "Agregado"
    descripcion: str = Field(min_length=1, max_length=400)
