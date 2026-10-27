# Lanzador del Panel de control TI
# Se invoca desde iniciar.bat. PowerShell maneja bien UTF-8, a diferencia de
# los archivos .bat, que se corrompen al mezclar chcp 65001 con acentos.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $raiz

$puerto = 8801
$url = "http://127.0.0.1:$puerto"

function Escribir($texto, $color = "Gray") {
    Write-Host $texto -ForegroundColor $color
}

Write-Host ""
Escribir "  ===============================================" "DarkCyan"
Escribir "   PANEL DE CONTROL TI" "Cyan"
Escribir "  ===============================================" "DarkCyan"
Write-Host ""

# --- Verificar Python ---
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Escribir "  [ERROR] No se encontró Python en este equipo." "Red"
    Write-Host ""
    Escribir "  Descárgalo desde https://www.python.org/downloads/"
    Escribir "  IMPORTANTE: marca la casilla 'Add Python to PATH' al instalarlo." "Yellow"
    Write-Host ""
    Read-Host "  Presiona Enter para cerrar"
    exit 1
}

# --- Verificar que el puerto esté libre ---
$ocupado = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    Escribir "  El sistema ya está corriendo en otra ventana." "Yellow"
    Write-Host ""
    Escribir "  Abriendo el navegador en $url"
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
}

# --- Instalar dependencias solo la primera vez ---
& python -c "import fastapi, uvicorn, sqlalchemy, openpyxl" 2>$null
if ($LASTEXITCODE -ne 0) {
    Escribir "  Primera ejecución: instalando los componentes necesarios." "Yellow"
    Escribir "  Tarda un par de minutos y solo ocurre una vez."
    Write-Host ""
    & python -m pip install --quiet --disable-pip-version-check -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Escribir "  [ERROR] No se pudieron instalar los componentes." "Red"
        Escribir "  Revisa tu conexión a internet e inténtalo de nuevo."
        Write-Host ""
        Read-Host "  Presiona Enter para cerrar"
        exit 1
    }
    Escribir "  Componentes instalados correctamente." "Green"
    Write-Host ""
}

# --- Abrir el navegador cuando el servidor ya responda ---
$abrir = {
    param($direccion)
    for ($i = 0; $i -lt 40; $i++) {
        try {
            Invoke-WebRequest -Uri $direccion -UseBasicParsing -TimeoutSec 2 | Out-Null
            Start-Process $direccion
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
}
Start-Job -ScriptBlock $abrir -ArgumentList $url | Out-Null

Escribir "  Dirección:  $url" "Cyan"
Write-Host ""
Escribir "  El navegador se abrirá solo en unos segundos."
Write-Host ""
Escribir "  ---------------------------------------------------------" "DarkGray"
Escribir "   DEJA ESTA VENTANA ABIERTA mientras uses el sistema." "Yellow"
Escribir "   Para detenerlo: cierra la ventana o presiona Ctrl+C." "DarkGray"
Escribir "  ---------------------------------------------------------" "DarkGray"
Write-Host ""

& python -m uvicorn app.main:app --host 127.0.0.1 --port $puerto

Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Escribir "  [ERROR] El servidor se detuvo de forma inesperada." "Red"
    Write-Host ""
    Read-Host "  Presiona Enter para cerrar"
}
