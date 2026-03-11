# Spotify API Client - Handles OAuth and data fetching
"""
Spotify Web API client wrapper.
Handles authentication token exchange and data fetching from Spotify endpoints.
"""

import logging
import httpx
from urllib.parse import urlencode
from backend.config import (
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    SPOTIFY_REDIRECT_URI,
    SPOTIFY_AUTH_URL,
    SPOTIFY_TOKEN_URL,
    SPOTIFY_API_BASE,
    SPOTIFY_SCOPES,
)

logger = logging.getLogger("spotify-analyzer")


def get_auth_url() -> str:
    """Build and return the Spotify authorization URL."""
    params = {
        "client_id": SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": SPOTIFY_SCOPES,
        "show_dialog": "true",
    }
    return f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Exchange authorization code for access and refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": SPOTIFY_REDIRECT_URI,
                "client_id": SPOTIFY_CLIENT_ID,
                "client_secret": SPOTIFY_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        return response.json()


async def _get(token: str, endpoint: str, params: dict = None) -> dict:
    """Make an authenticated GET request to the Spotify API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SPOTIFY_API_BASE}{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {},
        )
        if response.status_code == 403:
            logger.warning(f"403 Forbidden for {endpoint} — endpoint may be restricted/deprecated")
            return None
        response.raise_for_status()
        return response.json()


async def get_top_artists(token: str, time_range: str = "medium_term", limit: int = 20) -> dict:
    """Fetch the user's top artists."""
    return await _get(token, "/me/top/artists", {
        "time_range": time_range,
        "limit": limit,
    })


async def get_top_tracks(token: str, time_range: str = "medium_term", limit: int = 50) -> dict:
    """Fetch the user's top tracks."""
    return await _get(token, "/me/top/tracks", {
        "time_range": time_range,
        "limit": limit,
    })


async def get_recently_played(token: str, limit: int = 50) -> dict:
    """Fetch the user's recently played tracks."""
    return await _get(token, "/me/player/recently-played", {
        "limit": limit,
    })


async def get_audio_features(token: str, track_ids: list[str]) -> dict:
    """Fetch audio features for a list of track IDs.
    Note: This endpoint was deprecated for new apps in Nov 2024.
    Returns None if forbidden (403)."""
    ids_str = ",".join(track_ids[:100])
    result = await _get(token, "/audio-features", {"ids": ids_str})
    return result or {"audio_features": []}


async def get_artists(token: str, artist_ids: list[str]) -> dict:
    """Fetch full artist details (including genres) for a list of artist IDs."""
    ids_str = ",".join(artist_ids[:50])
    result = await _get(token, "/artists", {"ids": ids_str})
    return result or {"artists": []}


async def get_user_profile(token: str) -> dict:
    """Fetch the current user's profile."""
    return await _get(token, "/me")
