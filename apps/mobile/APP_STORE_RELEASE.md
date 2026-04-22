# Donna Mobile App Store Release Guide

Last updated: April 22, 2026.

## Current Local Status

- iOS bundle ID is aligned to `com.donna.caregiver` in Expo config and native iOS.
- `eas.json` no longer contains fake Apple submit placeholders.
- App icons are present at `1024x1024`; the iOS app icon has no alpha channel.
- Java is available through Homebrew for Maestro.
- Mobile settings includes an in-app account deletion path.
- App Store privacy policy URL: `https://www.calldonna.co/privacypolicy`.
- App Store support URL: `https://www.calldonna.co/support`.
- Third-party services URL: `https://www.calldonna.co/third-party`.
- The iOS privacy manifest declares linked, non-tracking data collection for app functionality.
- EAS project is linked as `@dmdzco/donna-caregiver`.
- EAS project ID is `aa482a04-3f14-4373-a654-42e51f1bd7b0`.

## Before You Build for App Store

1. Confirm Expo/EAS login:

   ```bash
   cd apps/mobile
   eas whoami
   eas project:info
   ```

   EAS is already linked for `@dmdzco/donna-caregiver`. If this repo is cloned elsewhere, run `eas login` and `eas project:init` again only if the project link is missing.

2. Switch Clerk to production:

   - Create or choose the Clerk production instance.
   - Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to the production publishable key for mobile builds.
   - Set `EXPO_PUBLIC_API_URL` to the production Node API base URL for mobile builds.
   - Set the backend `CLERK_SECRET_KEY` to the matching production secret key.
   - Confirm allowed redirects/deep links include the `donna` scheme and the final bundle ID.

3. Create the Apple app record:

   - Apple Developer account must be active.
   - Bundle ID: `com.donna.caregiver`.
   - App name: `Donna Companion`.
   - SKU: choose an internal stable value, for example `donna-caregiver-ios`.

4. Complete App Store Connect metadata:

   - Privacy policy URL.
   - Support URL.
   - Description, keywords, category, age rating, pricing/availability.
   - Export compliance encryption answers.
   - Accessibility Nutrition Labels after an accessibility pass.
   - Review notes and demo account. Use dummy data only; do not use real PHI.
   - Screenshots captured from dummy accounts only; no real transcripts, reminders, medical notes, phone numbers, or caregiver data.

5. Complete privacy and compliance review:

   - App Store privacy labels must match the app and all SDK/vendor data practices.
   - Confirm whether the app should declare health data in App Store Connect.
   - Confirm BAA/vendor posture before making HIPAA-adjacent claims.
   - Confirm account deletion behavior with legal/product. The app now deletes Donna data for sole-caregiver seniors and unlinks shared seniors, then attempts Clerk user deletion.

## Build, Test, Submit

1. Run local checks:

   ```bash
   npm run verify:assets
   npx tsc --noEmit
   npx expo-doctor
   ```

   `expo-doctor` currently reports the non-CNG/native-folder warning. That warning is expected while `ios/` is checked in; manually keep native iOS config synced when changing `app.json`.

2. Test on simulator and physical iPhone:

   ```bash
   npm run ios
   npm run test:e2e
   ```

   Push notification registration requires a physical device and a real EAS project ID.

3. Build for production:

   ```bash
   eas build --platform ios --profile production
   ```

4. Submit to App Store Connect:

   ```bash
   eas submit --platform ios --profile production
   ```

   You can let EAS prompt for Apple credentials, or configure App Store Connect API key credentials in EAS.

5. Distribute through TestFlight first, then submit the selected build for App Review in App Store Connect.

## Timing Note

Apple says that beginning April 28, 2026, App Store Connect uploads must use Xcode 26 or later with an iOS 26 SDK. This machine currently has Xcode 26.3 and an iPhoneOS 26.2 SDK, so the local toolchain is in range.
