# Donna iOS App — Assets Checklist

## Overview

The Donna mobile app requires brand-appropriate icon and splash screen assets for distribution via TestFlight and the App Store. Current asset requirements are defined in `app.json` and reference the `assets/images/` directory.

---

## Required Assets Before Distribution

### App Icon (1024×1024 PNG)
- **File**: `assets/images/icon.png`
- **Size**: 1024×1024 pixels
- **Format**: PNG without transparency
- **Purpose**: App icon displayed on iOS home screen and in App Store
- **Status**: ✅ Present — verified at 1024×1024
- **Design notes**: Should incorporate Donna's sage green (#4A5D4F) and cream (#FDFCF8) colors with a clear, recognizable mark at any size

### Splash Screen Icon (200×200+ PNG)
- **File**: `assets/images/splash-icon.png`
- **Size**: Minimum 200×200 pixels (recommend 1000×1000 for Retina displays)
- **Format**: PNG with transparency
- **Background**: Cream (#FDFCF8) as defined in `app.json`
- **Purpose**: Centered icon shown during app launch on iOS and Android
- **Status**: ✅ Present — verified at 483×1044
- **Design notes**: Simple, centered mark that scales well. Used with `resizeMode: "contain"` and cream background.

### Adaptive Icon (1024×1024 PNG)
- **File**: `assets/images/adaptive-icon.png`
- **Size**: 1024×1024 pixels
- **Format**: PNG with transparency
- **Purpose**: Android adaptive icon foreground layer
- **Background**: Cream (#FDFCF8) (defined in `app.json` as `android.adaptiveIcon.backgroundColor`)
- **Status**: ✅ Present — verified at 1024×1024
- **Android requirements**:
  - Safe zone: Center 480×480 pixel square (outside may be masked)
  - Design should work with both rounded and rounded-square masks
  - Consider shadow/depth for layering effect

### Web Favicon (32×32 PNG)
- **File**: `assets/images/favicon.png`
- **Size**: 32×32 pixels
- **Format**: PNG
- **Purpose**: Browser tab icon for web build (from `npm run web`)
- **Status**: ✅ Present — verified at 32×32
- **Design notes**: Must be clear and recognizable at small size

---

## Donna Brand Colors

- **Primary**: #4A5D4F (sage green) — use for text, logos, accents
- **Background**: #FDFCF8 (cream) — splash screen, adaptive icon background
- **Accent**: #1A1A1A (charcoal) — text, borders
- **Secondary**: Consider warm accent colors for elderly-friendly interface

---

## Asset Location Structure

```
apps/mobile/assets/
├── images/
│   ├── icon.png              (1024×1024)
│   ├── splash-icon.png       (483×1044)
│   ├── adaptive-icon.png     (1024×1024)
│   └── favicon.png           (32×32)
└── README.md
```

---

## Current Configuration

### app.json References

```json
{
  "expo": {
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#FDFCF8"
    },
    "ios": {
      "bundleIdentifier": "com.donna.caregiver"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#FDFCF8"
      },
      "package": "com.donna.caregiver"
    },
    "web": {
      "favicon": "./assets/images/favicon.png"
    }
  }
}
```

---

## Generation Workflow

### Option 1: Design in Figma (Recommended)
1. Create a Figma file or use existing design system
2. Export at specified dimensions with transparency
3. Place in `assets/images/`
4. Run: `npm run test:app` to verify assets load

### Option 2: Use Expo's Presets (Quick Dev)
For development/testing, Expo can auto-generate icons if you provide a single source image:
```bash
npx expo-app-icon ./source-image.png
```
(Note: Not recommended for production — design control is limited)

### Option 3: Third-Party Icon Generators
- **Figma plugins**: Icon Mixer, Pico
- **Web tools**: Logo.com, Brandmark (for custom design)
- **Design tools**: Adobe Express, Canva Pro

---

## Testing Assets

### Local Testing (Expo Go)
Assets are **not required** for local development with Expo Go:
```bash
npm run android    # Or: npm run ios
```

### Native Build Testing
To test with native icons (recommended before submission):

**iOS (via Xcode):**
```bash
npx eas build --platform ios --local
```

**Android:**
```bash
npx eas build --platform android --local
```

### Expo Preview (Web)
```bash
npm run web
```
Favicon will appear in browser tab.

---

## Before App Store Submission

- [x] App icon (1024×1024) created and placed at `assets/images/icon.png`
- [x] Splash screen icon present and placed at `assets/images/splash-icon.png`
- [x] Adaptive icon (1024×1024) created and placed at `assets/images/adaptive-icon.png`
- [x] Favicon (32×32) created and placed at `assets/images/favicon.png`
- [x] All PNGs verified to be valid image files (`file assets/images/*.png`)
- [x] Icons tested in native build: `npx expo run:ios -d "iPhone 17 Pro" --no-install --no-bundler`
- [ ] Adaptive icon safe zone validated (center 480×480 clear)
- [ ] Brand colors consistent across all assets
- [ ] No transparency issues or color bleeding at edges
- [ ] iOS build succeeds with assets included
- [ ] Android build succeeds with adaptive icon
- [ ] App Store submission attempted (will request icons if missing)

---

## Helpful Links

- **Expo Asset Configuration**: https://docs.expo.dev/guides/app-icons/
- **iOS App Icon Requirements**: https://developer.apple.com/design/human-interface-guidelines/app-icons
- **Android Adaptive Icons**: https://developer.android.com/guide/practices/ui_guidelines/icon_design_adaptive
- **Donna Brand**: Check design system or Figma for latest brand guidelines

---

## Notes

- All PNG files should use standard PNG compression (no excessive optimization that breaks mobile readers)
- Transparency should be properly embedded (not white background mistaken for transparency)
- Test on actual devices when possible — simulator rendering can vary
- If icons appear blurry, check DPI/scale in export settings (should be 72 DPI for standard web/mobile)
