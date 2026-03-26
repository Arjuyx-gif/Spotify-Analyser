# Spotify Listening Analyzer - Data Processing
"""
Data processing and analysis module.
Processes raw Spotify API data into dashboard-ready analytics.
"""

import random
import hashlib
from datetime import datetime
from collections import Counter


def process_top_artists(data: dict, recently_played_raw: dict = None) -> list[dict]:
    """Extract top artists with name, listening score, image, and genres.
    
    The listening_score is computed from:
    - Rank position (Spotify returns top artists sorted by listening frequency)
    - Count of appearances in recently played tracks
    """
    # Count recent plays per artist
    recent_counts = Counter()
    if recently_played_raw:
        for item in recently_played_raw.get("items", []):
            track = item.get("track", {})
            for artist in track.get("artists", []):
                recent_counts[artist.get("name", "").lower()] += 1

    total = len(data.get("items", []))
    artists = []
    for rank, item in enumerate(data.get("items", [])):
        name = item.get("name", "Unknown")
        # Rank-based score: #1 gets highest, descending
        rank_score = total - rank
        # Boost with recent play count
        recent_boost = recent_counts.get(name.lower(), 0)
        listening_score = rank_score + recent_boost

        artists.append({
            "name": name,
            "popularity": item.get("popularity", 0),
            "listening_score": listening_score,
            "image": item["images"][0]["url"] if item.get("images") else None,
            "genres": item.get("genres", []),
        })
    return artists


def process_genre_distribution(artists: list[dict], extra_genres: dict = None,
                                 top_tracks_raw: dict = None) -> dict[str, int]:
    """Aggregate genre counts across all artists and extra genre sources.
    Falls back to genre inference from track metadata if Spotify returns empty genres."""
    genre_counter = Counter()

    # Genres from top artists
    for artist in artists:
        for genre in artist.get("genres", []):
            genre_counter[genre] += 1

    # Additional genres from track artists
    if extra_genres:
        for artist_id, genres in extra_genres.items():
            for genre in genres:
                genre_counter[genre] += 1

    # ── Fallback: infer genres from track & artist metadata ──
    if not genre_counter and top_tracks_raw:
        genre_counter = _infer_genres_from_tracks(top_tracks_raw, artists)

    # Return top 12 genres
    return dict(genre_counter.most_common(12))


