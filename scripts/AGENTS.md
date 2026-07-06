# Scripts

Docker-only start/stop scripts. All scripts operate on an image and container both named `pm-app`.

- `start.sh` / `start.bat` - build the image from the repo root Dockerfile, replace any running container, run detached with `--env-file .env`, port 8000, and the named volume `pm-data` mounted at `/data` (SQLite database lives there, so board data survives rebuilds)
- `stop.sh` / `stop.bat` - stop and remove the container (the `pm-data` volume is left intact)

`.sh` scripts cover Mac and Linux; `.bat` covers Windows. App is served at http://localhost:8000.
