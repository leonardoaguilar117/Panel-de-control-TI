"""Conexion a la base de datos SQLite."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, clave_nombre

RUTA_DATOS = Path(os.getenv("INVENTARIO_DB_DIR", Path(__file__).resolve().parent.parent / "data"))
RUTA_DATOS.mkdir(parents=True, exist_ok=True)
RUTA_BD = RUTA_DATOS / "inventario.db"

engine = create_engine(
    f"sqlite:///{RUTA_BD}",
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def _configurar_sqlite(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    # WAL permite lecturas concurrentes mientras alguien escribe: necesario
    # para que varias personas del equipo de TI trabajen a la vez.
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def crear_esquema() -> None:
    Base.metadata.create_all(engine)
    _migrar()


def _columnas(con, tabla: str) -> set[str]:
    return {fila[1] for fila in con.execute(text(f"PRAGMA table_info({tabla})"))}


def _migrar() -> None:
    """Ajusta bases creadas con versiones anteriores del esquema."""
    with engine.begin() as con:
        if "folio_factura" in _columnas(con, "detalle_computo"):
            con.execute(text("ALTER TABLE detalle_computo DROP COLUMN folio_factura"))

        for campo, tipo in (("foto", "VARCHAR(80)"), ("correo", "VARCHAR(160)"),
                            ("telefono", "VARCHAR(30)"), ("puesto", "VARCHAR(80)")):
            if campo not in _columnas(con, "usuario"):
                con.execute(text(f"ALTER TABLE usuario ADD COLUMN {campo} {tipo}"))

        if "debe_cambiar_password" not in _columnas(con, "usuario"):
            con.execute(
                text("ALTER TABLE usuario ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT 0")
            )

        columnas = _columnas(con, "detalle_correo")
        if "habilitada" not in columnas:
            con.execute(
                text("ALTER TABLE detalle_correo ADD COLUMN habilitada BOOLEAN NOT NULL DEFAULT 1")
            )
            if "estatus_proveedor" in columnas:
                con.execute(
                    text(
                        "UPDATE detalle_correo SET habilitada = 0 "
                        "WHERE UPPER(estatus_proveedor) = 'SUSPENDED'"
                    )
                )
        for vieja in ("proveedor", "estatus_proveedor"):
            if vieja in columnas:
                con.execute(text(f"ALTER TABLE detalle_correo DROP COLUMN {vieja}"))
        if "actividad_importada_en" not in columnas:
            con.execute(text("ALTER TABLE detalle_correo ADD COLUMN actividad_importada_en DATETIME"))

        if "dias_sin_actividad" not in _columnas(con, "auditoria"):
            con.execute(text("ALTER TABLE auditoria ADD COLUMN dias_sin_actividad INTEGER"))
        _unir_seguridad_en_norton(con)
        _claves_de_empleado(con)
        con.execute(
            text(
                "UPDATE usuario SET nombre = 'Administrador' "
                "WHERE username = 'admin' AND nombre = 'Administrador TI'"
            )
        )
        _quitar_categorias_norton(con)
        _cifrar_claves_windows(con)

        columnas = _columnas(con, "impresora")
        for campo, tabla in (("sucursal_id", "sucursal"), ("bodega_id", "bodega"), ("planta_id", "planta")):
            if campo not in columnas:
                con.execute(text(f"ALTER TABLE impresora ADD COLUMN {campo} INTEGER REFERENCES {tabla}(id)"))

        columnas = _columnas(con, "detalle_movil")
        if "precio_plan" not in columnas:
            con.execute(text("ALTER TABLE detalle_movil ADD COLUMN precio_plan NUMERIC(10, 2)"))
        if "fecha_fin_plazo" in columnas:
            con.execute(text("ALTER TABLE detalle_movil DROP COLUMN fecha_fin_plazo"))
        # Toda la telefonía es Telcel en plazo forzoso con equipo
        con.execute(
            text(
                "UPDATE detalle_movil SET operador = 'Telcel', esquema = 'Plazo Forzoso con Equipo' "
                "WHERE activo_id IN (SELECT id FROM activo WHERE tipo = 'TELEFONO')"
            )
        )
        con.execute(
            text("UPDATE activo SET fecha_vencimiento = NULL WHERE tipo IN ('COMPUTO', 'TELEFONO', 'TABLETA', 'CORREO_WORKSPACE')")
        )


def _cifrar_claves_windows(con) -> None:
    from .cifrado import cifrar

    for activo_id, clave in con.execute(
        text(
            "SELECT activo_id, clave_windows FROM detalle_computo "
            "WHERE clave_windows IS NOT NULL AND clave_windows NOT LIKE 'gAAAAA%'"
        )
    ).all():
        con.execute(
            text("UPDATE detalle_computo SET clave_windows = :clave WHERE activo_id = :id"),
            {"clave": cifrar(clave), "id": activo_id},
        )


def _claves_de_empleado(con) -> None:
    """Llena la clave única de nombre; si ya hay repetidos, solo el más antiguo la recibe."""
    if "nombre_clave" not in _columnas(con, "empleado"):
        con.execute(text("ALTER TABLE empleado ADD COLUMN nombre_clave VARCHAR(180)"))
    usadas = {
        fila[0]
        for fila in con.execute(text("SELECT nombre_clave FROM empleado WHERE nombre_clave IS NOT NULL"))
    }
    for emp_id, nombres, apellidos in con.execute(
        text("SELECT id, nombres, apellidos FROM empleado WHERE nombre_clave IS NULL ORDER BY id")
    ).all():
        clave = clave_nombre(nombres, apellidos)
        if clave in usadas:
            continue
        usadas.add(clave)
        con.execute(
            text("UPDATE empleado SET nombre_clave = :clave WHERE id = :id"), {"clave": clave, "id": emp_id}
        )
    con.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS ix_empleado_nombre_clave ON empleado (nombre_clave)")
    )


def _unir_seguridad_en_norton(con) -> None:
    """Las auditorías de seguridad pasan a ser parte de la de Norton de su semana."""
    for aud_id, inicio, dias in con.execute(
        text("SELECT id, fecha_inicio, dias_sin_actividad FROM auditoria WHERE tipo = 'SEGURIDAD'")
    ).all():
        norton = con.execute(
            text("SELECT id FROM auditoria WHERE tipo = 'NORTON' AND fecha_inicio = :inicio"),
            {"inicio": inicio},
        ).scalar()
        if norton is None:
            con.execute(text("UPDATE auditoria SET tipo = 'NORTON' WHERE id = :id"), {"id": aud_id})
            continue
        siguiente = con.execute(
            text("SELECT COALESCE(MAX(orden), 0) + 1 FROM item_auditoria WHERE auditoria_id = :id"),
            {"id": norton},
        ).scalar()
        con.execute(
            text(
                "UPDATE item_auditoria SET auditoria_id = :norton, orden = orden + :desde "
                "WHERE auditoria_id = :id"
            ),
            {"norton": norton, "desde": siguiente, "id": aud_id},
        )
        con.execute(
            text(
                "UPDATE auditoria SET dias_sin_actividad = COALESCE(dias_sin_actividad, :dias) "
                "WHERE id = :norton"
            ),
            {"dias": dias, "norton": norton},
        )
        con.execute(text("DELETE FROM auditoria WHERE id = :id"), {"id": aud_id})


def _quitar_categorias_norton(con) -> None:
    """Cobertura, Licencias, Estado y Registro ya no forman parte de la auditoría de Norton."""
    items = (
        "SELECT i.id FROM item_auditoria i JOIN auditoria a ON a.id = i.auditoria_id "
        "WHERE a.tipo = 'NORTON' AND a.estado = 'EN_PROCESO' "
        "AND i.categoria IN ('Cobertura', 'Licencias', 'Estado', 'Registro')"
    )
    con.execute(text(f"DELETE FROM evidencia_auditoria WHERE item_id IN ({items})"))
    con.execute(text(f"DELETE FROM item_auditoria WHERE id IN ({items})"))


def obtener_sesion():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
