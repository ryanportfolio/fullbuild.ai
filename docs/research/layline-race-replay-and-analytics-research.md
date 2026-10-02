# What sailors, coaches, and race committees need from race replay

Research date: 23 August 2026  
Scope: browser replay and post-race analysis for Layline's fictional six-boat, one-design fleet

## Evidence and scope

This report separates three kinds of evidence:

- **Rule or governing-body evidence** comes from World Sailing and class rules.
- **Product evidence** describes what a vendor says its product does. Unless stated otherwise, feature claims in the product survey come from vendor pages, manuals, or repositories.
- **Practice evidence** comes from a named coach, sailor, race officer, event, or user. Recent independent field studies are scarce, so product claims do not prove that users find a feature useful.

The Layline baseline was checked in source on 23 August 2026. The shared contracts publish 4 Hz boat fixes with position, SOG, COG, heading, heel, TWA, and kite state, plus a 1 Hz time-only wind series. They contain no current, speed through water, or spatial wind coordinates ([types.ts](https://github.com/ryanportfolio/layline/blob/main/src/lib/layline/types.ts)). The simulator keeps its polar knots inside one private speed function and states that its published 1 Hz series is "the only wind there is" ([sim.ts](https://github.com/ryanportfolio/layline/blob/main/src/lib/layline/sim.ts)). Existing analytics cover starts, VMG, maneuvers, standings, boat state, boat comparison, and wind-at-time ([analytics.ts](https://github.com/ryanportfolio/layline/blob/main/src/lib/layline/analytics.ts), [analyst tools](https://github.com/ryanportfolio/layline/blob/main/src/lib/layline/analyst/tools.ts)). The three-pane races page has a race library, replay console, and analyst ([RaceWorkspace.tsx](https://github.com/ryanportfolio/layline/blob/main/src/app/prototype/layline/races/RaceWorkspace.tsx)).

## 1. Executive summary

1. **Build a current and water-reference lab first:** separate speed and course through water from speed and course over ground, draw the vector triangle in the replay, and let users see where current helped or hurt each boat.
2. **Expose the polar as a working performance tool:** add target boat speed, target VMG, percent of polar, and a polar diagram linked to the same replay clock.
3. **Turn the start into a proper start and recall lab:** use the hull rather than the tracker point, show signed distance and time to line, line bias, speed build, OCS and return, plus the race committee's signal and sighting record.
4. **Replace course-wide wind with a seeded spatial wind field:** give each boat local pressure and direction, then show lifts, headers, gusts, lulls, and the fleet's gains without claiming real-world sensor fidelity.
5. **Add a fleet gain-and-loss debrief:** mark where a boat gained or lost metres against the fleet median or a chosen rival, then split the result into start, straight-line pace, maneuvers, and roundings.
6. **Add an incident and rounding desk:** freeze the replay at zone entry or a close crossing, show hull geometry and synchronized facts, and export a short evidence clip without pretending to decide a protest.

The common thread is explanation. A sailor should be able to answer "where did the metres go?" A coach should be able to show the whole squad the same answer. A race officer or jury should be able to see which readings are measured, derived, simulated, or uncertain.

## 2. Per-audience findings

### Product reality check in 2026

| Product | Primary user and strongest job | What it is good at | Main limit for this prototype | Evidence freshness |
|---|---|---|---|---|
| SAP Sailing Analytics | Event organizers, coaches, sailors, media | Full event stack: live GPS, rankings, speed, maneuvers, bearings, race management, buoy tools, official-result integration, and a large archive | Broad platform and event administration, not a focused modern debrief interaction model | SAP open-sourced the platform and companion apps on 20 October 2025. The [announcement dated 14 November 2025](https://community.sap.com/t5/technology-blog-posts-by-sap/sailing-analytics-goes-open-source/ba-p/14268880), [repository](https://github.com/SAP/sailing-analytics), and [developer hub](https://docs.sapsailing.com/) are current primary sources |
| TracTrac | Event organizer, broadcaster, club or squad coach | Turnkey live tracking, permanent replay, leaderboards, course geometry, line bias, mark bearings, safety, and hosted group debriefs | Event service first. Deep boat-performance work depends on tracker resolution, wind capture, and event setup | Current vendor pages accessed 23 August 2026. A [2025 ILCA and pathway coaching page](https://www.tractracuk.co.uk/race-replay) shows real group debrief use |
| Kattack | Club fleet and offshore organizer | Low-cost GPS aggregation, replay, leaderboard, average speed, distance sailed, tack loss, rounding efficiency, and start loss | Windows Race Publisher workflow looks dated. Current service health could not be established | [Publishing instructions](https://wp.kattack.com/publishing-instructions) remain online in 2026. A [2025 user thread](https://www.reddit.com/r/sailing/comments/1laavoa/is_kattack_kaput/) reports app failure and possible shutdown, so availability is unverified |
| MetaSail | Event organizer, coach, parent, sailor | Rental trackers, remote event setup, 1 Hz fleet tracking, browser replay, SOG or VMG colored tracks, automatic WhatsApp reports, and synchronized phone video | Vendor claims sub-2 m accuracy. That is useful for replay but insufficient by itself for centimetre-level OCS or overlap calls | Current [vendor site](https://www.metasail.fr/) accessed 23 August 2026. No dated 2025 or 2026 independent review found |
| raceQs | Sailor and coach wanting an accessible fleet replay | Free 3D replay, many cameras, fleet tracks, VMG, separation, wind direction, drift vectors, maneuver analysis, and replay clips | Public examples and much tutorial content are old. Current maintenance and device reliability remain unclear | The [site is live and marked 2026](https://raceqs.com/), while signature races date from 2013 to 2015. The detailed [3D analytics tutorial](https://raceqs.com/tutorials/replaying-races-in-3d/) has no visible publication date |
| Sailmon | Individual sailor, training group, small event | Waterproof logging instrument plus mobile app, automatic legs and events, speed, heel, pitch, COG, wind trend, nearby-boat comparison, and mobile replay | Best evidence is for sailor logging and app review, not official evidence. Many detailed feature posts date from 2021 and 2022 | Current [product range](https://sailmon.com/home-2/) accessed 23 August 2026; feature detail from the [12 January 2021 MAX update](https://blog.sailmon.com/header-lift-wind-trends-and-app-updates-for-max) and [27 September 2021 app release](https://blog.sailmon.com/android-version-of-the-sailmon-app-online) |
| Vakaros | Competitive sailor and race committee | Atlas instruments, distance and time to line, live moving line ends, Race Control tablet, immediate OCS notification, fleet tracking, and automated finishes | Closed hardware ecosystem. Category 2 rule-determining use is still under assessment in World Sailing's 2026 framework | Current [RaceSense resources](https://www.vakaros.com/pages/racesense-resources), a [1 November 2025 ILCA RTK test](https://www.vakaros.com/blogs/news/ilca-tests-the-future-of-olympic-racing-with-racesense-rtk-in-vilamoura), and World Sailing's 2026 recognition page |
| Velocitek | Sailor who wants glanceable start data; increasingly race committees | ProStart distance to line, timer, SOG, COG, shift indicator, and logs. New RTK Puck adds live line ends, OCS, finish, mark, and evidence functions | ProStart is intentionally narrow. RTK requires event-wide devices and remains a 2026 rental and evaluation program | Current [ProStart page](https://www.velocitek.com/pages/prostart); [RTK Puck](https://www.velocitek.com/pages/rtk-puck); [31 March 2026 rental announcement](https://www.velocitek.com/blogs/news/nothing-drives-like-a-rental) |
| Expedition | Professional navigator and instrumented keelboat team | Weather and current routing, asymmetric polars, start line, time to burn, layline bounds, competitor tracking, strip charts, log replay, calibration, and polar editing | Dense Windows navigator workstation. It is built around one well-instrumented boat, not a phone-first squad debrief | Current [v12.8.17 product page](https://www.expeditionmarine.com/index.html) and [2026 manual](https://www.expeditionmarine.com/downloads/documents/Expedition.pdf) |
| Adrena | Offshore navigator, coach, professional team | Routing with current and weather, target speed and VMG, real polar creation, histographs, track correction, replay, and in Pro, fleet replay and maneuver-loss analysis | Advanced functions split by product tier. Desktop workflow and prepared instrument logs suit funded programs | Current [Standard and Pro comparison](https://www.adrena-software.com/en/our-navigation-software-offer/navigation-and-regular-racing/adrena-standard/); [2026 v23 changes](https://www.adrena-software.com/wp-content/uploads/2026/01/ADRENA-V23-New-features-1.pdf) |
| SailGP broadcast | Fans, commentators, officials, professional teams | LiveLineFX draws geo-positioned boundaries, marks, line, position, current, and performance over live video with stated 2 cm accuracy | League-owned infrastructure with 125 sensors per boat, high-accuracy GPS, dedicated broadcast staff, and cloud processing | [2025 technology release](https://sailgp.com/news/25/sailgp-2025-season-most-technologically-advanced-in-sailing-history/) and [9 May 2024 LiveLineFX description](https://mediahub.sailgp.com/news/24/sailgp-offer-livelinefx-graphics-sports-properties-rights-owners/), both official promotional sources |
| America's Cup broadcast | Fans, commentators, media analysts | VirtualEye data replay plus WindSightIQ spatial wind and an optimal-path ghost boat generated from LiDAR, yacht, and buoy sensors | Three shore LiDAR units, sensor fusion, simulators, and host-broadcast infrastructure make this a professional frontier feature | [22 August 2024 WindSightIQ announcement](https://www.americascup.com/news/3246_CAPGEMINI-AND-AMERICAS-CUP-MEDIA-TO-BRING-A-NEW-DIMENSION-TO-THE-37TH-AMERICAS-CUP-EXPERIENCE-WITH-WINDSIGHT-IQ) and [17 June 2026 AC38 press kit](https://www.americascup.com/files/m30120_AC38-ENG-PressKit-V4-5-20260617.pdf), both official promotional sources |

The strongest current pattern is specialization. Sailmon, Vakaros, and Velocitek make the on-boat job glanceable. TracTrac, MetaSail, SAP, and raceQs reconstruct a fleet. Expedition and Adrena calculate a navigator's answer from calibrated instruments. Njord and newer coaching tools align data, video, comments, and season history. SailGP and the America's Cup turn high-grade telemetry into a spectator story. Few products make those layers feel like one evidence chain.

### Sailors, afterguard, tacticians, and trimmers

#### What they actually review

The first argument is usually causal: "Did we lose because we were slow, sailed farther, tacked badly, chose the wrong side, or sat in less wind or worse current?" A track alone answers where. It rarely answers why.

The useful review units are:

- **The start:** signed distance to line, time to line, speed and acceleration at the gun, favored end, lane, first crossing, and whether an OCS return was clean.
- **Straight-line mode:** speed through water, target speed, percent of polar, VMG, target VMG, angle, heel, and how long the boat held a stable mode.
- **Tactics:** lifted or headed tack, pressure, current, leverage, crossings, cover, layline arrival, distance sailed, and metres gained or lost against a rival.
- **Boat handling:** tack or gybe entry speed, minimum speed, turn rate, exit speed, recovery time, and distance lost. raceQs exposes tacking angle, minimum speed, VMG, duration, recovery, and estimated time loss in its [replay analytics](https://raceqs.com/tutorials/replaying-races-in-3d/). Adrena Pro lists maneuver-loss analysis in its [current feature matrix](https://www.adrena-software.com/en/our-navigation-software-offer/navigation-and-regular-racing/adrena-pro/).
- **Transitions and roundings:** mark approach, inside or outside traffic, minimum mark distance, exit lane, sail or foil transition, and speed at exit.

Trimmers add a separate argument: which sail and setup was on, when a sheet, traveller, rig, or foil control moved, and whether the boat returned to target afterward. Layline has none of those control channels. Heel, speed, and TWA can show a performance change, but they cannot prove a trim cause. That boundary should stay explicit.

On a phone in the tent, the likely winning shape is a one-screen result with five or six tappable moments, followed by the replay at that exact second. Sailmon's app emphasizes personal bests, automatic legs, second-by-second graphs, and comparison to sailors in the same class and area ([vendor release, 27 September 2021](https://blog.sailmon.com/android-version-of-the-sailmon-app-online)). Velocitek's ProStart makes the on-water half deliberately sparse: large timer, distance, speed, and course numbers, with a log for later replay ([vendor page, accessed 23 August 2026](https://www.velocitek.com/pages/prostart)). The lesson for Layline is to keep the mobile review selective, not to shrink the desktop workspace into a phone.

#### Standard, performance-team, and frontier practice

| Level | Practice in 2026 |
|---|---|
| Standard club or dinghy fleet | Phone, watch, or GPS tracks; map or 3D fleet replay; SOG and COG; start and finish times; simple VMG when a wind direction has been set; tack and gybe markers; shared replay on a club screen |
| Performance team | Calibrated heading, wind, and speed through water; target tables and percent of polar; coach-boat wind and comments; synchronized video; same-class fleet comparison; trends across races and training days |
| Frontier professional program | RTK position, boat geometry, dense control and load channels, live current, spatial wind sensing, optimal-path simulation, remote analysts, and broadcast-grade augmented reality |

The frontier is visible but should not set Layline's data contract. SailGP says LiveLineFX receives sea current plus boat and weather data from 125 sensors on each F50 ([official release, 9 May 2024](https://mediahub.sailgp.com/news/24/sailgp-offer-livelinefx-graphics-sports-properties-rights-owners/)). America's Cup WindSightIQ fused three LiDARs with yacht and buoy sensors into a wind field refreshed every second ([official release, 22 August 2024](https://www.americascup.com/news/3246_CAPGEMINI-AND-AMERICAS-CUP-MEDIA-TO-BRING-A-NEW-DIMENSION-TO-THE-37TH-AMERICAS-CUP-EXPERIENCE-WITH-WINDSIGHT-IQ)). Those are useful interaction references, not honest data expectations for a fictional browser demo.

#### Where current tools are weak

1. **Ground speed is allowed to impersonate boat speed.** GPS-only systems know SOG and COG. Without speed through water, current, and calibrated wind, "slow" may mean adverse current. Velocitek explicitly describes SOG and COG as movement over the bottom and as clues to current, not a direct water-speed measurement ([ProStart page](https://www.velocitek.com/pages/prostart)).
2. **Metrics and replay drift apart.** Users often move between a track map, instrument graph, polar tool, video player, and exported spreadsheet. A number may use a different wind source or time window from the picture.
3. **Fleet context stops at overlay.** Track overlays show the split, but users still calculate where the metres changed and whether pace, maneuvering, or geography caused it.
4. **Mobile summaries favor records over decisions.** Top speed and best 500 m are easy to publish. A sailor needs the five moments that changed the race and a path back to the full evidence.
5. **The tools often hide uncertainty.** A clean animated boat looks exact even when the GPS error is metres, the line was pinged once, or wind came from a single moving sensor.

### Coaches

#### What a debrief looks like

A useful squad debrief has two passes. First, restore shared context with the full fleet: course, wind, fleet split, rank changes, and the decisive crossings. Second, isolate a small number of moments and compare boats on equal terms: same leg, same time, same tack, and similar wind.

Recent product workflows support this reading:

- TracTrac UK's 2025 sessions pause, rewind, switch legs, follow a boat or fleet, and show line bias and mark geometry. Its documented ILCA debriefs compare starts, boat speed, places gained, and VMG on a large screen ([practice and vendor source](https://www.tractracuk.co.uk/race-replay)).
- Njord logs coach comments on the water, detects races and legs after upload, synchronizes multiple video angles with telemetry, lets a team use the browser while the coach prepares, compares performance across the season, and exports stills or video with data overlays ([vendor page, accessed 23 August 2026](https://www.sailnjord.com/)). Named users include Olympic, TP52, SailGP, and one-design coaches, though that list is still vendor evidence.
- MetaSail combines squad tracking, training diaries, tests, starts, maneuvers, synchronized video, and WhatsApp reports ([vendor page, accessed 23 August 2026](https://www.metasail.fr/)).
- Adrena's replay article says skippers at Pôle Finistère Course au Large systematically sent tracks after training and racing so coaches could compare trajectories, performance, and routing polars. It also describes adding comments, pictures, and video to the replay ([coach-authored vendor article, 5 June 2018](https://www.adrena-software.com/en/use-of-the-replay-function/)). This is older, but it is a concrete account of a working debrief.
- SailSync's 2026 product combines group uploads, PDF reports, maneuver and start analysis, video or audio sync, and AI-linked 3D moments. Its named US Sailing Team coach testimonial complains about the time spent processing files ([vendor page, accessed 23 August 2026](https://www.sailsync.ai/)).

For Layline, a coach should be able to select "fleet median" as readily as a named boat. The comparison should answer:

- Who gained during the start, first beat, rounding, and run?
- Which boats held the best straight-line VMG before the next maneuver?
- What did the best two tacks look like, and was the loss caused by entry speed, turn, or recovery?
- Did one side pay across the squad, or only for the fastest boat?
- Is this boat improving across the three seeded races under comparable wind bands?

#### What coaches export or clip

The practical outputs are a replay link at a precise time, a short clip, a still with tracks and labels, a small comparison table, and a report that survives after the live discussion. Njord exports stills and video with overlays. SailSync sells PDF reports and video tools. MetaSail sends automatic race reports and retains synchronized video. These are vendor claims, but their agreement identifies a stable job: coaches need a portable teaching object, not another dashboard left open on the coach's laptop.

#### Standard, performance-team, and frontier practice

| Level | Practice in 2026 |
|---|---|
| Standard squad | Collect tracks, load the fleet, replay starts and major splits, compare SOG or VMG, talk through a few moments, share a link or screenshot |
| Performance program | Auto-detect races and legs, align coach comments and several videos, run line-ups or speed tests, compare normalized segments, build a season database, export clips and reports |
| Frontier professional program | Live chase-boat telemetry, remote analysts, calibrated multi-sensor data, simulation against measured weather, confidential setup channels, and automated batch analysis |

#### Where current tools are weak

1. **Preparation still consumes the debrief.** Pairing devices, collecting logs, aligning clocks, setting marks, correcting tracks, choosing wind, and cutting video happen before teaching can start.
2. **Squad comparisons are often unfair.** Raw averages mix tacks, legs, pressure, traffic, and different time windows. Good comparisons need a declared cohort and normalization.
3. **Most tools report outcomes before causes.** "VMG down 0.3 kn" is an observation. The coach still needs the replay, wind, current, angle, and maneuver context to decide what to train.
4. **Season history and race replay are separate.** Njord explicitly joins them, which suggests the gap elsewhere: the best tack today should be comparable with the same sailor's baseline and the squad's current benchmark.
5. **Sharing often loses provenance.** A screenshot or clip needs the race, boats, time range, metric definition, wind source, and data quality attached.

### Race committees, umpires, juries, and race officers

These users need a different product. Their job is a defensible record of what the race committee knew and did.

#### Before and during racing

A committee view needs:

- Tracker check-in, identity, battery, data age, position quality, and reference point on each hull.
- Mark and signal-boat positions, line length, line bearing, course axis, line bias, anchor swing, and any moved endpoint.
- Timestamped wind readings with source and location, plus current observations where they affect line or course geometry.
- The start sequence, flags, sounds, postponements, recalls, and the exact rule in force.
- At the gun, a line sight from both ends, a ranked list of boats nearest or over, and the ability to follow each recalled boat until it is wholly back on the pre-start side.
- During racing, mark movement, course changes, fleet identification, safety alerts, rounding order, finishing order, and scoring reconciliation.

World Sailing's older race-management manual remains the clearest public description of the manual job. It covers line length and bias, sighting from both ends, wind surveillance, course changes, and adjustments for current ([Race Management Manual, July 2019](https://www.sailing.org/tools/documents/RaceManagementManualJuly2019-%5B25256%5D.pdf)). The age matters: no current 2025 or 2026 replacement manual was found.

SAP's current open-source stack includes a Sailing Race Manager app for start sequences, flags, finishes, and cloud result sync, plus a Buoy Pinger ([developer hub, accessed 23 August 2026](https://docs.sapsailing.com/)). TracTrac sells course laying, result registration, processing, and safety alongside tracking ([vendor event page, accessed 23 August 2026](https://www.tractrac.com/get-event)). MetaSail places trackers on boats and marks and provides a committee portal ([vendor page](https://www.metasail.fr/)). These products show that race replay alone is only one part of the committee workflow.

#### Starts, OCS, recalls, and the 2025-2028 rules

The current Racing Rules of Sailing took effect on 1 January 2025. Two details should shape Layline:

1. A boat starts only after her **hull** has been wholly on the pre-start side at or after the signal, then any part of her hull crosses to the course side. Rule 29.1 also uses any part of the hull for an individual recall. The current Layline start report measures a position fix against the line. That is useful performance data, but it is not an official hull-based OCS test ([RRS 2025-2028, Start definition and rule 29](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf)).
2. Rule 29.2 permits a general recall when the committee cannot identify the boats on the course side, or when there was a starting-procedure error. Rules 30.1 to 30.4 add I, Z, U, and black-flag consequences. A serious start lab must model which rule was active and distinguish "over at the gun" from the one-minute triangle tests ([RRS 2025-2028, rules 29 and 30](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf)).

Rule 56.3 says a required AIS transponder or other tracking device may not be turned off or intentionally degraded. That supports tracker-health logging, but it does not make every tracker output determinative evidence ([RRS 2025-2028, rule 56.3](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf)).

#### What changed in 2025 and 2026

World Sailing's new Augmented Race Management Systems framework is the largest relevant change. Its draft 2026 categories separate:

- Category 0, testing only. Outputs cannot decide outcomes or compliance.
- Category 1, decision support. Officials retain the decision; output may be evidence or guidance.
- Category 2, automated rule determination. The notice of race or sailing instructions must change the RRS for designated decisions.

The framework names starts and finishes, tracking, telemetry and broadcast integration, and committee communications. In 2026, Vakaros Atlas 2 and Edge are Category 0 and 1. Vakaros HALO RTK, Velocitek RTK Puck, and Sailteck SK02 are Category 0 and 1 and under assessment for Category 2 ([World Sailing ARMS page, accessed 23 August 2026](https://www.sailing.org/inside-world-sailing/activities-services/technical-offshore/augmented-race-management-systems/)).

World Sailing also advertised a Digital Officiating Rules Working Group on 14 March 2025 to help develop rules for digital officiating ([World Sailing role notice, 14 March 2025](https://www.sailing.org/inside-world-sailing/organisation/world-sailing/career-opportunities/past-career-opportunities/racing-rules-committee-working-group-members/)). Both governance and hardware remain active work.

Adoption is moving into class rules. The International J/70 Class Rules effective 1 February 2026 let a RaceSense event require a Vakaros Atlas 2 or later model for starting and finishing ([J/70 class rules, 1 February 2026](https://media.sailing.org/sailing/wp-content/uploads/2022/02/03163655/J70_CR_2026-02-01-2.pdf)). Velocitek introduced RTK Puck rentals for 2026 at $50 per device per day, with three committee units plus one per competitor ([vendor announcement, 31 March 2026](https://www.velocitek.com/blogs/news/nothing-drives-like-a-rental)). These are real moves beyond professional leagues, but they are still controlled event deployments rather than normal club practice.

#### Protest and umpiring evidence

The RRS lets a protest committee take party, witness, hearsay, and other evidence it considers necessary, then decide the weight and find facts on the balance of probabilities. Appendix M warns that photo and video have limited depth perception and asks where the camera was, whether its platform moved, whether the view angle changed, and whether the view was obstructed ([RRS 2025-2028, rules 63.4 and 63.5, Appendix M8](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf)).

A replay should therefore expose camera, sensor, and model limits. It should never present interpolated 3D hulls as a truth source by themselves. For a fictional event, Layline can still show the right product behavior: original sample points, interpolation mode, sample age, position uncertainty, hull reference point, line-end history, and the formulas behind a derived crossing.

#### Standard, decision-support, and frontier practice

| Level | Practice in 2026 |
|---|---|
| Standard club committee | Visual line sight, flags and sounds, handwritten or app logs, wind readings, mark bearings, manual finish recording, scoring package, witness evidence and available video |
| Decision-support event | Trackers on boats and marks, live committee tablet, OCS candidate list, automated timing, finish assistance, replay and video, data-quality checks, official retains decision |
| Rule-determining or professional frontier | Event-wide RTK, defined hull geometry and reference points, redundant endpoints, audited communications, automatic calls authorized by NOR or SI, broadcast and officiating on a shared high-grade data feed |

#### Where current tools are weak

1. **Animation looks more certain than the evidence.** Most viewers hide fix rate, latency, accuracy, dropouts, interpolation, and hull offset.
2. **The action log and the replay are separate.** Flags, sounds, radio calls, course changes, and OCS decisions need the same clock as the boats.
3. **Line endpoints are treated as fixed pings.** Anchor swing and moving committee boats make the line a time series. RaceSense's live endpoint broadcasts directly address this job ([Vakaros resources](https://www.vakaros.com/pages/racesense-resources)).
4. **A tracker point is mistaken for a hull.** Official starts and finishes now turn on hull geometry. Device mounting and heading errors matter.
5. **Results and evidence do not round-trip cleanly.** Race managers still reconcile tracker output, finish records, penalties, and scoring systems. SAP's own issue history includes demand for better result exchange with Manage2Sail, a sign that integration is a long-running problem ([SAP issue 3941](https://github.com/eclipse-sailing-analytics/sailing-analytics/issues/3941)).

## 3. Candidate features

### Ranking table

Cost assumes one experienced front-end and 3D engineer working in the existing prototype. It includes tests and a polished seeded story, but excludes new real-world ingestion. S is 2 to 4 focused days, M is 1 to 2 weeks, and L is 2 to 4 weeks.

| Rank | Candidate | Posting evidence | Audience pull | Data status | Cost and work shape |
|---:|---|---|---|---|---|
| 1 | Current and water-reference lab | Player: strong; app: strong; analytics: strong | Sailors: high; coaches: high; committees: medium | Simulation extension | L; balanced 3D, interface, analysis |
| 2 | Polar performance panel | Player: medium; app: strong; analytics: very strong | Sailors: very high; coaches: very high; committees: low | Existing polar can seed it; full honesty needs water speed and local wind | M; mostly analysis and interface |
| 3 | Start and recall lab | Player: strong; app: very strong; analytics: very strong | Sailors: very high; coaches: high; committees: very high | Simulation extension | L; mostly interface and analysis with precise 3D geometry |
| 4 | Spatial wind and pressure replay | Player: very strong; app: strong; analytics: strong | Sailors: high; coaches: high; committees: medium | Simulation extension | L; mostly 3D plus analysis |
| 5 | Fleet gain-and-loss debrief | Player: medium; app: very strong; analytics: very strong | Sailors: high; coaches: very high; committees: low | Supported by existing telemetry | M; mostly analysis and interface |
| 6 | Incident and rounding desk | Player: very strong; app: strong; analytics: strong | Sailors: medium; coaches: high; committees and jury: high | Needs hull dimensions and a seeded close incident | L; balanced 3D, interface, analysis |

### 1. Current and water-reference lab

**What users call it**

"What was the tide doing, and were we actually slow?" Show current set and drift, boat speed through water, course through water, SOG, COG, and the resulting ground track.

**Posting evidence**

This hits all three bullets. The 3D player draws a moving current field and two velocity vectors. The React shell supplies layer controls, a vector inspector, and comparison states. Analytics quantify current gain or loss along the leg and separate water pace from ground progress.

**Audience strength**

Sailors and coaches: high. Race committees: medium, especially for line and course setting. Expedition and Adrena both treat current as an input to routing and start or course decisions, while World Sailing's race-management manual has a full section on adjusting a course for current.

**Data and simulation**

Needs a simulation extension. Add a deterministic current field `currentAt(x, y, t)` and retain water-relative velocity before adding current. Publish speed and course through water or the water-velocity vector on each fix. Keep SOG and COG as the resulting ground vector. A simple seeded field can combine a steady set, a cross-course gradient, and one tide-line transition. No real venue or tidal claim is needed.

The existing fixes already have heading, COG, and SOG, but that is insufficient to solve current uniquely because leeway and speed through water are unknown. Deriving current from the present fields would manufacture precision.

**Cost and work shape**

L, about 2 to 3 weeks. Simulation and analysis carry the risk. The visual work is moderate: water arrows or particles, a vector triangle, and a current-gain ribbon.

**Place in the layout**

Keep the replay central. Add a `Current` layer next to wind and laylines. The right pane gets a structured `Water vs ground` card above the analyst, with set, drift, STW, SOG, COG, and seconds gained. On narrow screens, the card becomes one of the five moment summaries.

**How a viewer checks it**

At any fix, display the equation `ground velocity = water velocity + current velocity` as three arrows and numeric x/y components. The arrow sum must land on the next rendered ground position. Leg current gain is the difference between actual along-course ground progress and the progress the same water vector would have made in still water, integrated over the selected window.

### 2. Polar performance panel

**What users call it**

"Are we on target?" Show target speed, target VMG, actual percent of polar, sailed angle, and the target angle for the current wind.

**Posting evidence**

This is the clearest evidence for the analytics bullet and strong evidence for the React application. It also affects the player by coloring a boat's wake by percent of target and letting a polar-point selection seek the replay.

**Audience strength**

Sailors and coaches: very high. Committees: low. Expedition computes and edits polars, while Adrena creates real polars from logged data and reports target speed and VMG. Sailmon's larger-boat processor calculates target speed and performance ratio ([operator material](https://www.sailmon.com/wp-content/uploads/Feb-2018-E4-Installation-manual-Sailmon-equipment-V3.0.docx.pdf)).

**Data and simulation**

The existing private polar curve is enough for a first version in the current no-current races. Expose it as a versioned race input and publish local TWS at each fix. Once current exists, percent of polar must use speed through water rather than SOG. A polar panel that continues to divide SOG by target speed would blame or reward the boat for tide.

Use the existing curve as a fictional class polar. Do not borrow a real class name or published polar.

**Cost and work shape**

M, about 5 to 8 days after the data contract is settled. Mostly analysis and interface, with a small scene change for wake coloring.

**Place in the layout**

The current VMG strip can gain a `Target` mode. The right pane gets a compact polar diagram with actual points accumulating to the current time, a target curve for the current TWS, and a boat or fleet selector. A full-screen analysis drawer can compare the three seeded races without squeezing the replay.

**How a viewer checks it**

At a chosen fix, print the inputs: local TWS, absolute TWA, actual STW, interpolated target STW, and percent. The point on the polar chart must have the same TWA and speed as the instrument card. Target VMG must come from searching the same polar curve for the speed-angle product that gives the best made-good speed in that wind band.

### 3. Start and recall lab

**What users call it**

Sailors ask "Were we late, slow, or over?" Race officers ask "Who was OCS, under which rule, and did they get back?"

**Posting evidence**

This exercises all three bullets. The player needs an exact hull-to-line view and start camera. The app needs countdown, rule state, line history, filters, and a decision log. Analytics need signed bow distance, time to line, speed build, line bias, crossing, OCS, and return.

**Audience strength**

Very high for sailors and race committees, high for coaches. Vakaros and Velocitek are investing most visibly here. World Sailing's 2026 framework names starts and finishes as its first application category.

**Data and simulation**

Needs a longer prestart, boat length and tracker offset, time-varying line endpoints, signal events, active starting rule, a seeded OCS boat, and its return. Model both ground truth and a lower-grade observed GPS feed if you want to explain confidence. The existing 10-second prestart and point-to-line reading can remain as a performance summary, but they cannot support a realistic full sequence or official-style hull test.

Line bias requires a declared comparison. In sailor language, show which end is closer to the windward mark or more upwind relative to the chosen course wind. Keep geometric and wind-based bias separate.

**Cost and work shape**

L, about 2 to 3 weeks. Mostly analysis and interface, with careful 3D hull geometry and interpolation. Rules tests are the largest verification burden.

**Place in the layout**

Selecting the `Start` phase switches the right pane from analyst-first to a start board. Its tabs are `Fleet`, `Line`, and `Committee log`. The central viewer gains a sight-line camera and a last-minute ghost trail. The timeline shows signal, gun, OCS, recall, and clear-return events.

**How a viewer checks it**

Draw the live line and each transformed hull outline at raw fixes. Show signed distance from the foremost hull point, not boat centre, to the line normal. Interpolate the exact crossing only between the two bracketing raw fixes. The event log must identify the rule in force and replay the return condition. A `Raw` toggle should expose the 4 Hz or simulated sensor samples behind every call.

### 4. Spatial wind and pressure replay

**What users call it**

"Who had pressure, and who was lifted?" Show the wind each boat actually sailed in, not one course-wide dial.

**Posting evidence**

The strongest pure 3D candidate. The player can draw sparse, legible wind streaks, pressure shading, and per-boat vectors. The application controls field, history, and comparison modes. Analytics attribute local pressure and direction differences without inventing a real weather model.

**Audience strength**

High for sailors and coaches. Medium for committees, who care about course-wide trend and readings at known locations. The America's Cup's LiDAR field is the frontier reference. Sailmon's much more attainable version shares coach or nearby wind and plots a three-minute trend ([vendor update, 12 January 2021](https://blog.sailmon.com/header-lift-wind-trends-and-app-updates-for-max)).

**Data and simulation**

Needs a deterministic `windAt(x, y, t)` with a background oscillation, cross-course gradient, and two advecting gust or lull cells. Publish local TWD and TWS on each boat fix or in a parallel per-boat series. The simulator, replay, instruments, and analytics must all call or read the same field.

Do not reproduce WindSightIQ's visual claim. Label this `Seeded wind field`, and include a compact source note that the field is simulation ground truth.

**Cost and work shape**

L, about 2 to 3 weeks. Mostly 3D and analysis. The main design problem is legibility and performance, not generating more particles.

**Place in the layout**

Add `Field`, `Boat wind`, and `History` layer modes. The right pane can compare two boats' pressure, heading relative to their local wind, and metres gained while their wind differed. A small course heat map can sit behind the existing 2D chart.

**How a viewer checks it**

Clicking a boat reveals its local vector and exact TWD and TWS. The instrument reading, vector direction, pressure color, and simulation input at that x/y/t must agree. For any claimed "pressure gain," show the selected time window and the boat-to-boat TWS difference beside the gap change. Phrase it as correlation unless the simulation performs a controlled counterfactual.

### 5. Fleet gain-and-loss debrief

**What users call it**

"Show me where we gained and lost." Let the user compare a boat to the leader, a named rival, the fleet median, or the best boat on that leg.

**Posting evidence**

Very strong for the React and analytics bullets, medium for the player. The 3D scene highlights the chosen interval and draws a ladder or separation measure. The interface turns race phases into a navigable diagnostic.

**Audience strength**

Very high for coaches and high for sailors. TracTrac's 2025 coaching material explicitly frames debriefs around places gained, fleet splits, VMG, and why the winner pulled away. SAP, MetaSail, raceQs, Sailmon, and newer 2026 tools all offer some form of fleet comparison.

**Data and simulation**

The existing fixes, progress samples, standings, maneuvers, race phases, and boat comparison support a useful first version. No simulation extension is required. Add derived segment boundaries for start, straight-line sailing, maneuver windows, rounding, and finish.

Avoid causal labels the telemetry cannot prove. `Lost 7 m during this tack window` is supported. `Lost 7 m because the jib was late` is not.

**Cost and work shape**

M, about 5 to 8 days. Mostly analysis and interface.

**Place in the layout**

Add a gain/loss ribbon above the existing timeline. Clicking a red or green segment seeks and loops the replay. The right pane shows the selected baseline, gap at entry and exit, SOG, VMG, distance sailed, and any maneuver. A coach can pin the segment to a `Debrief moments` list and export a link.

**How a viewer checks it**

Define gain as the change in along-course gap over the selected window, using the same distance-to-finish series as the standings. Print start gap, end gap, and delta. The visual separation ladder and the table must use the same baseline and sample times. For fleet median, show the boats included and use one shared interval.

### 6. Incident and rounding desk

**What users call it**

"Freeze it at the zone" or "show the crossing again." This is a review surface for mark approaches, overlaps, close crossings, contacts, penalties, and finish packs.

**Posting evidence**

Strong across all three bullets. It needs free camera and frame stepping, a purpose-built review UI, and geometry or event analysis. It also proves restraint: the interface presents facts and confidence rather than an automated rules verdict.

**Audience strength**

High for coaches, umpires, juries, and race committees. Medium for sailors. MetaSail markets synchronized slow-motion video to coaches, committees, and juries. World Sailing Appendix M confirms the value and limits of photographic evidence.

**Data and simulation**

Needs boat length and width, accurate hull reference points, a three-hull-length zone derived per relevant boat, and at least one deliberately seeded close rounding or crossing. Store original samples and derived event times. Optional camera footage should be generated from the replay itself, not presented as independent evidence.

Rules such as overlap, mark-room, and proper course depend on facts and context beyond a single distance. The first version should calculate geometry and timeline facts only.

**Cost and work shape**

L, about 2 to 3 weeks. Balanced 3D, interface, and analysis. A full rules engine would raise this well beyond L and is not recommended.

**Place in the layout**

Use a temporary four-part review mode: fleet or tactical viewer, synchronized top-down diagram, frame table, and evidence notes. Enter it from a timeline incident marker or pinned coach moment. Export a short clip or still with race ID, clock, raw or smooth mode, boats, sample rate, and metric definitions attached.

**How a viewer checks it**

Show raw hull poses at the bracketing fixes, the interpolated pose between them, distances and bearings, zone boundary, track source, and sample interval. Any derived event, such as first zone entry, links to the exact formula. A banner states `Geometry aid, not a rules decision` unless the fictional sailing instructions explicitly authorize a deterministic rule.

## 4. What to skip

| Feature to skip | Reason |
|---|---|
| More camera rigs | Chase, TV, and tactical already prove camera work. A fourth cinematic camera adds little user knowledge |
| Photoreal boats, venues, teams, and logos | Conflicts with the fictional-event constraint and spends time on assets rather than race understanding |
| Full SailGP-style sensor model | 125 channels per boat, foils, wing controls, and loads would be decorative without a credible simulation and user question |
| LiDAR-style volumetric wind | The useful part is spatial wind and synchronized explanation. A fake sensor aesthetic would overstate fidelity |
| Automatic protest verdicts | Rules decisions depend on event documents, testimony, facts, and evidence weight. World Sailing still treats most 2026 augmented systems as test or decision support |
| Centimetre-accuracy claims | Seeded ground truth can be mathematically exact, but it is not RTK hardware. Show separate truth and observed feeds if accuracy is part of the story |
| Live hardware ingestion | Valuable product work, weak portfolio return for this fictional prototype. It adds adapters and operational failure paths without improving the seeded demonstration |
| Handicap and rating scoring | The current event is a one-design sprint. ORC, IRC, PHRF, and pursuit scoring would widen scope without strengthening the named posting bullets |
| Generic dashboard builder | Expedition and Adrena already prove the dense configurable workstation. Layline should prove decisive defaults and linked evidence |
| More free-form AI analysis | The analyst already answers from telemetry and seeks moments. Build structured current, polar, start, and gain/loss tools that give the analyst better facts |
| Social feed, badges, and global leaderboards | Sailmon and raceQs cover community behavior. It does not demonstrate this role's core replay and analytics work |
| Real weather, tide, or event imports | They would make the fictional race look attached to a real venue and introduce provenance the prototype cannot honestly support |

## 5. Open questions

### User and workflow questions

1. **Which boat type does the employer's product center on?** Dinghy squads, foiling classes, grand-prix keelboats, and offshore navigators use different sensors and language. The job team's current customer and class mix would settle the weighting.
2. **Is the right pane meant to support a live debrief, solo analysis, or both?** Five interviews and screen recordings with a sailor, coach, PRO, judge or umpire, and event operator would settle the information density and export needs.
3. **What do users open first on a phone?** No independent 2025 or 2026 observational study of the tent-after-racing workflow was found. Product telemetry or short contextual interviews would be stronger than vendor feature pages.
4. **How many moments survive a real squad debrief?** A recording of two debriefs, including preparation time and what gets shared afterward, would set the moment-board design.

### Product questions

5. **Are Kattack's service and apps operating normally in 2026?** Its website and setup pages remain online, but a 2025 user report says the app stopped working. Confirmation from Kattack or a successful new event setup would settle this.
6. **How actively maintained is raceQs?** The site is live and marked 2026, but its highlighted races and much tutorial material are old. A dated release log, app-store history, or support response would settle current status.
7. **What exact export and comparison flows do current TracTrac, MetaSail, Sailmon, Vakaros, and SAP users rely on?** Public pages describe capabilities better than daily friction. Current user interviews and sample exports would settle interoperability priorities.

### Data and rules questions

8. **What is the required sensor reference point and uncertainty model for Category 2 starts and finishes?** World Sailing's 2026 page says technical and operational benchmarks are still being developed. The final recognition policy and test protocol would settle the evidence model.
9. **Which 2026 events have actually authorized Category 2 outputs to determine results?** World Sailing lists event options and assessments, not a complete deployment record. Notices of race, sailing instructions, and official reports from those events would settle adoption.
10. **How should current be measured or estimated for this product's target fleet?** A GPS-only dinghy, an instrumented keelboat with paddlewheel and compass, and an RTK event network support different answers. The employer's data schema and calibration method would settle this.
11. **Should percent of polar use a supplied design polar, a learned session polar, or a fleet benchmark?** Expedition, Adrena, and newer coaching products support different approaches. A target-class performance model and coach interviews would settle the default.
12. **What evidence may juries receive directly from the event system?** RRS 63 permits broad evidence and lets the protest committee assign weight, but each event's notice of race, sailing instructions, and recognized system category control whether an output guides or determines a call.

### Recommendation boundary

The first four candidates need simulation work. Build current before finalizing percent-of-polar so the speed reference stays honest. The fleet gain-and-loss debrief can ship against today's telemetry and is the best lower-risk feature if schedule cannot absorb a simulation extension. The incident desk should come after hull geometry and the start lab so both use one tested definition of boat shape, sample time, and line crossing.
