fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'arca_phone'
author 'Arca'
description 'iFruit phone for the Arca framework: calls, messages, contacts and phone chips'
version '0.1.0'

shared_scripts {
    '@arca_core/shared/import.lua',
    'config.lua',
}

client_script 'client.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/style.css',
    'web/app.js',
}

dependencies {
    'oxmysql',
    'arca_core',
    'arca_inventory',
}
