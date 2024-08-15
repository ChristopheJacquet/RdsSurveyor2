RDS Surveyor 2
==============

This is the development repository for the upcoming RDS Surveyor version 2, a versatile Radio Data System decoder.

While the original [RDS Surveyor](https://rds-surveyor.jacquet.xyz/) runs as a local Java application, RDS Surveyor version 2 will run in the browser.

The program is currently under development and it is not (yet) usable. See below for a tentative list of milestones. Please use the original [RDS Surveyor](https://rds-surveyor.jacquet.xyz/) for the time being.

## Milestones

### Milestone 1

* Protocol parser implemented for basic features (groups 0A, 0B, 1A, 2A, 2B, 3A, 4A, 10A, 14A, 14B, 15A, 15B), based on a protocol DSL compiled into TypeScript compiled into JavaScript.
* Corresponding web UI in Angular / TypeScript.
* One input source: hex files (RDS Surveyor / RDS Spy).

### Milestone 2

* New input source: Si 407x USB dongles.
* Logging.

### Milestone 3

* New input source: bitstream file.
* New input source: MPX signal (in WAV file).
* Audio out?

### Milestone 4

* New input source: I/Q signal (in WAV file).

### Milestone 5

* New input source: RTL-SDR USB dongles.

### Milestone 6

* ODA support.
* Common ODAs: RT+, DAB cross-reference.

### Milestone 7

* TMC support.

### Additional tasks

* Variant support (historical features, RBDS).
* RP support.
* Broadcaster-specific TDC/IH data support: CATRADIO.
* New input source: clock/data from sound card.