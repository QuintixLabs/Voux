# Setup

How to get Voux running for development or contributing.

## Requirements

- git
- Node.js `22`
- npm (should come with Node)
- fnm

### Windows
- Install [Git](https://git-scm.com/install/windows)
- Install [Node.js](https://nodejs.org/en/download)
- Install [fnm](https://github.com/Schniz/fnm)

#### I recommend to use [scoop](https://scoop.sh/) to install all of these on Windows.

```powershell
scoop install nodejs fnm git
```


### macOS (Homebrew)
```bash
brew update
brew install node fnm git
```

### Linux (Arch)
```bash
sudo pacman -S nodejs npm fnm git
```

## Building / Running

Clone the repo:
```bash
git clone https://github.com/QuintixLabs/Voux.git
cd Voux
```
Use **Node 22**:
```bash
fnm install 22
fnm use 22
node -v
```

Install dependencies:
```bash
npm install
```

Create your env:
```bash
cp .env.example .env
```
> [!WARNING]  
> Set `ADMIN_USERNAME` + `ADMIN_PASSWORD` (don't leave the example values). If you are developing, set `DEV_MODE=development` in `.env` so **HTML/JS/CSS** are served with no cache and changes show on reload.

Start dev server:
```bash
npm run dev
```
API and admin run at : http://localhost:8787.


Data is stored in `data/counters.db`. Back it up if you need the data.
