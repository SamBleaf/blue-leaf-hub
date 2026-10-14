"""Independent arithmetic examples for the specification, NOT application tests.
Run: python3 verify-fixtures.py
Standard library only. Does not validate installation suitability or production code.
"""
import json, math
from pathlib import Path

def calculate(kind, a):
    if kind == 'flashingPieces':
        return sum(math.ceil((length+a['allowance'])/a['increment'])*a['increment'] for length in a['tightPieces'])
    if kind == 'aliSequence':
        remaining=a['stock']-a.get('endTrim',0)
        for length in a['cuts']:
            if length == remaining and a.get('finalEndAcceptable',False):
                remaining=0
            elif length+a['kerf'] <= remaining:
                remaining-=length+a['kerf']
            else:
                return None
        return remaining
    if kind == 'repeated':
        r = a['run'] - a.get('startOffset', 0) - a.get('endOffset', 0)
        if r <= 0: return None
        return math.ceil(r / a['centres']) + 1
    if kind == 'memberStock':
        length = a['length'] if a['mode'] == 'true' else a['length'] / math.cos(math.radians(a['pitch']))
        return math.ceil((length + a['allowance']) / a['increment']) * a['increment']
    if kind == 'stock':
        if 'available' in a:
            return next((x for x in sorted(a['available']) if x >= a['need']), None)
        n = max(a.get('min',1200), math.ceil(a['need'] / a['increment']) * a['increment'])
        return n if a.get('max') is None or n <= a['max'] else None
    if kind == 'linear': return a['areaM2'] / (a['coverMm']/1000) * (1+a['spareRate'])
    if kind == 'sheets': return sum(math.ceil(w/a['cover']) for w in a['walls'])
    if kind == 'panelGrid': return math.ceil((a['width']+a['gap'])/(a['panel']+a['gap'])) * math.ceil((a['height']+a['gap'])/(a['panel']+a['gap']))
    if kind == 'courses': return math.ceil(a['height']/a['cover'])
    if kind == 'supports': return (math.ceil(a['width']/a['centres'])+1)*a['height']
    if kind == 'sealant': return math.pi*(a['diameter']/2)**2*a['length']/1000
    if kind == 'fit': return sum(a['cuts'])+a['kerf']*(len(a['cuts'])-1)+a.get('endTrim',0) <= a['stock']
    if kind == 'netArea': return (a['width']*a['height']-a['openingWidth']*a['openingHeight'])/1e6
    raise ValueError(kind)

def main():
    data=json.loads(Path(__file__).with_name('fixtures.json').read_text())
    for f in data['cases']:
        actual=calculate(f['kind'],f['input']); expected=f['expected']
        good = actual == expected if expected is None or isinstance(expected, bool) else math.isclose(actual,expected,rel_tol=1e-9,abs_tol=1e-6)
        if not good: raise AssertionError(f"{f['id']}: {actual!r} != {expected!r}")
        print(f"PASS {f['id']}: {actual}")
    print(f"\n{len(data['cases'])} arithmetic examples passed. These do not execute or certify the Hub implementation.")
if __name__ == '__main__': main()
