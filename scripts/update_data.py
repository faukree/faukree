
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

PLAYER_ID = "924159299"
BASE = "https://api.opendota.com/api"
OUT = Path("data/stats.json")

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
    """
    Adjusted winrate score.

    A hero with a small sample is pulled toward 50%.
    More games make the actual winrate more influential.
    """
    if games <= 0:
        return 50.0

    winrate = wins / games * 100
    confidence = games / (games + 20)

    return 50 + (winrate - 50) * confidence


def main():
    profile = get(f"/players/{PLAYER_ID}")
    matches = get(f"/players/{PLAYER_ID}/matches", {"limit": 20})

    heroes = get("/constants/heroes")
    hero_by_id = {int(key): value for key, value in heroes.items()}

    enriched = []

    for match in matches[:20]:
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

            radiant_win = detail.get(
                "radiant_win",
                match.get("radiant_win", False),
            )

            slot = me.get("player_slot", match.get("player_slot", 0))
            win = bool(radiant_win) == (int(slot) < 128)

            duration = detail.get(
                "duration",
                match.get("duration", 0),
            )

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
                    "kills": me.get(
                        "kills",
                        match.get("kills", 0),
                    ),
                    "deaths": me.get(
                        "deaths",
                        match.get("deaths", 0),
                    ),
                    "assists": me.get(
                        "assists",
                        match.get("assists", 0),
                    ),
                    "hero_damage": me.get("hero_damage"),
                    "total_xp": me.get("total_xp"),
                    "xp_per_min": me.get("xp_per_min"),
                    "gold": me.get("gold"),
                    "gold_per_min": me.get("gold_per_min"),
                    "duration": duration,
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

            radiant_win = match.get("radiant_win", False)
            slot = int(match.get("player_slot", 0))
            win = bool(radiant_win) == (slot < 128)

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

    # Lifetime hero statistics from OpenDota.
    hero_stats = get(f"/players/{PLAYER_ID}/heroes")

    totals = {}

    for row in hero_stats:
        hero_id = int(row.get("hero_id", 0))
        hero = hero_by_id.get(hero_id, {})

        games = int(row.get("games", 0))
        wins = int(row.get("win", 0))

        if games <= 0:
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

    # KDA from the recent 20 matches, when available.
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

    
    # Best heroes: minimum 20 games.
    # Prioritize actual winrate over number of games.
    eligible_heroes = [
        hero
        for hero in totals.values()
        if hero["games"] >= 20
    ]

    top_heroes = sorted(
        eligible_heroes,
        key=lambda hero: (
            hero["winrate"],
            hero["score"],
            hero["games"],
        ),
        reverse=True,
    )[:15]

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile.get("profile", {}),
        "matches": enriched,
        "top_heroes": top_heroes,
    }

    OUT.parent.mkdir(exist_ok=True)

    OUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Dota stats updated successfully.")


if __name__ == "__main__":
    main()

print("Dota stats updated successfully.")


if __name__ == "__main__":
    main()
