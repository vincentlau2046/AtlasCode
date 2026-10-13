import * as React from 'react';
import { useEffect, useState } from 'react';
import { Text } from '../../ink.js';
import { errorMessage } from '../../utils/errors.js';
import { createPluginReleaseTag } from '../../utils/plugins/pluginTag.js';
type Props = {
  plugin?: string;
  tag?: string;
  onComplete: (message?: string) => void;
};

/**
 * One-shot AD-07 release-tag action: version-checked git tag creation on an
 * installed plugin's repository. Works headless (completes with a text
 * message, like MarketplaceAdopt) and interactive. Clean (non-React-
 * Compiler) file, unlike its compiled siblings.
 */
export function TagPlugin({ plugin, tag, onComplete }: Props) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!plugin) {
      onComplete(
        'Usage: plugin tag <plugin> [--tag <tag>]\n' +
          'Creates a release git tag on the installed plugin\'s repository. ' +
          'The tag must match the version declared in the plugin manifest ' +
          '(default: v<manifest version>).',
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await createPluginReleaseTag(plugin, tag);
        if (cancelled) {
          return;
        }
        // Note: `r.ok === true` (not truthiness) — this project compiles
        // non-strict, where truthiness narrowing of the ok-discriminated
        // union is a no-op; the literal check keeps the branches narrowed.
        if (r.ok === true) {
          setDone(
            `Created release tag '${r.tag}' on plugin '${r.pluginId}' (manifest version ${r.version})\n` +
              `Repository: ${r.installPath}\n` +
              'Push it with: git push --tags (inside the plugin repository).',
          );
        } else {
          setError(r.message);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plugin, tag]);
  useEffect(() => {
    if (done !== null) {
      onComplete(done);
    } else if (error !== null) {
      onComplete(`Error tagging plugin '${plugin}': ${error}`);
    }
  }, [done, error]);
  if (done !== null) {
    return <Text color="brand">{done}</Text>;
  }
  if (error !== null) {
    return (
      <Text color="error">
        {`Error tagging plugin '${plugin}': ${error}`}
      </Text>
    );
  }
  return <Text dimColor>{`Tagging plugin '${plugin}'…`}</Text>;
}
