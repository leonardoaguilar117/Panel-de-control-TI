"""Cifrado de los datos sensibles: contraseñas de red, claves de Windows y adjuntos."""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken

from .database import RUTA_DATOS

RUTA_LLAVE = RUTA_DATOS / "llave.key"


def _cargar_llave() -> bytes:
    llave = os.getenv("INVENTARIO_LLAVE")
    if llave:
        return llave.encode()
    if not RUTA_LLAVE.exists():
        RUTA_LLAVE.write_bytes(Fernet.generate_key())
    return RUTA_LLAVE.read_bytes().strip()


_fernet = Fernet(_cargar_llave())


def cifrar(texto: str) -> str:
    return _fernet.encrypt(texto.encode()).decode()


def descifrar(cifrado: str) -> str | None:
    """None si la base se cifró con otra llave."""
    try:
        return _fernet.decrypt(cifrado.encode()).decode()
    except InvalidToken:
        return None


def es_cifrado(dato: bytes) -> bool:
    try:
        _fernet.extract_timestamp(dato)
        return True
    except (InvalidToken, TypeError, ValueError):
        return False


def cifrar_bytes(dato: bytes) -> bytes:
    return _fernet.encrypt(dato)


def descifrar_bytes(dato: bytes) -> bytes:
    """Los archivos guardados antes del cifrado se devuelven tal cual."""
    if not es_cifrado(dato):
        return dato
    return _fernet.decrypt(dato)
