import json, os, time
from datetime import datetime, timezone
from pathlib import Path
import requests

PLAYER_ID = "924159299"
BASE = "https://api.opendota.com/api"
OUT = Path("data/stats.json")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Faukree-Dota-Tracker/1.0"})

def get(path, params=None):
    r = SESSION.get(BASE + path, params=params, timeout=35)
    r.raise_for_status()
    return r.json()

def main():
    profile = get(f"/players/{PLAYER_ID}")
    matches = get(f"/players/{PLAYER_ID}/matches", {"limit": 20})
    # Hero names and portraits from OpenDota constants
    heroes = get("/constants/heroes")
    hero_by_id = {int(k): v for k, v in heroes.items()}
    enriched = []
    for match in matches[:20]:
        mid = match["match_id"]
        try:
            detail = get(f"/matches/{mid}")
            players = detail.get("players", [])
            me = next((p for p in players if str(p.get("account_id")) == PLAYER_ID), None)
            if me is None:
                me = next((p for p in players if p.get("player_slot") == match.get("player_slot")), {})
            hid = me.get("hero_id", match.get("hero_id"))
            hero = hero_by_id.get(int(hid or 0), {})
            radiant_win = detail.get("radiant_win", match.get("radiant_win", False))
            slot = me.get("player_slot", match.get("player_slot", 0))
            win = bool(radiant_win) == (int(slot) < 128)
            duration = detail.get("duration", match.get("duration", 0))
            enriched.append({
                "match_id": mid, "hero_id": hid, "hero_name": hero.get("localized_name", "Unknown"),
                "hero_icon": "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/" + hero.get("name", "").replace("npc_dota_hero_", "") + ".png",
                "win": win, "kills": me.get("kills", match.get("kills", 0)),
                "deaths": me.get("deaths", match.get("deaths", 0)), "assists": me.get("assists", match.get("assists", 0)),
                "hero_damage": me.get("hero_damage"), "total_xp": me.get("total_xp"),
                "xp_per_min": me.get("xp_per_min"), "gold": me.get("gold"), "gold_per_min": me.get("gold_per_min"),
                "duration": duration, "start_time": detail.get("start_time", match.get("start_time", int(time.time())))
            })
        except Exception as exc:
            print(f"Match {mid} detail fetch failed: {exc}")
            hid = match.get("hero_id")
            hero = hero_by_id.get(int(hid or 0), {})
            radiant_win = match.get("radiant_win", False)
            win = bool(radiant_win) == (int(match.get("player_slot", 0)) < 128)
            enriched.append({
                "match_id": mid, "hero_id": hid, "hero_name": hero.get("localized_name", "Unknown"),
                "hero_icon": "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/" + hero.get("name", "").replace("npc_dota_hero_", "") + ".png",
                "win": win, "kills": match.get("kills", 0), "deaths": match.get("deaths", 0), "assists": match.get("assists", 0),
                "hero_damage": None, "total_xp": None, "xp_per_min": None, "gold": None, "gold_per_min": None,
                "duration": match.get("duration", 0), "start_time": match.get("start_time", int(time.time()))
            })
        time.sleep(0.25)
    hero_stats = get(f"/players/{PLAYER_ID}/heroes")
    totals = {}
    for row in hero_stats:
        hid = int(row.get("hero_id", 0))
        h = hero_by_id.get(hid, {})
        games, wins = int(row.get("games", 0)), int(row.get("win", 0))
        if games:
            totals[hid] = {"name": h.get("localized_name", "Unknown"), "icon": "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/" + h.get("name", "").replace("npc_dota_hero_", "") + ".png",
                           "games": games, "wins": wins, "winrate": round(wins / games * 100, 1), "kda": "—"}
    # Estimate hero KDA from the recent parsed matches where those values are present.
    for hid, item in totals.items():
        group = [m for m in enriched if m.get("hero_id") == hid]
        if group:
            k, d, a = sum(m["kills"] for m in group), sum(m["deaths"] for m in group), sum(m["assists"] for m in group)
            item["kda"] = round((k + a) / max(d, 1), 2)
    output = {"updated_at": datetime.now(timezone.utc).isoformat(), "profile": profile.get("profile", {}),
              "matches": enriched, "top_heroes": sorted(totals.values(), key=lambda x: x["games"], reverse=True)[:15]}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
