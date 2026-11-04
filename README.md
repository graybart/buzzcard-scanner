# Check-in

One small web app for keyboard-emulating ID scanners, with two modes you can switch between from the admin page:

- **Attendance:** roster-based check-in. Shows names, marks late arrivals, lets people without their ID type their name, and copies to Google Sheets.
- **Door counter:** anonymous tap counter. Accepts any 9-digit ID, supports fastpass and blacklist lists, tracks how many people are inside with an exit-door −1 page, and has a public live count.

It's one Node container with no dependencies. Data is kept in the `scanner-data` Docker volume.

## Start and stop

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine (Linux). Run the start script from a terminal in this folder:

```bash
./start.sh                         # macOS / Linux
start.bat                          # Windows (Command Prompt or PowerShell)
```

Options (the same for both scripts):

| Option                | What it does                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `--password PASSWORD` | Sets the admin password. It's saved, so later starts without the flag keep it. Changing it logs everyone out. |
| `--port PORT`         | Uses another port. The default is 8080.                                                            |
| `--no-open`           | Doesn't open the scanner page in a browser.                                                         |
| `--help`              | Shows these options.                                                                                |

```bash
./start.sh --password hunter2 --port 8081
```

The first time, the password is `admin`. The script starts Docker if it isn't running, builds and starts the app, opens the scanner screen, and prints the links for other devices. The app keeps running in the background and starts again whenever Docker starts. To turn it off, run `./stop.sh` or `stop.bat`. Your data is kept.

If the old `checkin` or `id-scanner` app is still running on port 8080, stop it first (its own stop script), or start this one with `--port 8081`.

On Windows, if your password contains `&`, `^`, `%`, `|`, `<` or `>`, wrap it in double quotes: `start.bat --password "a&b"`.

## Pages

| Page        | Who                     | What                                                                    |
| ----------- | ----------------------- | ----------------------------------------------------------------------- |
| `/`         | Scanner PC (no login)   | The scanner screen. It follows the current mode live. Click once to enable sound, then press F11 for fullscreen. |
| `/admin`    | Login                   | The mode toggle, check-ins, door counter, sessions, and roster.         |
| `/checkout` | Login (phone at exit)   | The big −1 button for when someone leaves, with Undo. Works in Door counter mode. |
| `/count`    | Anyone                  | Live count with no IDs. Shows inside/total in Door mode and checked-in in Attendance. |
| `/fastpass` | Login                   | Bulk fastpass import from a spreadsheet paste.                          |

Keep the scanner tab focused, because the scanner "types" into whichever window is active.

## Modes and sessions

All scans go to the **active session**, and every session has a mode. The **Attendance / Door counter** toggle at the top of the admin page changes the active session's mode immediately, even mid-event. The scanner screen switches without reloading, so sound stays on. With no active session, the toggle picks the mode for the next session.

A session keeps whatever was recorded in either mode. If you switch mid-session, the attendance check-ins and the door taps are both kept, and you can see each on its own tab. You can also change a session's mode, start time, or active status from the Sessions tab.

The two modes don't share features. The roster only applies in Attendance mode, and fastpass, blacklist and the inside count only apply in Door counter mode.

### Attendance

1. **Roster:** paste the Name column into the left box and the ID column into the right box, then click *Add / update*. If you paste both columns into the left box, the app splits them for you. Header rows are skipped.
2. **Sessions:** name a session, choose *Attendance*, and start it. You can set a start time; anyone who checks in after it is marked late.
3. **Scanner screen:**
   - **Green + ding:** checked in
   - **Amber + ding + "LATE ENTRY":** checked in after the start time
   - **Amber + double beep:** already checked in this session (only the first tap is kept)
   - **Red + buzz:** ID isn't on the roster, or no session is active (nothing is recorded)
   - People without their ID can type their name and pick it from the list.
4. **Check-ins tab:** pick a session, then use *Copy for Google Sheets* to get two columns: name and check-in time.

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
- **Fastpass** and **Blacklist** are on the Door counter tab and are kept across sessions. An ID can't be on both.
- **New door session** (Door counter tab) starts a fresh active door session. The old one stays in the Sessions tab.
- **Export CSV** downloads the selected session's full door log.

## Notes

- The password is sent over plain HTTP, so others on the same network could read it. It keeps casual users out, but don't reuse a real password.
- The scanner page and `/count` need no login. The scanner's name autocomplete loads roster names (never ID numbers) without a login, as the old checkin app did.
- Removing someone from the roster keeps their past check-ins.
- Back up your data: `docker cp scanner:/data/db.json ./backup.json`
- Run manually: `docker build -t scanner . && docker run -d --name scanner --restart unless-stopped -p 8080:8080 -v scanner-data:/data -e ADMIN_PASSWORD=yourpassword scanner`
