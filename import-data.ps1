param(
  [string]$CsvPath = "\\?\C:\Users\wordo\Downloads\LeafLock_Pharmacy_Contacts_Prioritized 19-6-26 - All Pharmacies.csv",
  [string]$OutDir = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

Add-Type -AssemblyName Microsoft.VisualBasic

if (-not (Test-Path $CsvPath)) {
  $fallback = Join-Path $OutDir "source\pharmacies.csv"
  if (Test-Path $fallback) { $CsvPath = $fallback } else { throw "Pharmacy CSV not found: $CsvPath" }
}

$popularChains = @(
  "chemist warehouse", "priceline", "terry white", "terrywhite", "amcal", "wizard",
  "pharmacy 4 less", "discount drug", "capital chemist", "canwell", "medigreen",
  "greenlife", "green street", "vert dispensary", "pharmacy 777", "terrywhite chemmart"
)

function Get-HashNum([string]$id) {
  $h = 0
  foreach ($c in $id.ToCharArray()) { $h = ($h * 31 + [int][char]$c) % 1000000 }
  return $h
}

function Test-Phone([string]$s) { $s -match '^\(\d{2}\)' -or $s -match '^\(0\d\)' -or $s -match '^\d{2} \d{4}' }
function Test-Email([string]$s) { $s -match '@' }

function Test-Popular([string]$name) {
  $n = $name.ToLower()
  foreach ($p in $popularChains) { if ($n -like "*$p*") { return $true } }
  return $false
}

function Test-HighCompounding([string]$type, [string]$relevance) {
  return ($relevance -eq 'High') -and ($type -match 'Compounding|Medicinal Cannabis')
}

function Get-TierPayload([int]$tier) {
  switch ($tier) {
    500  { return @{ orderTier = 500; units = 500; unitPrice = 1.45; subtotal = 725; shipping = 25; tax = 75; value = 825 } }
    1000 { return @{ orderTier = 1000; units = 1000; unitPrice = 1.40; subtotal = 1400; shipping = 50; tax = 145; value = 1595 } }
    2000 { return @{ orderTier = 2000; units = 2000; unitPrice = 1.35; subtotal = 2700; shipping = 50; tax = 275; value = 3025 } }
  }
}

$parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($CsvPath)
$parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
$parser.SetDelimiters(',')
$parser.HasFieldsEnclosedInQuotes = $true
$all = @()
while (-not $parser.EndOfData) { $all += ,$parser.ReadFields() }
$parser.Close()

$rows = @()
for ($i = 2; $i -lt $all.Count; $i++) {
  $f = $all[$i]
  if ($f.Count -lt 10) { continue }

  $name = $f[0].Trim()
  $address = $f[1].Trim()
  $phone = $f[2].Trim()
  $email = $f[3].Trim()
  $hasWebsite = $f[4].Trim()
  $state = $f[5].Trim()
  $postcode = $f[6].Trim()
  $type = $f[7].Trim()
  $relevance = $f[8].Trim()
  $why = $f[9].Trim()

  if (Test-Phone $name) {
    if (Test-Email $address) { $email = $address; $address = '' }
    $phone = $name
    $name = ''
  }
  elseif ($name -eq 'Visit Website') {
    $hasWebsite = 'Yes'
    if (Test-Email $address) { $email = $address }
    $name = ''
  }
  elseif (Test-Email $name) {
    $email = $name
    $name = $address
    $address = $phone
    $phone = ''
  }

  if ([string]::IsNullOrWhiteSpace($name)) {
    if ($address -and -not (Test-Email $address) -and $address -ne 'Visit Website') { $name = $address; $address = '' }
    elseif ($phone) { $name = "Pharmacy $phone" }
    elseif ($email) { $name = ($email -split '@')[0] }
    else { continue }
  }

  if ($name -eq 'Pharmacy Name') { continue }

  $acctType = if ($type) { $type } else { 'Independent' }
  $priority = if ($relevance -eq 'High') { 'High' } elseif ($relevance -eq 'Low') { 'Low' } else { 'Medium' }

  $rows += [ordered]@{
    id = "pharm-$($rows.Count + 1)"
    name = $name
    address = $address
    phone = $phone
    email = $email
    website = if ($hasWebsite -eq 'Yes') { 'Yes' } else { '' }
    hasWebsite = ($hasWebsite -eq 'Yes')
    state = $state
    postcode = $postcode
    city = ''
    country = 'Australia'
    type = $acctType
    accountType = $acctType
    relevance = if ($relevance) { $relevance } else { 'Medium' }
    whyRelevant = $why
    description = $why
    stage = 'Appointment'
    status = 'Open'
    priority = $priority
    source = 'Outbound'
    assignee = 'Unassigned'
    closeDate = ''
    lossReason = ''
    notes = ''
    linkedin = ''
    contactName = ''
    contactTitle = 'Pharmacist'
    contactType = 'Prospect'
    lastActivity = (Get-Date).ToString('yyyy-MM-dd')
    createdAt = (Get-Date).ToString('yyyy-MM-dd')
    potentialSale = $true
    isPopular = (Test-Popular $name)
    isHighCompounding = (Test-HighCompounding $acctType $relevance)
    eliteCandidate = ((Test-HighCompounding $acctType $relevance) -or (Test-Popular $name))
  }
}

$elite = @($rows | Where-Object { $_.eliteCandidate } | Sort-Object { Get-HashNum $_.id })
$eliteCount = [Math]::Max(1, [Math]::Floor($elite.Count * 0.2))
$elite2000 = @{}
for ($i = 0; $i -lt $eliteCount; $i++) { $elite2000[$elite[$i].id] = $true }

foreach ($row in $rows) {
  $tier = 500
  if ($elite2000.ContainsKey($row.id)) {
    $tier = 2000
  }
  else {
    $roll = (Get-HashNum $row.id) % 100
    if ($row.relevance -eq 'High' -or $row.isPopular -or $row.isHighCompounding) {
      $tier = if ($roll -lt 35) { 500 } else { 1000 }
    }
    else {
      $tier = if ($roll -lt 58) { 500 } else { 1000 }
    }
  }
  $t = Get-TierPayload $tier
  $row.orderTier = $t.orderTier
  $row.units = $t.units
  $row.unitPrice = $t.unitPrice
  $row.subtotal = $t.subtotal
  $row.shipping = $t.shipping
  $row.tax = $t.tax
  $row.value = $t.value
  $row.potentialSale = $true
}

$dataDir = Join-Path $OutDir 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$json = $rows | ConvertTo-Json -Depth 6
$jsonPath = Join-Path $dataDir 'pharmacies.json'
$json | Set-Content $jsonPath -Encoding UTF8

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$seedPath = Join-Path $OutDir 'seed.js'
[System.IO.File]::WriteAllText($seedPath, "window.SEED_PHARMACIES = $json;", $utf8NoBom)

$t500 = ($rows | Where-Object { $_.orderTier -eq 500 }).Count
$t1000 = ($rows | Where-Object { $_.orderTier -eq 1000 }).Count
$t2000 = ($rows | Where-Object { $_.orderTier -eq 2000 }).Count
$totalPotential = ($rows | Measure-Object -Property value -Sum).Sum
Write-Host "Imported $($rows.Count) pharmacies"
Write-Host "Tier mix: 500u=$t500 | 1000u=$t1000 | 2000u=$t2000"
Write-Host "Total potential revenue: `$$totalPotential"
Write-Host "JSON: $jsonPath"
Write-Host "Seed: $seedPath"