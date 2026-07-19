// seed-sandbox.mjs — WP-08/12 Sandbox-Seed (idempotent, SECRET-FREI).
//
// Legt unter einem Temp-Sandbox-Root die vier Config-Wurzeln an, die
// src/main/services/config-roots.ts erwartet, wenn RAWALLM_SANDBOX_ROOT gesetzt
// ist (sandboxRoots(): <root>/.claude, <root>/.codex, <root>/.shared/.claude,
// <root>/project). Damit laufen ALLE mutierenden v4-Owner-Flows ausschliesslich
// gegen diese Sandbox — die echte Config wird nie beschrieben (F1 HART).
//
// WP-08-ROLLOUT (alle Kategorien × Familien):
// Der Seed bildet JEDE Rollout-Achse ab — Kategorien {Skills, Rules, Agents,
// Hooks, Instructions, Settings, Teams, Plugins} × Familien-Paarungen
// {Shared↔Claude, Shared↔Codex, Mirror-im-selben-Tool}. Die Paarungs-Wahrheit
// ist dedupe.ts + manifest-map.ts + dedupe-key.ts:
//   - Paare entstehen NUR (a) Tool↔Shared (cross-family, eine Seite = 'shared')
//     oder (b) Mirror im selben Tool (Pfad matcht MIRROR_RX). Claude↔Codex paart
//     NIE (Owner-Designentscheid dedupe.ts:5-6) — Codex-Pendants laufen darum
//     immer gegen die SHARED-Seite (Shared↔Codex), nie gegen Claude.
//   - Gepaart wird nach normalisiertem entry.name: normalizeKey strippt
//     .md/.toml/.yml/.yaml/.json/.rules -> Codex-`foo.toml`/`foo.rules` paart mit
//     Shared-`foo.md`. DARUM tragen Paar-Partner denselben BASE-Namen.
//   - normalizeCat strippt 'shared-'/'codex-' -> 'rules'↔'shared-rules'↔
//     'codex-rules' liegen auf derselben Achse; Cross-Achse paart nicht.
//   - Ordner-Paare (Skills/Agents/Teams/Plugins) erreichen den rekursiven
//     compareDirs NUR ueber einen Manifest-Anker (toCompareDir): SKILL.md/AGENT.md
//     in JEDEM Kontext; config.json NUR als teams/<seg>/config.json; plugin.json/
//     package.json NUR als plugins/<seg>/<manifest>. CODEX weicht hier bewusst ab.
//
// CODEX-STRUKTUR-WAHRHEIT (codex-scan.ts, kritiker P1-D — NICHT Claude spiegeln!):
//   - Instructions = Root-Dateien ^(AGENTS|CLAUDE_PARITY|CODEX)\.md / ^(pm-|profile)\.toml
//   - Settings     = config.toml (SECRET-CLASSED -> read-only-Erwartung)
//   - Hooks        = hooks.json + hooks/*  (.cjs roh)
//   - Skills/Agents/Rules = scanDir(withContent) — .rules-Endung wird erfasst
//   - Teams        = teams/*.toml-DATEIEN (KEIN config.json-Ordner!)
//   - Plugins      = plugins/* ORDNER OHNE Manifest (withContent=false, kein Drilldown)
//
// SECRET-FREIHEIT: Alle "Secret"-Werte sind offensichtliche Platzhalter
// (KEY=platzhalter). Es werden NIE echte Secrets gelesen oder kopiert. Das
// Dummy-Token 'platzhalter' wird vom v4-Flow-Leak-Check (=platzhalter) gesucht.
//
// IDEMPOTENZ: file() schreibt jede Datei deterministisch auf den Soll-Stand
// zurueck; dir() ist mkdir-recursive. Ein zweiter Lauf stellt exakt denselben
// Zustand her (auch nach einem mutierenden Flow), der `_archive`-Root bleibt.
//
// Aufruf:
//   node tests/seed-sandbox.mjs            -> nutzt stabilen Temp-Root, gibt ihn aus
//   node tests/seed-sandbox.mjs <root>     -> seedet in <root> (idempotent)
// Stdout (letzte Zeile): SANDBOX_ROOT=<absoluter Pfad>  (von Flow-Scripts geparst)

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

