"""Face emojis players can pick as their avatar.

Single source of truth: the setup screen renders this list (passed through
the template) and the API rejects anything outside it. Only single-codepoint
faces, so they render the same on every phone without ZWJ sequences.
"""

from django.core.exceptions import ValidationError

AVATARS = [
    "😀", "😁", "😂", "🤣", "😄", "😅", "😆", "😉",
    "😊", "😇", "🙂", "🙃", "😋", "😛", "😜", "🤪",
    "😝", "🤗", "🤭", "🤔", "🤨", "😐", "😏", "😬",
    "😌", "😴", "🤩", "🥳", "🤠", "😎", "🤓", "🧐",
    "🥸", "😮", "😲", "🤯", "😱", "🥶", "🥵", "😤",
]

DEFAULT_AVATAR = AVATARS[0]


def validate_avatar(value):
    if value not in AVATARS:
        raise ValidationError("Elige una de las caras disponibles.")
