#!/bin/bash
# 0.1.76 生产 lane：registry packument + tgz 独立拉取（D-8 三方复算面）
J=/home/vince/.claude/jobs/09264df0/tmp/prodlane-076
cd "$J"
curl -s -o packument.json https://registry.npmjs.org/@atlasharness%2Fatlascode
python3 -I -c "
import json
p=json.load(open('packument.json'))
d=p['versions'].get('0.1.76')
print('version 0.1.76 present:', d is not None)
if d: print('dist.tarball:', d['dist']['tarball'])
print('latest tag:', p.get('dist-tags',{}).get('latest'))
"
curl -s -O https://registry.npmjs.org/@atlasharness/atlascode/-/atlascode-0.1.76.tgz
mv -f atlascode-0.1.76.tgz atlasharness-atlascode-0.1.76.tgz 2>/dev/null
ls -l atlasharness-atlascode-0.1.76.tgz
echo '=== FETCH-076-DONE ==='
