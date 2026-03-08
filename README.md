# 🎵 Spotify Listening Analyzer

A full-stack web application that analyzes your Spotify listening history and displays beautiful interactive visualizations of your music preferences.

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green?logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)
![Chart.js](https://img.shields.io/badge/Chart.js-4.4-orange?logo=chartdotjs)

## ✨ Features

- **Spotify OAuth Login** — Secure authentication with your Spotify account
- **Top Artists & Tracks** — See your most listened artists and songs
- **Genre Analysis** — Discover your musical palette with genre distribution charts
- **Listening Patterns** — Hourly and daily listening activity heatmaps
- **Audio Features** — Energy, valence, danceability analysis with interactive scatter plots
- **7 Interactive Charts** — Bar, doughnut, line, heatmap, scatter, radar, and day-of-week visualizations
- **Fully Containerized** — Run anywhere with Docker

## 🗂️ Project Structure

```
spotify-analyzer/
├── backend/
│   ├── __init__.py
│   ├── config.py            # Environment configuration
│   ├── main.py              # FastAPI app & routes
│   └── spotify_client.py    # Spotify API wrapper
├── data_processing/
│   ├── __init__.py
│   └── analyzer.py          # Data analysis logic
├── frontend/
│   ├── index.html           # Login page
│   ├── dashboard.html       # Dashboard page
│   ├── css/style.css        # Premium dark theme
│   └── js/
│       ├── auth.js           # Auth error handling
│       └── dashboard.js      # Chart.js visualizations
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Docker** (recommended) or **Python 3.11+**
- A **Spotify Developer Account**

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set the **Redirect URI** to: `http://localhost:8000/api/callback`
4. Note your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cd spotify-analyzer
cp .env.example .env
```

Edit `.env` with your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_actual_client_id
SPOTIFY_CLIENT_SECRET=your_actual_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:8000/api/callback
SECRET_KEY=any-random-secret-string
```

### 3a. Run with Docker (Recommended)

```bash
docker-compose up --build
```

### 3b. Run Locally (Without Docker)

```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Open the App

Visit **http://localhost:8000** in your browser and click **Continue with Spotify**.

## 📊 Dashboard Visualizations

| Chart | Description |
|-------|-------------|
| 🎤 **Top Artists** | Horizontal bar chart of your most listened artists |
| 🎸 **Genre Distribution** | Doughnut chart of genre diversity |
| 📈 **Listening Activity** | Area chart of tracks played by hour |
| 🗓️ **Heatmap** | Day × Hour listening heatmap |
| ⚡ **Energy vs Valence** | Scatter plot colored by danceability |
| 🎛️ **Audio Profile** | Radar chart of average audio features |
| 📅 **By Day** | Bar chart of listening by day of week |

## 🛠️ Technologies

- **Backend**: Python, FastAPI, httpx
- **Frontend**: HTML5, CSS3, JavaScript, Chart.js
- **Auth**: Spotify OAuth 2.0 (Authorization Code Flow)
- **Containerization**: Docker, docker-compose

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Login page |
| `GET` | `/dashboard` | Dashboard page (requires auth) |
| `GET` | `/api/login` | Redirects to Spotify auth |
| `GET` | `/api/callback` | OAuth callback handler |
| `GET` | `/api/logout` | Clears session and redirects |
| `GET` | `/api/dashboard-data` | Returns all analytics as JSON |

## 📄 License

MIT License — feel free to use, modify, and distribute.
