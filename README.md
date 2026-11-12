# Check-in

One small web app for keyboard-emulating ID scanners. Every session is one of two types, chosen when you start it:

- **Attendance:** roster-based check-in. Shows names, marks late arrivals, lets people without their ID type their name, and copies to Google Sheets.
- **Door counter:** anonymous tap counter. Accepts any 9-digit ID, supports fastpass and blacklist lists, tracks how many people are inside with an exit-door −1 page, and has a public live count.

It runs as one Docker container: a small Node server with no dependencies, plus a React frontend built with [Base UI](https://base-ui.com/) and styled to [Material 3](https://m3.material.io/) with the Delta Chi brand colors and type. Data is kept in the `scanner-data` Docker volume.

## Start and stop

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine (Linux). Run the start script from a terminal in this folder. The first time, create your admin account:

```bash
./start.sh --user grady --password yourpassword     # macOS / Linux
start.bat --user grady --password yourpassword      # Windows (Command Prompt or PowerShell)
```

After that, `./start.sh` (or `start.bat`) on its own is enough; accounts are kept.

Options (the same for both scripts):

| Option                               | What it does                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `--user NAME --password PASSWORD`    | Creates an admin account, or resets that account's password (which signs it out everywhere). Required on the first run. |
| `--port PORT`                        | Uses another port. The default is 8080.                                                            |
| `--no-open`                          | Doesn't open the scanner page in a browser.                                                         |
| `--help`                             | Shows these options.                                                                                |

Usernames can use letters, numbers, dots, dashes and underscores, and they aren't case-sensitive. Passwords need at least 6 characters. The script's account is applied once each time you run it, so Docker restarting the app doesn't undo a password you changed on the Accounts page.

The script starts Docker if it isn't running, builds and starts the app, opens the scanner screen, and prints the links for other devices. The first build downloads the frontend's build tools, so it takes a minute or two and needs internet. The app keeps running in the background and starts again whenever Docker starts. To turn it off, run `./stop.sh` or `stop.bat`. Your data is kept.

If the old `checkin` or `id-scanner` app is still running on port 8080, stop it first (its own stop script), or start this one with `--port 8081`.

On Windows, if your password contains `&`, `^`, `%`, `|`, `<` or `>`, wrap it in double quotes: `start.bat --user grady --password "a&b"`.

## Accounts

There are two roles:

- **Admin:** everything. Start and end sessions, open past sessions, manage the roster, fastpass and blacklist, and add or remove accounts.
- **Door staff:** the active session only. In an attendance session they can check people in by name (they see names, not ID numbers). In a door session they see the counts and can use the exit-door page.

Admins manage accounts from the menu next to **New session** → **Accounts**: add an account, change its role, reset its password, or delete it. There always has to be at least one admin.

## Pages

| Page        | Who                         | What                                                                    |
| ----------- | --------------------------- | ----------------------------------------------------------------------- |
| `/`         | Scanner PC (no login)       | The scanner screen. It follows the active session's type live. Click once to enable sound, then press F11 for fullscreen. |
| `/admin`    | Any account                 | The active session. Admins also get New session and the menu (End session, All sessions, Roster, Accounts). |
| `/checkout` | Any account (phone at exit) | The big −1 button for when someone leaves, with Undo. Works during door sessions. |
| `/count`    | Anyone                      | Live count with no IDs. Shows inside/total for door sessions and checked-in for attendance. |
| `/fastpass` | Admin                       | Bulk fastpass import from a spreadsheet paste.                          |

Keep the scanner tab focused, because the scanner "types" into whichever window is active.

## Sessions

All scans go to the **active session**. To start one, click **New session** at the top of the admin page and pick its type; the type can't be changed later. Starting a session makes it the active one. **End session** in the menu stops recording without starting another.

The header shows the active session's name and count. The page below it shows that session: the check-in list for attendance, or the counters and activity for a door session. **All sessions** (in the menu) lists every session. Open one to look at it or fix its check-ins, make it active again, set its start time, or delete it.

### Attendance

1. **Roster** (menu → Roster): paste the Name column into the left box and the ID column into the right box, then click *Add or update roster*. If you paste both columns into the left box, the app splits them for you. Header rows are skipped.
2. **New session:** choose *Attendance*. You can set a start time; anyone who checks in after it is marked late.
3. **Scanner screen:**
   - **Green + ding:** checked in
   - **Buff + ding + "Late entry":** checked in after the start time
   - **Buff + double beep:** already checked in this session (only the first tap is kept)
   - **Red + buzz:** ID isn't on the roster, or no session is active (nothing is recorded)
   - People without their ID can type their name and pick it from the list.
4. **Admin page:** the **Check someone in** box above the list checks in anyone on the roster by name. On a past session, set the check-in time first. Check-ins added this way show who added them.
5. **Copy for Google Sheets** gives two columns: name and check-in time.

### Door counter

| Tap                                               | Screen                    | Sound        | Counted                                          |
| ------------------------------------------------- | ------------------------- | ------------ | ------------------------------------------------ |
| New 9-digit ID                                    | Green                     | Ding         | Yes                                              |
| ID on the fastpass list                           | Blue                      | Rising chime | Yes (logged as Fastpass)                         |
| Enter on its own, or the "Add Non-ID Scan" button | Green                     | Ding         | Yes (logged as Non-ID; never a repeat)           |
| Anything that isn't exactly 9 digits              | Red, "Invalid ID"         | None         | No (not logged)                                  |
| ID already counted this session                   | Yellow, "Welcome back"    | None         | Not in Total, but +1 Inside (logged as Re-entry) |
| Blacklisted ID                                    | Red                       | None         | No (logged as Rejected)                          |
| No active session                                 | Red                       | Buzz         | No                                               |

- **Total** is unique IDs counted this session plus every non-ID entry. Blacklisting an ID after it was counted lowers the total; removing it from the blacklist raises it again.
- **Inside** is every entry minus check-outs from `/checkout`. Blacklisting someone after they came in doesn't change Inside.
- **Fastpass** and **Blacklist** are on the door session page and are kept across sessions. An ID can't be on both.
- **Export CSV** downloads the session's full door log.

## Frontend

The pages live in `web/` (React + TypeScript, built with Vite). The Docker build compiles them, so you don't need Node installed to run the app.

- **Look:** Material 3 color roles built on the brand palette: red `#ca3d31` is primary, buff `#f1bd19` is the secondary container (tonal buttons, selected segments, late/repeat flashes), and navy feeds the tertiary colors. Tokens are in `web/src/styles/tokens.css`.
- **Type:** Bitter for headings (a free stand-in for the brand's Clavo/Chronicle) and Montserrat for everything else (the brand's webfont). Both are bundled, so the app works without internet.
- **Components:** `web/src/ui/` wraps Base UI parts (Menu, Dialog, Combobox, Select, Toggle Group, Alert Dialog, Toast, Checkbox, Radio, Field) in Material 3 styles. Icons are Material Symbols, copied into `web/src/ui/icons.ts`.
- **Working on it:** run the server with `PUBLIC_DIR=web/dist node server.js` after `cd web && npm install && npm run build`, or use `npm run dev` in `web/` for hot reload (it proxies the API to port 8080; open `/admin.html`, `/scanner.html` and so on). Running the server outside Docker needs an account too: `ADMIN_USER=you ADMIN_PASSWORD=yourpassword PUBLIC_DIR=web/dist node server.js`.

## Notes

- Passwords are stored hashed (scrypt), but logins are sent over plain HTTP, so others on the same network could read them. They keep casual users out; don't reuse a real password.
- The scanner page and `/count` need no login. The scanner's name autocomplete loads roster names (never ID numbers) without a login, as the old checkin app did.
- Removing someone from the roster keeps their past check-ins.
- Back up your data: `docker cp scanner:/data/db.json ./backup.json`
- Run manually: `docker build -t scanner . && docker run -d --name scanner --restart unless-stopped -p 8080:8080 -v scanner-data:/data -e ADMIN_USER=grady -e ADMIN_PASSWORD=yourpassword scanner`
