"""Game rules and write operations, kept out of views and serializers so they
can be reused (API, admin, management commands) and tested on their own."""

from django.db import models, transaction
from django.utils import timezone

from .models import Player, Sighting, State

MIN_PLAYERS = 1
MAX_PLAYERS = 12


class StateStatus(models.TextChoices):
    """How much of the group has spotted a state's plate. Drives map colors."""

    NONE = "none", "Sin ver"
    SOME = "some", "Algunos"
    ALL = "all", "Todos"


class GameAlreadyConfigured(Exception):
    """Players can only be set up once; a second setup would orphan sightings."""


def compute_status(seen_count, player_count):
    if seen_count == 0:
        return StateStatus.NONE
    if seen_count >= player_count:
        return StateStatus.ALL
    return StateStatus.SOME


def get_players():
    return list(Player.objects.all())


@transaction.atomic
def setup_players(players):
    """Creates the whole group in the given order.

    `players` is a list of {"name", "avatar"} dicts, already validated.
    """
    if Player.objects.exists():
        raise GameAlreadyConfigured()
    return Player.objects.bulk_create(
        Player(name=p["name"], avatar=p["avatar"], position=position)
        for position, p in enumerate(players)
    )


@transaction.atomic
def reset_game():
    """Deletes every player and sighting so the group can be set up again."""
    Sighting.objects.all().delete()
    Player.objects.all().delete()
    State.objects.update(last_changed=None)


def _touch(state):
    State.objects.filter(pk=state.pk).update(last_changed=timezone.now())


@transaction.atomic
def mark_sighting(state, player):
    # get_or_create (not update_or_create) so re-marking an already-seen
    # state is a true no-op and doesn't bump any timestamp.
    _, created = Sighting.objects.get_or_create(state=state, player=player)
    if created:
        _touch(state)


@transaction.atomic
def unmark_sighting(state, player):
    deleted, _ = Sighting.objects.filter(state=state, player=player).delete()
    if deleted:
        _touch(state)
