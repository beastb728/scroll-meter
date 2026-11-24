# Scroll Meter privacy policy

Scroll Meter measures how far you scroll. That is all it does, and everything stays on your device.

## What it collects

- **The domain name** of sites you've chosen to measure (for example `reddit.com`).
- **How many pixels you scrolled** on each of those domains, per day and per hour of the day.
- **Daily records**: your fastest scrolling speed, your longest continuous scroll on one site
  (domain, duration, distance), and how much of your scrolling went back up.
- **Your settings** (units, daily limit, display toggles).

## What it never collects

- Full URLs, page titles, or browsing history
- Page content, text you type, or anything you read
- Personal information, accounts, or identifiers

## Where it goes

Nowhere. Data is kept in `chrome.storage.local` on your computer. Scroll Meter makes no network
requests, has no analytics, and has no server. The weekly card is drawn on your device and only
leaves it if you download or copy it and share it yourself.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your daily totals and settings on your device |
| `scripting` | Start measuring on the sites you pick |
| `activeTab` | Let the popup show whether the current site is measured |
| `alarms` | Reset the toolbar badge at midnight |
| Optional site access | Requested one site at a time, only for sites you turn on. "Measure every website" is opt-in. |

## Your control

- Turn any site off in Settings, or remove the extension's site access in Chrome.
- Export your data as JSON, or delete all of it, from Settings.
- Uninstalling the extension deletes all of its data.
