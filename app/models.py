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


class Asignacion(Base):
    """Vincula un activo con un empleado durante un periodo.

    Un activo puede tener muchas asignaciones a lo largo del tiempo, pero solo
    una vigente (fecha_devolucion NULL). Asi el equipo conserva su rastro cuando
    la persona cambia de puesto o causa baja.
    """

    __tablename__ = "asignacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), index=True)
    empleado_id: Mapped[int] = mapped_column(ForeignKey("empleado.id"), index=True)

    fecha_asignacion: Mapped[dt.date] = mapped_column(Date, default=hoy)
    fecha_devolucion: Mapped[dt.date | None] = mapped_column(Date, index=True)

    responsiva_estado: Mapped[EstadoDocumento] = mapped_column(
        Enum(EstadoDocumento), default=EstadoDocumento.PENDIENTE, index=True
    )
    # Cuando se mandó a firmar. Con esta fecha se sabe cuánto lleva esperando.
    responsiva_fecha_envio: Mapped[dt.date | None] = mapped_column(Date)
    responsiva_fecha_firma: Mapped[dt.date | None] = mapped_column(Date)
    responsiva_destino: Mapped[str | None] = mapped_column(String(160))
    # Enlace externo (Drive) o archivo subido al servidor. Pueden coexistir.
    responsiva_url: Mapped[str | None] = mapped_column(String(400))
    responsiva_archivo: Mapped[str | None] = mapped_column(String(80))
    responsiva_nombre: Mapped[str | None] = mapped_column(String(200))

    ine_estado: Mapped[EstadoDocumento] = mapped_column(
        Enum(EstadoDocumento), default=EstadoDocumento.PENDIENTE
    )
    ine_url: Mapped[str | None] = mapped_column(String(400))
    ine_archivo: Mapped[str | None] = mapped_column(String(80))
    ine_nombre: Mapped[str | None] = mapped_column(String(200))

    motivo_devolucion: Mapped[str | None] = mapped_column(String(160))
    notas: Mapped[str | None] = mapped_column(Text)

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    activo: Mapped[Activo] = relationship(back_populates="asignaciones")
    empleado: Mapped[Empleado] = relationship(back_populates="asignaciones")


# --------------------------------------------------------------------------
# Usuarios del sistema y bitacora
# --------------------------------------------------------------------------


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    rol: Mapped[RolUsuario] = mapped_column(Enum(RolUsuario), default=RolUsuario.CONSULTA)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_acceso: Mapped[dt.datetime | None] = mapped_column(DateTime)
    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    # Perfil: la foto es el nombre del archivo en adjuntos
    foto: Mapped[str | None] = mapped_column(String(80))
    correo: Mapped[str | None] = mapped_column(String(160))
    telefono: Mapped[str | None] = mapped_column(String(30))
    puesto: Mapped[str | None] = mapped_column(String(80))
    # Verdadero mientras la cuenta conserve la contraseña de fábrica
    debe_cambiar_password: Mapped[bool] = mapped_column(Boolean, default=False)


class Sesion(Base):
    __tablename__ = "sesion"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), index=True)
    creada_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    expira_en: Mapped[dt.datetime] = mapped_column(DateTime, index=True)

    usuario: Mapped[Usuario] = relationship()


# --------------------------------------------------------------------------
# Notas y pendientes compartidos
# --------------------------------------------------------------------------


class Nota(Base):
    """Recados y pendientes visibles para todo el equipo de TI.

    Puede colgar de un empleado o de un activo, o quedar suelta como
    pendiente general del área.
    """

    __tablename__ = "nota"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(160))
    contenido: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[EstadoNota] = mapped_column(
        Enum(EstadoNota), default=EstadoNota.PENDIENTE, index=True
    )
    prioridad: Mapped[Prioridad] = mapped_column(Enum(Prioridad), default=Prioridad.MEDIA)

    empleado_id: Mapped[int | None] = mapped_column(ForeignKey("empleado.id"))
    activo_id: Mapped[int | None] = mapped_column(ForeignKey("activo.id"))

    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    autor_nombre: Mapped[str | None] = mapped_column(String(120))
    resuelta_por: Mapped[str | None] = mapped_column(String(120))
    resuelta_en: Mapped[dt.datetime | None] = mapped_column(DateTime)

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[dt.datetime] = mapped_column(
        DateTime, default=ahora, onupdate=ahora
    )

    empleado: Mapped[Empleado | None] = relationship()
    activo: Mapped[Activo | None] = relationship()


# --------------------------------------------------------------------------
# Auditoria semanal
# --------------------------------------------------------------------------


