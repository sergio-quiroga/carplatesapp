from django.contrib import admin

from .models import Player, Sighting, State


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "fips")
    search_fields = ("code", "name")


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("avatar", "name", "position")
    search_fields = ("name",)


@admin.register(Sighting)
class SightingAdmin(admin.ModelAdmin):
    list_display = ("state", "player", "first_seen", "last_modified")
    list_filter = ("player",)
    autocomplete_fields = ("state", "player")