// ── Root bestimmen: Argument hat Vorrang, sonst frischer Temp-Ordner ──────────
function resolveRoot() {
  const arg = process.argv[2]
  if (arg && arg.trim().length > 0) return resolve(arg.trim())
  // Stabiler, wiederverwendbarer Sandbox-Root (idempotent ueber Laeufe hinweg).
  return join(tmpdir(), 'rawallm-sandbox-seed')
}

const ROOT = resolveRoot()

// Die vier Wurzeln exakt wie sandboxRoots() in config-roots.ts.
const CLAUDE = join(ROOT, '.claude')
const CODEX = join(ROOT, '.codex')
const SHARED = join(ROOT, '.shared', '.claude')
const PROJECT = join(ROOT, 'project')

// ── Idempotente Schreib-Helfer ───────────────────────────────────────────────
function dir(p) {
  mkdirSync(p, { recursive: true })
  return p
}
// Datei nur auf den Soll-Stand schreiben (idempotent, aber re-seedbar). Ein
// zweiter Lauf stellt nach einem Flow den Ausgangszustand wieder her.
function file(p, content) {
  dir(p.slice(0, p.lastIndexOf(p.includes('\\') ? '\\' : '/')))
  writeFileSync(p, content, 'utf8')
  return p
}

// Skill-Manifest (SKILL.md) bauen — gueltiges Frontmatter, secret-frei.
function skillMd(name, desc, body) {
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    'model: sonnet',
    '---',
    '',
    `# ${name}`,
    '',
    body,
    ''
  ].join('\n')
}

// Agent-Manifest (AGENT.md / Claude-Einzeldatei-Agent) — gueltiges Frontmatter.
function agentMd(name, desc, body) {
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    'model: sonnet',
    'tools: Read, Grep, Glob',
    '---',
    '',
    `# ${name}`,
    '',
    body,
    ''
  ].join('\n')
}

// Mehrzeiliger Markdown-Body mit Seiten-Variante (fuer diff-Paare). Mehrere
// abweichende Zeilen + gemeinsame Zeilen -> LCS/Chunk-tauglich.
function variantMd(title, seite) {
  return [
    `# ${title}`,
    '',
    'Grundsatz: gemeinsame Zeile.',
    `Detail-A: ${seite}-Fassung.`,
    'Mitte: gemeinsam.',
    `Detail-B: ${seite}-Fassung.`,
    'Schluss: gemeinsam.',
    ''
  ].join('\n')
}

// ── Wurzeln + Pflicht-Unterordner anlegen ────────────────────────────────────
for (const base of [CLAUDE, CODEX, SHARED, PROJECT]) dir(base)
for (const base of [CLAUDE, SHARED]) {
  dir(join(base, 'skills'))
  dir(join(base, 'rules'))
  dir(join(base, 'agents'))
  dir(join(base, 'plugins'))
}
dir(join(CLAUDE, 'teams'))
dir(join(SHARED, 'tools'))
// Codex-Unterordner (eigene Struktur — Teams=*.toml-Dateien, Plugins=Ordner-ohne-Manifest).
for (const sub of ['skills', 'rules', 'agents', 'plugins', 'teams', 'hooks']) dir(join(CODEX, sub))
// HR7-Archiv-Root der Sandbox: getWriteContext() nutzt <root>/_archive als
// archiveRoot; backup.ts legt ihn NICHT selbst an (archive-missing = STOP).
// Ohne diesen Ordner bricht JEDE Mutation korrekt ab.
dir(join(ROOT, '_archive'))

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: SKILLS  (Ordner-Manifest SKILL.md)
// ══════════════════════════════════════════════════════════════════════════════

// (S1) Shared↔Claude diff-Ordner MIT mehreren Innendateien: "skill-diff-multi"
// SKILL.md identisch, extra.md weicht ab -> verdict=diff; mirror-only nur-claude.md.
{
  const nm = 'skill-diff-multi'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Demo-Skill mit abweichender Innendatei', 'Gemeinsamer Hauptinhalt, identisch auf beiden Seiten.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', 'Zeile C — Shared-Variante', 'Zeile D gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'extra.md'), ['# Extra (Claude)', '', 'Zeile A — Claude-Variante', 'Zeile B gemeinsam', 'Zeile C — Claude-Variante', 'Zeile D gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'nur-claude.md'), ['# Nur Claude', '', 'Diese Innendatei existiert nur auf der Claude-Seite.', ''].join('\n'))
}

