# subir.ps1 — Actualiza el repositorio con los cambios del día.
#
#   .\subir.ps1 "mensaje del commit"
#
# Comprueba antes de confirmar: que no se cuele ninguna captura de escenario,
# que node_modules siga fuera, que ningún archivo pase de 100 MB y cuánto pesa
# en total lo que va a subir. Un push que falla a mitad por tamaño deja el
# repositorio en un estado incómodo de arreglar, y esas comprobaciones cuestan
# un segundo.
#
# No confirma nada si alguna comprobación falla: muestra el problema y para.

param(
  [Parameter(Mandatory = $true)][string]$Mensaje,
  [string]$Detalle = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path .git)) { Write-Host "No hay repositorio git en esta carpeta." -Foreground Red; exit 1 }

Write-Host "`nPreparando cambios..." -Foreground Cyan
git add -A 2>$null | Out-Null

$seguidos = git ls-files
if (-not $seguidos) { Write-Host "No hay nada que subir." -Foreground Yellow; exit 0 }

# ── Comprobaciones ─────────────────────────────────────────────────────────
$capturas = @($seguidos | Where-Object { $_ -like 'corpus/*.png' -or $_ -like 'corpus-rep2/*.png' })
$modulos  = @($seguidos | Where-Object { $_ -like 'node_modules/*' })
$grandes  = @($seguidos | Where-Object { (Test-Path $_) -and (Get-Item $_).Length -gt 100MB })
$mb = [math]::Round((($seguidos | Where-Object { Test-Path $_ } | ForEach-Object { (Get-Item $_).Length } |
       Measure-Object -Sum).Sum / 1MB), 1)

Write-Host ("  archivos seguidos        {0}" -f $seguidos.Count)
Write-Host ("  tamaño total             {0} MB" -f $mb)
Write-Host ("  capturas de escenario    {0}" -f $capturas.Count) -Foreground $(if ($capturas.Count) {"Red"} else {"Green"})
Write-Host ("  node_modules             {0}" -f $modulos.Count)  -Foreground $(if ($modulos.Count)  {"Red"} else {"Green"})
Write-Host ("  archivos > 100 MB        {0}" -f $grandes.Count)  -Foreground $(if ($grandes.Count)  {"Red"} else {"Green"})

if ($capturas.Count -or $modulos.Count -or $grandes.Count) {
  Write-Host "`nHay algo que no debería subir. Revise el .gitignore antes de continuar." -Foreground Red
  if ($capturas.Count) { Write-Host "  ejemplo de captura: $($capturas[0])" }
  if ($grandes.Count)  { Write-Host "  archivo grande:     $($grandes[0])" }
  git reset | Out-Null
  exit 1
}

# ── Qué cambia ─────────────────────────────────────────────────────────────
$estado = git status --short
if (-not $estado) { Write-Host "`nNo hay cambios pendientes." -Foreground Yellow; exit 0 }
$n = ($estado | Measure-Object).Count
Write-Host "`n$n archivos con cambios:" -Foreground Cyan
$estado | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
if ($n -gt 15) { Write-Host "  ... y $($n - 15) más" }

# ── Confirmar y subir ──────────────────────────────────────────────────────
Write-Host "`nConfirmando..." -Foreground Cyan
$args = @("-m", $Mensaje)
if ($Detalle) { $args += @("-m", $Detalle) }
$args += @("-m", "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>")
git commit @args

Write-Host "`nSubiendo..." -Foreground Cyan
git push

Write-Host "`nListo." -Foreground Green
git log --oneline -1
