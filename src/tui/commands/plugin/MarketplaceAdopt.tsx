import * as React from 'react';
import { useEffect, useState } from 'react';
import { Text } from '../../ink.js';
import { errorMessage } from '../../utils/errors.js';
import { adoptOrphanMarketplace } from '../../utils/plugins/marketplaceManager.js';
import { formatSourceForDisplay } from '../../utils/plugins/marketplaceHelpers.js';
type Props = {
  target?: string;
  name?: string;
  onComplete: (message?: string) => void;
};

/**
 * One-shot adopt action (WS3): register an already-materialized orphan
 * checkout under marketplaces/ without re-cloning. Works headless
 * (completes with a text message, like MarketplaceList) and interactive.
 * Clean (non-React-Compiler) file, unlike its compiled siblings.
 */
export function MarketplaceAdopt({ target, name, onComplete }: Props) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) {
      onComplete('Usage: plugin marketplace adopt <dir> [--name <name>]\nRun `plugin marketplace list` to see unregistered directories.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await adoptOrphanMarketplace(target, name);
        if (!cancelled) {
          setDone(
            `Adopted marketplace directory '${target}' as '${r.name}' (${formatSourceForDisplay(r.source)})\n` +
              `Install plugins from it with: plugin install <plugin>@${r.name}`,
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, name]);
  useEffect(() => {
    if (done !== null) {
      onComplete(done);
    } else if (error !== null) {
      onComplete(`Error adopting marketplace '${target}': ${error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, error]);
  if (done !== null) {
    return <Text color="brand">{done}</Text>;
  }
  if (error !== null) {
    return <Text color="error">{`Error adopting marketplace '${target}': ${error}`}</Text>;
  }
  return <Text dimColor>{`Adopting marketplace directory '${target}'…`}</Text>;
}