// (S2) Shared↔Claude IDENTISCH (verdict same): "skill-same"
{
  const nm = 'skill-same'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Identischer Demo-Skill auf beiden Seiten', 'Byte-identischer Inhalt -> verdict same.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
}

// (S3) only-Shared-Ordner (mehrere Innendateien): "skill-only-shared"
{
  const nm = 'skill-only-shared'
  const d = dir(join(SHARED, 'skills', nm))
  file(join(d, 'SKILL.md'), skillMd(nm, 'Nur in Shared vorhanden', 'Existiert nur auf der Shared-Seite.'))
  file(join(d, 'notes.md'), ['# Notizen (Shared-only)', '', 'Zusatzdatei eins.', ''].join('\n'))
  file(join(d, 'guide.md'), ['# Anleitung (Shared-only)', '', 'Zusatzdatei zwei.', ''].join('\n'))
}

// (S4) only-Claude-Ordner (mehrere Innendateien): "skill-only-claude"
{
  const nm = 'skill-only-claude'
  const d = dir(join(CLAUDE, 'skills', nm))
  file(join(d, 'SKILL.md'), skillMd(nm, 'Nur in Claude vorhanden', 'Existiert nur auf der Claude-Seite.'))
  file(join(d, 'notes.md'), ['# Notizen (Claude-only)', '', 'Zusatzdatei eins.', ''].join('\n'))
  file(join(d, 'guide.md'), ['# Anleitung (Claude-only)', '', 'Zusatzdatei zwei.', ''].join('\n'))
}

