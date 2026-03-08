"""
Configuration module for Spotify Listening Analyzer.
Loads environment variables and defines application settings.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Spotify API Configuration
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "your_client_id_here")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "your_client_secret_here")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/api/callback")

# Spotify API Endpoints
SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"

# OAuth Scopes
SPOTIFY_SCOPES = "user-top-read user-read-recently-played"

# Application Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-in-production")
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
