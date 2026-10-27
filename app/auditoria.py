"""Plantillas de la auditoría semanal y detección de excepciones.

Cada auditoría se arma con dos clases de puntos:

- Los de la **plantilla**, que son siempre los mismos y hay que revisar a mano.
- Los **automáticos**, que el sistema detecta al abrir la auditoría a partir de
  lo que ya hay capturado (una cuenta suspendida, una baja con equipos asignados).
  Nacen marcados como incidencia para que nadie tenga que buscarlos.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from .models import (
    Activo,
    Asignacion,
    DetalleCorreo,
    Empleado,
    EstadoItem,
    ItemAuditoria,
    TipoActivo,
    TipoAuditoria,
)

# (categoría, descripción)
PLANTILLA_CORREO = [
    ("Altas y bajas", "Las altas de personal de la semana ya tienen cuenta creada"),
    ("Altas y bajas", "Las bajas de personal de la semana ya tienen cuenta suspendida"),
    ("Altas y bajas", "Los cambios de puesto tienen su cuenta y permisos actualizados"),
    ("Seguridad", "Revisar accesos sospechosos en el panel de administración"),
    ("Seguridad", "Revisar reenvíos automáticos no autorizados"),
    ("Seguridad", "Verificar que la verificación en dos pasos siga activa en las cuentas críticas"),
    ("Uso", "Revisar cuentas sin acceso en los últimos 20 días"),
    ("Uso", "Revisar buzones cerca del límite de almacenamiento"),
    ("Facturación", "El número de licencias facturadas coincide con las cuentas activas"),
    ("Registro", "El inventario coincide con el panel de Google Workspace"),
]

DIAS_SIN_ACTIVIDAD = 7
TIPOS_DISPOSITIVO = [TipoActivo.COMPUTO, TipoActivo.TABLETA, TipoActivo.TELEFONO]

PLANTILLA_NORTON = [
    ("Seguridad de la información",
     "Las cuentas no han generado ninguna búsqueda que atente contra la seguridad "
     "de la información de la empresa"),
    ("Seguridad de la información",
     "Los dispositivos de tipo Tablet no han descargado ninguna aplicación ajena a las permitidas"),
    ("Seguridad de la información",
     "Los dispositivos de tipo PC no han descargado ninguna aplicación ajena a las permitidas"),
    ("Categorías web",
     "Las cuentas tienen bloqueadas las categorías juegos, arte y entretenimiento, redes sociales, "
     "ciberamenaza, violencia y crimen, temas peligrosos, contenido para adultos"),
    ("Categorías web",
     "Las cuentas no acceden a sitios de tipo contenido para adultos, streaming, o cualquier otro "
     "que sea ajeno a la actividad habitual laboral"),
    ("Tiempo de dispositivos",
     "Los dispositivos tienen fijado el horario laboral (7:00 AM - 6:30 PM) de lunes a viernes y "
     "7:30 AM a 2:30 PM en sábado, excepto si mandan un correo avisando que se utilizará el "
     "dispositivo de forma extralaboral"),
    ("Tiempo de dispositivos",
     "Notificar si existen dispositivos que no han generado actividad en {dias} días"),
    ("Bajas / Altas",
     "Los dispositivos asignados a usuarios que tuvieron altas o bajas fueron bloqueados o "
     "desbloqueados correctamente y se actualizó la información correspondiente en el sistema "
     "(reasignación)"),
]

PLANTILLAS = {
    TipoAuditoria.CORREO: PLANTILLA_CORREO,
    TipoAuditoria.NORTON: PLANTILLA_NORTON,
}


def _agregar(items: list[ItemAuditoria], orden: int, categoria: str,
             descripcion: str, automatico: bool = False,
             activo_id: int | None = None) -> int:
    items.append(
        ItemAuditoria(
            orden=orden,
            categoria=categoria,
            descripcion=descripcion,
            automatico=automatico,
            estado=EstadoItem.INCIDENCIA if automatico else EstadoItem.PENDIENTE,
            activo_id=activo_id,
        )
    )
    return orden + 1


def construir_items(db: Session, tipo: TipoAuditoria, fecha_inicio: dt.date,
                    fecha_fin: dt.date, dias_sin_actividad: int | None = None) -> list[ItemAuditoria]:
    items: list[ItemAuditoria] = []
    orden = 0

    for categoria, descripcion in PLANTILLAS[tipo]:
        descripcion = descripcion.format(dias=dias_sin_actividad or DIAS_SIN_ACTIVIDAD)
        orden = _agregar(items, orden, categoria, descripcion)

    if tipo == TipoAuditoria.CORREO:
        orden = _excepciones_correo(db, items, orden, fecha_inicio)
    else:
        orden = _excepciones_bajas_altas(db, items, orden, fecha_inicio, fecha_fin)

    return items


def _excepciones_correo(db: Session, items: list[ItemAuditoria],
                        orden: int, fecha_inicio: dt.date) -> int:
    suspendidas = (
        db.query(Activo)
        .join(DetalleCorreo)
        .filter(DetalleCorreo.habilitada.is_(False))
        .all()
    )
    for a in suspendidas:
        orden = _agregar(
            items, orden, "Detectado",
            f"Cuenta suspendida: {a.detalle_correo.direccion} ({a.codigo})",
            automatico=True, activo_id=a.id,
        )

    corte = dt.datetime.combine(fecha_inicio, dt.time()) - dt.timedelta(days=20)
    inactivas = (
        db.query(Activo)
        .join(DetalleCorreo)
        .filter(DetalleCorreo.ultimo_acceso.isnot(None), DetalleCorreo.ultimo_acceso < corte)
        .all()
    )
    for a in inactivas:
        dias = (fecha_inicio - a.detalle_correo.ultimo_acceso.date()).days
        orden = _agregar(
            items, orden, "Detectado",
            f"Sin acceso desde hace {dias} días: {a.detalle_correo.direccion} ({a.codigo})",
            automatico=True, activo_id=a.id,
        )

    sin_asignar = (
        db.query(Activo)
        .outerjoin(
            Asignacion,
            (Asignacion.activo_id == Activo.id) & (Asignacion.fecha_devolucion.is_(None)),
        )
        .filter(Activo.tipo == TipoActivo.CORREO_WORKSPACE, Asignacion.id.is_(None))
        .all()
    )
    for a in sin_asignar:
        orden = _agregar(
            items, orden, "Detectado",
            f"Cuenta sin responsable asignado: {a.detalle_correo.direccion if a.detalle_correo else a.codigo}",
            automatico=True, activo_id=a.id,
        )
    return orden


def _excepciones_bajas_altas(db: Session, items: list[ItemAuditoria], orden: int,
                             fecha_inicio: dt.date, fecha_fin: dt.date) -> int:
    for e in (
        db.query(Empleado)
        .filter(Empleado.fecha_ingreso.between(fecha_inicio, fecha_fin))
        .order_by(Empleado.nombre_completo)
    ):
        orden = _agregar(
            items, orden, "Bajas / Altas",
            f"Alta de {e.nombre_completo} ({e.fecha_ingreso:%d/%m/%Y}): "
            "dispositivos desbloqueados y asignados en el sistema",
        )

    for e in (
        db.query(Empleado)
        .filter(Empleado.fecha_baja.between(fecha_inicio, fecha_fin))
        .order_by(Empleado.nombre_completo)
    ):
        pendientes = (
            db.query(Asignacion)
            .join(Activo, Activo.id == Asignacion.activo_id)
            .filter(
                Asignacion.empleado_id == e.id,
                Asignacion.fecha_devolucion.is_(None),
                Activo.tipo.in_(TIPOS_DISPOSITIVO),
            )
            .all()
        )
        if pendientes:
            codigos = ", ".join(a.activo.codigo for a in pendientes)
            orden = _agregar(
                items, orden, "Detectado",
                f"Baja de {e.nombre_completo} ({e.fecha_baja:%d/%m/%Y}) con dispositivos "
                f"aún asignados: {codigos}",
                automatico=True, activo_id=pendientes[0].activo_id,
            )
        else:
            orden = _agregar(
                items, orden, "Bajas / Altas",
                f"Baja de {e.nombre_completo} ({e.fecha_baja:%d/%m/%Y}): "
                "dispositivos bloqueados y reasignación registrada",
            )
    return orden


def semana_de(fecha: dt.date) -> tuple[dt.date, dt.date]:
    """Lunes y domingo de la semana a la que pertenece la fecha."""
    lunes = fecha - dt.timedelta(days=fecha.weekday())
    return lunes, lunes + dt.timedelta(days=6)
