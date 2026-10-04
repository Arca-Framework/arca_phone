-- Phone chips, contacts, messages and calls.
-- Everything is stored by chip NUMBER, so it belongs to the chip, not the phone or the character.

local cfg = PhoneConfig
local inv = exports.arca_inventory

local function notify(src, msg, kind) TriggerClientEvent('arca_core:notify', src, msg, kind or 'inform') end

---------------------------------------------------------------------
-- Database
---------------------------------------------------------------------
CreateThread(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `arca_phone_chips` (
            `number` VARCHAR(16) NOT NULL,
            `settings` LONGTEXT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `arca_phone_contacts` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `owner` VARCHAR(16) NOT NULL,
            `name` VARCHAR(50) NOT NULL,
            `number` VARCHAR(16) NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `owner_number` (`owner`, `number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `arca_phone_messages` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `sender` VARCHAR(16) NOT NULL,
            `receiver` VARCHAR(16) NOT NULL,
            `body` TEXT NOT NULL,
            `is_read` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `sender` (`sender`),
            KEY `receiver` (`receiver`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `arca_phone_calls` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `caller` VARCHAR(16) NOT NULL,
            `receiver` VARCHAR(16) NOT NULL,
            `status` VARCHAR(12) NOT NULL,
            `duration` INT NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `caller` (`caller`),
            KEY `receiver` (`receiver`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
end)

---------------------------------------------------------------------
-- Chips
---------------------------------------------------------------------
local function randomNumber()
    return (cfg.NumberFormat:gsub('#', function() return tostring(math.random(0, 9)) end))
end

---Creates a new, unused chip number (arca_inventory calls this for every new phone / chip)
local function newChipNumber()
    for _ = 1, 50 do
        local number = randomNumber()
        -- INSERT IGNORE affects 0 rows when the number is already taken
        local affected = MySQL.update.await('INSERT IGNORE INTO arca_phone_chips (number) VALUES (?)', { number })
        if affected and affected > 0 then return number end
    end
end
exports('NewChipNumber', newChipNumber)

local function validNumber(n)
    return type(n) == 'string' and #n <= 16 and n:match('^[%d%-]+$') ~= nil
end

---The phone in a player's slot and its chip number (nil when there's no chip)
local function phoneAt(src, slot)
    local item = inv:GetItemBySlot(src, tonumber(slot) or 0)
    if not item or item.name ~= cfg.Item then return nil end
    local chip = item.metadata and item.metadata.chip
    return item, type(chip) == 'table' and chip.number or nil
end

---Online players carrying a phone with this chip in it
local function holdersOf(number)
    local list = {}
    for _, src in ipairs(exports.arca_core:GetPlayers()) do
        for _, item in ipairs(inv:GetItemsByName(src, cfg.Item) or {}) do
            local chip = item.metadata and item.metadata.chip
            if type(chip) == 'table' and chip.number == number then
                list[#list + 1] = src
                break
            end
        end
    end
    return list
end

---------------------------------------------------------------------
-- Opening the phone
---------------------------------------------------------------------
local function threadsFor(number)
    local rows = MySQL.query.await([[
        SELECT m.*, IF(m.sender = ?, m.receiver, m.sender) AS other
        FROM arca_phone_messages m
        JOIN (
            SELECT IF(sender = ?, receiver, sender) AS other, MAX(id) AS last_id
            FROM arca_phone_messages WHERE sender = ? OR receiver = ?
            GROUP BY other
        ) t ON t.last_id = m.id
        ORDER BY m.id DESC LIMIT 50
    ]], { number, number, number, number }) or {}
    local unread = MySQL.query.await('SELECT sender, COUNT(*) AS c FROM arca_phone_messages WHERE receiver = ? AND is_read = 0 GROUP BY sender', { number }) or {}
    local unreadBy = {}
    for _, r in ipairs(unread) do unreadBy[r.sender] = r.c end
    local list = {}
    for _, r in ipairs(rows) do
        list[#list + 1] = { number = r.other, last = r.body, mine = r.sender == number, time = r.created_at, unread = unreadBy[r.other] or 0 }
    end
    return list
end

Arca.Callback.Register('arca_phone:open', function(src, slot)
    local item, number = phoneAt(src, slot)
    if not item then return nil end
    -- phones from before arca_phone existed have never had a chip (nil, not false): give them one
    if item.metadata == nil or item.metadata.chip == nil then
        local meta = item.metadata or {}
        number = newChipNumber()
        meta.chip = { number = number }
        inv:SetMetadata(src, item.slot, meta)
    end
    if not number then return { nochip = true } end
    local settings = MySQL.scalar.await('SELECT settings FROM arca_phone_chips WHERE number = ?', { number })
    return {
        number = number,
        settings = settings and json.decode(settings) or {},
        contacts = MySQL.query.await('SELECT id, name, number FROM arca_phone_contacts WHERE owner = ? ORDER BY name', { number }) or {},
        threads = threadsFor(number),
        calls = MySQL.query.await('SELECT * FROM arca_phone_calls WHERE caller = ? OR receiver = ? ORDER BY id DESC LIMIT 30', { number, number }) or {},
    }
end)

Arca.Callback.Register('arca_phone:thread', function(src, slot, other)
    local _, number = phoneAt(src, slot)
    if not number or not validNumber(other) then return nil end
    MySQL.update('UPDATE arca_phone_messages SET is_read = 1 WHERE receiver = ? AND sender = ?', { number, other })
    local rows = MySQL.query.await([[
        SELECT * FROM (
            SELECT id, sender, body, created_at FROM arca_phone_messages
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            ORDER BY id DESC LIMIT 100
        ) t ORDER BY id ASC
    ]], { number, other, other, number }) or {}
    for _, r in ipairs(rows) do r.mine = r.sender == number end
    return rows
end)

---------------------------------------------------------------------
-- Messages
---------------------------------------------------------------------
Arca.Callback.Register('arca_phone:send', function(src, slot, to, body)
    local _, number = phoneAt(src, slot)
    if not number or not validNumber(to) or type(body) ~= 'string' then return false end
    body = body:gsub('^%s+', ''):gsub('%s+$', ''):sub(1, cfg.MaxMessageLength)
    if body == '' then return false end
    local id = MySQL.insert.await('INSERT INTO arca_phone_messages (sender, receiver, body) VALUES (?, ?, ?)', { number, to, body })
    for _, holder in ipairs(holdersOf(to)) do
        TriggerClientEvent('arca_phone:client:message', holder, { id = id, from = number, to = to, body = body })
    end
    return { id = id, sender = number, body = body, mine = true }
end)

---------------------------------------------------------------------
-- Contacts & settings
---------------------------------------------------------------------
Arca.Callback.Register('arca_phone:saveContact', function(src, slot, data)
    local _, number = phoneAt(src, slot)
    if not number or type(data) ~= 'table' or not validNumber(data.number) then return nil end
    local name = tostring(data.name or ''):sub(1, 50)
    if name == '' then return nil end
    MySQL.query.await('INSERT INTO arca_phone_contacts (owner, name, number) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', { number, name, data.number })
    if data.id and tonumber(data.id) and data.oldNumber and data.oldNumber ~= data.number then
        MySQL.query.await('DELETE FROM arca_phone_contacts WHERE id = ? AND owner = ?', { tonumber(data.id), number })
    end
    return MySQL.query.await('SELECT id, name, number FROM arca_phone_contacts WHERE owner = ? ORDER BY name', { number })
end)

Arca.Callback.Register('arca_phone:deleteContact', function(src, slot, id)
    local _, number = phoneAt(src, slot)
    if not number then return nil end
    MySQL.query.await('DELETE FROM arca_phone_contacts WHERE id = ? AND owner = ?', { tonumber(id) or 0, number })
    return MySQL.query.await('SELECT id, name, number FROM arca_phone_contacts WHERE owner = ? ORDER BY name', { number })
end)

Arca.Callback.Register('arca_phone:saveSettings', function(src, slot, settings)
    local _, number = phoneAt(src, slot)
    if not number or type(settings) ~= 'table' then return false end
    local clean = { wallpaper = tostring(settings.wallpaper or ''):sub(1, 30), silent = settings.silent == true }
    MySQL.update('UPDATE arca_phone_chips SET settings = ? WHERE number = ?', { json.encode(clean), number })
    return true
end)

---------------------------------------------------------------------
-- Calls
---------------------------------------------------------------------
local calls = {}        -- [id] = { id, caller, target, callerNumber, targetNumber, state, started }
local inCall = {}       -- [src] = call id
local nextCallId = 0

local function voice(src, channel)
    if GetResourceState(cfg.Voice) ~= 'started' then return end
    pcall(function() exports[cfg.Voice]:setPlayerCall(src, channel) end)
end

local function logCall(call, status)
    local duration = call.started and (os.time() - call.started) or 0
    MySQL.insert('INSERT INTO arca_phone_calls (caller, receiver, status, duration) VALUES (?, ?, ?, ?)', { call.callerNumber, call.targetNumber, status, duration })
end

local function endCall(id, status)
    local call = calls[id]
    if not call then return end
    calls[id] = nil
    for _, src in ipairs({ call.caller, call.target }) do
        if src and inCall[src] == id then
            inCall[src] = nil
            voice(src, 0)
            TriggerClientEvent('arca_phone:client:callEnded', src, status)
        end
    end
    logCall(call, status == 'ended' and 'answered' or status)
end

RegisterNetEvent('arca_phone:server:call', function(slot, to)
    local src = source
    local _, number = phoneAt(src, slot)
    if not number or not validNumber(to) or inCall[src] then return end
    if to == number then return notify(src, 'You can\'t call yourself', 'error') end

    nextCallId = nextCallId + 1
    local id = nextCallId
    local call = { id = id, caller = src, callerNumber = number, targetNumber = to, state = 'ringing' }
    calls[id] = call
    inCall[src] = id
    TriggerClientEvent('arca_phone:client:outgoing', src, { id = id, number = to })

    local target
    for _, holder in ipairs(holdersOf(to)) do
        if not inCall[holder] then target = holder break end
    end
    if not target then
        -- nobody is carrying that chip (or they're busy)
        SetTimeout(2500, function() if calls[id] and calls[id].state == 'ringing' then endCall(id, 'unavailable') end end)
        return
    end
    call.target = target
    inCall[target] = id
    TriggerClientEvent('arca_phone:client:incoming', target, { id = id, number = number })

    SetTimeout(cfg.RingTime * 1000, function()
        if calls[id] and calls[id].state == 'ringing' then endCall(id, 'missed') end
    end)
end)

RegisterNetEvent('arca_phone:server:answer', function(id)
    local src = source
    local call = calls[tonumber(id)]
    if not call or call.target ~= src or call.state ~= 'ringing' then return end
    call.state, call.started = 'active', os.time()
    voice(call.caller, call.id)
    voice(call.target, call.id)
    TriggerClientEvent('arca_phone:client:answered', call.caller, call.id)
    TriggerClientEvent('arca_phone:client:answered', call.target, call.id)
end)

RegisterNetEvent('arca_phone:server:hangup', function(id)
    local src = source
    id = tonumber(id) or inCall[src]
    local call = calls[id]
    if not call or (call.caller ~= src and call.target ~= src) then return end
    if call.state == 'ringing' then
        endCall(id, call.target == src and 'declined' or 'cancelled')
    else
        endCall(id, 'ended')
    end
end)

---------------------------------------------------------------------
-- Chips in and out of phones (right-click a phone in the inventory)
---------------------------------------------------------------------
RegisterNetEvent('arca_phone:server:chipAction', function(slot, action)
    local src = source
    slot = tonumber(slot)
    local item = slot and inv:GetItemBySlot(src, slot)
    if not item or item.name ~= cfg.Item then return end
    local meta = item.metadata or {}

    if action == 'remove' then
        local chip = type(meta.chip) == 'table' and meta.chip
        if not chip then return end
        if inCall[src] then return notify(src, 'You\'re on a call', 'error') end
        if not inv:AddItem(src, cfg.ChipItem, 1, nil, { number = chip.number }) then
            return notify(src, 'No room for the chip', 'error')
        end
        meta.chip = false -- false (not nil) so the phone isn't given a fresh chip later
        inv:SetMetadata(src, slot, meta)
        notify(src, ('Removed chip %s'):format(chip.number), 'success')
    elseif action == 'insert' then
        if type(meta.chip) == 'table' then return notify(src, 'This phone already has a chip', 'error') end
        local chipItem = inv:GetItemByName(src, cfg.ChipItem)
        local number = chipItem and chipItem.metadata and chipItem.metadata.number
        if not number then return notify(src, 'You don\'t have a phone chip', 'error') end
        if not inv:RemoveItem(src, cfg.ChipItem, 1, chipItem.slot) then return end
        -- re-read: removing the chip can't move the phone, but be safe
        local phone = inv:GetItemBySlot(src, slot)
        if not phone or phone.name ~= cfg.Item then
            inv:AddItem(src, cfg.ChipItem, 1, nil, { number = number })
            return
        end
        local pm = phone.metadata or {}
        pm.chip = { number = number }
        inv:SetMetadata(src, slot, pm)
        notify(src, ('Inserted chip %s'):format(number), 'success')
    end
    TriggerClientEvent('arca_phone:client:chipChanged', src, slot)
end)

---------------------------------------------------------------------
-- Using the phone item, starter phone, cleanup
---------------------------------------------------------------------
exports.arca_core:CreateUseableItem(cfg.Item, function(src, item)
    TriggerClientEvent('arca_phone:client:open', src, item.slot)
end)

AddEventHandler('arca_core:server:playerLoaded', function(player)
    if not cfg.StarterPhone or player.PlayerData.metadata.phoneStarter then return end
    local src = player.PlayerData.source
    SetTimeout(3000, function()
        if inv:AddItem(src, cfg.Item, 1) then player.SetMetaData('phoneStarter', true) end
    end)
end)

AddEventHandler('playerDropped', function()
    local src = source
    if inCall[src] then endCall(inCall[src], 'ended') end
end)

exports('GetHolders', holdersOf)
