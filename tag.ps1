# Get version number
$version = $args[0]
if (-not $version) {
    # Auto read from manifest.json
    try {
        $manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
        $version = $manifest.version
        Write-Host "Auto read version from manifest.json: $version"
    } catch {
        Write-Host "Usage: .\tag.ps1 <version>"
        Write-Host "Example: .\tag.ps1 1.0.1"
        pause
        exit
    }
}

$tag = "v" + $version
Write-Host "Processing tag: $tag"

# Process tag
git push origin --delete $tag 2>&1 | Out-Null
git tag -d $tag 2>&1 | Out-Null
git tag $tag
git push origin $tag

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Tag $tag published!"
} else {
    Write-Host "❌ Failed!"
}
