PhoneConfig = {
    Key = 'M',                      -- open the phone (players can rebind in GTA settings)
    Item = 'phone',                 -- the phone item (needs chip = true in arca_inventory items)
    ChipItem = 'phone_chip',

    -- Phone numbers live on chips. Lore-friendly 555 numbers: '555-####'
    NumberFormat = '555-####',

    -- new characters get a phone (with its own chip) the first time they load in
    StarterPhone = true,

    RingTime = 30,                  -- seconds before an unanswered call is missed
    MaxMessageLength = 500,

    -- pma-voice call channels for real voice in calls (used automatically when it's running)
    Voice = 'pma-voice',
}
