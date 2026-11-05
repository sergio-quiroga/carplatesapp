from django.db import models
from django.db.models.functions import Lower

from .avatars import DEFAULT_AVATAR, validate_avatar


class State(models.Model):
    """One of the 50 US states, identified by its 2-letter postal code."""

    code = models.CharField(max_length=2, primary_key=True)
    name = models.CharField(max_length=64, unique=True)
    fips = models.CharField(max_length=2, unique=True)
    # Time of the last mark/unmark of any sighting. Kept on the state because
    # an unmark deletes the sighting row and its own timestamp with it.
    last_changed = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Player(models.Model):
    """A participant of the game. The whole group is created at once on setup."""

    NAME_MAX_LENGTH = 30

    name = models.CharField(max_length=NAME_MAX_LENGTH)
    avatar = models.CharField(max_length=8, default=DEFAULT_AVATAR, validators=[validate_avatar])
    # Order in which the players were entered; drives display order everywhere.
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(Lower("name"), name="unique_player_name_ci"),
        ]

    def __str__(self):
        return self.name


class Sighting(models.Model):
    """Records that a given player has spotted a license plate from a state."""

    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name="sightings")
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="sightings")
    first_seen = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["state", "player"], name="unique_state_player")
        ]

    def __str__(self):
        return f"{self.state_id} - {self.player}"
