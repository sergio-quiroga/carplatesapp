from django.core.management.base import BaseCommand, CommandError

from plates import services


class Command(BaseCommand):
    """Wipes players and sightings so the app asks for the players again."""

    help = "Borra todos los jugadores y patentes marcadas (la app vuelve a pedir jugadores)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--noinput",
            "--no-input",
            action="store_false",
            dest="interactive",
            help="No pedir confirmación.",
        )

    def handle(self, *args, interactive, **options):
        if interactive:
            answer = input("Se borrarán todos los jugadores y patentes marcadas. ¿Continuar? [s/N] ")
            if answer.strip().lower() not in ("s", "si", "sí", "y", "yes"):
                raise CommandError("Cancelado.")
        services.reset_game()
        self.stdout.write(self.style.SUCCESS("Juego reiniciado."))
