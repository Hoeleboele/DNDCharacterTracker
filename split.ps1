
# split.ps1 - Extract app.js into split files
$src = "C:\Users\lsomers\Downloads\CharacterTracker\app.js"
$js  = "C:\Users\lsomers\Downloads\CharacterTracker\js"

$lines = [System.IO.File]::ReadAllLines($src)

# Helper: extract lines by 1-based ranges (pairs: from,to), strip 2-space IIFE indent
function Get-Section {
  param([int[]]$ranges)
  $out = [System.Collections.Generic.List[string]]::new()
  for ($i = 0; $i -lt $ranges.Length; $i += 2) {
    if ($i -gt 0) { $out.Add('') }   # blank separator between ranges
    $from = $ranges[$i] - 1
    $to   = $ranges[$i+1] - 1
    for ($j = $from; $j -le $to; $j++) {
      $line = $lines[$j]
      if ($line.StartsWith('  ')) { $line = $line.Substring(2) }
      $out.Add($line)
    }
  }
  return $out -join "`n"
}

function Write-JsFile {
  param([string]$path, [int[]]$ranges)
  $content = Get-Section $ranges
  [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "Created: $path"
}

# ── constants.js ─────────────────────────────────────────────────────────────
Write-JsFile "$js\constants.js" @(
  15, 19,       # STORAGE_KEY ... SETTINGS_KEY
  111, 234,     # EXAMPLE + DMGPT_PROMPT
  237, 248,     # TAB_COLORS + tabRgb
  1738, 1748,   # TAB_TIPS
  4002, 4005    # B32, B32_DEC, Object.assign
)

# ── utils.js ──────────────────────────────────────────────────────────────────
Write-JsFile "$js\utils.js" @(
  1349, 1356,   # comment + $ + clamp
  1357, 1465,   # deepClone through toInt (includes deepMerge at 1449)
  1637, 1644,   # safeFilename + toast
  3916, 3925,   # setPath
  3980, 3996    # // Escaping + escapeHtml + escapeAttr + signed
)

# ── state.js ──────────────────────────────────────────────────────────────────
Write-JsFile "$js\state.js" @(
  21, 27,       # loadAppSettings, saveAppSettings, appSettings, loadStarredFields, saveStarredFields, starredFields
  30, 72,       # // Multi-char comment + loadAllChars + saveChar + deleteChar + JSDoc */
  73, 109,      # newBlank
  1379, 1447,   # normalize
  250, 258,     # state vars (state, currentSaveName, activeTab, favTabs, etc.)
  261, 261      # gameMode
)

# ── firebase.js ───────────────────────────────────────────────────────────────
Write-JsFile "$js\firebase.js" @(
  2, 13,        # Firebase init (_fbApp, fbAuth, fbDb)
  271, 273,     # fbUser, cloudSyncedData
  275, 358      # auth state change + updateAuthBar + mergeCloudToLocal + saveCharToCloud + deleteCharFromCloud
)

# ── storage.js ────────────────────────────────────────────────────────────────
Write-JsFile "$js\storage.js" @(
  263, 263,     # autosaveInterval var
  1587, 1635,   # saveBtnLabel + flashSaveBtn + saveToLocalStorage + startAutosave + stopAutosave + loadFromLocalStorage + downloadJSON
  1733, 1735    # saveFavTabs
)

# ── data.js ───────────────────────────────────────────────────────────────────
Write-JsFile "$js\data.js" @(
  1467, 1586,   # wikiLookupItem + wikiLookupSpell
  4007, 4065    # uint8ToBase32 + base32ToUint8 + charToCode + codeToChar
)

# ── actions.js ────────────────────────────────────────────────────────────────
Write-JsFile "$js\actions.js" @(
  3927, 3978    # // Actions comment + applyHpDelta + setTempHp + doRest
)

# ── fields.js ─────────────────────────────────────────────────────────────────
Write-JsFile "$js\fields.js" @(
  3829, 3914    # // Field templates comment + fieldStar + textField + numField + selectField + textAreaField + wireTextFields + wireNumberFields + wireTextAreaFields + wireSelectFields
)

# ── multiplayer.js ────────────────────────────────────────────────────────────
Write-JsFile "$js\multiplayer.js" @(
  262, 262,     # mpPeer
  264, 270,     # mpHostConn through mpDetailTab (skip autosaveInterval=263, fbUser=271)
  794, 836,     # startHost
  837, 871,     # joinGame
  872, 878,     # syncToHost
  903, 1346     # genCode + renderHostView + renderPlayerCard + renderHostFullView + renderCharacterDetails
)

# ── tabs/overview.js ──────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\overview.js" @(
  2089, 2214    # getPath + tabForKey + renderOverview
)

# ── tabs/features.js ──────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\features.js" @(
  2215, 2375    # renderFeatures
)

# ── tabs/character.js ─────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\character.js" @(
  2376, 2571    # renderCharacter
)

# ── tabs/spells.js ────────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\spells.js" @(
  2572, 2895    # renderSpells
)

# ── tabs/stats.js ─────────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\stats.js" @(
  2896, 3044    # renderStats
)

# ── tabs/combat.js ────────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\combat.js" @(
  3045, 3474    # renderCombat
)

# ── tabs/inventory.js ─────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\inventory.js" @(
  3475, 3617    # renderInventory
)

# ── tabs/camp.js ──────────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\camp.js" @(
  3618, 3660    # renderCamp
)

# ── tabs/settings.js ──────────────────────────────────────────────────────────
Write-JsFile "$js\tabs\settings.js" @(
  3661, 3828    # renderSettings
)

# ── render.js ─────────────────────────────────────────────────────────────────
Write-JsFile "$js\render.js" @(
  1646, 1732,   # // Rendering comment + resize IIFE + render + renderHeader
  1750, 2088    # switchTab + showTabTip + renderTabNotch + renderTabsDesktop + renderTabs + renderContent
)

# ── landing.js ────────────────────────────────────────────────────────────────
Write-JsFile "$js\landing.js" @(
  359, 377,     # showLanding
  378, 594,     # showTutorial
  595, 606,     # charCloudBadge
  607, 755,     # showCharPicker
  756, 781,     # showModePicker
  782, 782,     # setLandingStatus
  784, 793,     # startSolo
  879, 901      # returnToMenu
)

# ── boot.js ───────────────────────────────────────────────────────────────────
Write-JsFile "$js\boot.js" @(
  3998, 3999,   # // Sidebar actions + $('#btnMainMenu').onclick
  4067, 4136    # $('#btnGetCode').onclick + copy + load + wipe + boot section
)

Write-Host "`nAll files created successfully!"
