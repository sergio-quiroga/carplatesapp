"""Removes the District of Columbia: the game covers only the 50 states.

seed_states no longer creates it (it was dropped from the fixture), so this
cleans up databases seeded before. Its sightings are deleted by cascade.
"""

from django.db import migrations


def remove_dc(apps, schema_editor):
    State = apps.get_model("plates", "State")
    State.objects.filter(code="DC").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("plates", "0004_player_avatar"),
    ]

    operations = [
        migrations.RunPython(remove_dc, migrations.RunPython.noop),
    ]
