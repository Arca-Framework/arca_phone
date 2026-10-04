-- Opening the phone, holding it, calls (ringing / voice) and passing NUI requests to the server.

local cfg = PhoneConfig
local isOpen = false
local slot           -- inventory slot of the phone in use
local typing = false
local call           -- { id, number, state = 'outgoing' | 'incoming' | 'active' }
local prop

local function notify(msg, kind) exports.arca_core:Notify(msg, kind or 'inform') end

---------------------------------------------------------------------
-- Holding the phone (prop + anim)
---------------------------------------------------------------------
local ANIM_DICT = 'cellphone@'

local function playAnim(clip)
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return end
    RequestAnimDict(ANIM_DICT)
    local timeout = GetGameTimer() + 2000
    while not HasAnimDictLoaded(ANIM_DICT) and GetGameTimer() < timeout do Wait(0) end
    TaskPlayAnim(ped, ANIM_DICT, clip, 3.0, 3.0, -1, 50, 0, false, false, false)
end

local function holdPhone(state)
    local ped = PlayerPedId()
    if state then
        if not prop then
            local model = `prop_npc_phone_02`
            RequestModel(model)
            local timeout = GetGameTimer() + 2000
            while not HasModelLoaded(model) and GetGameTimer() < timeout do Wait(0) end
            local c = GetEntityCoords(ped)
            prop = CreateObject(model, c.x, c.y, c.z, true, true, false)
            AttachEntityToEntity(prop, ped, GetPedBoneIndex(ped, 28422), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true, true, false, true, 1, true)
            SetModelAsNoLongerNeeded(model)
        end
        playAnim(call and call.state == 'active' and 'cellphone_call_listen_base' or 'cellphone_text_read_base')
    else
        if prop then DeleteEntity(prop) prop = nil end
        StopAnimTask(ped, ANIM_DICT, 'cellphone_text_read_base', 2.0)
        StopAnimTask(ped, ANIM_DICT, 'cellphone_call_listen_base', 2.0)
    end
end

---------------------------------------------------------------------
-- Open / close
---------------------------------------------------------------------
local function worldInfo()
    local t = GlobalState.arcaTime
    local h, m = t and t.h or GetClockHours(), t and t.m or GetClockMinutes()
    local c = GetEntityCoords(PlayerPedId())
    return {
        hour = h, minute = m,
        zone = GetLabelText(GetNameOfZone(c.x, c.y, c.z)),
        weather = GlobalState.arcaWeather or 'CLEAR',
    }
end

local function findPhoneSlot()
    for _, item in ipairs(exports.arca_inventory:GetPlayerItems() or {}) do
        if item.name == cfg.Item then return item.slot end
    end
end

local function close()
    if not isOpen then return end
    isOpen, typing = false, false
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({ action = 'close', data = { inCall = call ~= nil } })
    if not call then holdPhone(false) end
end

