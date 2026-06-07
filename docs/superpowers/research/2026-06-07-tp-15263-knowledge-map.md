# Research Note — TP‑15263 Knowledge Map (Basic vs Advanced)

> Date: 2026-06-07 · For: bilingual lesson content design (`../specs/2026-06-07-basic-advanced-lesson-content-design.md`)
> Method: targeted authoritative fetch of the official TP‑15263 page, cross‑checked against the **RPAS 101** guide (primary source already in hand). This is an internal knowledge map, not a standalone report — a full multi‑source deep‑research report would be disproportionate for a single authoritative government source (the deep‑research skill's own decision tree routes single‑source extraction to a focused fetch).

## Sources
- **[S1]** Transport Canada, *TP‑15263 — Knowledge Requirements for Pilots of RPAS (250 g up to 150 kg), Basic & Advanced Operations.* https://tc.canada.ca/en/aviation/publications/knowledge-requirements-pilots-remotely-piloted-aircraft-systems-250-g-including-150-kg-basic-advanced-operations-tp-15263 (§ "Knowledge areas", #toc5).
- **[S2]** Transport Canada / AEAC, *RPAS 101 — A General Knowledge Guide for Canadian RPAS Pilots* (provided PDF). Used as the tie‑breaker on specifics.

## Headline result: the 8 TP‑15263 sections **are** the 8 modules

| TP‑15263 Section | Module id |
|---|---|
| 1. Air Law, Air Traffic Rules & Procedures | `air-law` |
| 2. RPA Airframes, Power Plants, Propulsion & Systems | `airframes-systems` |
| 3. Human Factors | `human-factors` |
| 4. Meteorology | `meteorology` |
| 5. Navigation | `navigation` |
| 6. Flight Operations | `flight-operations` |
| 7. Theory of Flight | `theory-of-flight` |
| 8. Radiotelephony | `radiotelephony` |

## Basic scope vs Advanced‑only additions

| Module | Tested at **Basic** (foundation) | **Advanced‑only** additions |
|---|---|---|
| **air-law** | Aeronautics Act defs; CARs Part I/III/VI; Part IX Div I–III (general rules, registration); **Subpart 1 Div IV — Basic operating limits**; airspace structure & classification (awareness); TSB reporting; MF/ATF awareness | **Controlled‑airspace operations (901.71)**; **Subpart 1 Div V — Advanced ops requirements** (near/over people); Division X (training & flight review); **SFOC‑RPAS** |
| **airframes-systems** | Everything (airframe, electrical, data links, batteries+transport, autopilot/flight‑termination, payloads, propulsion, launch/recovery, maintenance/logs, compass/altimeter/ASI/IMU) | — (none) |
| **human-factors** | Everything (physiology, pilot+environment, psychology/decision‑making/SA/attitudes, pilot‑equipment/SOPs/automation/complacency, interpersonal/CRM/pressures) | — (none) |
| **meteorology** | Atmosphere, pressure, altimetry, clouds, surface layers (fog), turbulence, wind, **icing**, met services, METAR/AWOS | **Moisture/lapse rate**, **stability/instability**, **fronts & frontal weather**, **thunderstorm development & hazards**, **TAF** interpretation |
| **navigation** | Definitions (lat/long/track/heading/variation/drift), maps & charts (VNC/VTA/CFS), time/UTC, pilot navigation, flight planning (NOTAMs/W&B/docs/wind), **radio theory** (RF/bands/interference) | **GNSS/GPS principles + augmentation (DGPS)**, **ATC radar transponder** |
| **flight-operations** | PIC responsibilities, performance, W&B, critical‑surface contamination, **VLOS ops** (site survey, crew brief, emergency procedures, comms, post‑flight), OSH | **EVLOS**, **sheltered operations** |
| **theory-of-flight** | Everything (principles, parts, 4 forces, stability, aerofoils, props/rotors, controls fixed/heli/multirotor dynamics, load factor) | — (none) |
| **radiotelephony** | Basic radio theory lives under **Navigation** (above); communications terminology awareness | Aviation **radiotelephony / ATC comms** depth (the practical use that pairs with controlled airspace) |

Exam params [S1]: **Basic** 35 Q / 90 min / 65%; **Advanced** 50 Q / 60 min / 80%.

## Reconciliations / caveats (RPAS 101 as tie‑breaker)
- **ROC‑A:** the fetched summary asserted ROC‑A is *mandatory for both* levels. **RPAS 101 [S2] contradicts this:** holding a ROC‑A is **not required**; the *knowledge* is "essential for **Advanced**" pilots (controlled‑airspace terminology). → Full aviation radiotelephony/ROC‑A/ATC content goes in the **Advanced** course; Basic keeps only the radio *theory* that TP‑15263 files under Navigation.
- **Thunderstorms:** meteorological *depth* (development, microbursts, TAF) is Advanced‑only [S1], but "don't fly within ~15 NM of a thunderstorm" is basic operational safety [S2]. → Basic meteorology keeps a short thunderstorm **avoidance** note; the **mechanism** depth goes to Advanced meteorology.

## Resulting lesson decisions (updates the spec blueprint)
- **Basic = 8 lessons**, one per section, with `air-law` split in two (foundations + operating limits) and `radiotelephony` folded into Basic Navigation/Flight‑Ops.
- **Advanced = 5 lessons** (the delta): advanced operating environments (controlled airspace, near/over people, Safety Assurance/Std 922, SFOC); airspace classes & NAV CANADA authorization (+GNSS/DGPS, transponder); aviation communications (ROC‑A/ATC); advanced meteorology; advanced ops (EVLOS/sheltered + flight review).
