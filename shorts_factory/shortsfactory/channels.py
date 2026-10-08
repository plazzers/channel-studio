"""Channel styles and the fixed text that goes into every Short's description."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    bar: str  # dark brand color: hook bar background
    accent: str  # highlighted caption word, hook bar frame
    light: str  # hook text
    link_line: str
    hashtags: tuple[str, str]


CHANNELS = {
    "walter": Channel(
        id="walter",
        name="Walter's Home Check",
        bar="#1C2B3A",
        accent="#E07A1F",
        light="#F2EDE4",
        link_line="FREE checklist: https://payhip.com/b/hiIm1",
        hashtags=("#homeinspection", "#homeowner"),
    ),
    "sal": Channel(
        id="sal",
        name="Chef Sal Romano",
        bar="#2A1E18",
        accent="#BE3A24",
        light="#FAF4E8",
        link_line="FREE 25 Rules for Eating Out: https://payhip.com/b/dnY7F",
        hashtags=("#restaurantsecrets", "#chef"),
    ),
}


def get_channel(name: str) -> Channel:
    key = (name or "").strip().lower()
    if key not in CHANNELS:
        raise ValueError(f"Unknown channel '{name}'. Use one of: {', '.join(CHANNELS)}")
    return CHANNELS[key]


def ass_color(hex_color: str, alpha: int = 0) -> str:
    """'#RRGGBB' -> ASS '&HAABBGGRR' (alpha 0 = solid)."""
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()