class Auditoria(Base):
    """Revision semanal de correo o de Norton, resuelta como checklist."""

    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[TipoAuditoria] = mapped_column(Enum(TipoAuditoria), index=True)
    fecha_inicio: Mapped[dt.date] = mapped_column(Date, index=True)
    fecha_fin: Mapped[dt.date] = mapped_column(Date)
    estado: Mapped[EstadoAuditoria] = mapped_column(
        Enum(EstadoAuditoria), default=EstadoAuditoria.EN_PROCESO, index=True
    )

    # Analista de TI al que se le asigna la revisión
    analista_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"), index=True)
    analista_nombre: Mapped[str | None] = mapped_column(String(120))
    programada_por: Mapped[str | None] = mapped_column(String(120))

    observaciones: Mapped[str | None] = mapped_column(Text)
    # Umbral del punto de dispositivos sin actividad (auditoría de Norton)
    dias_sin_actividad: Mapped[int | None] = mapped_column(Integer)
    fecha_cierre: Mapped[dt.datetime | None] = mapped_column(DateTime)
    cerrada_por: Mapped[str | None] = mapped_column(String(120))

    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    analista: Mapped[Usuario | None] = relationship()
    items: Mapped[list[ItemAuditoria]] = relationship(
        back_populates="auditoria", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tipo", "fecha_inicio", name="uq_auditoria_periodo"),
    )


class ItemAuditoria(Base):
    """Cada punto del checklist.

    Unos vienen de la plantilla fija y otros los genera el sistema por
    excepcion (una cuenta suspendida, una licencia sobreasignada).
    """

    __tablename__ = "item_auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    auditoria_id: Mapped[int] = mapped_column(ForeignKey("auditoria.id"), index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)

    categoria: Mapped[str] = mapped_column(String(60))
    descripcion: Mapped[str] = mapped_column(String(400))
    # Lo detectó el sistema, no la plantilla: arranca como posible incidencia
    automatico: Mapped[bool] = mapped_column(Boolean, default=False)

    estado: Mapped[EstadoItem] = mapped_column(
        Enum(EstadoItem), default=EstadoItem.PENDIENTE, index=True
    )
    observacion: Mapped[str | None] = mapped_column(Text)

    activo_id: Mapped[int | None] = mapped_column(ForeignKey("activo.id"))
    actualizado_por: Mapped[str | None] = mapped_column(String(120))
    actualizado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)

    auditoria: Mapped[Auditoria] = relationship(back_populates="items")
    activo: Mapped[Activo | None] = relationship()
    evidencias: Mapped[list[EvidenciaAuditoria]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="EvidenciaAuditoria.id"
    )


class EvidenciaAuditoria(Base):
    """Archivo de Google Drive que respalda un punto del checklist."""

    __tablename__ = "evidencia_auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("item_auditoria.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(600))
    agregado_por: Mapped[str | None] = mapped_column(String(120))
    agregado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    item: Mapped[ItemAuditoria] = relationship(back_populates="evidencias")


# --------------------------------------------------------------------------
# Verificación mensual de números
# --------------------------------------------------------------------------


class LineaVerificacion(Base):
    """Número de la empresa que entra en la verificación mensual."""

    __tablename__ = "linea_verificacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    titular: Mapped[str | None] = mapped_column(String(180))
    sucursal: Mapped[str | None] = mapped_column(String(80))
    departamento: Mapped[str | None] = mapped_column(String(80))
    # Si la línea está en el inventario, el titular sale de su asignación vigente
    activo_id: Mapped[int | None] = mapped_column(ForeignKey("activo.id", ondelete="SET NULL"))
    creado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    activo: Mapped[Activo | None] = relationship()
    verificaciones: Mapped[list[VerificacionNumero]] = relationship(
        back_populates="linea", cascade="all, delete-orphan"
    )


class VerificacionNumero(Base):
    __tablename__ = "verificacion_numero"

    id: Mapped[int] = mapped_column(primary_key=True)
    linea_id: Mapped[int] = mapped_column(ForeignKey("linea_verificacion.id"), index=True)
    periodo: Mapped[str] = mapped_column(String(7), index=True)  # AAAA-MM

    verificada: Mapped[bool] = mapped_column(Boolean, default=False)
    verificada_por: Mapped[str | None] = mapped_column(String(120))
    verificada_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    enviado_por: Mapped[str | None] = mapped_column(String(120))
    enviado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    observacion: Mapped[str | None] = mapped_column(Text)

    linea: Mapped[LineaVerificacion] = relationship(back_populates="verificaciones")

    __table_args__ = (
        UniqueConstraint("linea_id", "periodo", name="uq_verificacion_periodo"),
    )


class Bitacora(Base):
    """Quien hizo que y cuando. Requisito para operar entre varias personas."""

    __tablename__ = "bitacora"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    usuario_nombre: Mapped[str | None] = mapped_column(String(120))
    fecha: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora, index=True)
    accion: Mapped[str] = mapped_column(String(20))  # CREAR/EDITAR/ELIMINAR/ASIGNAR
    entidad: Mapped[str] = mapped_column(String(40), index=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer)
    detalle: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (UniqueConstraint("id", name="uq_bitacora_id"),)
