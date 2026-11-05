from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Player, Sighting, State
from .services import MAX_PLAYERS, StateStatus, compute_status


class ComputeStatusTests(SimpleTestCase):
    def test_nobody(self):
        self.assertEqual(compute_status(0, 3), StateStatus.NONE)

    def test_some(self):
        self.assertEqual(compute_status(1, 3), StateStatus.SOME)

    def test_everyone(self):
        self.assertEqual(compute_status(3, 3), StateStatus.ALL)

    def test_single_player(self):
        self.assertEqual(compute_status(1, 1), StateStatus.ALL)


class PlayerSetupTests(TestCase):
    url = reverse("plates:player-list")

    def setup(self, names, avatar="😎"):
        players = [{"name": name, "avatar": avatar} for name in names]
        return self.client.post(self.url, {"players": players}, content_type="application/json")

    def test_starts_without_players(self):
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_setup_creates_players_in_order(self):
        resp = self.setup(["Ana", "  Beto ", "Caro"])
        self.assertEqual(resp.status_code, 201)
        self.assertEqual([p["name"] for p in resp.json()], ["Ana", "Beto", "Caro"])
        self.assertEqual([p["name"] for p in self.client.get(self.url).json()], ["Ana", "Beto", "Caro"])

    def test_setup_stores_avatars(self):
        players = [{"name": "Ana", "avatar": "🤠"}, {"name": "Beto", "avatar": "🤓"}]
        resp = self.client.post(self.url, {"players": players}, content_type="application/json")
        self.assertEqual([(p["name"], p["avatar"]) for p in resp.json()], [("Ana", "🤠"), ("Beto", "🤓")])

    def test_rejects_avatar_outside_catalog(self):
        self.assertEqual(self.setup(["Ana"], avatar="🍕").status_code, 400)
        self.assertEqual(self.setup(["Ana"], avatar="").status_code, 400)
        self.assertFalse(Player.objects.exists())

    def test_setup_only_once(self):
        self.setup(["Ana"])
        resp = self.setup(["Beto"])
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(list(Player.objects.values_list("name", flat=True)), ["Ana"])

    def test_rejects_duplicate_names_case_insensitive(self):
        resp = self.setup(["Ana", "ana"])
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Player.objects.exists())

    def test_rejects_empty_list_blank_names_and_too_many(self):
        self.assertEqual(self.setup([]).status_code, 400)
        self.assertEqual(self.setup(["Ana", "  "]).status_code, 400)
        too_many = [f"Jugador {i}" for i in range(MAX_PLAYERS + 1)]
        self.assertEqual(self.setup(too_many).status_code, 400)


class SightingFlowTests(TestCase):
    fixtures = ["states"]

    def setUp(self):
        self.state = State.objects.get(code="CA")
        self.ana = Player.objects.create(name="Ana", avatar="🤠", position=0)
        self.beto = Player.objects.create(name="Beto", position=1)

    def sighting_url(self, player, code="CA"):
        return reverse("plates:sighting-detail", args=[code, player.id])

    def detail(self, code="CA"):
        return self.client.get(reverse("plates:state-detail", args=[code])).json()

    def test_state_starts_unseen(self):
        data = self.detail()
        self.assertEqual(data["status"], "none")
        self.assertEqual([p["seen"] for p in data["players"]], [False, False])

    def test_one_player_gives_some_status(self):
        self.client.put(self.sighting_url(self.ana))
        data = self.detail()
        self.assertEqual(data["status"], "some")
        self.assertEqual(
            [(p["name"], p["seen"]) for p in data["players"]], [("Ana", True), ("Beto", False)]
        )
        self.assertEqual(data["players"][0]["avatar"], "🤠")

    def test_all_players_give_all_status(self):
        self.client.put(self.sighting_url(self.ana))
        self.client.put(self.sighting_url(self.beto))
        self.assertEqual(self.detail()["status"], "all")

    def test_list_reports_status_and_seen_by(self):
        self.client.put(self.sighting_url(self.beto))
        states = {s["code"]: s for s in self.client.get(reverse("plates:state-list")).json()}
        self.assertEqual(states["CA"]["status"], "some")
        self.assertEqual(states["CA"]["seen_by"], [self.beto.id])
        self.assertEqual(states["TX"]["status"], "none")
        self.assertEqual(states["TX"]["seen_by"], [])

    def test_unmarking_removes_sighting(self):
        self.client.put(self.sighting_url(self.ana))
        self.client.delete(self.sighting_url(self.ana))
        self.assertFalse(Sighting.objects.filter(state=self.state, player=self.ana).exists())

    def test_unknown_player_returns_404(self):
        resp = self.client.put(reverse("plates:sighting-detail", args=["CA", 9999]))
        self.assertEqual(resp.status_code, 404)

    def test_unknown_state_returns_404(self):
        resp = self.client.get(reverse("plates:state-detail", args=["ZZ"]))
        self.assertEqual(resp.status_code, 404)

    def test_repeated_put_is_idempotent_and_keeps_first_seen(self):
        first = self.client.put(self.sighting_url(self.ana)).json()
        second = self.client.put(self.sighting_url(self.ana)).json()
        self.assertEqual(first["players"][0]["first_seen"], second["players"][0]["first_seen"])

    def test_repeated_put_does_not_bump_last_modified(self):
        first = self.client.put(self.sighting_url(self.ana)).json()
        second = self.client.put(self.sighting_url(self.ana)).json()
        self.assertEqual(first["last_modified"], second["last_modified"])
        self.assertEqual(first["players"][0]["last_modified"], second["players"][0]["last_modified"])

    def test_unmarking_one_player_advances_last_modified(self):
        self.client.put(self.sighting_url(self.beto))
        before = self.client.put(self.sighting_url(self.ana)).json()
        # Windows' clock can return the same instant for back-to-back requests.
        later = timezone.now() + timedelta(seconds=1)
        with mock.patch("plates.services.timezone.now", return_value=later):
            after = self.client.delete(self.sighting_url(self.ana)).json()
        self.assertGreater(after["last_modified"], before["last_modified"])

    def test_seed_states_keeps_last_changed(self):
        self.client.put(self.sighting_url(self.ana))
        self.client.delete(self.sighting_url(self.ana))
        before = State.objects.get(code="CA").last_changed
        self.assertIsNotNone(before)

        call_command("seed_states", stdout=StringIO())

        self.assertEqual(State.objects.get(code="CA").last_changed, before)
        self.assertEqual(State.objects.count(), 50)

    def test_reset_game_clears_players_and_sightings(self):
        self.client.put(self.sighting_url(self.ana))

        call_command("reset_game", "--noinput", stdout=StringIO())

        self.assertFalse(Player.objects.exists())
        self.assertFalse(Sighting.objects.exists())
        self.assertIsNone(State.objects.get(code="CA").last_changed)
