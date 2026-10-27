"""Limite de peticiones en memoria (ventana deslizante por llave)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class Limitador:
    def __init__(self, maximo: int, ventana_segundos: float):
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._marcas: dict[str, deque[float]] = defaultdict(deque)
        self._candado = threading.Lock()

    def _purgar(self, marcas: deque[float], ahora: float) -> None:
        while marcas and marcas[0] <= ahora - self.ventana:
            marcas.popleft()

    def excedido(self, llave: str) -> float | None:
        """Segundos a esperar si la llave agotó su cupo; None si aún puede."""
        ahora = time.monotonic()
        with self._candado:
            marcas = self._marcas.get(llave)
            if not marcas:
                return None
            self._purgar(marcas, ahora)
            if len(marcas) < self.maximo:
                return None
            return max(1.0, marcas[0] + self.ventana - ahora)

    def registrar(self, llave: str) -> None:
        ahora = time.monotonic()
        with self._candado:
            marcas = self._marcas[llave]
            self._purgar(marcas, ahora)
            marcas.append(ahora)
            if len(self._marcas) > 10_000:
                for k in [k for k, v in self._marcas.items() if not v]:
                    del self._marcas[k]

    def consumir(self, llave: str) -> float | None:
        espera = self.excedido(llave)
        if espera is None:
            self.registrar(llave)
        return espera

    def limpiar(self, llave: str) -> None:
        with self._candado:
            self._marcas.pop(llave, None)


# Intentos fallidos de inicio de sesión
fallos_por_usuario = Limitador(maximo=5, ventana_segundos=15 * 60)
fallos_por_ip = Limitador(maximo=20, ventana_segundos=15 * 60)
# Tráfico general de la API
peticiones_por_ip = Limitador(maximo=600, ventana_segundos=60)
# Subidas de archivos
subidas_por_ip = Limitador(maximo=30, ventana_segundos=60)
