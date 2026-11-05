"""Replaces the fixed "Él / Ella" pair with a configurable list of players.

Existing sightings are preserved: each legacy person value becomes a Player
(keeping its first_seen/last_modified dates), so a running deployment keeps
its progress and simply skips the initial player setup.
"""

import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models

LEGACY_PEOPLE = [("EL", "Él"), ("ELLA", "Ella")]


def legacy_people_to_players(apps, schema_editor):
    Player = apps.get_model("plates", "Player")
    Sighting = apps.get_model("plates", "Sighting")

    if not Sighting.objects.exists():
        return
    for position, (person, name) in enumerate(LEGACY_PEOPLE):
        player = Player.objects.create(name=name, position=position)
        # queryset.update() skips auto_now, so last_modified is kept intact.
        Sighting.objects.filter(person=person).update(player=player)


class Migration(migrations.Migration):

    dependencies = [
        ("plates", "0002_state_last_changed"),
    ]

    operations = [
        migrations.CreateModel(
            name="Player",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=30)),
                ("position", models.PositiveSmallIntegerField()),
            ],
            options={
                "ordering": ["position", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        django.db.models.functions.text.Lower("name"), name="unique_player_name_ci"
                    )
                ],
            },
        ),
        migrations.AddField(
            model_name="sighting",
            name="player",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sightings",
                to="plates.player",
            ),
        ),
        migrations.RunPython(legacy_people_to_players, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="sighting",
            name="unique_state_person",
        ),
        migrations.RemoveField(
            model_name="sighting",
            name="person",
        ),
        migrations.AlterField(
            model_name="sighting",
            name="player",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sightings",
                to="plates.player",
            ),
        ),
        migrations.AddConstraint(
            model_name="sighting",
            constraint=models.UniqueConstraint(fields=("state", "player"), name="unique_state_player"),
        ),
    ]
