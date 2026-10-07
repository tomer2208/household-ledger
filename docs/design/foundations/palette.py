"""F1 palette (docs/DESIGN_GANTT.md): builds the colour scales in OKLCH, maps them to semantic
tokens for light and dark, and checks every pair. Writes palette.json next to this file, the
same data into palette.html, and apps/mobile/src/lib/tokens/palette.gen.ts for the app. Run: python3 docs/design/foundations/palette.py
"""
import json
import math
import os

# ---------- OKLCH -> sRGB ----------
def oklch_to_srgb(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, bl

def gamma(x):
    return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055

def to_hex(L, C, h):
    # Lower chroma until the colour fits in sRGB.
    while True:
        rgb = oklch_to_srgb(L, C, h)
        if all(-1e-4 <= v <= 1 + 1e-4 for v in rgb) or C <= 0:
            break
        C -= 0.002
    return '#' + ''.join(f'{round(max(0, min(1, gamma(v))) * 255):02X}' for v in rgb)

# ---------- contrast and colour-vision simulation ----------
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(hx):
    return [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]

def lum(hx):
    r, g, b = (lin(c) for c in rgb(hx))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

# Machado et al. 2009, severity 1.0, applied in linear RGB.
CVD = {
    'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

def simulate(hx, kind):
    v = [lin(c) for c in rgb(hx)]
    out = [sum(CVD[kind][i][j] * v[j] for j in range(3)) for i in range(3)]
    return '#' + ''.join(f'{round(max(0, min(1, gamma(max(0, x)))) * 255):02X}' for x in out)

def oklab(hx):
    r, g, b = (lin(c) for c in rgb(hx))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)

def delta(a, b):
    return math.dist(oklab(a), oklab(b))

# ---------- scales ----------
STEPS = {50: .975, 100: .952, 150: .925, 200: .895, 300: .83, 400: .74, 500: .645, 600: .56, 700: .48, 800: .40, 900: .315, 950: .245, 1000: .19}
# hue, peak chroma. Chroma tapers at both ends so the light and dark steps stay calm.
FAMILIES = {
    'stone': (135, 0.008),   # tinted neutrals: sage-stone, barely green
    'plum': (345, 0.13),     # brand and action
    'amber': (62, 0.15),     # close to the limit
    'red': (27, 0.17),       # over
    'green': (152, 0.13),    # sparing: refunds, savings, a month under budget
}

def scale(name, h, peak):
    out = {}
    for step, L in STEPS.items():
        taper = 1 - abs(L - 0.6) / 0.6 * 0.75
        c = peak * (1 if name == 'stone' else max(0.25, taper))
        out[step] = to_hex(L, c, h)
    out[0] = to_hex(0.997, 0.003, h) if name == 'stone' else None
    return {k: v for k, v in out.items() if v}

S = {name: scale(name, *spec) for name, spec in FAMILIES.items()}

# ---------- semantic tokens ----------
TOKENS = {
    'light': {
        'bg': S['stone'][100], 'surface': S['stone'][0], 'raised': S['stone'][0], 'fill': S['stone'][150],
        'line': S['stone'][200], 'lineStrong': S['stone'][300],
        'text': S['stone'][950], 'text2': S['stone'][700], 'text3': S['stone'][500],
        'action': S['plum'][700], 'actionPressed': S['plum'][800], 'onAction': S['stone'][0], 'actionSoft': S['plum'][100], 'focus': S['plum'][600],
        'close': S['amber'][700], 'closeSoft': S['amber'][100], 'closeBar': S['amber'][600],
        'over': S['red'][700], 'overSoft': S['red'][100], 'overBar': S['red'][800],
        'positive': S['green'][700], 'positiveSoft': S['green'][100],
        'disabledBg': S['stone'][150], 'disabledText': S['stone'][600],
        'toast': S['stone'][950], 'onToast': S['stone'][50], 'scrim': 'rgba(20,26,23,.38)',
    },
    # F4: in dark mode height is lightness, not shadow, so raised sits between surface and fill,
    # and lines are a step above fill so they still show on a raised sheet.
    'dark': {
        'bg': S['stone'][1000], 'surface': S['stone'][950], 'raised': to_hex(0.28, 0.008, 135), 'fill': S['stone'][900],
        'line': to_hex(0.365, 0.008, 135), 'lineStrong': S['stone'][800],
        'text': S['stone'][50], 'text2': S['stone'][400], 'text3': S['stone'][600],
        'action': S['plum'][300], 'actionPressed': S['plum'][200], 'onAction': S['plum'][1000], 'actionSoft': S['plum'][900], 'focus': S['plum'][300],
        'close': S['amber'][300], 'closeSoft': S['amber'][950], 'closeBar': S['amber'][300],
        'over': S['red'][300], 'overSoft': S['red'][950], 'overBar': S['red'][500],
        'positive': S['green'][300], 'positiveSoft': S['green'][950],
        'disabledBg': S['stone'][900], 'disabledText': S['stone'][500],
        'toast': S['stone'][50], 'onToast': S['stone'][1000], 'scrim': 'rgba(0,0,0,.55)',
    },
}

# What has to pass, and against what. 4.5 for text, 3 for bars, borders and the focus ring.
CHECKS = [
    ('text', ['bg', 'surface', 'fill', 'raised'], 4.5, 'טקסט'),
    ('text2', ['bg', 'surface', 'fill', 'raised'], 4.5, 'טקסט משני'),
    ('action', ['bg', 'surface', 'raised'], 4.5, 'קישור / פעולה כטקסט'),
    ('onAction', ['action', 'actionPressed'], 4.5, 'טקסט על כפתור'),
    ('action', ['actionSoft'], 4.5, 'פעולה על רקע עדין'),
    ('close', ['surface', 'bg', 'closeSoft'], 4.5, 'קרוב לגבול'),
    ('over', ['surface', 'bg', 'overSoft'], 4.5, 'עברתם'),
    ('positive', ['surface', 'bg', 'positiveSoft'], 4.5, 'חיובי'),
    ('onToast', ['toast'], 4.5, 'הודעה'),
    ('closeBar', ['surface', 'fill'], 3, 'פס קרוב לגבול'),
    ('overBar', ['surface', 'fill'], 3, 'פס עברתם'),
    ('focus', ['bg', 'surface'], 3, 'טבעת פוקוס'),
    ('lineStrong', ['surface'], 1.5, 'קו מודגש (קישוטי)'),
    ('disabledText', ['disabledBg'], 3, 'טקסט מושבת'),
]

# ---------- category colours (F2) ----------
# Ten colours a household can give its envelopes. Hand-placed around the wheel, not optimised:
# a search for the ten most distinct put five blues in, which isn't a warm home. Statuses own
# 15-75 (red to amber), 335-355 (plum) and 140-165 (green); a category may sit near them only
# muted. `dark` is the lightness in dark mode when it can't simply be a step lighter, so sand
# and rose don't look like "close to the limit" and the plum action there.
CATEGORY = [
    # id, Hebrew name, hue, lightness, chroma, dark lightness
    ('teal', 'טורקיז', 195, 0.66, 0.10, None),
    ('sand', 'חול', 88, 0.80, 0.09, 0.66),
    ('blue', 'כחול', 255, 0.60, 0.14, None),
    ('ocean', 'ים', 230, 0.48, 0.10, 0.56),
    ('clay', 'חימר', 40, 0.62, 0.06, None),
    ('olive', 'זית', 115, 0.70, 0.14, None),
    ('indigo', 'אינדיגו', 278, 0.50, 0.15, 0.62),
    ('sage', 'מרווה', 165, 0.58, 0.06, None),
    ('violet', 'סגול', 305, 0.60, 0.15, None),
    ('rose', 'ורד', 8, 0.72, 0.07, 0.60),
]

def max_chroma(L, h, cap):
    C = cap
    while C > 0 and not all(-1e-4 <= v <= 1 + 1e-4 for v in oklch_to_srgb(L, C, h)):
        C -= 0.002
    return max(C, 0)

def category_colours():
    out = []
    for cid, name, h, L, C, Ld in CATEGORY:
        Ld = Ld if Ld is not None else min(0.86, L + 0.08)
        c = min(C, max_chroma(L, h, C), max_chroma(Ld, h, C))
        out.append({
            'id': cid, 'name': name, 'hue': h,
            # base: the flap and the bar while the envelope is fine. soft: behind the icon.
            # ink: the icon itself, and the name where it's coloured.
            'light': {'base': to_hex(L, c, h), 'soft': to_hex(0.935, min(c, 0.035), h),
                      'ink': to_hex(0.45, min(c + 0.02, max_chroma(0.45, h, 0.2)), h)},
            'dark': {'base': to_hex(Ld, c, h), 'soft': to_hex(0.31, min(c, 0.045), h),
                     'ink': to_hex(0.84, min(c, max_chroma(0.84, h, 0.2)), h)},
        })
    return out

CATS = category_colours()

# The defaults for the sixteen seeded categories (migration 34), by sort order. The first eight
# (the ones on screen) get eight different colours. Of the pairs that blur for colour blindness,
# teal/rose and blue/violet aren't both among them, and sage/clay and ocean/indigo are, but never
# next to each other in the two-column grid.
# Savings isn't an envelope colour: it takes `positive`.
DEFAULTS = [
    ('Groceries', 'סופרמרקט', 'teal'), ('Dining', 'אוכל בחוץ', 'sand'), ('Transport', 'תחבורה', 'blue'),
    ('Fuel', 'דלק', 'ocean'), ('Housing', 'דיור', 'clay'), ('Utilities', 'חשבונות', 'olive'),
    ('Health', 'בריאות', 'indigo'), ('Kids', 'ילדים', 'sage'), ('Shopping', 'קניות', 'violet'),
    ('Entertainment', 'בילויים', 'rose'), ('Subscriptions', 'מנויים', 'olive'), ('Travel', 'חופשות', 'teal'),
    ('Gifts', 'מתנות', 'rose'), ('Education', 'חינוך', 'blue'), ('Other', 'אחר', 'sand'),
]

def run_category_checks():
    res = []
    for c in CATS:
        for mode in ('light', 'dark'):
            t, v = TOKENS[mode], c[mode]
            for fg, bg, need, label in [
                (v['ink'], v['soft'], 4.5, 'סמל על הרקע שלו'),
                (v['ink'], t['surface'], 4.5, 'סמל / שם על כרטיס'),
                (v['base'], t['surface'], 1.5 if mode == 'light' else 3, 'דש ופס על כרטיס'),
            ]:
                r = contrast(fg, bg)
                res.append({'cat': c['id'], 'mode': mode, 'label': label, 'ratio': round(r, 2), 'need': need, 'ok': r >= need})
    return res

def run_category_distance():
    # Smallest distance between any two category colours, and to any status, per kind of vision.
    out = {}
    for kind in ['normal', 'protan', 'deutan', 'tritan']:
        f = (lambda x: x) if kind == 'normal' else (lambda x, k=kind: simulate(x, k))
        pairs, status = [], []
        for i, a in enumerate(CATS):
            for b in CATS[i + 1:]:
                dd = min(delta(f(a['light']['base']), f(b['light']['base'])), delta(f(a['dark']['base']), f(b['dark']['base'])))
                pairs.append((round(dd, 3), a['id'], b['id']))
            for st in ('closeBar', 'overBar', 'action', 'positive'):
                dd = min(delta(f(a['light']['base']), f(TOKENS['light'][st])), delta(f(a['dark']['base']), f(TOKENS['dark'][st])))
                status.append((round(dd, 3), a['id'], st))
        out[kind] = {'pairs': sorted(pairs)[:4], 'status': sorted(status)[:3],
                     'seen': {c['id']: [f(c['light']['base']), f(c['dark']['base'])] for c in CATS}}
    return out

def run_checks():
    results = []
    for mode, t in TOKENS.items():
        for fg, bgs, need, label in CHECKS:
            for bg in bgs:
                r = contrast(t[fg], t[bg])
                results.append({'mode': mode, 'fg': fg, 'bg': bg, 'ratio': round(r, 2), 'need': need, 'ok': r >= need, 'label': label})
    return results

def run_cvd():
    # The two warnings must stay apart for every kind of colour vision, and neither may look like the brand.
    out = []
    for mode, t in TOKENS.items():
        for kind in ['normal', 'protan', 'deutan', 'tritan']:
            f = (lambda x: x) if kind == 'normal' else (lambda x, k=kind: simulate(x, k))
            out.append({
                'mode': mode, 'kind': kind,
                'closeVsOver': round(delta(f(t['closeBar']), f(t['overBar'])), 3),
                'overVsAction': round(delta(f(t['overBar']), f(t['action'])), 3),
                'positiveVsClose': round(delta(f(t['positive']), f(t['close'])), 3),
                'lumCloseOver': round(contrast(t['closeBar'], t['overBar']), 2),
                'seen': {k: f(t[k]) for k in ['closeBar', 'overBar', 'action', 'positive', 'close', 'over', 'surface', 'fill']},
            })
    return out

if __name__ == '__main__':
    checks, cvd = run_checks(), run_cvd()
    here = os.path.dirname(os.path.abspath(__file__))
    cat_checks, cat_dist = run_category_checks(), run_category_distance()
    data = {'scales': S, 'tokens': TOKENS, 'checks': checks, 'cvd': cvd, 'steps': list(STEPS),
            'categories': CATS, 'defaults': DEFAULTS, 'catChecks': cat_checks, 'catDistance': cat_dist}
    with open(os.path.join(here, 'palette.json'), 'w') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=1)
    # palette.html is opened straight from disk, where neither fetch() nor a sibling script is
    # reliable: the data goes inside the page, between its two markers.
    page = os.path.join(here, 'palette.html')
    with open(page) as fp:
        html = fp.read()
    start, end = html.index('// palette:start') + len('// palette:start'), html.index('// palette:end')
    html = html[:start] + '\nwindow.PALETTE = ' + json.dumps(data, ensure_ascii=False) + ';\n' + html[end:]
    with open(page, 'w') as fp:
        fp.write(html)
    # F7: the app reads the same values. Generated, never edited by hand.
    app = os.path.normpath(os.path.join(here, '..', '..', '..', 'apps', 'mobile', 'src', 'lib', 'tokens', 'palette.gen.ts'))
    os.makedirs(os.path.dirname(app), exist_ok=True)
    cats = {c['id']: {'light': c['light'], 'dark': c['dark']} for c in CATS}
    with open(app, 'w') as fp:
        fp.write('// Generated by docs/design/foundations/palette.py (F1, F2). Do not edit: change the\n'
                 '// script and run `python3 docs/design/foundations/palette.py`.\n\n')
        fp.write('export const scales = ' + json.dumps(S, indent=2) + ' as const;\n\n')
        fp.write('export const semantic = ' + json.dumps(TOKENS, indent=2) + ' as const;\n\n')
        fp.write('export const categoryColors = ' + json.dumps(cats, indent=2) + ' as const;\n\n')
        fp.write('export type CategoryColor = keyof typeof categoryColors;\n')
    fails = [c for c in checks if not c['ok']]
    for name, sc in S.items():
        print(name.ljust(6), ' '.join(f'{k}:{v}' for k, v in sorted(sc.items())))
    print(f'\n{len(checks) - len(fails)}/{len(checks)} pairs pass')
    for c in fails:
        print('FAIL', c['mode'], c['label'], c['fg'], 'on', c['bg'], c['ratio'], '<', c['need'])
    cf = [c for c in cat_checks if not c['ok']]
    print(f'categories: {len(cat_checks) - len(cf)}/{len(cat_checks)} pass')
    for c in cf:
        print('FAIL', c)
    for k, v in cat_dist.items():
        print(k, 'closest pairs', v['pairs'][:3], 'closest to a status', v['status'][:2])
    print('\ncolour vision (OKLab distance; under ~0.08 starts to blur):')
    for c in cvd:
        print(c)
