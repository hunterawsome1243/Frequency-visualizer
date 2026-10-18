# Frequency Visualizer

A phone app that makes nearby wireless signals visible. It scans for Bluetooth devices (and Wi-Fi networks on Android), shows them as dots on a live neon radar, and points out devices that might be trackers, such as AirTags or Tiles.

Built with Expo (React Native) and TypeScript.

## What it does

- **Bluetooth scan:** lists nearby Bluetooth Low Energy devices with their name (if they send one), ID and signal strength (RSSI).
- **Live radar:** each device is a dot. The stronger its signal, the closer it sits to the centre.
- **Possible trackers:** devices whose Bluetooth data looks like an AirTag, another Find My accessory, a Tile, a Samsung SmartTag, a Chipolo or a Google Find Hub tag get a clear warning label.
- **Device details:** tap a device to see a rough proximity (near, medium or far) and a small chart of its signal strength over time.
- **Sorting, filters and nicknames:** sort by signal or name, show only trackers or named devices, and give a device a nickname (like "my headphones") that the phone remembers.
- **Wi-Fi networks (Android only):** nearby networks with their signal strength and channel.

## What it can't do

We'd rather be honest than impressive:

- **It doesn't measure the electromagnetic spectrum.** A phone can only hear what its own Bluetooth and Wi-Fi radios pick up. Radio stations, microwave ovens, mobile networks, power lines and every other kind of EM wave are invisible to it.
- **Signal strength is a hint, not a distance.** Walls, bodies, pockets and phone cases all change it a lot, so "near" and "far" are rough guesses.
- **Tracker detection is best effort.** It guesses from the data devices broadcast over Bluetooth. It can miss trackers (for example ones that are switched off or change how they advertise) and it can flag harmless devices. "Possible tracker" never means "definitely a tracker". On iPhone, iOS hides the Bluetooth data that marks AirTags and other Find My devices from apps, so there they usually appear only as unnamed devices with no tracker label; Tile, SmartTag, Chipolo and Google Find Hub tags can still be flagged. If you think someone is tracking you, also use your phone's built-in unknown tracker alerts, and contact the police if you feel unsafe.
- **Wi-Fi scanning is Android only.** iOS doesn't let apps scan for Wi-Fi networks. Android also limits how often an app may scan (about 4 times every 2 minutes) and needs Location turned on.
- **Bluetooth scanning needs a development build** on a real phone. It doesn't work in Expo Go, a simulator or a web browser (see below).

## Privacy

Everything stays on your phone. There's no account, no server and no analytics: scan results are never uploaded, and nicknames are saved only on the device. Android asks for Location permission because Bluetooth and Wi-Fi scans could reveal where you are, but the app never reads your GPS position.

## Requirements