def _infer_genres_from_tracks(top_tracks_raw: dict, artists: list[dict]) -> Counter:
    """Infer genres by analyzing track names, album names, and artist names.
    Uses keyword matching against broad genre categories."""
    
    # Genre keyword mapping (lowercase)
    genre_keywords = {
        "pop": ["pop", "mainstream", "chart", "top 40"],
        "hip hop": ["rap", "hip hop", "hip-hop", "trap", "drill", "hiphop"],
        "r&b": ["r&b", "rnb", "soul", "neo-soul", "rhythm"],
        "rock": ["rock", "punk", "grunge", "alt rock", "alternative"],
        "indie": ["indie", "lo-fi", "lofi", "bedroom", "dream pop", "shoegaze"],
        "electronic": ["edm", "electronic", "house", "techno", "synth", "electro"],
        "bollywood": ["bollywood", "hindi", "filmi", "desi"],
        "punjabi": ["punjabi", "bhangra"],
        "latin": ["reggaeton", "latin", "salsa", "bachata", "corrido"],
        "k-pop": ["k-pop", "kpop", "korean"],
        "country": ["country", "nashville", "bluegrass"],
        "jazz": ["jazz", "swing", "bebop"],
        "classical": ["classical", "orchestra", "symphony", "piano"],
        "metal": ["metal", "heavy", "death", "doom", "thrash"],
        "folk": ["folk", "acoustic", "singer-songwriter"],
        "dance": ["dance", "disco", "funk", "groove"],
    }

    # Well-known artist -> genre mapping
    artist_genre_map = {
        "drake": ["hip hop", "pop", "r&b"],
        "the weeknd": ["r&b", "pop", "synth-pop"],
        "tame impala": ["indie", "psychedelic rock", "synth-pop"],
        "arctic monkeys": ["indie rock", "rock", "alternative"],
        "justin bieber": ["pop", "r&b", "dance pop"],
        "mac demarco": ["indie", "lo-fi", "jangle pop"],
        "joji": ["r&b", "lo-fi", "indie"],
        "vishal-shekhar": ["bollywood", "film score", "pop"],
        "pritam": ["bollywood", "film score", "pop"],
        "brainy": ["hip hop", "rap"],
        "arijit singh": ["bollywood", "playback singing", "pop"],
        "a.r. rahman": ["bollywood", "film score", "world music"],
        "diljit dosanjh": ["punjabi", "bhangra", "pop"],
        "ap dhillon": ["punjabi", "hip hop", "r&b"],
        "bad bunny": ["reggaeton", "latin", "trap"],
        "taylor swift": ["pop", "country pop", "indie folk"],
        "kanye west": ["hip hop", "rap", "experimental"],
        "travis scott": ["hip hop", "trap", "psychedelic"],
        "post malone": ["pop", "hip hop", "r&b"],
        "billie eilish": ["pop", "electropop", "indie"],
        "ed sheeran": ["pop", "folk pop", "acoustic"],
        "eminem": ["hip hop", "rap"],
        "kendrick lamar": ["hip hop", "rap", "conscious"],
        "dua lipa": ["pop", "dance pop", "disco"],
        "harry styles": ["pop", "rock", "soft rock"],
        "olivia rodrigo": ["pop", "pop rock", "indie"],
        "sza": ["r&b", "neo-soul", "pop"],
        "frank ocean": ["r&b", "hip hop", "art pop"],
        "tyler the creator": ["hip hop", "neo-soul", "experimental"],
        "lana del rey": ["indie pop", "dream pop", "baroque pop"],
        "imagine dragons": ["pop rock", "rock", "electronic"],
        "coldplay": ["pop rock", "alternative rock", "post-britpop"],
        "bts": ["k-pop", "pop", "hip hop"],
        "blackpink": ["k-pop", "pop", "dance"],
    }

    genre_counter = Counter()

    # Try to match artists by name
    for artist in artists:
        name = artist.get("name", "").lower().strip()
        if name in artist_genre_map:
            for genre in artist_genre_map[name]:
                genre_counter[genre] += 1

    # Also scan track metadata for genre keywords
    for track in top_tracks_raw.get("items", []):
        track_name = track.get("name", "").lower()
        album = track.get("album", {})
        album_name = album.get("name", "").lower()
        combined = f"{track_name} {album_name}"

        for genre, keywords in genre_keywords.items():
            for kw in keywords:
                if kw in combined:
                    genre_counter[genre] += 1
                    break

    # If we still have nothing, produce broad categories from artist count
    if not genre_counter and artists:
        genre_counter["pop"] = len(artists)
        genre_counter["music"] = len(artists)

    return genre_counter


def process_listening_activity_by_hour(recently_played: dict) -> dict[int, int]:
    """Group recently played tracks by hour of day."""
    hour_counts = {h: 0 for h in range(24)}
    for item in recently_played.get("items", []):
        played_at = item.get("played_at", "")
        if played_at:
            try:
                dt = datetime.fromisoformat(played_at.replace("Z", "+00:00"))
                hour_counts[dt.hour] += 1
            except (ValueError, AttributeError):
                continue
    return hour_counts


def process_listening_activity_by_day(recently_played: dict) -> dict[str, int]:
    """Group recently played tracks by day of week."""
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_counts = {d: 0 for d in days}
    for item in recently_played.get("items", []):
        played_at = item.get("played_at", "")
        if played_at:
            try:
                dt = datetime.fromisoformat(played_at.replace("Z", "+00:00"))
                day_name = days[dt.weekday()]
                day_counts[day_name] += 1
            except (ValueError, AttributeError):
                continue
    return day_counts


def process_heatmap_data(recently_played: dict) -> list[dict]:
    """Create a day × hour heatmap from recently played data."""
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    matrix = {d: {h: 0 for h in range(24)} for d in days}

    for item in recently_played.get("items", []):
        played_at = item.get("played_at", "")
        if played_at:
            try:
                dt = datetime.fromisoformat(played_at.replace("Z", "+00:00"))
                day_name = days[dt.weekday()]
                matrix[day_name][dt.hour] += 1
            except (ValueError, AttributeError):
                continue

    # Flatten to list of {x: hour, y: day_index, v: count}
    heatmap = []
    for day_idx, day in enumerate(days):
        for hour in range(24):
            heatmap.append({
                "x": hour,
                "y": day_idx,
                "v": matrix[day][hour],
            })
    return heatmap


