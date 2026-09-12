# coding: utf-8
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('candidate',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
def read(path):
 last=None;n=0;models=set();first=None;end=None
 for line in path.open():
  try:r=json.loads(line)
  except ValueError:continue
  q=r.get('payload',{})
  if r.get('type')=='turn_context':models.add(q.get('model'))
  if r.get('type')=='event_msg' and q.get('type')=='token_count':
   u=(q.get('info') or {}).get('total_token_usage')
   if u and u!=last:
    first=first or r['timestamp'];end=r['timestamp'];last=u;n+=1
 assert last
 return {'log':str(path),'first_token_event':first,'last_token_event':end,'models':sorted(models),'requests_with_usage':n,**last,'uncached_input_tokens':last['input_tokens']-last['cached_input_tokens']}
b=read(a.baseline);c=read(a.candidate)
keys=['input_tokens','cached_input_tokens','uncached_input_tokens','output_tokens','total_tokens','requests_with_usage']
r={'baseline':b,'optimized':c,'reduction_percent':{k:round((1-c[k]/b[k])*100,2) for k in keys},'scope':'Independent worker vs worker only; excludes parent implementation, review and research overhead. Cumulative last counter once; cached within input, reasoning within output. One trial, not a general expected saving or invoice.'}
a.out.write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
