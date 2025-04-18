RDS Surveyor 2, Radio Data System decoder
=========================================

RDS Surveyor 2 is a complete tool for decoding and analyzing Radio Data System (RDS) data. RDS (also known as RBDS in North America) is a communication protocol for embedding streams of digital information in FM radio broadcasts.

RDS Surveyor 2 runs in the Chrome or Edge web browsers, on all platforms. It aims to support all RDS and RDS2 features and a large selection of Open Data Applications (ODAs). It supports popular radio front-ends (RTL-SDR and Si470x USB dongles) and can play back sample files (log files compatible with RDS Spy, MPX samples, I/Q samples).

Run RDS Surveyor 2 in your browser at [rds-surveyor-app.jacquet.xyz](https://rds-surveyor-app.jacquet.xyz).

Project homepage for more details: [rds-surveyor.jacquet.xyz](https://rds-surveyor.jacquet.xyz/).

## Past milestones

### Milestone 1 (Reached on 11 Sep 2024)

* Protocol parser implemented for basic features (groups 0A, 0B, 2A, 2B, 3A, 4A, 10A, 15A), based on a protocol DSL compiled into TypeScript compiled into JavaScript.
* Corresponding web UI in Angular / TypeScript.
* One input source: playback of hex files (RDS Surveyor / RDS Spy format).

### Milestone 2 (Reached on 16 Sep 2024)

* New input source: Si 407x USB dongles.
* Graphical block error rate display.
* Logging to local files.
* ODA support infrastructure.
* RT+ ODA support.
* Display of RT history (including RT+).
* RDS/RBDS switch in the UI (interpretation of PTY, call letters decoding).

### Milestone 3 (Reached on 21 Sep 2024)

* New input source: bitstream file.
* AF support.
* DAB cross-reference (EN 301700) ODA support.

### Milestone 4 (Reached on 3 Oct 2024)

* New input source: MPX signal (in WAV file).
* Constellation diagram display.
* Groups 1A, 1B support.
* Display the list of ODAs in use.

### Milestone 5 (Reached on 19 Oct 2024)

* Traffic info and EON support (notably groups 14A, 14B, 15B).
* RDS Surveyor is now installable as a Progressive Web App (PWA).
* New tab with a log of group contents.
* New tab with a log of traffic events (TA, EON).
* Lots of UI polishing.
* The various settings (RDS/RBDS, tuner frequency, etc.) are now remembered across sessions.
* Lots of bugfixes.

### Milestone 6 (Reached on 29 Mar 2025)

* New input source: RTL-SDR USB dongles (with audio out).
* FLAC format support for MPX file playback.
* Faster synchronization.
* eRT ODA support.
* New `play_url` parameter allows linking to an RDS-Surveyor instance directly playing a sample file.
* Preliminary support for Radio Paging (RP): information visible in log tab; no dedicated RP tab yet.

### Milestone 7 (Reached on 18 Apr 2025)

* RDS2 upper streams support.
* RDS2 station logo ODA.
* RDS2 Internet connection ODA.
* New input source: I/Q signal (from WAV or FLAC files).

## Rough future plans

### Milestone 8

* New input source: clock/data from sound card.
* User interface improvements

### Milestone 9

* TMC support.

### Other planned features

* Display of groups sequence.
* Variant support for historical features.
* RP support (with own tab in UI).
* Broadcaster-specific TDC/IH data support: CATRADIO.
* Audio out support in playback mode.
