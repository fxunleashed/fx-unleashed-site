"""
The FX Pro's 3D geometry for src/data/wheels/fx-pro.json, from the plugin's drawing of the wheel plus parts measured on
the same reference. PREVIEW BRANCH ONLY (see the $comment in fx-pro.json and the plugin's docs/rights-check.md): the
outline and windows are the plugin's assets/fxpro-outline.svg, traced from Simagic's front picture; the pods, grips,
paddles, rollers and screws below were read off a 10-unit grid laid over that picture fitted to the outline's
coordinates (663 x 396, x right, y down). The picture itself is never in this repo.

    python scripts/fxpro_geometry.py [path/to/SimagicRpmSync/assets/fxpro-outline.svg]

Rewrites only the geometry keys of fx-pro.json (outline, windows, pods, grips, paddles, rollers, screws, housing, qr,
funky, plateMm, podMm); LEDs, groups, texts and the rest stay as they are. Left-side parts are mirrored by the model.
"""
import json
import os
import re
import sys

from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
JSON = os.path.join(HERE, "..", "src", "data", "wheels", "fx-pro.json")
SVG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "SimagicRpmSync", "assets", "fxpro-outline.svg")
W = 663.0

# The aluminium button pod, left side: the top arm over the thumb opening (outer roller in its corner), the arm down the
# opening's inner side (inner roller) and the lower cluster of four buttons. Includes the opening; it's cut out below.
POD = [(27, 133), (31, 118), (38, 104), (47, 90), (57, 77), (68, 64), (80, 50), (92, 40), (105, 35), (125, 33), (145, 34),
       (160, 38), (172, 46), (181, 57), (186, 70), (187, 95), (190, 118), (196, 130), (198, 150), (198, 172), (194, 186),
       (184, 195), (176, 205), (173, 220), (178, 230), (195, 226), (208, 232), (213, 248), (207, 263), (203, 278),
       (206, 295), (205, 308), (214, 313), (221, 323), (221, 335), (212, 345), (200, 349), (188, 347), (178, 338),
       (170, 322), (165, 305), (161, 285), (152, 262), (142, 248), (136, 235), (135, 215), (137, 203), (130, 197),
       (84, 199), (80, 150)]
# The rubber grip's inner edge, top to bottom (its outer edge is the outline): under the pod, the thumb rest, then
# down past the clutch paddle to the tip.
GRIP_TOP = (27, 133)   # the pod's outer corner: the grip's top edge runs from here along the pod to GRIP_INNER[0]
GRIP_INNER = [(80, 150), (86, 192), (110, 196), (125, 205), (128, 225), (122, 242), (100, 250), (87, 258), (84, 280),
              (86, 305), (100, 318), (110, 335), (113, 355), (108, 372), (95, 381)]


def outline_and_windows(svg):
    d = re.search(r'\sd="([^"]+)"', open(svg, encoding="utf-8").read()).group(1)
    subs = [s for s in re.split(r"(?=M)", d) if s.strip()]
    paths = [[(float(a), float(b)) for a, b in re.findall(r"([\d.]+),([\d.]+)", s)] for s in subs]
    return paths[0], paths[1:]


def r1(pts):
    return [[round(x, 1), round(y, 1)] for x, y in pts]


def main():
    outline, windows = outline_and_windows(SVG)
    body = Polygon(outline)
    for w in windows:
        assert body.contains(Polygon(w)), "a window pokes out of the outline"
    left_opening = min(windows, key=lambda w: min(x for x, _ in w))  # the thumb opening on the left
    pod = Polygon(POD).difference(Polygon(left_opening))
    assert pod.geom_type == "Polygon", pod.geom_type
    pod = pod.intersection(body).simplify(0.4)

    # grip: the outline from the pod's outer corner down the left side to the tip, then the inner edge back up
    def nearest(p):
        return min(range(len(outline)), key=lambda i: (outline[i][0] - p[0]) ** 2 + (outline[i][1] - p[1]) ** 2)
    a, b = nearest(GRIP_TOP), nearest(GRIP_INNER[-1])
    n = len(outline)
    fwd = [(a + i) % n for i in range((b - a) % n + 1)]
    back = [(a - i) % n for i in range((a - b) % n + 1)]
    side = fwd if max(outline[i][0] for i in fwd) < W / 2 else back          # the way round that stays on the left
    grip = Polygon([outline[i] for i in side] + list(reversed(GRIP_INNER[:-1]))).buffer(0).intersection(body).simplify(0.4)
    assert grip.geom_type == "Polygon", grip.geom_type

    data = json.load(open(JSON, encoding="utf-8"))
    for old in ("cutouts",):
        data.pop(old, None)
    data.update({
        "plateMm": 5,
        "podMm": 6,
        "outline": r1(outline[::2]),
        "windows": [r1(w) for w in windows],
        "pods": [{"outer": r1(pod.exterior.coords[:-1]), "holes": [r1(h.coords[:-1]) for h in pod.interiors]}],
        "grips": [{"points": r1(grip.exterior.coords[:-1])}],
        "paddles": [
            {"$comment": "upper paddle, above the shift paddle", "x": 98, "y": 99, "w": 54, "h": 14, "r": 5, "back": 6},
            {"$comment": "shift paddle, seen through the thumb opening", "x": 92, "y": 106, "w": 60, "h": 110, "r": 12, "back": 12},
            {"$comment": "clutch paddle, below the grip's thumb rest", "x": 84, "y": 242, "w": 52, "h": 72, "r": 12, "back": 12},
        ],
        "rollers": [
            {"$comment": "outer roller on the pod's corner: black body, red knurl below; rolls sideways",
             "kind": "upright", "x": 62, "y": 113, "r": 20, "len": 52, "tilt": -16},
            {"$comment": "inner roller at the opening's inner edge, on a bracket; rolls up and down",
             "kind": "wheel", "x": 168, "y": 153, "r": 24, "len": 18, "bracket": [133, 124, 14, 32]},
        ],
        "funky": {"x": W / 2, "y": 318, "r": 9},
        "screws": r1([(75, 82), (130, 70), (152, 256), (166, 318), (194, 210), (222, 319), (208, 40), (262, 328)]),
        "housing": {"$comment": "electronics housing behind the centre, seen through the knob windows",
                    "x": 192, "y": 30, "w": 279, "h": 320, "r": 70, "depthMm": 18},
        "qr": {"$comment": "wheel-side quick release half: black flange (70 mm bolt circle, 6 x M5), red locking collar, "
                           "ball-lock bore with a contact block; dimensions estimated from product pictures",
               "x": W / 2, "y": 200, "pcdMm": 70, "flangeMm": [75, 19], "collarMm": [80, 24], "stepMm": [72, 5],
               "boreMm": [46, 10]},
    })
    json.dump(data, open(JSON, "w", encoding="utf-8"), indent=1)
    print(f"outline {len(data['outline'])} points, {len(windows)} windows, pod {len(data['pods'][0]['outer'])} points "
          f"(+{len(data['pods'][0]['holes'])} hole), grip {len(data['grips'][0]['points'])} points")


if __name__ == "__main__":
    main()
