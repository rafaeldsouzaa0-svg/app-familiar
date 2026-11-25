# Publica o servidor do app no Neon. Uso: .\publicar-api.ps1 -Usuario seu-usuario-do-github
param([Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9-]+$')][string]$Usuario)
Set-Location $PSScriptRoot

# Cria o codigo de instalacao uma unica vez. O arquivo .env.instalacao fica fora do GitHub.
$arq = Join-Path $PSScriptRoot '.env.instalacao'
if (-not (Test-Path $arq)) {
  $b = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($b)
  $rng.Dispose()
  Set-Content -Path $arq -Encoding ascii -NoNewline -Value (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}
$codigo = (Get-Content $arq -Raw).Trim()
$origem = 'https://' + $Usuario.ToLower() + '.github.io'

Write-Host '1/2 Entrando no Neon (confirme no navegador)...'
npx --yes neon@9.9.8 auth
if ($LASTEXITCODE -ne 0) { Write-Host 'O login nao terminou. Nada foi publicado.'; exit 1 }
Write-Host '2/2 Publicando o servidor...'
npx --yes neon@9.9.8 functions deploy api --src api/index.mjs --project-id square-hall-51593045 --branch br-blue-grass-bdhjg2ip --env "SETUP_CODE=$codigo" --env "ORIGINS=$origem"
