# coding: utf-8
import json
from pathlib import Path
sessions=Path('/Users/jangjunpyo/.codex/sessions/2026/09/11')
main=next(sessions.glob('*17-37-08*')); worker=next(sessions.glob('*18-07-47*'))
def read(p):
 for line in p.open():
  try: yield json.loads(line)
  except ValueError: continue
def usage(q): return (q.get('info') or {}).get('total_token_usage')
last=None;start=end=None;st=et=None
for r in read(main):
 q=r.get('payload',{})
 if r.get('type')=='event_msg' and q.get('type')=='token_count' and usage(q):last=usage(q)
 if r.get('type')=='response_item' and q.get('role')=='user':
  s=' '.join(c.get('text','') for c in q.get('content',[]))
  if s.startswith('하나만 더해볼까'): start=last.copy();st=r['timestamp']
  if s.startswith('뭐 크게 달라지진'):end=last.copy();et=r['timestamp'];break
assert start and end
wu=None
for r in read(worker):
 q=r.get('payload',{})
 if r.get('type')=='event_msg' and q.get('type')=='token_count' and usage(q):wu=usage(q)
mu={k:end[k]-start[k] for k in end}
combined={k:mu[k]+wu[k] for k in mu}
for u in (mu,wu,combined):
 u['uncached_input_tokens']=u['input_tokens']-u['cached_input_tokens']
 u['cache_share_of_input']=u['cached_input_tokens']/u['input_tokens']
result={'scope':'Toilet request through last token event preceding next user message; excludes current audit. Parent counter delta plus independent worker final counter, no summing cumulative events. Reasoning is within output, cached is within input.','start_utc':st,'end_utc':et,'parent_log':main.name,'worker_log':worker.name,'parent':mu,'worker':wu,'combined':combined,'billing':'Token counters, not an invoice or exact subscription quota attribution.'}
Path(__file__).with_name('usage.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
