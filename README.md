# arca_phone

An iFruit smartphone for the Arca framework, with calls, messages and contacts, built around **phone chips**.

## Phone chips

Your number, contacts, messages and call history aren't stored on the phone or the character. They're stored on the **chip** inside the phone.

- Every new phone comes with its own chip and number: from a shop, `/giveitem`, or the free starter phone a new character gets.
- **Right-click a phone** in the inventory to see its chip (number), **remove** it, or **insert** a spare chip.
- **Without a chip**, the phone shows an **"OS visual issue"** screen and does nothing.
- Anyone holding your phone can take the chip out, and with it your number and messages.
- Spare chips (`phone_chip`) are sold at the **Digital Den** electronics stores (arca_inventory shop config). Each comes with a new number.
- Phone numbers are lore-friendly `555-####` numbers.

## Features

- **Lock screen:** big clock, day, current area, live weather from arca_admin, notifications. Click to unlock.
- **Home screen:** a clock and weather widget, apps and a dock. Snapmatic, Maps, Fleeca and Lifeinvader are placeholders for later.
- **Phone:** keypad (you can also type the number), recent calls, contacts. Calls ring the other player and use real voice through pma-voice when it's running. Unanswered calls show as missed.
- **Messages:** conversations with unread badges and chat bubbles. Enter sends.
- **Contacts:** add, edit, delete, search, and call or message from the list.
- **Settings:** chip number, silent mode, wallpapers (Vinewood, LS Night, Blaine, Pacific, Arca, Mono). Settings are saved on the chip.
- **While the phone is put away:** banners for new messages and incoming calls (press **M** to answer).
- **While the phone is open:** you hold it with the phone animation and prop, and you can keep walking. Movement keys are blocked while you type.

## Setup

1. Start after `oxmysql`, `arca_core` and `arca_inventory`. The tables are created automatically.
2. arca_inventory already has the `phone` (with `chip = true`) and `phone_chip` items, and the Digital Den shop.
3. Optional: run pma-voice for call audio.

## Config

```lua
PhoneConfig = {
    Key = 'M',
    NumberFormat = '555-####',
    StarterPhone = true,
    RingTime = 30,
    MaxMessageLength = 500,
    Voice = 'pma-voice',
}
```

## Exports

- **Client:** `Open(slot?)`, `Close()`, `IsOpen()`
- **Server:**
  - `NewChipNumber()`: a new unused number (arca_inventory uses it for new phones and chips)
  - `GetHolders(number)`: players currently carrying that chip
