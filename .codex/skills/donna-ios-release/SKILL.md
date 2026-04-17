---
name: donna-ios-release
description: Use when building, submitting, or troubleshooting Donna's iOS app release with Expo EAS, Apple Developer, App Store Connect, TestFlight internal/external testers, provisioning profiles, certificates, App Store Connect API keys, or Clerk/App Review sign-in requirements for `apps/mobile`.
---

# Donna iOS Release

Use this for Donna iOS distribution work in `apps/mobile`.

## Ground Rules

1. Read `DIRECTORY.md` before changing repo files and confirm the active surface is `apps/mobile`.
2. Do not commit secrets, certificates, provisioning profiles, App Store Connect `.p8` keys, credentials JSON, or review passwords.
3. Treat caregiver/senior-linked app data as PHI. Use fake demo data only for Apple review and TestFlight testing.
4. If Apple or EAS policy/status is ambiguous, verify against official docs or the live dashboard before giving definitive guidance.
5. Before starting a new release build, check `git status -sb` and avoid building from unrelated dirty work unless the user explicitly wants those changes included.
6. Do not submit or upload anything to App Store Connect, TestFlight, or Apple review unless David explicitly asks for that submission in the current conversation. Building with EAS is allowed when requested, but stop before `eas submit`, App Store Connect upload, TestFlight group assignment, or beta review submission until told to proceed.

## Donna Constants

- EAS account/project: `@dmdzco/donna-caregiver`
- EAS project URL: `https://expo.dev/accounts/dmdzco/projects/donna-caregiver`
- EAS project ID: `aa482a04-3f14-4373-a654-42e51f1bd7b0`
- App Store Connect app ID: `6762152100`
- TestFlight URL: `https://appstoreconnect.apple.com/apps/6762152100/testflight/ios`
- Bundle ID: `com.donna.caregiver`
- Current app display name used during release work: `Donna Companion`
- Do not assume a previously mentioned build is latest. Run `npx eas build:list --platform ios --limit 5 --non-interactive` from `apps/mobile`.

## Roles

- EAS builds the iOS binary, manages remote signing credentials if allowed, and can upload the build to Apple via EAS Submit.
- Apple Developer/App Store Connect owns the app record, certificates, provisioning profiles, TestFlight review, testers, and public TestFlight links.
- TestFlight distributes the uploaded Apple build. Friends do not need Apple Developer accounts to install through external TestFlight.

## Credential Guardrails

Keep these ignored and uncommitted:

- `apps/mobile/credentials.json`
- `apps/mobile/ios/certs/`
- `*.p12`, `*.cer`, `*.mobileprovision`, `*.provisionprofile`, `*.certSigningRequest`, `*.p8`
- `.env*` files containing real keys

Useful checks:

```bash
git status -sb
git check-ignore -v apps/mobile/ios/certs/CertificateSigningRequest.certSigningRequest
git diff --check
```

If EAS asks about certificates, profiles, APNs, or App Store Connect API keys, explain that these are Apple signing/submission credentials. Prefer EAS remote credential management unless the user explicitly wants manual credentials. Never paste or commit the private key material.

If EAS Apple login fails because Apple presents only physical security-key authentication, use the App Store Connect API key path when available, or adjust the Apple Account so EAS can complete trusted-device 2FA. Restore the strongest Apple Account auth setup after credential work is done.

## Preflight

From `apps/mobile`:

```bash
npx --yes npm@10.9.3 ci --include=dev
npx tsc --noEmit
npm run verify:assets
git diff --check
npx eas build:list --platform ios --limit 5 --non-interactive
```

Check EAS environments before building:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` must exist in `development`, `preview`, and `production` EAS environments.
- For TestFlight beta with the existing Railway test backend, the key may be Clerk `pk_test`.
- Before real public App Store launch, decide whether to switch to Clerk live keys (`pk_live`/`sk_live`) and rebuild.
- `apps/mobile/eas.json` should map build profiles to explicit EAS environments.

## Preview Or Ad Hoc iPhone Build

Use preview/internal builds when testing on a known device outside TestFlight:

```bash
npx eas build --platform ios --profile preview --message "Preview build"
```

Notes:

- This uses ad hoc/internal distribution and requires the iPhone UDID in the provisioning profile.
- New tester device means registering the device and rebuilding with an updated profile.
- The tester may need iOS Developer Mode enabled.
- Each new preview build has its own EAS build page/link; TestFlight is smoother for friends.

## Production/TestFlight Build

Use production/store builds for TestFlight:

```bash
npx eas build --platform ios --profile production --message "TestFlight build"
```

After the build finishes, report the build ID, build number, commit, and artifact URL. Do not run `npx eas submit`, upload to App Store Connect, add the build to TestFlight groups, or submit beta/App Store review unless David explicitly tells you to do that in the current conversation.

If submitting a specific build, use the build ID from `eas build:list` rather than relying on `--latest`.

Before building, ensure the Apple build number increments. If Apple rejects a build or the user changes code, fix it and increment the build number as needed, but still wait for explicit submission approval before uploading or resubmitting to Apple.

## App Store Connect/TestFlight Flow

1. Open App Store Connect TestFlight: `https://appstoreconnect.apple.com/apps/6762152100/testflight/ios`
2. Confirm the uploaded build appears under iOS builds.
3. For internal testers:
   - Add the person in App Store Connect `Users and Access` first.
   - Eligible internal testers are App Store Connect users with app access and an eligible role.
   - They need an Apple ID, but not their own paid Apple Developer Program membership.
   - Use this only for trusted teammates/cofounders because it grants App Store Connect access.
4. For external testers:
   - Create an External Testing group.
   - Add the build to the group.
   - Fill `What to Test`, beta review contact info, and sign-in info.
   - Add tester emails or create a public link after approval.
   - Friends only need a normal Apple ID and the free TestFlight app.
5. If Apple asks for sign-in info, provide a dedicated Clerk demo caregiver account with fake senior data. Do not store the password in this skill or in git. Rotate/delete it after review.

Apple TestFlight behavior to remember:

- External testers can be invited by email or public link after the build is available for external testing.
- Apple reviews the first external TestFlight build; later builds for the same version might not need the same review.
- Only one build of each version can be in review at a time.
- Apple allows up to six TestFlight review submissions in 24 hours.
- TestFlight builds are available for 90 days.

## If Something Fails

- EAS build failed: open the EAS build URL and inspect the first real error, not the final generic failure line.
- Clerk key missing on device: verify `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the exact EAS environment used by the build, then rebuild.
- Apple rejected beta review: get the exact rejection text from App Store Connect, fix that issue only, increment build number, rebuild production, and resubmit.
- Friend cannot install preview build: use TestFlight for external testers or register their device UDID and rebuild a preview/ad hoc build.
- Internal tester cannot be added: they are probably not an App Store Connect user with an eligible role or app access.

## Official References

- Expo EAS Build docs: `https://docs.expo.dev/build/introduction/`
- Expo iOS submission docs: `https://docs.expo.dev/submit/ios/`
- Apple internal testers: `https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers`
- Apple external testers/public links: `https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers`
