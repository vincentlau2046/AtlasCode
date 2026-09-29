import figures from 'figures'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Byline } from '../../components/design-system/Byline.js'
import { SearchBox } from '../../components/SearchBox.js'
import { useSearchInput } from '../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for raw search mode text input
import { Box, Text, useInput, useTerminalFocus } from '../../ink.js'
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js'
import type { PluginMarketplaceEntry } from '../../utils/plugins/schemas.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import { installPluginFromMarketplace } from '../../utils/plugins/pluginInstallationHelpers.js'
import {
  type MarketSkill,
  searchSkillsAcrossMarketplaces,
} from '../../utils/plugins/skillSearch.js'
import { truncateToWidth } from '../../utils/truncate.js'
import type { ViewState as ParentViewState } from './types.js'

type Props = {
  error: string | null
  setError: (error: string | null) => void
  result: string | null
  setResult: (result: string | null) => void
  setViewState: (state: ParentViewState) => void
  onInstallComplete?: () => void | Promise<void>
  onSearchModeChange?: (isActive: boolean) => void
}

/**
 * "Skills" dimension of the Discover tab (WS4). Skill marketplaces parasitize
 * the plugin marketplace: a skill-pack is a plugin that ships a `skills/` dir
 * of SKILL.md files. This view surfaces a skill-level catalog across every
 * *materialized* marketplace (uninstalled included — the point is discovery
 * before install); selecting a skill installs its parent plugin through the
 * existing install path. It's a clean (non-compiled) sibling to
 * DiscoverPlugins so the compiled state machine there stays untouched.
 */
export function DiscoverSkills({
  error,
  setError,
  result: _result,
  setResult,
  setViewState,
  onInstallComplete,
  onSearchModeChange,
}: Props): React.ReactNode {
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [isSearchMode, setIsSearchModeRaw] = useState(false)
  const setIsSearchMode = useCallback(
    (active: boolean) => {
      setIsSearchModeRaw(active)
      onSearchModeChange?.(active)
    },
    [onSearchModeChange],
  )
  const { query, setQuery, cursorOffset } = useSearchInput({
    isActive: isSearchMode && !loading,
    onExit: () => setIsSearchMode(false),
  })
  const isTerminalFocused = useTerminalFocus()
  const { columns: terminalWidth } = useTerminalSize()

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installError, setInstallError] = useState<string | null>(null)

  // Load the skill catalog (cache-only — no network fetches)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const all = await searchSkillsAcrossMarketplaces()
        if (!cancelled) setSkills(all)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load skills')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [setError])

  // Filter by search query (case-insensitive over name / description / when-to-use)
  const filteredSkills = useMemo(() => {
    if (!query) return skills
    const q = query.toLowerCase()
    return skills.filter(
      s =>
        s.skill.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.whenToUse ?? '').toLowerCase().includes(q),
    )
  }, [skills, query])

  // Reset selection when the filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const installSkill = useCallback(
    async (skill: MarketSkill) => {
      setInstalling(new Set([skill.installId]))
      setInstallError(null)
      // Reconstruct a minimal entry so the installer can resolve the parent
      // plugin's local source (carried on MarketSkill by the search).
      const entry = {
        name: skill.plugin,
        source: skill.source,
        version: skill.version,
      } as PluginMarketplaceEntry
      const res = await installPluginFromMarketplace({
        pluginId: skill.installId,
        entry,
        marketplaceName: skill.marketplace,
        scope: 'user',
      })
      setInstalling(new Set())
      if (res.success) {
        clearAllCaches()
        setResult(res.message ?? `✓ Installed ${skill.plugin}`)
        if (onInstallComplete) {
          await onInstallComplete()
        }
        setViewState({ type: 'menu' })
      } else {
        setInstallError(res.error ?? 'Install failed')
      }
    },
    [onInstallComplete, setResult, setViewState],
  )

  // Esc — back to the plugin menu
  useKeybinding('confirm:no', () => {
    setViewState({ type: 'menu' })
  }, { context: 'Confirmation', isActive: true })

  // List navigation + accept (install)
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex === 0) {
          setIsSearchMode(true)
        } else {
          setSelectedIndex(selectedIndex - 1)
        }
      },
      'select:next': () => {
        if (selectedIndex < filteredSkills.length - 1) {
          setSelectedIndex(selectedIndex + 1)
        }
      },
      'select:accept': () => {
        const skill = filteredSkills[selectedIndex]
        if (skill) {
          void installSkill(skill)
        }
      },
    },
    { context: 'Select', isActive: !isSearchMode && !loading },
  )

  // Enter raw search mode with '/' or any printable character
  useInput((input, key) => {
    const keyIsNotCtrlOrMeta = !key.ctrl && !key.meta
    if (!isSearchMode) {
      if (input === '/' && keyIsNotCtrlOrMeta) {
        setIsSearchMode(true)
        setQuery('')
      } else if (
        keyIsNotCtrlOrMeta &&
        input.length > 0 &&
        !/^\s+$/.test(input) &&
        input !== 'j' &&
        input !== 'k'
      ) {
        setIsSearchMode(true)
        setQuery(input)
      }
    }
  }, { isActive: !loading })

  if (loading) {
    return <Text>Loading skills…</Text>
  }

  if (error) {
    return <Text color="error">{error}</Text>
  }

  const visibleWidth = Math.max(20, terminalWidth - 4)

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Discover skills</Text>
        <Text dimColor> {skills.length} across your marketplaces</Text>
      </Box>

      <Box marginBottom={1}>
        <SearchBox
          query={query}
          isFocused={isSearchMode}
          isTerminalFocused={isTerminalFocused}
          width={visibleWidth}
          cursorOffset={cursorOffset}
        />
      </Box>

      {installError && (
        <Box marginBottom={1}>
          <Text color="error">Error: {installError}</Text>
        </Box>
      )}

      {skills.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>
            No skills found in your marketplaces yet.
          </Text>
          <Text dimColor>
            Skills ship inside skill-pack plugins — install one via{' '}
            <Text bold>/plugin</Text> to see its skills here.
          </Text>
        </Box>
      ) : filteredSkills.length === 0 && query ? (
        <Box marginBottom={1}>
          <Text dimColor>No skills match "{query}"</Text>
        </Box>
      ) : (
        filteredSkills.map((skill, index) => {
          const isSelected = selectedIndex === index
          const isInstallingThis = installing.has(skill.installId)
          return (
            <Box key={skill.installId} flexDirection="column" marginBottom={1}>
              <Box>
                <Text>
                  {isInstallingThis
                    ? figures.ellipsis
                    : isSelected && !isSearchMode
                      ? figures.pointer
                      : ' '}{' '}
                </Text>
                <Text
                  color={isSelected && !isSearchMode ? 'suggestion' : undefined}
                >
                  {skill.skill}
                </Text>
                <Text dimColor>
                  {' · '}
                  {skill.plugin}
                  <Text dimColor>
                    {' @'}
                    {skill.marketplace}
                  </Text>
                </Text>
                {skill.isInstalled && (
                  <Text dimColor> [installed]</Text>
                )}
              </Box>
              {skill.description && (
                <Box marginLeft={2}>
                  <Text dimColor>
                    {truncateToWidth(skill.description, visibleWidth - 2)}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })
      )}

      <Box marginTop={1}>
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="select:accept"
              context="Select"
              fallback="Enter"
              description="install"
            />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="back"
            />
          </Byline>
        </Text>
      </Box>
    </Box>
  )
}