- [Node.js](https://nodejs.org) 22 LTS (22.13+), 24 LTS (24.3+) or 26+
- A real Android phone, or an iPhone on iOS 16.4 or later (iPhone 8 or newer). Simulators and emulators have no Bluetooth to scan.
- A free [Expo account](https://expo.dev/signup), used to build the app with EAS
- For iPhone builds: a paid [Apple Developer](https://developer.apple.com/programs/) membership

## Install and test

```sh
npm install
npm test
```

Use `npx jest --watch` to re-run tests while you work.

## Run it on your phone

### Why a development build?

Expo Go only contains a fixed set of native libraries, and the Bluetooth library this app uses (`react-native-ble-plx`) isn't one of them. A development build is your own version of Expo Go with this app's native code built in. You make it once, and again only when native libraries or native settings in `app.json` change. After that, your code changes load live from your computer, just like in Expo Go.

### Android

1. Log in to Expo: `npx expo login`
2. Build: `npx eas-cli build --profile development --platform android`
   The first time, it asks to create an EAS project (this adds a project ID to `app.json`) and a signing key. Say yes to both.
3. When the build is done, open its link (or scan the QR code) on your phone, download the APK and install it. Allow installs from your browser if Android asks.
4. On your computer run `npx expo start`. Open the Frequency Visualizer app on your phone and pick your computer from the list, or scan the QR code. The phone and computer need to be on the same Wi-Fi; if they aren't, use `npx expo start --tunnel`.

### iPhone

This needs a paid Apple Developer account, and each iPhone has to be registered before the build. The development build loads the app from your computer while you work on it; to use the app on its own, see [Use it without your computer](#use-it-without-your-computer) below.

1. Log in to Expo: `npx expo login`
2. Register your iPhone: `npx eas-cli device:create`. The first time, it asks to create an EAS project (say yes; this adds a project ID to `app.json`). Sign in with your Apple ID and two-factor code, and pick your team if asked. Choose **Website**, open the link it shows in Safari on the iPhone and tap Download. Then open the Settings app, tap **Profile Downloaded** and then **Install**.
3. Build: `npx eas-cli build --profile development --platform ios`. Say yes when it asks to log in to your Apple account. EAS then makes the signing certificate and provisioning profile for you, and shows a device list with your iPhone already ticked: press Return.
4. When the build is done, scan the QR code in the terminal with the iPhone Camera (or open the build link in Safari) and tap Install. If iOS asks, turn on Developer Mode in Settings > Privacy & Security.
5. Run `npx expo start` and open the app on the iPhone, as in step 4 for Android. When iOS asks to let it find devices on your local network, tap Allow.

If the build warns "Failed to provision ... of the selected devices" and asks whether to continue, choose No. Apple is still processing your iPhone (you can see it at [developer.apple.com/account/resources/devices/list](https://developer.apple.com/account/resources/devices/list)), so run the build again later. Choosing Yes gives a build that won't install on that iPhone.

Added a new iPhone? Run `npx eas-cli device:create` and register it, then run the same build command again. When EAS says the profile is missing devices and asks to choose devices again, answer Yes, press Space to tick the new iPhone, then press Return.

#### Use it without your computer

The development build can't show the app unless `npx expo start` is running. For an app that works on its own, build the preview profile instead:

```sh
npx eas-cli build --profile preview --platform ios
```

Install it the same way as step 4, on an iPhone you've already registered. It scans without your computer. It's a snapshot of the code, so make a new build when you change something. It uses the same app ID as the development build, so installing one replaces the other: reinstall the development build when you want live reloading again.

#### If it won't install or connect

- **"Unable to Install" or "integrity could not be verified":** that iPhone isn't in the build. Register it and build again, ticking it (see "Added a new iPhone?" above).
- **The app opens but shows no computer to connect to:** turn on Settings > Privacy & Security > Local Network > Frequency Visualizer. Keep the phone and computer on the same Wi-Fi, or use `npx expo start --tunnel`.
- **EAS says the bundle identifier is not available:** change `ios.bundleIdentifier` in `app.json` to something unique, such as `com.yourname.frequencyvisualizer`, and build again.

### Expo Go (screens only)

The app still opens in [Expo Go](https://expo.dev/go), so you can look around the screens, but it can't scan there. Because `expo-dev-client` is installed, `npx expo start` aims at the development build: press `s` in the terminal to switch to Expo Go, then scan the QR code. On an iPhone, log in to the same Expo account in Expo Go.

## Share it with testers

### Preview builds

A preview build is a standalone app that doesn't need your computer running:

```sh
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

On Android, anyone with the link can install the APK. On iPhone, each tester's iPhone must be registered with `npx eas-cli device:create` before you build, and ticked in the device list during the build.

### TestFlight and Google Play internal testing

1. Make a store build: `npx eas-cli build --profile production --platform ios` (or `android`). The build number goes up automatically.
2. Upload it: `npx eas-cli submit --platform ios` (or `android`).
   - **iPhone:** the build goes to App Store Connect. Add testers in TestFlight.
   - **Android:** you need a Google Play Console account with the app created in it, and a service account key for EAS. The very first upload has to be done by hand in Play Console. Then invite testers under Internal testing.

Guides: [development builds](https://docs.expo.dev/develop/development-builds/create-a-build/), [internal distribution](https://docs.expo.dev/build/internal-distribution/), [submit to the App Store](https://docs.expo.dev/submit/ios/), [submit to Google Play](https://docs.expo.dev/submit/android/).

## Project structure

```
src/app/            Screens, one file per route (Expo Router)
  (tabs)/           Radar, Devices, Wi-Fi and About tabs
  device/[id].tsx   Device detail screen
src/lib/            Logic that isn't about screens: scanning, tracker detection,
                    proximity, sorting, nicknames. Tests live in __tests__.
src/components/     Reusable UI: radar, device rows, signal chart, badges
src/context/        Shared state for scan results and nicknames
src/hooks/          Hooks such as the Bluetooth scan hook
src/constants/      The dark neon theme
assets/             Icons and splash screen
scripts/            make-icons.py redraws every icon (Python 3 + Pillow)
app.json            App settings: name, permissions, icons, Bluetooth plugin
eas.json            EAS build profiles: development, preview, production
```

To change the icon, edit `scripts/make-icons.py` and run `python3 scripts/make-icons.py`.

## License

MIT, see [LICENSE](LICENSE).
