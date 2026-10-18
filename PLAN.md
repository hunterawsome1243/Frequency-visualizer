# Plan: Frequency visualizer

A phone app that shows nearby wireless signals such as Bluetooth devices, Wi-Fi networks and trackers like AirTags as a live, easy-to-read visual display.

How to use this file:
- Fix any unchecked blocker under "Bugs to fix" first. Then take the first unchecked task under a "Milestone" heading, in the first milestone that still has one.
- When a task or bug works and its checks pass, change its "- [ ]" to "- [x]". On a task, also add today's date to its brackets: "(S)" becomes "(S, done YYYY-MM-DD)".
- Keep the hidden id comment at the end of each line. Do not reorder, rename or delete lines.
- A large (L) task can be split into steps: indented "- [ ]" lines under it, done in order. Tick the task itself only when all its steps are ticked.
- Put anything worth remembering on an indented "Notes:" line under the task. If you find extra work that is needed, add it as a new "- [ ]" line in the milestone it belongs to: just above the task that needs it done first, otherwise at the end.

## Milestone 1: Bare-bones version running

Goal: The app opens on your phone and shows its first screen.

- [ ] Create an Expo app in this folder (S) <!-- id:tyk6y9k8wp97 -->
  Notes: First run git init, unless this folder is already in git. Create it in a temporary folder so CLAUDE.md is kept: run npx create-expo-app@latest expo-tmp --yes --no-agents-md, move everything from expo-tmp into this folder (including hidden files such as .gitignore, but not a .git folder, and never replacing CLAUDE.md or anything in .claude), delete expo-tmp, then set the app name in app.json and package.json. Do not start the dev server: tell me to run npx expo start in a second terminal myself and scan its QR code with Expo Go. On an iPhone, Expo Go only opens it when I am logged in to the same free Expo account on both (npx expo login on the computer); if the phone is not on the same Wi-Fi, use npx expo start --tunnel. Check: the starter app opens on my phone.
  Notes: Created 2026-10-18 in a cloud session; the Android bundle builds (npx expo export). Not yet opened on a phone: tick this once it opens in Expo Go.
- [ ] Replace the starter screens with the app's real layout (M) <!-- id:tb1hluepwp97 -->
  Notes: Check: every screen opens from the navigation on your phone.
  Notes: Code done 2026-10-18 (Radar, Devices, Wi-Fi and About tabs, plus the device screen); waiting for the check on a phone.
- [x] Set up Jest with jest-expo and one passing test (M, done 2026-10-18) <!-- id:t8va36zjwp97 -->
  Notes: Follow Expo's unit testing guide, but set the test script to "jest" (not "jest --watchAll") so npm test finishes; use npx jest --watch while you work. Check: npm test passes and exits.
- [x] Commit the setup to git (S, done 2026-10-18) <!-- id:tb6pkua1wp97 -->
  Notes: Check: git status shows nothing left to commit.

## Milestone 2: Scanning and listing devices

Goal: The app asks for permission, scans Bluetooth and shows a live list of nearby devices.

- [ ] Add a Bluetooth library and development build config (M) <!-- id:trpfs4ufx3uk -->
  Notes: Install react-native-ble-plx with its Expo config plugin and set the Bluetooth permission text in app config. Check that a development build starts on a real phone.
  Notes: Code done 2026-10-18: react-native-ble-plx and its config plugin, the permission text in app.json, and plugins/with-ble-scan-location.js, which stops ble-plx's library manifest from adding neverForLocation to BLUETOOTH_SCAN. Waiting for a development build on a real phone; on that build, also check that the merged AndroidManifest.xml has no usesPermissionFlags on BLUETOOTH_SCAN and that Google Find Hub tags show up on Android 12+.
- [ ] Build the permission and about screen (S) <!-- id:t6ep9liex3uk -->
  Notes: Create a screen that explains what the app can and cannot detect and asks for Bluetooth permission. Check that denying permission shows a helpful message.
  Notes: Code done 2026-10-18 (About tab, status card, Android permission wording and the note before the first scan); waiting for the check on a phone that denying permission shows a helpful message.
- [x] Create a scanning hook (M, done 2026-10-18) <!-- id:t5crjg19x3uk -->
  Notes: Write a hook that starts and stops a BLE scan and returns a list of devices with name, ID and RSSI, with the scanner wrapped so tests can use a fake. Add Jest tests for the list-updating logic.
- [ ] Show devices in a live list screen (M) <!-- id:tuii6533x3uk -->
  Notes: Build the main screen with Expo Router that lists devices and refreshes as signals change, with a start/stop scan button. Check on a real phone that nearby devices appear.
  Notes: Code done 2026-10-18; waiting for the check on a real phone that nearby devices appear.
- [x] Add a proximity helper (S, done 2026-10-18) <!-- id:t2t7t4eix3uk -->
  Notes: Write a function that turns RSSI into near, medium or far, and add Jest tests for the boundaries.
- [ ] Check that switching apps quickly does not leave the scan stuck (S)
  Notes: The scan now pauses in the background and restarts on return. Android allows about 5 scan starts per 30 seconds and quietly ignores more, so check on an Android phone that flipping between apps several times still ends with devices updating.

