import hashlib, tarfile, base64, json, os

J = '/home/vince/.claude/jobs/09264df0/tmp/prodlane-073'
tgz = os.path.join(J, 'atlasharness-atlascode-0.1.73.tgz')

pack = json.load(open(os.path.join(J, 'packument.json')))
reg = pack['versions']['0.1.73']['dist']

b = open(tgz, 'rb').read()
sha1 = hashlib.sha1(b).hexdigest()
sha512 = 'sha512-' + base64.b64encode(hashlib.sha512(b).digest()).decode()

tot = 0
cli = None
with tarfile.open(tgz, 'r:gz') as t:
    for m in t.getmembers():
        if m.isfile():
            tot += m.size
            if m.name == 'package/dist/cli.js':
                cli = m.size

out = {
    'tgzBytes': len(b),
    'sha1': sha1,
    'sha512': sha512,
    'unpackedSize': tot,
    'cliJs': cli,
    'registry': {
        'shasum': reg['shasum'],
        'integrity': reg['integrity'],
        'unpackedSize': reg['unpackedSize'],
        'fileCount': reg['fileCount'],
    },
}
print(json.dumps(out, indent=2))

print('--- 三方对照 ---')
print('sha1  : 独立=%s registry=%s' % (sha1, reg['shasum']))
print('sha512: 独立=%s registry=%s' % (sha512, reg['integrity']))
print('unpck : 独立=%s registry=%s' % (tot, reg['unpackedSize']))
print('cli.js: 独立=%s' % cli)

# extract
ext = os.path.join(J, 'extracted')
os.makedirs(ext, exist_ok=True)
with tarfile.open(tgz, 'r:gz') as t:
    t.extractall(ext)
print('extracted ->', ext)