// (S5) Shared↔Codex Skill-Ordner diff: "skill-codex-pair"
// SHARED-Seite: SKILL.md-Ordner. CODEX-Seite: scanDir(withContent) listet den
// Ordner; codex-scanDirEntry drillt auf SKILL.md. Manifest-Anker beidseitig ->
// compareDirs. extra.md weicht ab -> diff. (Shared ist Paar-Partner, NICHT Claude.)
{
  const nm = 'skill-codex-pair'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const codexDir = dir(join(CODEX, 'skills', nm))
  const manifest = skillMd(nm, 'Shared↔Codex Skill-Ordner-Paar', 'Gemeinsamer Hauptinhalt.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(codexDir, 'SKILL.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(codexDir, 'extra.md'), ['# Extra (Codex)', '', 'Zeile A — Codex-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}

// (S6) Mirror-im-selben-Tool (Claude): MIRROR_RX matcht den Pfad ('mirror').
// Beide liegen UNTER skills/ in Claude (gleiche Familie) -> nur via MIRROR_RX
// vergleichbar. Gleicher Skill-Name in normalem Ordner + Mirror-Ordner.
{
  const nm = 'skill-mirror-pair'
  const normalDir = dir(join(CLAUDE, 'skills', nm))
  const mirrorDir = dir(join(CLAUDE, 'skills', 'mirror', nm))
  const manifest = skillMd(nm, 'Mirror-Paar im selben Tool (Claude)', 'Original-Inhalt.')
  file(join(normalDir, 'SKILL.md'), manifest)
  file(join(mirrorDir, 'SKILL.md'), manifest)
  // abweichende Innendatei -> diff (Mirror weicht ab)
  file(join(normalDir, 'body.md'), ['# Body (Original)', '', 'Zeile A — Original-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(mirrorDir, 'body.md'), ['# Body (Spiegel)', '', 'Zeile A — Spiegel-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: RULES  (Einzeldateien — kein Manifest -> compareSingleFile)
// ══════════════════════════════════════════════════════════════════════════════

// (R1) Shared↔Claude Einzeldatei-diff: "rule-diff.md" (beidseitig .md)
// Mehrere abweichende Zeilen -> Chunk-Uebernahme beide Richtungen + Save je Seite.
{
  const nm = 'rule-diff.md'
  file(join(SHARED, 'rules', nm), variantMd('Demo-Regel', 'Shared'))
  file(join(CLAUDE, 'rules', nm), variantMd('Demo-Regel', 'Claude'))
}

// (R2) Shared↔Claude Einzeldatei IDENTISCH: "rule-same.md" (verdict same)
{
  const nm = 'rule-same.md'
  const body = variantMd('Identische Regel', 'gemeinsam')
  file(join(SHARED, 'rules', nm), body)
  file(join(CLAUDE, 'rules', nm), body)
}

// (R3) Shared↔Codex Einzeldatei-diff: BASE "rule-codex".
// SHARED: rule-codex.md  ·  CODEX: rule-codex.rules  (W8-Fix: .rules wird erfasst).
// normalizeKey strippt .md UND .rules -> beide Keys = 'rule-codex' -> paaren.
// compareSingleFile (echte Datei-Pfade, kein Manifest). (Shared ist Paar-Partner.)
{
  file(join(SHARED, 'rules', 'rule-codex.md'), variantMd('Codex-Achsen-Regel', 'Shared'))
  file(join(CODEX, 'rules', 'rule-codex.rules'), variantMd('Codex-Achsen-Regel', 'Codex'))
}

// (R4) Mirror-im-selben-Tool (Shared): rules/<x>.md + rules/backup/<x>.md.
// 'backup' matcht MIRROR_RX -> Mirror-Paar im selben Tool (Shared-Familie).
{
  const nm = 'rule-mirror.md'
  file(join(SHARED, 'rules', nm), variantMd('Mirror-Regel', 'Original'))
  file(join(SHARED, 'rules', 'backup', nm), variantMd('Mirror-Regel', 'Spiegel'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: AGENTS  (zwei Formen: AGENT.md-ORDNER UND Claude-Einzeldatei-Agent)
// ══════════════════════════════════════════════════════════════════════════════

// (A1) Shared↔Codex AGENT.md-ORDNER diff: "agent-folder-pair"
// SHARED-Seite: agents/<nm>/AGENT.md (Ordner). CODEX: scanDir(agents, withContent)
// listet den Ordner + drillt auf AGENT.md. Manifest-Anker beidseitig -> compareDirs.
// (Claude-Agents sind EINZELDATEIEN -> Ordner-Form gegen Shared/Codex testen.)
{
  const nm = 'agent-folder-pair'
  const sharedDir = dir(join(SHARED, 'agents', nm))
  const codexDir = dir(join(CODEX, 'agents', nm))
  const manifest = agentMd(nm, 'Shared↔Codex AGENT.md-Ordner-Paar', 'Gemeinsame Agent-Definition.')
  file(join(sharedDir, 'AGENT.md'), manifest)
  file(join(codexDir, 'AGENT.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(codexDir, 'extra.md'), ['# Extra (Codex)', '', 'Zeile A — Codex-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}

// (A2) Shared↔Claude Claude-EINZELDATEI-Agent diff: BASE "agent-single".
// Claude collectAgents() listet agents/*.md als Einzeldatei (name = ohne .md).
// SHARED: agents/agent-single.md (Datei). normalizeKey strippt .md beidseitig.
// compareSingleFile (beide echte Dateien, kein Manifest-Ordner).
{
  const nm = 'agent-single.md'
  file(join(SHARED, 'agents', nm), agentMd('agent-single', 'Shared↔Claude Einzeldatei-Agent', variantMd('Inhalt', 'Shared')))
  file(join(CLAUDE, 'agents', nm), agentMd('agent-single', 'Shared↔Claude Einzeldatei-Agent', variantMd('Inhalt', 'Claude')))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: HOOKS  (.cjs-Dateien)  — Codex: hooks.json + hooks/*; Claude: settings.json + hooks/*
// ══════════════════════════════════════════════════════════════════════════════

// (H1) Shared↔Codex Hook-Skript diff: BASE "demo-hook.cjs" (beidseitig .cjs).
// SHARED scanDir hooks (A-Kategorie, content) listet .cjs als Datei. CODEX scanHooks
// listet hooks/*.cjs als Datei. Gleiche Achse 'hooks', eine Seite = shared -> paaren.
// .cjs ist KEINE Secret-Klasse -> Roh-Inhalt, compareSingleFile (diff via 1 Zeile).
{
  const nm = 'demo-hook.cjs'
  const head = ['#!/usr/bin/env node', "// Demo-Hook (secret-frei) — nur Struktur.", "const EVENT = 'SessionStart'"].join('\n')
  file(join(SHARED, 'hooks', nm), `${head}\nconsole.log('[demo-hook] shared-variante')\n`)
  file(join(CODEX, 'hooks', nm), `${head}\nconsole.log('[demo-hook] codex-variante')\n`)
}

// (H2) Codex hooks.json-Registrierung (Events/Namen; KEINE Secrets, nur Pfade).
// scanHooks liest hooks.json -> Events; maskedPreview maskiert. Re-seedbar.
{
  const hooksJson = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node hooks/demo-hook.cjs' }] }]
    }
  }
  file(join(CODEX, 'hooks.json'), JSON.stringify(hooksJson, null, 2))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: INSTRUCTIONS  (CLAUDE.md / AGENTS.md)
// ══════════════════════════════════════════════════════════════════════════════

// (I1) Shared↔Codex Instructions diff: BASE "AGENTS.md" (beidseitig .md).
// SHARED buildInstructions() listet Top-Level .shared/.claude/*.md (nicht .).
// CODEX scanInstructions() listet Root-^(AGENTS|CLAUDE_PARITY|CODEX)\.md.
// Achse 'instructions' beidseitig, eine Seite = shared -> compareSingleFile diff.
{
  const nm = 'AGENTS.md'
  file(join(SHARED, nm), variantMd('Cross-WS Startanker', 'Shared'))
  file(join(CODEX, nm), variantMd('Cross-WS Startanker', 'Codex'))
}

// (I2) Claude Instructions: CLAUDE.md am .claude-Root (collectInstructions()).
// Kein Shared-Pendant mit gleichem Namen -> kein Paar (Claude-Instructions sind
// CLAUDE.md, Shared-Instructions sind Overview/AGENTS); dient der Kategorie-
// Vollstaendigkeit (Uebersicht/Anzeige je Familie) + Overview-Edit-Flow.
{
  file(join(CLAUDE, 'CLAUDE.md'), ['# Globale Instruktionen (Sandbox)', '', 'Demo-Startanker fuer die Claude-Familie.', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: SETTINGS  (secret-classed Paar — fuer WP-06-Secret-Paar-Flow)
// ══════════════════════════════════════════════════════════════════════════════

// (SE1) Shared↔Codex Settings SECRET-Paar.
// CODEX-Settings = config.toml (secret-classed). Damit ein SHARED-Pendant auf der
// Achse 'settings' paart, braucht es eine Shared-settings-Karte. Der Shared-Scan
// hat KEINE 'settings'-Kategorie -> stattdessen: das beidseitig-secret-Paar wird
// auf der CLAUDE-Settings-Achse gegen SHARED erprobt, UND config.toml liegt als
// secret-classed Codex-Datei vor (read-only-Erwartung). config.toml wird vom
// Read-Scanner secret-maskiert; assertWritable lehnt Schreiben ab (owner-only).
{
  // config.toml (Codex-Hauptconfig, SECRET-CLASSED). Nur Struktur, Werte DUMMY.
  const configToml = [
    '# Codex-Hauptconfig (Sandbox, DUMMY) — config.toml ist secret-classed.',
    'model = "demo-model"',
    'approval_policy = "on-request"',
    'sandbox_mode = "read-only"',
    '',
    '[profiles.demo]',
    'note = "platzhalter"',
    ''
  ].join('\n')
  file(join(CODEX, 'config.toml'), configToml)
}

// (SE2) Shared↔Claude Settings-Datei-Paar als beidseitig-secret (settings.json).
// settings.json ist secret-classed (matchesPrefixClass). Beide Seiten maskiert ->
// dedupe verdict aus Roh-SHA korrekt, masked=true -> WP-06 read-only-Badge-Flow.
{
  const settings = JSON.stringify({ permissions: { deny: [], allow: [] }, env: {}, hooks: {} }, null, 2)
  file(join(CLAUDE, 'settings.json'), settings)
  file(join(SHARED, 'settings.json'), settings)
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: TEAMS  — Claude: config.json-ORDNER  ·  Codex: teams/*.toml-DATEIEN
// ══════════════════════════════════════════════════════════════════════════════

// (T1) Claude↔Shared Teams config.json-ORDNER diff: "team-folder-pair"
// Claude collectTeams() drillt teams/<nm>/config.json. manifest-map ankert
// config.json NUR als teams/<seg>/config.json -> compareDirs (Ordner-Paar).
// SHARED-Seite traegt denselben teams/<nm>/config.json-Ordner (Achse 'teams',
// shared-Seite). (Claude↔Shared, NICHT Codex — Codex-Teams sind .toml-Dateien.)
{
  const nm = 'team-folder-pair'
  const claudeDir = dir(join(CLAUDE, 'teams', nm))
  const sharedDir = dir(join(SHARED, 'teams', nm))
  const cfgA = JSON.stringify({ name: nm, members: ['a', 'b'], note: 'claude-variante' }, null, 2)
  const cfgB = JSON.stringify({ name: nm, members: ['a', 'b'], note: 'shared-variante' }, null, 2)
  file(join(claudeDir, 'config.json'), cfgA)
  file(join(sharedDir, 'config.json'), cfgB)
  // zusaetzliche Innendatei je Seite -> Ordner-Vergleich hat mehr als das Manifest
  file(join(claudeDir, 'roster.md'), ['# Roster (Claude)', '', 'Mitglied a, Mitglied b.', ''].join('\n'))
  file(join(sharedDir, 'roster.md'), ['# Roster (Shared)', '', 'Mitglied a, Mitglied b.', ''].join('\n'))
}

// (T2) Shared↔Codex Teams diff: BASE "team-codex".
// CODEX-Teams = teams/*.toml-DATEIEN (KEIN config.json-Ordner!). scanDir(teams,
// withContent) listet die .toml als Datei. SHARED-Seite: teams/team-codex.md als
// Einzeldatei-Pendant. normalizeKey strippt .toml/.md -> Key 'team-codex' paart;
// compareSingleFile (keine Manifest-Ordner). Genau die Codex-Form, keine Fiktion.
{
  file(join(SHARED, 'teams', 'team-codex.md'), variantMd('Codex-Team', 'Shared'))
  file(join(CODEX, 'teams', 'team-codex.toml'), ['# Codex-Team (Sandbox, secret-frei)', 'name = "team-codex"', 'note = "codex-variante"', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: PLUGINS  — Claude: plugin.json-ORDNER  ·  Codex: ORDNER OHNE Manifest
// ══════════════════════════════════════════════════════════════════════════════

// (P1) Claude↔Shared Plugins plugin.json-ORDNER diff: "plugin-folder-pair"
// Claude collectPlugins() drillt plugins/<nm>/plugin.json (drillPluginEntry).
// manifest-map ankert plugin.json NUR als plugins/<seg>/plugin.json -> compareDirs.
// SHARED-Seite: gleicher plugins/<nm>/plugin.json-Ordner (Achse 'plugins', shared).
{
  const nm = 'plugin-folder-pair'
  const claudeDir = dir(join(CLAUDE, 'plugins', nm))
  const sharedDir = dir(join(SHARED, 'plugins', nm))
  const manA = JSON.stringify({ name: nm, version: '1.0.0', note: 'claude-variante' }, null, 2)
  const manB = JSON.stringify({ name: nm, version: '1.0.0', note: 'shared-variante' }, null, 2)
  file(join(claudeDir, 'plugin.json'), manA)
  file(join(sharedDir, 'plugin.json'), manB)
  file(join(claudeDir, 'README.md'), ['# Plugin (Claude)', '', 'Demo-Plugin.', ''].join('\n'))
  file(join(sharedDir, 'README.md'), ['# Plugin (Shared)', '', 'Demo-Plugin.', ''].join('\n'))
}

// (P2) Codex Plugins = ORDNER OHNE Manifest (withContent=false, kein Drilldown).
// scanDir('codex-plugins', …, withContent=false) -> dirEntry, KEIN Manifest-Drill.
// Kein Shared-Pendant mit gleichem Namen -> KEIN Paar (Codex-Plugins sind by
// design nur Ordner-Listing ohne Vergleich). Dient der Codex-Struktur-Wahrheit:
// WP-09 prueft, dass die Codex-Plugins-Karte den Ordner OHNE Aktionen/Drill zeigt.
{
  const d = dir(join(CODEX, 'plugins', 'codex-plugin-bare'))
  // bewusst KEIN plugin.json/package.json — Codex-Plugins haben kein Manifest.
  file(join(d, 'notes.txt'), ['Codex-Plugin-Ordner ohne Manifest (Sandbox).', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  WP-06 P1-C: GEMISCHTER Ordner mit GENAU EINER secret-Datei
// ══════════════════════════════════════════════════════════════════════════════

// (M1) Shared↔Claude Skill-Ordner-Paar, in dem EINE Innendatei secret-classed ist
// (.env). compareDirs markiert die .env-Zeile secret=true (isSecretPathForRead);
// die uebrigen Dateien sind normal vergleichbar -> "gemischter Ordner". WP-06
// kennzeichnet die secret-Zeile als „geschützt — übersprungen", die anderen
// Dateien bleiben normal aktionsfaehig. DUMMY-Werte (=platzhalter), nie echt.
{
  const nm = 'skill-mixed-secret'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Gemischter Ordner mit einer secret-Datei', 'Normaler Skill-Inhalt.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
  // normale diff-Innendatei (vergleichbar)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'extra.md'), ['# Extra (Claude)', '', 'Zeile A — Claude-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  // GENAU EINE secret-Datei (.env, DUMMY) je Seite -> pro-Datei skip-Kennzeichnung.
  const envBody = ['# Dummy-Env (gemischter Ordner) — KEINE echten Werte', 'API_KEY=platzhalter', 'TOKEN=platzhalter', ''].join('\n')
  file(join(sharedDir, '.env'), envBody)
  file(join(claudeDir, '.env'), envBody)
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECRET-GATE Einzeldatei (FLOW-J): .env + settings.local.json (DUMMY) je Seite
// ══════════════════════════════════════════════════════════════════════════════
{
  const envBody = ['# Dummy-Env zum Secret-Gate-Test — KEINE echten Werte', 'API_KEY=platzhalter', 'DB_PASS=platzhalter', 'TOKEN=platzhalter', ''].join('\n')
  file(join(SHARED, '.env'), envBody)
  file(join(CLAUDE, '.env'), envBody)
  // settings.local.json (secret-classed) -> maskierter Instructions-/Settings-Eintrag.
  const localJson = JSON.stringify({ note: 'dummy', token: 'platzhalter', env: { DEMO_PW: 'platzhalter' } }, null, 2)
  file(join(CLAUDE, 'settings.local.json'), localJson)
}

// ── Ergebnis ──────────────────────────────────────────────────────────────────
console.log('[seed-sandbox] Wurzeln:')
console.log('  claudeHome  =', CLAUDE)
console.log('  codexHome   =', CODEX)
console.log('  sharedClaude=', SHARED)
console.log('  projectRoot =', PROJECT)
console.log('[seed-sandbox] Skills: skill-diff-multi(diff) skill-same(same) skill-only-shared skill-only-claude skill-codex-pair(S↔Codex) skill-mirror-pair(Mirror) skill-mixed-secret(P1-C)')
console.log('[seed-sandbox] Rules: rule-diff.md(S↔Claude) rule-same.md(same) rule-codex.md/.rules(S↔Codex) rule-mirror.md(Mirror)')
console.log('[seed-sandbox] Agents: agent-folder-pair(AGENT.md-Ordner S↔Codex) agent-single.md(Einzeldatei S↔Claude)')
console.log('[seed-sandbox] Hooks: demo-hook.cjs(S↔Codex) + codex hooks.json')
console.log('[seed-sandbox] Instructions: AGENTS.md(S↔Codex) + claude CLAUDE.md')
console.log('[seed-sandbox] Settings: config.toml(secret) settings.json-Paar(secret S↔Claude) settings.local.json')
console.log('[seed-sandbox] Teams: team-folder-pair(config.json-Ordner C↔S) team-codex.toml(Codex-Datei S↔Codex)')
console.log('[seed-sandbox] Plugins: plugin-folder-pair(plugin.json-Ordner C↔S) codex-plugin-bare(Codex Ordner-ohne-Manifest)')
// Letzte Zeile maschinell parsbar:
console.log(`SANDBOX_ROOT=${ROOT}`)
