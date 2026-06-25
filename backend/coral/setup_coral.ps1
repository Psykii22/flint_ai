Write-Host "Downloading Coral binary..."
Invoke-WebRequest -Uri "https://github.com/withcoral/coral/releases/latest/download/coral-x86_64-pc-windows-msvc.zip" -OutFile "coral.zip"
Expand-Archive -Path "coral.zip" -DestinationPath "." -Force
$env:Path += ";$PWD"
Remove-Item "coral.zip"

Write-Host "Adding Supabase source..."
# Provide the ENV variables so it doesn't prompt (or set them in your environment)
if (-not $env:SUPABASE_URL) { $env:SUPABASE_URL = "https://YOUR_SUPABASE_PROJECT.supabase.co" }
if (-not $env:SUPABASE_OPS_KEY) { $env:SUPABASE_OPS_KEY = "YOUR_SUPABASE_SECRET_KEY" }
.\coral source add --file ./supabase-source.yaml

Write-Host "Setup complete."
