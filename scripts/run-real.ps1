Remove-Item Env:TMN_MODE -ErrorAction SilentlyContinue
$env:DOTENV_CONFIG_PATH = "C:\Users\ADMIN\MMK1000\.env.tmn.real"
$env:DOTENV_CONFIG_OVERRIDE = "true"

node -r dotenv/config src/server.mjs
