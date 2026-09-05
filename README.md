# Umbra

An offline sky almanac for Android. It works out what your sky is doing tonight, scores whether
that is worth going outside for, and tells you once, in the evening, when it is.

Everything is computed on the device. The app declares no INTERNET permission, so it cannot fetch
a forecast, an ephemeris or an advert, and the numbers on screen come from published astronomical
algorithms that ship inside the binary.

- Landing page and web version: https://shayanmohd.github.io/umbra/
- Privacy policy: https://shayanmohd.github.io/umbra/privacy-policy.html

## What it does

- **A score out of ten for tonight**, with its four components shown: what is on, hours of true
  darkness, what the Moon costs you, and whether the good hour is a civilised one.
- **A darkness timeline** drawn from the real solar altitude: sunset, the three twilights,
  moonrise and moonset, and the window of astronomical darkness.
- **Meteor rates for your sky**, from the IMO working list run through the standard rate formula
  with radiant altitude, your Bortle class and tonight's moonlight.
- **Eclipses with local circumstances**: type, times, magnitude, obscuration and altitude for your
  coordinates, with a warning when you are near the edge of a path of totality.
- **A year of dated events**: shower peaks, eclipses, oppositions, greatest elongations, close
  conjunctions, new and full moons, solstices and equinoxes.
- **Two places side by side**, so the question "is the drive worth it" gets a number.
- **A life list and an observation log**, with the computed conditions attached to each entry and
  a JSON export.
- **Red light mode** for the whole app, manual or automatic after dusk.
- **Local notifications** computed on the device: an evening heads up when a night clears the score
  you set, an eclipse warning, and a Sunday digest that stays quiet when the week holds nothing.

## Layout

```
web/                 the app: no build step, no framework, no CDN, works offline
  js/astro.js        ephemeris kernel: Sun, Moon, planets, eclipses, rise and set
  js/data.js         authored tables: meteor streams, Bortle classes, targets, life list, cities
  js/sky.js          the model: nights, darkness, rates, the score, the year ahead
  js/store.js        one localStorage record
  js/notify.js       the alert schedule, computed here and handed to the system
  js/draw.js         every picture in the app, drawn on canvas from the numbers
  js/app.js          screens, routing and the window.App contract the shell needs
android/             WebView shell: haptics, file export, local notifications
docs/                landing page, privacy policy and a playable copy of web/
store/               brand spec, icons, screenshots, listing copy
```

## Building

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew --offline bundleRelease assembleRelease
```

`web/` is copied into `android/app/src/main/assets/www` by a Gradle task on every build.
Signing reads `android/keystore.properties`, which is not in this repository.

## Accuracy, and its limits

Positions follow Meeus, *Astronomical Algorithms*, for the Sun, the Moon, sidereal time, parallax
and eclipse geometry, and JPL's Keplerian elements for the planets. Rise, set and twilight times
match published tables to the minute; eclipse times land within a few minutes of the canon and
local magnitudes within a fraction of a per cent.

Three things are approximations, and the app says so on its Method screen: the magnitudes lost to
moonlight are modelled from phase and altitude rather than a full scattering model; eclipse
circumstances use the Moon's mean limb, so a place within a few kilometres of the edge of a path
needs an official map; and your Bortle class is your own judgement rather than a measurement.

The app does not forecast weather, aurora or satellite passes. All three need live data, and it
has no way to fetch any.

## Licence

Space Grotesk is used under the SIL Open Font License. Everything else is the work of
SocialSure Private Limited.
