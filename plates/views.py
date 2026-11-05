import json

from django.shortcuts import render
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .avatars import AVATARS
from .models import Player, State
from .serializers import (
    PlayerSerializer,
    PlayerSetupSerializer,
    StateDetailSerializer,
    StateListSerializer,
)


def index(request):
    fips_to_code = {s.fips: s.code for s in State.objects.all()}
    context = {
        "fips_to_code_json": json.dumps(fips_to_code),
        "avatars": AVATARS,
        "max_players": services.MAX_PLAYERS,
        "player_name_max_length": Player.NAME_MAX_LENGTH,
    }
    return render(request, "plates/index.html", context)


def _get_state_or_404(code):
    try:
        return State.objects.prefetch_related("sightings").get(code=code.upper())
    except State.DoesNotExist:
        raise NotFound(f"Estado '{code}' no existe.")


def _get_player_or_404(player_id):
    try:
        return Player.objects.get(pk=player_id)
    except Player.DoesNotExist:
        raise NotFound(f"Jugador '{player_id}' no existe.")


def _state_detail_response(code):
    state = _get_state_or_404(code)
    context = {"players": services.get_players()}
    return Response(StateDetailSerializer(state, context=context).data)


class PlayerListView(APIView):
    def get(self, request):
        return Response(PlayerSerializer(services.get_players(), many=True).data)

    def post(self, request):
        """Initial game setup: creates the whole group of players at once."""
        serializer = PlayerSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.setup_players(serializer.validated_data["players"])
        except services.GameAlreadyConfigured:
            return Response(
                {"detail": "Los jugadores ya fueron configurados."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            PlayerSerializer(services.get_players(), many=True).data,
            status=status.HTTP_201_CREATED,
        )


class StateListView(APIView):
    def get(self, request):
        states = State.objects.prefetch_related("sightings").all()
        context = {"players": services.get_players()}
        return Response(StateListSerializer(states, many=True, context=context).data)


class StateDetailView(APIView):
    def get(self, request, code):
        return _state_detail_response(code)


class SightingView(APIView):
    """Mark or unmark a sighting for a given state + player."""

    def put(self, request, code, player_id):
        services.mark_sighting(_get_state_or_404(code), _get_player_or_404(player_id))
        return _state_detail_response(code)

    def delete(self, request, code, player_id):
        services.unmark_sighting(_get_state_or_404(code), _get_player_or_404(player_id))
        return _state_detail_response(code)
