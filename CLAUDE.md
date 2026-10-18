# Frequency visualizer

A phone app that shows nearby wireless signals such as Bluetooth devices, Wi-Fi networks and trackers like AirTags as a live, easy-to-read visual display.

## About this project
- **Who it is for:** Curious people and privacy-conscious phone owners who want to see what wireless devices are around them and spot unknown trackers.
- **Problem it solves:** Wireless signals are invisible, so people can't tell what devices are near them or whether an unknown tracker is traveling with them. Phones can't measure the full electromagnetic spectrum, but they can scan Bluetooth and Wi-Fi signals and show them clearly.
- **Done when:** The app scans for nearby Bluetooth Low Energy devices, shows them in a live list and a signal-strength visualization, and flags devices that look like AirTags or other trackers. The user can tap a device to see its details and signal strength over time.

## Tech stack
- Expo (React Native) with TypeScript
- Expo Router for screens
- Jest with jest-expo for tests

## Commands
```sh
npm install
npx expo start
npm test
```

## Conventions
- Use TypeScript and function components
- One screen per file in src/app, the folder Expo Router reads in current templates
- Keep logic that is not about the screen in src/lib, with tests
- Try every change on a real phone with Expo Go before calling it done

## Constraints
- Phones cannot sense true EM waves (radio, microwave, etc.) beyond Bluetooth and Wi-Fi radios, so the app must be honest about this limit. iOS does not let apps scan Wi-Fi networks, so Wi-Fi features are mostly Android-only. Bluetooth scanning needs a development build rather than Expo Go, and real devices are required for testing. Tracker detection is best-effort based on Bluetooth advertisement data and must not claim certainty. All scanning stays on the device and no data is uploaded.

## First version (must have)
- Bluetooth device scan: Request permissions and scan for nearby Bluetooth Low Energy devices, listing each with name (if any), ID and signal strength (RSSI).
- Live signal radar view: Show detected devices as dots on a radar-style display where distance from the center reflects signal strength, updating live.
- Tracker detection: Identify likely AirTags, Tile and similar trackers from Bluetooth advertisement data and mark them with a clear warning label.
- Device detail screen: Tap a device to see its details, an estimated proximity (near, medium, far) and a small chart of signal strength over time.
- Permission and honesty screens: Explain why permissions are needed and what the app can and cannot detect, including that it does not measure the whole EM spectrum.

## After the first version (should have)
- Wi-Fi network scan (Android): On Android, list nearby Wi-Fi networks with signal strength and channel. On iOS, show a short note that this is unavailable.
- Filters and sorting: Sort by signal strength or name, and filter to show only trackers or only named devices.
- Device nicknames: Let the user name a device (for example 'my headphones') and save it on the phone so it is recognized next time.

## How to work in this repo
- The plan is in PLAN.md, and its top says how to use it. When a task works, tick it there: "- [ ]" becomes "- [x]", and "(S)" becomes "(S, done YYYY-MM-DD)" with today's date.
- Read the files a task touches before changing them.
- Tasks marked (S) and small fixes: go ahead. Anything bigger: outline the plan first and wait for a go-ahead.
- Keep changes small. After each step run the tests from Commands and fix failures before moving on. A check that is not set up yet (a later task adds it) is not a failure: say so and go on.
- Ask before adding a new dependency or changing the tech stack.
