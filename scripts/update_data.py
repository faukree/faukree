
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

PLAYER_ID = "924159299"
BASE = "https://api.opendota.com/api"
OUT = Path("data/stats.json")

START_MMR = 5043
MMR_PER_MATCH = 25
RANKED_LOBBY = 7
MATCH_HISTORY_LIMIT = 100
DISPLAY_MATCHES = 20
MAX_SAVED_MATCH_IDS = 5000

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Faukree-Dota-Tracker/1.0"})


def get(path, params=None):
    response = SESSION.get(BASE + path, params=params, timeout=35)
    response.raise_for_status()
    return response.json()


def hero_icon(hero):
    name = hero.get("name", "").replace("npc_dota_hero_", "")
    return (
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/"
        f"dota_react/heroes/{name}.png"
    )


def hero_score(games, wins):
    if games <= 0:
        return 50.0

    winrate = wins / games * 100
    confidence = games / (games + 20)

    return 50 + (winrate - 50) * confidence


def match_won(match):
    radiant_win = match.get("radiant_win")
    player_slot = match.get("player_slot")

    if radiant_win is None or player_slot is None:
        return None

    return bool(radiant_win) == (int(player_slot) < 128)


def main():
    # Read previously saved data.
    old_data = {}

    if OUT.exists():
        try:
            old_data = json.loads(OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            old_data = {}

    # Get profile and Ranked matches only.
    profile_data = get(f"/players/{PLAYER_ID}")

    matches = get(
        f"/players/{PLAYER_ID}/matches",
        {
            "limit": MATCH_HISTORY_LIMIT,
            "lobby_type": RANKED_LOBBY,
        },
    )

    heroes = get("/constants/heroes")
    hero_by_id = {int(key): value for key, value in heroes.items()}

    saved_ids = old_data.get("processed_match_ids")

    if saved_ids is None:
        # One-time migration:
        # The known current MMR is 5043.
        # Existing matches, including match 9067849694,
        # must not be counted again.
        mmr = int(old_data.get("mmr", START_MMR))

        processed_ids = {
            str(match["match_id"])
            for match in matches
            if match.get("match_id") is not None
        }

        print(
            f"Initial MMR set to {mmr}. "
            "Existing Ranked matches marked as processed."
        )

    else:
        mmr = int(old_data.get("mmr", START_MMR))
        processed_ids = {str(match_id) for match_id in saved_ids}

        # Find only matches that have not been processed before.
        new_matches = [
            match
            for match in matches
            if match.get("match_id") is not None
            and str(match["match_id"]) not in processed_ids
        ]

        # Process from oldest to newest.
        new_matches.sort(key=lambda match: match.get("start_time", 0))

        for match in new_matches:
            result = match_won(match)

            if result is None:
                print(
                    f"Could not determine result for match "
                    f"{match.get('match_id')}. Will retry later."
                )
                continue

            if result:
                mmr += MMR_PER_MATCH
                print(f"Ranked win: +{MMR_PER_MATCH} MMR")
            else:
                mmr -= MMR_PER_MATCH
                print(f"Ranked loss: -{MMR_PER_MATCH} MMR")

            processed_ids.add(str(match["match_id"]))

    # Keep the saved list within a reasonable size.
    processed_ids = set(
        sorted(processed_ids, key=int)[-MAX_SAVED_MATCH_IDS:]
    )

    # Enrich the latest 20 Ranked matches for the website.
    enriched = []

    for match in matches[:DISPLAY_MATCHES]:
        match_id = match["match_id"]

        try:
            detail = get(f"/matches/{match_id}")
            players = detail.get("players", [])

            me = next(
                (
                    player
                    for player in players
                    if str(player.get("account_id")) == PLAYER_ID
                ),
                None,
            )

            if me is None:
                me = next(
                    (
                        player
                        for player in players
                        if player.get("player_slot")
                        == match.get("player_slot")
                    ),
                    {},
                )

            hero_id = me.get("hero_id", match.get("hero_id"))
            hero = hero_by_id.get(int(hero_id or 0), {})

            radiant_win = detail.get("radiant_win")
            slot = me.get("player_slot", match.get("player_slot"))

            if radiant_win is not None and slot is not None:
                win = bool(radiant_win) == (int(slot) < 128)
            else:
                win = match_won(match)

            enriched.append(
                {
                    "match_id": match_id,
                    "hero_id": hero_id,
                    "hero_name": hero.get(
                        "localized_name",
                        "Unknown",
                    ),
                    "hero_icon": hero_icon(hero),
                    "win": win,
                    "kills": me.get("kills", match.get("kills", 0)),
                    "deaths": me.get("deaths", match.get("deaths", 0)),
                    "assists": me.get("assists", match.get("assists", 0)),
                    "hero_damage": me.get("hero_damage"),
                    "total_xp": me.get("total_xp"),
                    "xp_per_min": me.get("xp_per_min"),
                    "gold": me.get("gold"),
                    "gold_per_min": me.get("gold_per_min"),
                    "duration": detail.get(
                        "duration",
                        match.get("duration", 0),
                    ),
                    "start_time": detail.get(
                        "start_time",
                        match.get("start_time", int(time.time())),
                    ),
                }
            )

        except Exception as exc:
            print(f"Match {match_id} detail fetch failed: {exc}")

            hero_id = match.get("hero_id")
            hero = hero_by_id.get(int(hero_id or 0), {})

            enriched.append(
                {
                    "match_id": match_id,
                    "hero_id": hero_id,
                    "hero_name": hero.get(
                        "localized_name",
                        "Unknown",
                    ),
                    "hero_icon": hero_icon(hero),
                    "win": match_won(match),
                    "kills": match.get("kills", 0),
                    "deaths": match.get("deaths", 0),
                    "assists": match.get("assists", 0),
                    "hero_damage": None,
                    "total_xp": None,
                    "xp_per_min": None,
                    "gold": None,
                    "gold_per_min": None,
                    "duration": match.get("duration", 0),
                    "start_time": match.get(
                        "start_time",
                        int(time.time()),
                    ),
                }
            )

        time.sleep(0.25)

    # Lifetime hero statistics from Ranked matches only.
    hero_stats = get(
        f"/players/{PLAYER_ID}/heroes",
        {"lobby_type": RANKED_LOBBY},
    )

    totals = {}

    for row in hero_stats:
        hero_id = int(row.get("hero_id", 0))
        hero = hero_by_id.get(hero_id, {})

        games = int(row.get("games", 0))
        wins = int(row.get("win", 0))

        if games < 20:
            continue

        winrate = round(wins / games * 100, 1)
        score = hero_score(games, wins)

        totals[hero_id] = {
            "name": hero.get("localized_name", "Unknown"),
            "icon": hero_icon(hero),
            "games": games,
            "wins": wins,
            "winrate": winrate,
            "score": round(score, 2),
            "kda": "—",
        }

    # KDA from the latest 20 Ranked matches.
    for hero_id, item in totals.items():
        group = [
            match
            for match in enriched
            if int(match.get("hero_id") or 0) == hero_id
        ]

        if group:
            kills = sum(match["kills"] for match in group)
            deaths = sum(match["deaths"] for match in group)
            assists = sum(match["assists"] for match in group)

            item["kda"] = round(
                (kills + assists) / max(deaths, 1),
                2,
            )

    # Best heroes: at least 20 Ranked games.
    top_heroes = sorted(
        totals.values(),
        key=lambda hero: (
            hero["winrate"],
            hero["score"],
            hero["games"],
        ),
        reverse=True,
    )[:15]

    profile = profile_data.get("profile", {})
    profile["mmr"] = mmr

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "mmr": mmr,
        "matches": enriched,
        "top_heroes": top_heroes,
        "processed_match_ids": sorted(processed_ids, key=int),
    }

    OUT.parent.mkdir(exist_ok=True)

    OUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"Ranked stats updated successfully. Estimated MMR: {mmr}"
    )


if __name__ == "__main__":
    main()
