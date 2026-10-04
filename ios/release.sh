#!/bin/sh
# App Store build of the iOS app, from the command line:
#   web bundle (npm run ios:sync) → unsigned Release archive → the app's
#   entitlements stamped in with the team's development certificate
#   (ad-hoc when the keychain has none, see below) → App Store Connect
#   export with Xcode's automatic distribution signing (cloud-managed
#   certificate, Xcode-managed store profile) → ios/build-release/export/App.ipa.
# With --upload the export step uploads to App Store Connect instead of
# writing the .ipa (the app record must exist there first). --no-sync skips
# the web bundle when ios/App/App/public is already current.
#
# Why not "Product → Archive" with automatic signing? Xcode signs archives
# for *development* and re-signs them at export; a development profile needs
# at least one registered device in the team, and a team can be device-less
# (App Store builds never need one). An unsigned archive exports fine, but
# the export keeps only the entitlements it finds in the archive's signature,
# so the Universal Links entitlement would be lost: the ad-hoc signature is
# what carries App.entitlements into the export (no certificate involved).
# Manual distribution signing at archive time is not an option either: the
# distribution certificate is cloud-managed (no local private key) and the
# store profile is Xcode-managed.
#
# Needs: the team id in ios/Signing.local.xcconfig (DEVELOPMENT_TEAM, or the
# environment variable) and a way to talk to App Store Connect: either the
# team signed in in Xcode (Settings → Accounts), or an App Store Connect API
# key in ios/AppStoreConnect.local.env (git-ignored; ASC_KEY_PATH to the .p8,
# ASC_KEY_ID, ASC_ISSUER_ID from App Store Connect → Users and Access →
# Integrations), which xcodebuild then uses instead of the Xcode session
# (the session can expire: "exportArchive Failed to Use Accounts").
# Xcode registers the App ID and creates the certificate and the profile on
# the first export. Bump CURRENT_PROJECT_VERSION in ios/Signing.xcconfig
# before every upload. See docs/app-store.md.
set -eu
cd "$(dirname "$0")/.."

UPLOAD=0
SYNC=1
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD=1 ;;
    --no-sync) SYNC=0 ;;
    *) echo "usage: sh ios/release.sh [--upload] [--no-sync]" >&2; exit 2 ;;
  esac
done

TEAM="${DEVELOPMENT_TEAM:-$(sed -n 's/^DEVELOPMENT_TEAM *= *\([A-Za-z0-9]*\).*/\1/p' ios/Signing.local.xcconfig 2>/dev/null | tail -n 1)}"
if [ -z "$TEAM" ]; then
  echo "release.sh: put DEVELOPMENT_TEAM = <team id> in ios/Signing.local.xcconfig (see ios/Signing.xcconfig)" >&2
  exit 1
fi

# App Store Connect API key, when one is configured (see the header).
if [ -f ios/AppStoreConnect.local.env ]; then
  # shellcheck disable=SC1091
  . ./ios/AppStoreConnect.local.env
fi
AUTH=""
if [ -n "${ASC_KEY_PATH:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  if [ ! -f "$ASC_KEY_PATH" ]; then
    echo "release.sh: ASC_KEY_PATH does not exist: $ASC_KEY_PATH" >&2
    exit 1
  fi
  AUTH="-authenticationKeyPath $ASC_KEY_PATH -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID"
  echo "release.sh: using the App Store Connect API key $ASC_KEY_ID"
fi

OUT=ios/build-release
ARCHIVE="$OUT/App.xcarchive"
APP="$ARCHIVE/Products/Applications/App.app"
EXPORT="$OUT/export"
ENTITLEMENTS="$OUT/release.xcent"
OPTIONS="$OUT/ExportOptions.plist"

if [ "$SYNC" = 1 ]; then
  npm run ios:sync
fi

echo "release.sh: archiving (unsigned)"
rm -rf "$ARCHIVE" "$EXPORT" "$ENTITLEMENTS" "$OPTIONS"
mkdir -p "$OUT"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -quiet archive

BUNDLE_ID="$(plutil -extract ApplicationProperties.CFBundleIdentifier raw -o - "$ARCHIVE/Info.plist")"
echo "release.sh: stamping entitlements for $TEAM.$BUNDLE_ID"
cp ios/App/App/App.entitlements "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :application-identifier string $TEAM.$BUNDLE_ID" "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string $TEAM" "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :get-task-allow bool true" "$ENTITLEMENTS"
# Signed with the team's own development certificate when the keychain has
# one (Xcode's Organizer then recognises the team and can distribute the
# archive itself: it refuses an ad-hoc one with "No Team Found in Archive"),
# else ad-hoc, which the command-line export accepts just the same.
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | while read -r name; do
  if security find-certificate -c "$name" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -Eq "OU ?= ?$TEAM"; then echo "$name"; break; fi
done)"
if [ -n "$IDENTITY" ]; then
  echo "release.sh: signing the archive with \"$IDENTITY\""
else
  IDENTITY="-"
  echo "release.sh: no development certificate for $TEAM in the keychain; ad-hoc signature (command-line export only)"
fi
for framework in "$APP"/Frameworks/*.framework; do
  codesign --force --sign "$IDENTITY" --timestamp=none "$framework"
done
codesign --force --sign "$IDENTITY" --timestamp=none --entitlements "$ENTITLEMENTS" "$APP"
plutil -replace ApplicationProperties.SigningIdentity -string "$IDENTITY" "$ARCHIVE/Info.plist"
plutil -replace ApplicationProperties.Team -string "$TEAM" "$ARCHIVE/Info.plist"

cp ios/ExportOptions.plist "$OPTIONS"
plutil -replace teamID -string "$TEAM" "$OPTIONS"
if [ "$UPLOAD" = 1 ]; then
  plutil -replace destination -string upload "$OPTIONS"
  echo "release.sh: exporting and uploading to App Store Connect"
else
  echo "release.sh: exporting"
fi
# shellcheck disable=SC2086
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OPTIONS" \
  -exportPath "$EXPORT" -allowProvisioningUpdates $AUTH -quiet

if [ "$UPLOAD" = 1 ]; then
  echo "release.sh: uploaded $BUNDLE_ID $(plutil -extract ApplicationProperties.CFBundleShortVersionString raw -o - "$ARCHIVE/Info.plist") ($(plutil -extract ApplicationProperties.CFBundleVersion raw -o - "$ARCHIVE/Info.plist")); it appears in App Store Connect → TestFlight after processing"
  exit 0
fi

IPA="$EXPORT/App.ipa"
CHECK="$(mktemp -d)"
unzip -q "$IPA" -d "$CHECK"
echo "release.sh: $IPA"
codesign -dvv "$CHECK/Payload/App.app" 2>&1 | grep -E '^(Identifier|Authority=Apple|TeamIdentifier)'
codesign -d --entitlements :- "$CHECK/Payload/App.app" 2>/dev/null | plutil -p -
rm -rf "$CHECK"
