"""Autenticacion por sesion en cookie.

Se usa scrypt de la libreria estandar para no depender de paquetes que
requieran compilacion (bcrypt/argon2 complican el build en Synology).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os
import secrets

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .database import obtener_sesion
from .models import Bitacora, RolUsuario, Sesion, Usuario

COOKIE = "inventario_sesion"
DURACION_SESION = dt.timedelta(hours=12)
# Con la contraseña de fábrica sólo se puede consultar el perfil y cambiarla
RUTAS_CON_PASSWORD_DE_FABRICA = {"/api/yo", "/api/yo/password"}
# Activar cuando la aplicación se sirva por HTTPS
COOKIE_SEGURA = os.getenv("INVENTARIO_COOKIE_SEGURA", "").lower() in ("1", "true", "si", "sí")

_N, _R, _P = 2**15, 8, 1
_MAXMEM = 128 * 1024 * 1024


def hashear_password(password: str) -> str:
    sal = secrets.token_bytes(16)
    dk = hashlib.scrypt(
        password.encode(), salt=sal, n=_N, r=_R, p=_P, maxmem=_MAXMEM, dklen=32
    )
    return f"scrypt${_N}${_R}${_P}${sal.hex()}${dk.hex()}"


# Se verifica contra este hash cuando el usuario no existe, para que el
# tiempo de respuesta no revele qué nombres de usuario son válidos.
_HASH_SENUELO = hashear_password(secrets.token_urlsafe(16))


def verificar_senuelo(password: str) -> None:
    verificar_password(password, _HASH_SENUELO)


def requiere_rehash(almacenado: str) -> bool:
    return not almacenado.startswith(f"scrypt${_N}${_R}${_P}$")


def verificar_password(password: str, almacenado: str) -> bool:
    try:
        etiqueta, n, r, p, sal_hex, dk_hex = almacenado.split("$")
        if etiqueta != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(sal_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            maxmem=_MAXMEM,
            dklen=len(bytes.fromhex(dk_hex)),
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, AttributeError):
        return False


def huella_token(token: str) -> str:
    """En la base solo se guarda el SHA-256 del token, nunca el token."""
    return hashlib.sha256(token.encode()).hexdigest()


def poner_cookie(respuesta: Response, token: str) -> None:
    respuesta.set_cookie(
        COOKIE,
        token,
        max_age=int(DURACION_SESION.total_seconds()),
        path="/",
        httponly=True,
        secure=COOKIE_SEGURA,
        samesite="strict",
    )


def quitar_cookie(respuesta: Response) -> None:
    respuesta.delete_cookie(
        COOKIE, path="/", httponly=True, secure=COOKIE_SEGURA, samesite="strict"
    )


def crear_sesion(db: Session, usuario: Usuario) -> str:
    ahora = dt.datetime.now(dt.timezone.utc)
    db.query(Sesion).filter(Sesion.expira_en < ahora.replace(tzinfo=None)).delete()
    token = secrets.token_urlsafe(32)
    db.add(
        Sesion(
            token=huella_token(token),
            usuario_id=usuario.id,
            expira_en=ahora + DURACION_SESION,
        )
    )
    usuario.ultimo_acceso = ahora
    db.commit()
    return token


def cerrar_sesion(db: Session, token: str) -> None:
    db.query(Sesion).filter(Sesion.token == huella_token(token)).delete()
    db.commit()


def cerrar_otras_sesiones(db: Session, usuario: Usuario, token_actual: str | None) -> None:
    consulta = db.query(Sesion).filter(Sesion.usuario_id == usuario.id)
    if token_actual:
        consulta = consulta.filter(Sesion.token != huella_token(token_actual))
    consulta.delete()


def usuario_actual(
    request: Request, db: Session = Depends(obtener_sesion)
) -> Usuario:
    token = request.cookies.get(COOKIE)
    if not token or len(token) > 100:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión no iniciada")

    sesion = db.query(Sesion).filter(Sesion.token == huella_token(token)).first()
    if sesion is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida")

    if sesion.expira_en < dt.datetime.now(dt.timezone.utc).replace(tzinfo=None):
        db.delete(sesion)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión expiró")

    usuario = db.get(Usuario, sesion.usuario_id)
    if usuario is None or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    if usuario.debe_cambiar_password and request.url.path not in RUTAS_CON_PASSWORD_DE_FABRICA:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Debes cambiar la contraseña de fábrica antes de continuar"
        )
    return usuario


def requiere_captura(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if usuario.rol == RolUsuario.CONSULTA:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu perfil es de solo consulta")
    return usuario


def requiere_admin(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if usuario.rol != RolUsuario.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requiere perfil de administrador")
    return usuario


def registrar(
    db: Session,
    usuario: Usuario | None,
    accion: str,
    entidad: str,
    entidad_id: int | None = None,
    detalle: str | None = None,
) -> None:
    db.add(
        Bitacora(
            usuario_id=usuario.id if usuario else None,
            usuario_nombre=usuario.nombre if usuario else "sistema",
            accion=accion,
            entidad=entidad,
            entidad_id=entidad_id,
            detalle=detalle,
        )
    )
