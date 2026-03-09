"""
FastAPI main application.
Handles routing, Spotify OAuth flow, and serves the frontend.
"""

import os
import logging
import traceback
from collections import Counter
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from backend.config import SECRET_KEY
from backend import spotify_client
from data_processing import analyzer

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spotify-analyzer")

# Resolve paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = FastAPI(title="Spotify Listening Analyzer", version="1.0.0")

# Session middleware for storing tokens
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

# Mount static assets
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")


# ─── Page Routes ───────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
async def login_page():
    """Serve the login page."""
    with open(os.path.join(FRONTEND_DIR, "index.html"), "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    """Serve the dashboard page."""
    token = request.session.get("access_token")
    if not token:
        return RedirectResponse(url="/")
    with open(os.path.join(FRONTEND_DIR, "dashboard.html"), "r") as f:
        return HTMLResponse(content=f.read())


# ─── Auth Routes ───────────────────────────────────────────────


@app.get("/api/login")
async def login():
    """Redirect user to Spotify authorization page."""
    auth_url = spotify_client.get_auth_url()
    return RedirectResponse(url=auth_url)


@app.get("/api/callback")
async def callback(request: Request, code: str = None, error: str = None):
    """Handle Spotify OAuth callback."""
    if error:
        return RedirectResponse(url=f"/?error={error}")
    if not code:
        return RedirectResponse(url="/?error=no_code")

    try:
        token_data = await spotify_client.exchange_code(code)
        request.session["access_token"] = token_data["access_token"]
        request.session["refresh_token"] = token_data.get("refresh_token", "")
        return RedirectResponse(url="/dashboard")
    except Exception as e:
        logger.error(f"Token exchange failed: {e}")
        return RedirectResponse(url=f"/?error=token_exchange_failed")


@app.get("/api/logout")
async def logout(request: Request):
    """Clear session and redirect to login."""
    request.session.clear()
    return RedirectResponse(url="/")


# ─── Data API Routes ──────────────────────────────────────────


async def _safe_fetch(label: str, coro, default=None):
    """Safely fetch data; return default on failure instead of crashing."""
    try:
        return await coro
    except Exception as e:
        logger.error(f"[{label}] fetch failed: {e}")
        return default


@app.get("/api/dashboard-data")
async def dashboard_data(request: Request):
    """Fetch all Spotify data, process it, and return dashboard payload."""
    token = request.session.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        logger.info("Fetching Spotify data...")

        # Fetch data from Spotify API (each call is resilient)
        top_artists_raw = await _safe_fetch(
            "top_artists", spotify_client.get_top_artists(token, limit=20), {"items": []})
        top_tracks_raw = await _safe_fetch(
            "top_tracks", spotify_client.get_top_tracks(token, limit=50), {"items": []})
        recently_played_raw = await _safe_fetch(
            "recently_played", spotify_client.get_recently_played(token, limit=50), {"items": []})
        user_profile = await _safe_fetch(
            "user_profile", spotify_client.get_user_profile(token), {})

        logger.info(f"Fetched: {len(top_artists_raw.get('items', []))} artists, "
                     f"{len(top_tracks_raw.get('items', []))} tracks, "
                     f"{len(recently_played_raw.get('items', []))} recent plays")

        # ── Get FULL artist details (with genres) ──
        # Always fetch via /artists endpoint — it has the most complete genre data
        artist_ids = [a["id"] for a in top_artists_raw.get("items", []) if a.get("id")]
        all_genre_counts = Counter()

        if artist_ids:
            full_artists_raw = await _safe_fetch(
                "full_artists", spotify_client.get_artists(token, artist_ids), {"artists": []})
            full_artists_list = (full_artists_raw or {}).get("artists", []) or []

            # ALWAYS override top_artists_raw genres with full artist data
            artist_genre_map = {}
            for fa in full_artists_list:
                if fa and fa.get("id"):
                    genres = fa.get("genres", [])
                    artist_genre_map[fa["id"]] = genres
                    logger.info(f"Artist '{fa.get('name')}': genres = {genres}")
                    for g in genres:
                        all_genre_counts[g] += 1

            # Merge into top_artists_raw items (override always)
            for item in top_artists_raw.get("items", []):
                item_id = item.get("id", "")
                if item_id in artist_genre_map:
                    item["genres"] = artist_genre_map[item_id]

            logger.info(f"Full artist genres collected from {len(artist_genre_map)} artists. "
                         f"Total unique genres: {len(all_genre_counts)}")

        # ── Also collect genres from track artists ──
        track_artist_ids = set()
        for track in top_tracks_raw.get("items", []):
            for artist in track.get("artists", []):
                if artist.get("id"):
                    track_artist_ids.add(artist["id"])
        extra_artist_ids = list(track_artist_ids - set(artist_ids))[:50]
        extra_genres = {}
        if extra_artist_ids:
            extra_artists_raw = await _safe_fetch(
                "extra_artists", spotify_client.get_artists(token, extra_artist_ids), {"artists": []})
            for fa in (extra_artists_raw or {}).get("artists", []) or []:
                if fa and fa.get("genres"):
                    extra_genres[fa["id"]] = fa["genres"]
                    for g in fa["genres"]:
                        all_genre_counts[g] += 1
            logger.info(f"Extra artist genres: found genres for {len(extra_genres)} additional artists")

        logger.info(f"Total genre counts before processing: {dict(all_genre_counts.most_common(15))}")


        # ── Audio features (may be deprecated for new apps) ──
        track_ids = [t["id"] for t in top_tracks_raw.get("items", []) if t.get("id")]
        audio_features_raw = {"audio_features": []}
        if track_ids:
            logger.info(f"Fetching audio features for {len(track_ids)} tracks...")
            audio_features_raw = await _safe_fetch(
                "audio_features", spotify_client.get_audio_features(token, track_ids),
                {"audio_features": []})
            af_list = (audio_features_raw or {}).get("audio_features", [])
            non_null = [f for f in af_list if f is not None]
            logger.info(f"Audio features received: {len(af_list)} items, non-null: {len(non_null)}")

            # If audio features endpoint returned nothing (deprecated), build synthetic data
            if not non_null:
                logger.warning("Audio features endpoint returned no data (likely deprecated). Using synthetic data from track popularity.")
                audio_features_raw = analyzer.build_synthetic_audio_features(top_tracks_raw)

        # Process data
        top_artists = analyzer.process_top_artists(top_artists_raw, recently_played_raw)
        top_tracks = analyzer.process_top_tracks(top_tracks_raw)
        genre_distribution = analyzer.process_genre_distribution(top_artists, extra_genres, top_tracks_raw)
        activity_by_hour = analyzer.process_listening_activity_by_hour(recently_played_raw)
        activity_by_day = analyzer.process_listening_activity_by_day(recently_played_raw)
        heatmap = analyzer.process_heatmap_data(recently_played_raw)
        audio_features = analyzer.process_audio_features(audio_features_raw)

        logger.info(f"Genre distribution: {genre_distribution}")
        logger.info(f"Audio averages: {audio_features.get('averages', {})}")
        logger.info(f"Top artists processed (first 3): {[{'name': a['name'], 'popularity': a['popularity'], 'genres': a['genres']} for a in top_artists[:3]]}")

        # Handle user image safely
        user_image = None
        if user_profile.get("images") and len(user_profile["images"]) > 0:
            user_image = user_profile["images"][0].get("url")

        logger.info("Dashboard data processed successfully!")

        return JSONResponse(content={
            "user": {
                "name": user_profile.get("display_name", "User"),
                "image": user_image,
            },
            "top_artists": top_artists[:10],
            "top_tracks": top_tracks[:10],
            "genre_distribution": genre_distribution,
            "activity_by_hour": activity_by_hour,
            "activity_by_day": activity_by_day,
            "heatmap": heatmap,
            "audio_features": audio_features,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dashboard data error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")


# ─── Run ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    from backend.config import APP_HOST, APP_PORT
    uvicorn.run("backend.main:app", host=APP_HOST, port=APP_PORT, reload=True)
