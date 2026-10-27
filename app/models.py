"""Modelo de datos del panel de control TI."""

from __future__ import annotations

import datetime as dt
import enum
import re
import unicodedata
from zoneinfo import ZoneInfo

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TextoCifrado(TypeDecorator):
    """Texto que se guarda cifrado en la base y se lee ya descifrado."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        from .cifrado import cifrar

        return cifrar(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        # Valores capturados antes de cifrar esta columna
        if not value.startswith("gAAAAA"):
            return value
        from .cifrado import descifrar

        return descifrar(value)


ZONA_HORARIA = ZoneInfo("America/Mexico_City")


def ahora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def ahora_local() -> dt.datetime:
    return dt.datetime.now(ZONA_HORARIA).replace(tzinfo=None)


def hoy() -> dt.date:
    return dt.datetime.now(ZONA_HORARIA).date()


def a_hora_local(valor: dt.datetime) -> dt.datetime:
    """Las marcas de tiempo se guardan en UTC sin zona."""
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=dt.timezone.utc)
    return valor.astimezone(ZONA_HORARIA).replace(tzinfo=None)


def clave_nombre(nombres: str, apellidos: str) -> str:
    """Apellidos y nombres sin acentos, en mayúsculas y con un solo espacio."""
    texto = unicodedata.normalize("NFKD", f"{apellidos} {nombres}")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto).strip().upper()


# --------------------------------------------------------------------------
# Enumeraciones
# --------------------------------------------------------------------------


class TipoActivo(str, enum.Enum):
    COMPUTO = "COMPUTO"
    TELEFONO = "TELEFONO"
    TABLETA = "TABLETA"
    LICENCIA_MICROSOFT = "LICENCIA_MICROSOFT"
    LICENCIA_NORTON = "LICENCIA_NORTON"
    CORREO_WORKSPACE = "CORREO_WORKSPACE"


class EstatusActivo(str, enum.Enum):
    ASIGNADO = "ASIGNADO"
    DISPONIBLE = "DISPONIBLE"
    EN_REPARACION = "EN_REPARACION"
    EXTRAVIADO = "EXTRAVIADO"
    ROBADO = "ROBADO"
    SUSPENDIDO = "SUSPENDIDO"
    BAJA = "BAJA"


class PropietarioImpresora(str, enum.Enum):
    PROVEEDOR = "PROVEEDOR"
    PROPIA = "PROPIA"


class AlcanceRed(str, enum.Enum):
    LOCAL = "LOCAL"
    FORANEA = "FORANEA"


class ProveedorRed(str, enum.Enum):
    TELMEX = "TELMEX"
    TOTALPLAY = "TOTALPLAY"
    MEGACABLE = "MEGACABLE"
    OTRO = "OTRO"


class EstatusEmpleado(str, enum.Enum):
    ACTIVO = "ACTIVO"
    BAJA = "BAJA"


class RolUsuario(str, enum.Enum):
    ADMIN = "ADMIN"        # control total, incluida la gestion de usuarios
    CAPTURA = "CAPTURA"    # alta y edicion de inventario
    CONSULTA = "CONSULTA"  # solo lectura y reportes


class EstadoDocumento(str, enum.Enum):
    """Ciclo de vida de una responsiva o una INE.

    Las responsivas casi nunca se firman en TI: se envian a la sucursal,
    ahi las firman y despues regresan. ENVIADA es esa espera, que antes
    no se podia representar con un simple si/no.
    """

    PENDIENTE = "PENDIENTE"    # ni siquiera se ha enviado
    ENVIADA = "ENVIADA"        # en espera de que la firmen y la devuelvan
    FIRMADA = "FIRMADA"        # firmada y en resguardo
    NO_APLICA = "NO_APLICA"


class EstadoNota(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    EN_PROCESO = "EN_PROCESO"
    RESUELTA = "RESUELTA"


class Prioridad(str, enum.Enum):
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"


class TipoAuditoria(str, enum.Enum):
    CORREO = "CORREO"
    NORTON = "NORTON"


class EstadoAuditoria(str, enum.Enum):
    EN_PROCESO = "EN_PROCESO"
    CERRADA = "CERRADA"


class EstadoItem(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    CONFORME = "CONFORME"
    INCIDENCIA = "INCIDENCIA"
    NO_APLICA = "NO_APLICA"


# --------------------------------------------------------------------------
# Catalogos
# --------------------------------------------------------------------------


class Sucursal(Base):
    __tablename__ = "sucursal"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True)
    clave: Mapped[str] = mapped_column(String(10), unique=True)  # TOL, CUAU, QRO...
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    bodegas: Mapped[list[Bodega]] = relationship(back_populates="sucursal")


class Departamento(Base):
    __tablename__ = "departamento"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True)
    clave: Mapped[str] = mapped_column(String(12), unique=True)  # FIN, RH, SHE...
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Bodega(Base):
    __tablename__ = "bodega"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    sucursal: Mapped[Sucursal | None] = relationship(back_populates="bodegas")


class Planta(Base):
    """Cliente o planta donde opera la organización."""

    __tablename__ = "planta"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class SistemaInterno(Base):
    """Sistemas propios a los que se entregan credenciales: gastos, ERP..."""

    __tablename__ = "sistema_interno"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    clave: Mapped[str] = mapped_column(String(20), unique=True)
    descripcion: Mapped[str | None] = mapped_column(String(200))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


# --------------------------------------------------------------------------
# Personas
# --------------------------------------------------------------------------


class Empleado(Base):
    __tablename__ = "empleado"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Clave de negocio estable e independiente del nombre: EMP-0001
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    nombres: Mapped[str] = mapped_column(String(80))
    apellidos: Mapped[str] = mapped_column(String(80))
    # Se calcula al guardar; sirve para busquedas sin importar el orden
    nombre_completo: Mapped[str] = mapped_column(String(180), index=True)
    # Evita dar de alta dos veces a la misma persona
    nombre_clave: Mapped[str | None] = mapped_column(String(180), unique=True, index=True)

    correo_principal: Mapped[str | None] = mapped_column(String(160), index=True)
    puesto: Mapped[str | None] = mapped_column(String(120))

    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    departamento_id: Mapped[int | None] = mapped_column(ForeignKey("departamento.id"))
    bodega_id: Mapped[int | None] = mapped_column(ForeignKey("bodega.id"))
    planta_id: Mapped[int | None] = mapped_column(ForeignKey("planta.id"))

    estatus: Mapped[EstatusEmpleado] = mapped_column(
        Enum(EstatusEmpleado), default=EstatusEmpleado.ACTIVO
    )
    fecha_ingreso: Mapped[dt.date | None] = mapped_column(Date)
    fecha_baja: Mapped[dt.date | None] = mapped_column(Date)
    notas: Mapped[str | None] = mapped_column(Text)

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[dt.datetime] = mapped_column(
        DateTime, default=ahora, onupdate=ahora
    )

    sucursal: Mapped[Sucursal | None] = relationship()
    departamento: Mapped[Departamento | None] = relationship()
    bodega: Mapped[Bodega | None] = relationship()
    planta: Mapped[Planta | None] = relationship()
    asignaciones: Mapped[list[Asignacion]] = relationship(back_populates="empleado")
    accesos: Mapped[list[AccesoSistema]] = relationship(
        back_populates="empleado", cascade="all, delete-orphan"
    )


class AccesoSistema(Base):
    """Checklist de credenciales entregadas a una persona."""

    __tablename__ = "acceso_sistema"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int] = mapped_column(ForeignKey("empleado.id"), index=True)
    sistema_id: Mapped[int] = mapped_column(ForeignKey("sistema_interno.id"), index=True)

    entregado: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_entrega: Mapped[dt.date | None] = mapped_column(Date)
    usuario_sistema: Mapped[str | None] = mapped_column(String(120))
    notas: Mapped[str | None] = mapped_column(Text)

    actualizado_por: Mapped[str | None] = mapped_column(String(120))
    actualizado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)

    empleado: Mapped[Empleado] = relationship(back_populates="accesos")
    sistema: Mapped[SistemaInterno] = relationship()

    __table_args__ = (
        UniqueConstraint("empleado_id", "sistema_id", name="uq_acceso_empleado_sistema"),
    )


# --------------------------------------------------------------------------
# Activos
# --------------------------------------------------------------------------


class Activo(Base):
    """Tabla base. Los atributos propios de cada tipo viven en las tablas de detalle."""

    __tablename__ = "activo"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Etiqueta fisica o identificador interno: PC-0001, TEL-0001, LIC-0001
    codigo: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    tipo: Mapped[TipoActivo] = mapped_column(Enum(TipoActivo), index=True)
    estatus: Mapped[EstatusActivo] = mapped_column(
        Enum(EstatusActivo), default=EstatusActivo.DISPONIBLE, index=True
    )

    descripcion: Mapped[str | None] = mapped_column(String(200))
    fecha_adquisicion: Mapped[dt.date | None] = mapped_column(Date)
    # Fecha en que vence: renovacion de licencia o fin de plazo forzoso
    fecha_vencimiento: Mapped[dt.date | None] = mapped_column(Date, index=True)

    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[dt.datetime] = mapped_column(
        DateTime, default=ahora, onupdate=ahora
    )

    detalle_computo: Mapped[DetalleComputo | None] = relationship(
        back_populates="activo", uselist=False, cascade="all, delete-orphan"
    )
    detalle_movil: Mapped[DetalleMovil | None] = relationship(
        back_populates="activo", uselist=False, cascade="all, delete-orphan"
    )
    detalle_licencia: Mapped[DetalleLicencia | None] = relationship(
        back_populates="activo", uselist=False, cascade="all, delete-orphan"
    )
    detalle_correo: Mapped[DetalleCorreo | None] = relationship(
        back_populates="activo", uselist=False, cascade="all, delete-orphan"
    )
    asignaciones: Mapped[list[Asignacion]] = relationship(back_populates="activo")


class DetalleComputo(Base):
    """Laptops, equipos de escritorio y la parte de cómputo de las tabletas."""

    __tablename__ = "detalle_computo"

    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), primary_key=True)
    marca: Mapped[str | None] = mapped_column(String(40))
    modelo: Mapped[str | None] = mapped_column(String(80))
    # El identificador fisico que hoy falta por completo en los Excel
    numero_serie: Mapped[str | None] = mapped_column(String(80), unique=True, index=True)
    procesador: Mapped[str | None] = mapped_column(String(120))
    ram_gb: Mapped[int | None] = mapped_column(Integer)
    almacenamiento: Mapped[str | None] = mapped_column(String(60))
    sistema_operativo: Mapped[str | None] = mapped_column(String(60))
    clave_windows: Mapped[str | None] = mapped_column(TextoCifrado)

    activo: Mapped[Activo] = relationship(back_populates="detalle_computo")


class DetalleMovil(Base):
    """Telefonos y tabletas, con o sin linea celular."""

    __tablename__ = "detalle_movil"

    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), primary_key=True)
    marca: Mapped[str | None] = mapped_column(String(40))
    modelo: Mapped[str | None] = mapped_column(String(120))
    # Unico por hardware: la BD impide el IMEI repetido que hay hoy en el Excel
    imei: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)

    numero_telefonico: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    iccid: Mapped[str | None] = mapped_column(String(25), unique=True)
    operador: Mapped[str | None] = mapped_column(String(40), default="Telcel")
    # Precio del equipo dentro del plan
    precio_plan: Mapped[float | None] = mapped_column(Numeric(10, 2))
    esquema: Mapped[str | None] = mapped_column(String(60))
    esim: Mapped[bool] = mapped_column(Boolean, default=False)
    cuenta_operador: Mapped[str | None] = mapped_column(String(40))

    activo: Mapped[Activo] = relationship(back_populates="detalle_movil")


class CuentaLicencia(Base):
    """Cuenta contenedora de licencias (una suscripcion M365 o Norton con N ranuras)."""

    __tablename__ = "cuenta_licencia"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    producto: Mapped[str] = mapped_column(String(60))  # Microsoft 365 / Norton 360
    correo_cuenta: Mapped[str | None] = mapped_column(String(160))
    # Nunca se guarda la contrasena: solo donde encontrarla en el gestor
    referencia_credencial: Mapped[str | None] = mapped_column(String(160))
    ranuras_totales: Mapped[int] = mapped_column(Integer, default=1)
    fecha_renovacion: Mapped[dt.date | None] = mapped_column(Date, index=True)
    notas: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    licencias: Mapped[list[DetalleLicencia]] = relationship(back_populates="cuenta")


class DetalleLicencia(Base):
    """Una ranura concreta dentro de una cuenta de licencias."""

    __tablename__ = "detalle_licencia"

    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), primary_key=True)
    cuenta_id: Mapped[int | None] = mapped_column(ForeignKey("cuenta_licencia.id"))
    correo_licencia: Mapped[str | None] = mapped_column(String(160))
    identificador_dispositivo: Mapped[str | None] = mapped_column(String(60))

    activo: Mapped[Activo] = relationship(back_populates="detalle_licencia")
    cuenta: Mapped[CuentaLicencia | None] = relationship(back_populates="licencias")


class DetalleCorreo(Base):
    """Cuenta de Google Workspace."""

    __tablename__ = "detalle_correo"

    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), primary_key=True)
    direccion: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    habilitada: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_acceso: Mapped[dt.datetime | None] = mapped_column(DateTime)
    almacenamiento_gb: Mapped[float | None] = mapped_column(Numeric(10, 2))
    # Fecha del último reporte de Workspace cargado para esta cuenta
    actividad_importada_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    alias_de: Mapped[str | None] = mapped_column(String(160))

    activo: Mapped[Activo] = relationship(back_populates="detalle_correo")


# --------------------------------------------------------------------------
# Impresoras
# --------------------------------------------------------------------------


impresora_departamento = Table(
    "impresora_departamento",
    Base.metadata,
    Column("impresora_id", ForeignKey("impresora.id", ondelete="CASCADE"), primary_key=True),
    Column("departamento_id", ForeignKey("departamento.id"), primary_key=True),
)


class Impresora(Base):
    __tablename__ = "impresora"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero_serie: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    propietario: Mapped[PropietarioImpresora] = mapped_column(Enum(PropietarioImpresora))
    locacion: Mapped[str | None] = mapped_column(String(160))
    numero_serie_proveedor: Mapped[str | None] = mapped_column(String(80))
    identificador_proveedor: Mapped[str] = mapped_column(String(80))
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    bodega_id: Mapped[int | None] = mapped_column(ForeignKey("bodega.id"))
    planta_id: Mapped[int | None] = mapped_column(ForeignKey("planta.id"))

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[dt.datetime] = mapped_column(
        DateTime, default=ahora, onupdate=ahora
    )

    departamentos: Mapped[list[Departamento]] = relationship(
        secondary=impresora_departamento, order_by="Departamento.nombre"
    )
    sucursal: Mapped[Sucursal | None] = relationship()
    bodega: Mapped[Bodega | None] = relationship()
    planta: Mapped[Planta | None] = relationship()


class RedWifi(Base):
    __tablename__ = "red_wifi"
    __table_args__ = (UniqueConstraint("alcance", "ubicacion", "ssid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    alcance: Mapped[AlcanceRed] = mapped_column(Enum(AlcanceRed), index=True)
    ubicacion: Mapped[str] = mapped_column(String(160))
    ssid: Mapped[str] = mapped_column(String(80))
    contrasena: Mapped[str] = mapped_column(Text)  # cifrada con app.cifrado
    numero_cuenta: Mapped[str | None] = mapped_column(String(60))
    proveedor: Mapped[ProveedorRed] = mapped_column(Enum(ProveedorRed))

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[dt.datetime] = mapped_column(
        DateTime, default=ahora, onupdate=ahora
    )


# --------------------------------------------------------------------------
# Asignaciones: el historial que hoy no existe
# --------------------------------------------------------------------------