## Milestone 3: Visualizing and spotting trackers

Goal: Devices appear on a radar view and likely trackers are clearly flagged.

- [x] Write tracker detection logic (M, done 2026-10-18) <!-- id:t3c5f7swx3uk -->
  Notes: Create a function that checks advertisement data (manufacturer data and service UUIDs) for known AirTag, Find My and Tile patterns and returns a tracker type or none. Cover it with Jest tests using sample data.
- [x] Flag trackers in the device list (S, done 2026-10-18) <!-- id:tq5af4ukx3uk -->
  Notes: Show a warning badge on devices detected as trackers and sort them to the top. Check with fake data in a test or on screen.
- [ ] Build the radar component (M) <!-- id:t7koptimx3uk -->
  Notes: Draw a radar with react-native-svg where each device is a dot placed by signal strength and a stable angle based on its ID. Check that dots move when signal changes.
  Notes: Code done 2026-10-18 (the glide is covered by a Jest test of the animation call); waiting for the check on a phone that dots move when the signal changes.
- [ ] Add radar and list tabs (S) <!-- id:tcrrb09hx3uk -->
  Notes: Use Expo Router tabs so the user can switch between the radar and the list, sharing the same scan data.
  Notes: Code done 2026-10-18; waiting for the check on a phone that both tabs show the same scan.
- [ ] Create the device detail screen (M) <!-- id:t9dh8si1x3uk -->
  Notes: Tapping a device opens a screen with its info, proximity label and a simple line chart of recent RSSI values. Check that the chart updates while scanning.
  Notes: Code done 2026-10-18: the history keeps about one sample per second for two minutes. Waiting for the check on a phone that the chart updates while scanning.
- [ ] Tell Google Find Hub tags apart from offline Android phones (M)
  Notes: Both send Eddystone frame 0x40, so it is only flagged as "possible" and the reason says it may be a phone. AirGuard tells them apart by the AD Flags byte (0x06 tag, 0x02 phone), which needs the raw scan record (react-native-ble-plx rawScanRecord, Android only) in Advertisement.

## Milestone 4: Extra scans and personalization

Goal: Users can filter devices, name them, and see Wi-Fi networks on Android.

- [x] Add sorting and filter controls (M, done 2026-10-18) <!-- id:to816egqx3uk -->
  Notes: Add controls to sort by signal or name and to show only trackers or named devices. Add Jest tests for the filter function.
- [ ] Save device nicknames (M) <!-- id:t60xw2ygx3uk -->
  Notes: Store nicknames with AsyncStorage keyed by device ID and show them in the list and detail screen. Check that names persist after restarting the app.
  Notes: Code done 2026-10-18; waiting for the check on a phone that names persist after restarting the app.
- [ ] Add an Android Wi-Fi scan screen (M) <!-- id:te11fd6rx3uk -->
  Notes: Use a Wi-Fi scanning library on Android to list networks with signal and channel, and show an 'unavailable on iOS' note otherwise. Check on an Android phone.
  Notes: Code done 2026-10-18; waiting for the check on an Android phone.
- [ ] Apply a dark neon theme (M) <!-- id:tvyyhupwx3uk -->
  Notes: Create a shared theme file with dark colors and glow styles and use it on the radar, list and detail screens.
  Notes: Code done 2026-10-18: glow uses shadows on iOS and boxShadow on Android 9+ and the web. Waiting for a phone check, including that many glowing radar dots still draw smoothly on a low-end Android phone.

## Milestone 5: Ready to share

Goal: Someone else can install it and use it.

- [ ] Handle empty, loading and error states (M) <!-- id:th5zzj7mwp97 -->
  Notes: Code done 2026-10-18; waiting for the check on a phone.
- [ ] Add an app icon and a splash screen (M) <!-- id:tvfqjtthwp97 -->
  Notes: Code done 2026-10-18; waiting for the check that the icon and splash screen show on a build.
- [ ] Build a preview with EAS and install it on your phone (M) <!-- id:th3rer5nwp97 -->
  Notes: Ask Claude for the eas build steps. On Android you can install the build directly. On an iPhone this needs a paid Apple Developer account, and each iPhone has to be added with eas device:create before the build. Check: the installed app opens without Expo Go.
  Notes: eas.json is ready (2026-10-18); waiting for you to run the build and install it.
  Notes: 2026-10-18: the iPhone steps, including the preview build and fixes for install problems, are in README.md. The app ID is now com.hunterawsome1243.frequencyvisualizer (iOS and Android); change it in app.json before the first build if you want another one, because changing it later means new signing credentials.
- [ ] Let testers install it with TestFlight or Google Play internal testing (M) <!-- id:twpgwa7lwp97 -->
  Notes: Ask Claude for the eas submit steps for the store you use. Check: a tester installs it from their invite.
  Notes: Waiting for you: needs the preview build and a store account.
- [x] Write a README with how to run it (S, done 2026-10-18) <!-- id:tulhyr86wp97 -->
