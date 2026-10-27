"""Siembra el usuario administrador inicial.

No carga catálogos de ejemplo: sucursales, departamentos, locaciones y sistemas internos
se capturan desde Catálogos. Tampoco siembra empleados ni activos.
"""

from __future__ import annotations

import os

from sqlalchemy.orm import Session

from .auth import hashear_password
from .models import (
    Bodega,
    Departamento,
    Planta,
    RolUsuario,
    SistemaInterno,
    Sucursal,
    Usuario,
)

# Credencial que traían las bases creadas con versiones anteriores. La
# aplicación sigue mostrando el aviso mientras alguien la conserve.
PASSWORD_DE_FABRICA = "admin1234"

SUCURSALES: list[tuple[str, str]] = []

DEPARTAMENTOS: list[tuple[str, str]] = []

# (nombre de bodega, clave de sucursal)
BODEGAS: list[tuple[str, str]] = []

# (nombre, clave, descripcion, orden)
SISTEMAS = []

PLANTAS: list[str] = []


def sembrar(db: Session) -> dict[str, int]:
    creados = {
        "sucursales": 0, "departamentos": 0, "bodegas": 0,
        "plantas": 0, "sistemas": 0, "usuarios": 0,
    }

    # Sólo en una base nueva; después los catálogos se administran desde la aplicación
    if not db.query(Sucursal).first():
        for nombre, clave in SUCURSALES:
            db.add(Sucursal(nombre=nombre, clave=clave))
            creados["sucursales"] += 1
        db.flush()

    if not db.query(Departamento).first():
        for nombre, clave in DEPARTAMENTOS:
            db.add(Departamento(nombre=nombre, clave=clave))
            creados["departamentos"] += 1
        db.flush()

    if not db.query(Bodega).first():
        sucursales = {s.clave: s.id for s in db.query(Sucursal).all()}
        for nombre, clave_suc in BODEGAS:
            db.add(Bodega(nombre=nombre, sucursal_id=sucursales.get(clave_suc)))
            creados["bodegas"] += 1
        db.flush()

    if not db.query(Planta).first():
        for nombre in PLANTAS:
            db.add(Planta(nombre=nombre))
            creados["plantas"] += 1
        db.flush()

    if not db.query(SistemaInterno).first():
        for nombre, clave, descripcion, orden in SISTEMAS:
            db.add(
                SistemaInterno(
                    nombre=nombre, clave=clave, descripcion=descripcion, orden=orden
                )
            )
            creados["sistemas"] += 1
        db.flush()

    if not db.query(Usuario).first():
        password = os.getenv("INVENTARIO_ADMIN_PASSWORD") or PASSWORD_DE_FABRICA
        db.add(
            Usuario(
                username="admin",
                nombre="Administrador",
                password_hash=hashear_password(password),
                debe_cambiar_password=password == PASSWORD_DE_FABRICA,
                rol=RolUsuario.ADMIN,
            )
        )
        creados["usuarios"] += 1

    db.commit()
    return creados
