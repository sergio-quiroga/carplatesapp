from rest_framework import serializers

from .avatars import AVATARS
from .models import Player, State
from .services import MAX_PLAYERS, MIN_PLAYERS, compute_status


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ["id", "name", "avatar"]


class PlayerSetupEntrySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=Player.NAME_MAX_LENGTH, trim_whitespace=True)
    avatar = serializers.ChoiceField(
        choices=AVATARS, error_messages={"invalid_choice": "Elige una de las caras disponibles."}
    )


class PlayerSetupSerializer(serializers.Serializer):
    players = serializers.ListField(
        child=PlayerSetupEntrySerializer(),
        min_length=MIN_PLAYERS,
        max_length=MAX_PLAYERS,
    )

    def validate_players(self, players):
        seen = set()
        for player in players:
            key = player["name"].casefold()
            if key in seen:
                raise serializers.ValidationError(f"El nombre '{player['name']}' está repetido.")
            seen.add(key)
        return players


class _StateStatusMixin:
    """Status depends on the whole group, so views pass the players in context."""

    @property
    def group(self):
        return self.context["players"]

    def _sightings_by_player(self, obj):
        if not hasattr(obj, "_sightings_cache"):
            obj._sightings_cache = {s.player_id: s for s in obj.sightings.all()}
        return obj._sightings_cache

    def get_status(self, obj):
        return compute_status(len(self._sightings_by_player(obj)), len(self.group))


class StateListSerializer(_StateStatusMixin, serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    seen_by = serializers.SerializerMethodField()

    class Meta:
        model = State
        fields = ["code", "name", "status", "seen_by"]

    def get_seen_by(self, obj):
        seen = self._sightings_by_player(obj)
        return [p.id for p in self.group if p.id in seen]


class StateDetailSerializer(_StateStatusMixin, serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    players = serializers.SerializerMethodField()
    first_seen = serializers.SerializerMethodField()
    last_modified = serializers.SerializerMethodField()

    class Meta:
        model = State
        fields = ["code", "name", "status", "players", "first_seen", "last_modified"]

    def get_players(self, obj):
        seen = self._sightings_by_player(obj)
        payload = []
        for player in self.group:
            sighting = seen.get(player.id)
            payload.append(
                {
                    "id": player.id,
                    "name": player.name,
                    "avatar": player.avatar,
                    "seen": sighting is not None,
                    "first_seen": sighting.first_seen if sighting else None,
                    "last_modified": sighting.last_modified if sighting else None,
                }
            )
        return payload

    def get_first_seen(self, obj):
        dates = [s.first_seen for s in self._sightings_by_player(obj).values()]
        return min(dates) if dates else None

    def get_last_modified(self, obj):
        sightings = self._sightings_by_player(obj)
        if not sightings:
            return None
        dates = [s.last_modified for s in sightings.values()]
        # last_changed also covers unmarks, whose sighting row no longer exists.
        if obj.last_changed:
            dates.append(obj.last_changed)
        return max(dates)