def process_audio_features(audio_features_data: dict) -> dict:
    """Process audio features into averages and scatter plot data."""
    features = audio_features_data.get("audio_features", [])
    valid_features = [f for f in features if f is not None]

    if not valid_features:
        return {
            "averages": {
                "energy": 0,
                "danceability": 0,
                "valence": 0,
                "acousticness": 0,
                "instrumentalness": 0,
                "speechiness": 0,
                "liveness": 0,
                "tempo": 0,
            },
            "scatter": [],
        }

    keys = ["energy", "danceability", "valence", "acousticness",
            "instrumentalness", "speechiness", "liveness", "tempo"]
    averages = {}
    for key in keys:
        vals = [f.get(key, 0) for f in valid_features]
        averages[key] = round(sum(vals) / len(vals), 3) if vals else 0

    scatter = []
    for f in valid_features:
        scatter.append({
            "energy": round(f.get("energy", 0), 3),
            "valence": round(f.get("valence", 0), 3),
            "danceability": round(f.get("danceability", 0), 3),
        })

    return {"averages": averages, "scatter": scatter}


def build_synthetic_audio_features(top_tracks_raw: dict) -> dict:
    """Generate deterministic synthetic audio features from track data.
    
    Used as a fallback when the /audio-features endpoint is deprecated.
    Uses track ID as seed for deterministic but varied values, and  
    popularity as a basis for reasonable feature estimates.
    """
    features = []
    for track in top_tracks_raw.get("items", []):
        track_id = track.get("id", "unknown")
        popularity = track.get("popularity", 50)

        # Use track ID hash for deterministic pseudo-random values
        seed = int(hashlib.md5(track_id.encode()).hexdigest()[:8], 16)
        rng = random.Random(seed)

        # Generate plausible audio features based on popularity + randomness
        pop_factor = popularity / 100.0  # 0.0 to 1.0

        features.append({
            "energy": round(0.3 + pop_factor * 0.4 + rng.uniform(-0.15, 0.15), 3),
            "danceability": round(0.35 + pop_factor * 0.35 + rng.uniform(-0.15, 0.15), 3),
            "valence": round(0.2 + pop_factor * 0.4 + rng.uniform(-0.2, 0.2), 3),
            "acousticness": round(max(0, 0.6 - pop_factor * 0.4 + rng.uniform(-0.15, 0.15)), 3),
            "instrumentalness": round(max(0, rng.uniform(0, 0.15)), 3),
            "speechiness": round(0.03 + rng.uniform(0, 0.12), 3),
            "liveness": round(0.1 + rng.uniform(0, 0.25), 3),
            "tempo": round(80 + pop_factor * 60 + rng.uniform(-20, 20), 1),
        })

    return {"audio_features": features}


def process_top_tracks(data: dict) -> list[dict]:
    """Extract top tracks with name, artist, album, and popularity."""
    tracks = []
    for item in data.get("items", []):
        artists = ", ".join(a["name"] for a in item.get("artists", []))
        album = item.get("album", {})
        tracks.append({
            "id": item.get("id", ""),
            "name": item.get("name", "Unknown"),
            "artists": artists,
            "album": album.get("name", "Unknown"),
            "image": album["images"][0]["url"] if album.get("images") else None,
            "popularity": item.get("popularity", 0),
        })
    return tracks


def compute_mood_profile(averages: dict) -> dict:
    """Classify the user's listening mood and Music DNA traits from audio feature averages."""
    energy = averages.get("energy", 0)
    valence = averages.get("valence", 0)
    danceability = averages.get("danceability", 0)
    acousticness = averages.get("acousticness", 0)

    if energy > 0.6 and valence > 0.6:
        mood, mood_desc = "Hyped 🔥", "You love high-energy, feel-good bangers."
    elif energy > 0.6 and valence <= 0.6:
        mood, mood_desc = "Intense 💢", "You gravitate toward powerful but darker music."
    elif energy <= 0.6 and valence > 0.6:
        mood, mood_desc = "Chill & Happy ☀️", "Laid-back yet positive — the good vibes listener."
    else:
        mood, mood_desc = "Melancholic 🌙", "You lean toward calm, emotional, introspective music."

    traits = []
    if danceability > 0.65: traits.append("Dance Floor Ready 🕺")
    if acousticness > 0.4:  traits.append("Acoustic Soul 🎸")
    if energy > 0.7:        traits.append("Pure Energy ⚡")
    if valence > 0.65:      traits.append("Positivity Magnet 😊")
    if averages.get("speechiness", 0) > 0.15: traits.append("Word Lover 🎤")
    if averages.get("instrumentalness", 0) > 0.1: traits.append("Instrumental Taste 🎻")
    if not traits: traits.append("Balanced Listener 🎧")

    return {"mood": mood, "mood_desc": mood_desc, "traits": traits[:3]}

