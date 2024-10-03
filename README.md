RDS Surveyor 2
==============

This is the development repository for the upcoming RDS Surveyor version 2, a versatile Radio Data System decoder.

While the original [RDS Surveyor](https://rds-surveyor.jacquet.xyz/) runs as a local Java application, RDS Surveyor version 2 will run in the browser.

The program is currently under development and it is not (yet) usable. See below for a tentative list of milestones. Please use the original [RDS Surveyor](https://rds-surveyor.jacquet.xyz/) for the time being.

## Milestones

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

### Milestone 5

* New input source: I/Q signal (in WAV file).
* Traffic info and EON support (notably groups 14A, 14B, 15B).

### Milestone 6

* New input source: RTL-SDR USB dongles.
* Audio out?

### Milestone 7

* TMC support.

### Additional tasks

* Display of groups breakdown, groups sequence.
* Variant support for historical features.
* RP support.
* Broadcaster-specific TDC/IH data support: CATRADIO.
* New input source: clock/data from sound card.
* RDS2 upper streams and ODA support.