local function open(useSlot)
    if isOpen then return close() end
    if not exports.arca_core:IsLoggedIn() or IsPauseMenuActive() then return end
    if GetResourceState('arca_health') == 'started' and exports.arca_health:IsDown() then return end
    if exports.arca_inventory:IsBusy() then return end

    slot = useSlot or (call and slot) or findPhoneSlot()
    if not slot then return notify('You don\'t have a phone', 'error') end
    local data = Arca.Callback.Await('arca_phone:open', slot)
    if not data then return notify('You don\'t have a phone', 'error') end

    isOpen = true
    data.world = worldInfo()
    data.call = call
    data.bank = GetResourceState('arca_bank') == 'started'
    SendNUIMessage({ action = 'open', data = data })
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true) -- keep walking while using the phone
    holdPhone(true)

    CreateThread(function()
        local nextClock = 0
        while isOpen do
            if typing then
                DisableAllControlActions(0)
                EnableControlAction(0, 249, true) -- push to talk
            else
                DisableControlAction(0, 1, true)   -- look
                DisableControlAction(0, 2, true)
                DisableControlAction(0, 24, true)  -- attack
                DisableControlAction(0, 25, true)  -- aim
                DisableControlAction(0, 37, true)  -- weapon wheel
                DisableControlAction(0, 140, true) -- melee
                DisableControlAction(0, 141, true)
                DisableControlAction(0, 142, true)
                DisableControlAction(0, 199, true) -- pause (Esc closes the phone instead)
                DisableControlAction(0, 200, true)
            end
            if GetGameTimer() > nextClock then
                nextClock = GetGameTimer() + 5000
                SendNUIMessage({ action = 'world', data = worldInfo() })
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('arca_phone:client:open', open)
-- ignore the key while typing on the phone (an 'm' in a message shouldn't close it)
RegisterCommand('phone', function()
    if isOpen and typing then return end
    if not isOpen and IsNuiFocused() then return end
    open()
end, false)
RegisterKeyMapping('phone', 'Open phone', 'keyboard', cfg.Key)
exports('Open', open)
exports('Close', close)
exports('IsOpen', function() return isOpen end)

-- the phone or its chip changed in the inventory: refresh / close
RegisterNetEvent('arca_phone:client:chipChanged', function(changedSlot)
    if isOpen and changedSlot == slot then close() end
end)
RegisterNetEvent('arca_inventory:client:update', function(data)
    if not isOpen or data.type ~= 'player' then return end
    for _, item in ipairs(data.items or {}) do
        if item.slot == slot and item.name == cfg.Item then return end
    end
    close() -- the phone left this slot (dropped, given, moved)
end)

---------------------------------------------------------------------
-- NUI callbacks
---------------------------------------------------------------------
RegisterNUICallback('close', function(_, cb) cb(1) close() end)
RegisterNUICallback('typing', function(data, cb) cb(1) typing = data.state == true end)

RegisterNUICallback('thread', function(data, cb)
    cb(Arca.Callback.Await('arca_phone:thread', slot, data.number) or {})
end)
RegisterNUICallback('send', function(data, cb)
    cb(Arca.Callback.Await('arca_phone:send', slot, data.number, data.body) or false)
end)
RegisterNUICallback('saveContact', function(data, cb)
    cb(Arca.Callback.Await('arca_phone:saveContact', slot, data) or false)
end)
RegisterNUICallback('deleteContact', function(data, cb)
    cb(Arca.Callback.Await('arca_phone:deleteContact', slot, data.id) or false)
end)
RegisterNUICallback('saveSettings', function(data, cb)
    cb(Arca.Callback.Await('arca_phone:saveSettings', slot, data) or false)
end)
-- Fleeca app (arca_bank)
local function bankRunning() return GetResourceState('arca_bank') == 'started' end
RegisterNUICallback('bank', function(_, cb)
    cb(bankRunning() and Arca.Callback.Await('arca_bank:phone') or false)
end)
RegisterNUICallback('bankTx', function(data, cb)
    cb(bankRunning() and Arca.Callback.Await('arca_bank:transactions', data.ref) or {})
end)
RegisterNUICallback('bankTransfer', function(data, cb)
    cb(bankRunning() and Arca.Callback.Await('arca_bank:phoneTransfer', data.ref, data.target, data.amount, data.note) or false)
end)

RegisterNUICallback('call', function(data, cb)
    cb(1)
    if call then return end
    TriggerServerEvent('arca_phone:server:call', slot, data.number)
end)
RegisterNUICallback('answer', function(_, cb)
    cb(1)
    if call and call.state == 'incoming' then TriggerServerEvent('arca_phone:server:answer', call.id) end
end)
RegisterNUICallback('hangup', function(_, cb)
    cb(1)
    if call then TriggerServerEvent('arca_phone:server:hangup', call.id) end
end)

---------------------------------------------------------------------
-- Messages
---------------------------------------------------------------------
RegisterNetEvent('arca_phone:client:message', function(msg)
    SendNUIMessage({ action = 'message', data = msg })
    if not isOpen then
        PlaySoundFrontend(-1, 'Text_Arrive_Tone', 'Phone_SoundSet_Default', true)
    end
end)

---------------------------------------------------------------------
-- Calls
---------------------------------------------------------------------
local function ringLoop()
    CreateThread(function()
        while call and call.state == 'incoming' do
            PlaySoundFrontend(-1, 'Remote_Ring', 'Phone_SoundSet_Michael', true)
            Wait(2500)
        end
    end)
end

RegisterNetEvent('arca_phone:client:outgoing', function(data)
    call = { id = data.id, number = data.number, state = 'outgoing' }
    SendNUIMessage({ action = 'call', data = call })
    holdPhone(true)
    playAnim('cellphone_call_listen_base')
end)

RegisterNetEvent('arca_phone:client:incoming', function(data)
    call = { id = data.id, number = data.number, state = 'incoming' }
    slot = slot or findPhoneSlot()
    SendNUIMessage({ action = 'call', data = call })
    if not isOpen then notify(('Incoming call · press %s to answer'):format(cfg.Key), 'inform') end
    ringLoop()
end)

RegisterNetEvent('arca_phone:client:answered', function()
    if not call then return end
    call.state = 'active'
    SendNUIMessage({ action = 'call', data = call })
    holdPhone(true)
    playAnim('cellphone_call_listen_base')
end)

local ENDED = {
    unavailable = 'The number you dialled is unavailable',
    missed = 'No answer', declined = 'Call declined', cancelled = 'Call cancelled', ended = 'Call ended',
}
RegisterNetEvent('arca_phone:client:callEnded', function(status)
    call = nil
    SendNUIMessage({ action = 'callEnded', data = { status = status, text = ENDED[status] or 'Call ended' } })
    if isOpen then playAnim('cellphone_text_read_base') else holdPhone(false) end
end)

---------------------------------------------------------------------
-- Cleanup
---------------------------------------------------------------------
AddEventHandler('arca_health:client:stateChanged', function(state)
    if state ~= 'alive' then
        close()
        if call then TriggerServerEvent('arca_phone:server:hangup', call.id) end
    end
end)
AddEventHandler('arca_core:client:onPlayerUnloaded', function()
    close()
    holdPhone(false)
end)
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if isOpen then SetNuiFocus(false, false) SetNuiFocusKeepInput(false) end
    holdPhone(false)
end)

-- radial menu entry
CreateThread(function()
    exports.arca_core:AddRadialItem({ id = 'arca_phone', label = 'Phone', icon = 'fa-solid fa-mobile-screen', onSelect = function() open() end })
end)
