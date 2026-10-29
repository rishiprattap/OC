param(
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$Architectures = 'arm64-v8a,x86_64'
)
$ErrorActionPreference = 'Stop'
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Set JAVA_HOME or pass -JavaHome with a JDK 17/21 directory.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:GRADLE_USER_HOME = Join-Path $PSScriptRoot '..\.gradle-cache'
$env:EXPO_PUBLIC_API_URL = 'https://offstagecreators.in'
$env:NODE_ENV = 'production'
Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  # Expo's generated release variant uses the debug key. Testing only, never store release.
  & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" --max-workers=2 '-Dorg.gradle.parallel=false' --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed.' }
} finally { Pop-Location }
