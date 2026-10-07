Created At: 2026-10-07T23:37:21+05:30
Completed At: 2026-10-07T23:37:22+05:30
File Path: `file:///c:/VisionGuard/Context1.md`
Total Lines: 1280
Total Bytes: 20575
Showing lines 1 to 800
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: 
2: # Vision Guard — Backend + AI/ML Fix & Model Plan
3: 
4: ## 1. Recommended ML Stack
5: 
6: | Requirement                 | Recommended Model/Tool              | Purpose                                | Train/Fine-tune? |
7: | --------------------------- | ----------------------------------- | -------------------------------------- | ---------------- |
8: | Person detection            | YOLO11n / YOLO11s                   | Detect people                          | No               |
9: | Tracking                    | ByteTrack                           | Maintain object IDs across frames      | No               |
10: | Knife/scissors/bat baseline | YOLO11 COCO                         | Detect supported COCO objects          | No               |
11: | Gun/firearm                 | Custom YOLO11s                      | Detect guns/pistols/rifles             | Yes              |
12: | Weapon detection            | Custom YOLO11s                      | Knife + gun + other weapons            | Yes              |
13: | Person pose                 | YOLO11n-pose                        | Wrist/hand/body keypoints              | No               |
14: | Holding weapon              | YOLO pose + weapon detector         | Determine whether weapon is being held | Custom logic     |
15: | Motion                      | Existing tracking + movement engine | Speed/direction/approach               | No               |
16: | Advanced suspicious motion  | Temporal model                      | Learn abnormal movement                | Future           |
17: | Risk classification         | Existing RiskEngine initially       | Combine evidence                       | No initially     |
18: 
19: ### Official resources
20: 
21: * YOLO11: [https://docs.ultralytics.com/models/yolo11](https://docs.ultralytics.com/models/yolo11)
22: * YOLO Detection: [https://docs.ultralytics.com/tasks/detect](https://docs.ultralytics.com/tasks/detect)
23: * YOLO Tracking: [https://docs.ultralytics.com/modes/track](https://docs.ultralytics.com/modes/track)
24: * YOLO Pose: [https://docs.ultralytics.com/datasets/pose](https://docs.ultralytics.com/datasets/pose)
25: 
26: ---
27: 
28: # 2. P0 — Core Scenario Cannot Reach HIGH
29: 
30: ### Problem
31: 
32: A person with a high-confidence knife held next to them can currently score around:
33: 
34: ```text
35: 0.56 → MEDIUM
36: ```
37: 
38: HIGH requires additional movement-related rules.
39: 
40: ### Fix
41: 
42: HIGH should be based on:
43: 
44: ```text
45: Person detected
46:       +
47: Weapon detected
48:       +
49: Weapon close to person
50:       +
51: Holding association
52:       +
53: Persistence
54:       ↓
55:     HIGH
56: ```
57: 
58: ### Suggested scoring
59: 
60: ```text
61: Weapon detection       0.40
62: Person proximity       0.25
63: Holding association    0.25
64: Persistence             gate
65: ```
66: 
67: ### Expected behavior
68: 
69: ```text
70: Person + knife in hand
71:         → HIGH
72: 
73: Person + knife on table
74:         → LOW/MEDIUM
75: 
76: Person running without weapon
77:         → LOW
78: ```
79: 
80: ### Model required?
81: 
82: Not necessarily, but **YOLO11n-pose is strongly recommended** for reliable holding detection.
83: 
84: ---
85: 
86: # 3. P0 — Secure `/config`
87: 
88: ### Problem
89: 
90: `POST /config` currently accepts arbitrary `model_path` values that eventually reach YOLO model loading.
91: 
92: Invalid values are also accepted:
93: 
94: ```text
95: detection_confidence_threshold = 5
96: frame_skip = 0
97: ```
98: 
99: ### Fix
100: 
101: Never accept arbitrary filesystem paths from the client.
102: 
103: Use an allow-list:
104: 
105: ```python
106: ALLOWED_MODELS = {
107:     "person": "models/yolo11n.pt",
108:     "weapon": "models/weapon_yolo11s.pt",
109: }
110: ```
111: 
112: The API should receive a model identifier rather than a filesystem path:
113: 
114: ```json
115: {
116:   "model": "weapon_yolo11s"
117: }
118: ```
119: 
120: ### Pydantic validation
121: 
122: ```python
123: detection_confidence_threshold: float = Field(
124:     ge=0.0,
125:     le=1.0
126: )
127: 
128: frame_skip: int = Field(
129:     ge=1,
130:     le=10
131: )
132: ```
133: 
134: ### Model required?
135: 
136: No.
137: 
138: ---
139: 
140: # 4. P0 — File Upload Security
141: 
142: ### Problems
143: 
144: * Client-controlled filenames
145: * Possible file overwriting
146: * No upload-size limit
147: * Client-supplied Content-Type is trusted
148: * Uploaded files are not cleaned up
149: * `/session/start` can accept arbitrary server paths
150: 
151: ### Fix
152: 
153: ```text
154: Upload
155:   ↓
156: Generate UUID
157:   ↓
158: uploads/<uuid>.mp4
159:   ↓
160: Validate actual video
161:   ↓
162: Create session
163:   ↓
164: Delete after session
165: ```
166: 
167: Return an opaque file ID instead of a server path.
168: 
169: **Never accept arbitrary filesystem paths from the client.**
170: 
171: ### Model required?
172: 
173: No.
174: 
175: ---
176: 
177: # 5. P1 — Live Model Switching
178: 
179: ### Problem
180: 
181: Each session creates its own Tracker and loads its model once.
182: 
183: Changing configuration later does not update the active tracker.
184: 
185: RiskEngine settings such as weights and persistence are also copied during initialization.
186: 
187: ### Fix: Risk configuration
188: 
189: ```text
190: Config snapshot
191:       ↓
192: Every evaluation
193:       ↓
194: RiskEngine
195: ```
196: 
197: ### Fix: Model switching
198: 
199: ```text
200: Request model change
201:        ↓
202: Load new model in background
203:        ↓
204: Wait until ready
205:        ↓
206: Atomically swap model
207:        ↓
208: Next frame uses new model
209: ```
210: 
211: Do not block the FastAPI event loop.
212: 
213: ### Model required?
214: 
215: No new model.
216: 
217: ---
218: 
219: # 6. P1 — YOLO Loading Blocks FastAPI
220: 
221: ### Problem
222: 
223: YOLO model construction happens synchronously when a session starts.
224: 
225: This can freeze other API requests.
226: 
227: ### Fix
228: 
229: Load models once during startup:
230: 
231: ```text
232: FastAPI startup
233:       ↓
234: Load YOLO
235:       ↓
236: Keep model in memory
237: ```
238: 
239: Share model weights across sessions while maintaining separate tracker state per stream.
240: 
241: For loading/replacing weights, use a worker/background process or thread.
242: 
243: ### Model required?
244: 
245: No.
246: 
247: ---
248: 
249: # 7. P1 — Correct Detection Stack
250: 
251: ### Problem
252: 
253: The default COCO YOLO model does **not** contain a generic `gun` or `weapon` class.
254: 
255: Relevant baseline classes include:
256: 
257: ```text
258: knife
259: scissors
260: baseball bat
261: ```
262: 
263: The tracker also needs to explicitly use ByteTrack.
264: 
265: ### Person model
266: 
267: Start with:
268: 
269: ```text
270: YOLO11n
271: ```
272: 
273: Use YOLO11s if additional accuracy is worth the performance cost.
274: 
275: ### Weapon model
276: 
277: Train/fine-tune:
278: 
279: ```text
280: YOLO11s
281: ```
282: 
283: Recommended classes:
284: 
285: ```text
286: knife
287: gun
288: pistol
289: rifle
290: scissors
291: baseball_bat
292: ```
293: 
294: Keep person and weapon detection conceptually separate if this makes the pipeline easier to control.
295: 
296: ### Tracker
297: 
298: Explicitly select ByteTrack:
299: 
300: ```python
301: model.track(
302:     frame,
303:     persist=True,
304:     tracker="bytetrack.yaml",
305:     conf=0.25,
306: )
307: ```
308: 
309: Only pass required classes.
310: 
311: Remove fake fallback IDs such as `1..n` when no tracking ID exists.
312: 
313: ---
314: 
315: # 8. Weapon Datasets
316: 
317: ## Gun + Knife
318: 
319: Roboflow Weapon Detection:
320: 
321: [https://universe.roboflow.com/oioii/weapon-detection-1cj3j-5au6h](https://universe.roboflow.com/oioii/weapon-detection-1cj3j-5au6h)
322: 
323: ## Broader Weapon Dataset
324: 
325: [https://universe.roboflow.com/train-yolov8-on-custom-dataset/weapon-detection-2ukqe](https://universe.roboflow.com/train-yolov8-on-custom-dataset/weapon-detection-2ukqe)
326: 
327: ## Gun Detection Collection
328: 
329: [https://universe.roboflow.com/use-cases/gun-detection](https://universe.roboflow.com/use-cases/gun-detection)
330: 
331: ### Recommended dataset strategy
332: 
333: Do not rely on one dataset.
334: 
335: Combine public datasets with your own webcam/test images.
336: 
337: Include:
338: 
339: ```text
340: knife clearly visible
341: knife partially hidden
342: knife in hand
343: knife near body
344: knife on table
345: knife far from person
346: fake knife
347: phone
348: pen
349: scissors
350: gun
351: toy gun
352: dark lighting
353: bright lighting
354: motion blur
355: multiple people
356: occlusion
357: ```
358: 
359: ---
360: 
361: # 9. P1 — Fix Movement Rules
362: 
363: ## Direction Change Problem
364: 
365: The current logic compares directions across different people in one frame.
366: 
367: That is not erratic movement.
368: 
369: Movement must be tracked **per person over time**.
370: 
371: Example:
372: 
373: ```text
374: Person #4
375: 
376: Frame 1 → →
377: Frame 2 → →
378: Frame 3 ↓
379: Frame 4 ←
380: Frame 5 ↑
381: ```
382: 
383: ### Fix
384: 
385: Store history per tracking ID:
386: 
387: ```python
388: track_history[track_id] = [
389:     position_t-5,
390:     position_t-4,
391:     position_t-3,
392:     position_t-2,
393:     position_t-1,
394:     position_t,
395: ]
396: ```
397: 
398: Calculate:
399: 
400: ```text
401: heading(t)
402: heading(t-1)
403: heading(t-2)
404: ```
405: 
406: Then detect significant heading changes over time.
407: 
408: ---
409: 
410: # 10. Speed Normalization
411: 
412: ### Problem
413: 
414: A threshold such as:
415: 
416: ```text
417: 100 px/s
418: ```
419: 
420: doesn't represent the same physical movement at different distances from the camera.
421: 
422: ### Short-term fix
423: 
424: Normalize by bounding-box height:
425: 
426: ```python
427: normalized_speed = pixel_speed / bbox_height
428: ```
429: 
430: ### Long-term fix
431: 
432: Calibrate the camera:
433: 
434: ```text
435: pixels → metres
436: ```
437: 
438: Eventually calculate:
439: 
440: ```text
441: m/s
442: ```
443: 
444: ### Model required?
445: 
446: No.
447: 
448: ---
449: 
450: # 11. Consistent Proximity Calculation
451: 
452: ### Problem
453: 
454: The system currently uses different distance definitions:
455: 
456: ```text
457: Bounding-box edge distance
458: Center-to-center distance
459: ```
460: 
461: This can incorrectly classify a knife on a table as dangerously close.
462: 
463: ### Fix
464: 
465: Use one consistent person-to-weapon relationship representation.
466: 
467: Associate each weapon with a specific person.
468: 
469: Feed this association into the holding detector.
470: 
471: ---
472: 
473: # 12. Holding Detection — YOLO11n-Pose
474: 
475: This is one of the most valuable ML improvements.
476: 
477: ### Model
478: 
479: ```text
480: YOLO11n-pose
481: ```
482: 
483: Official:
484: 
485: [https://docs.ultralytics.com/models/yolo11](https://docs.ultralytics.com/models/yolo11)
486: 
487: ### Pipeline
488: 
489: ```text
490: Weapon detector
491:       +
492: Pose detector
493:       +
494: Person tracker
495:       ↓
496: Association
497:       ↓
498: Weapon being held?
499: ```
500: 
501: Use:
502: 
503: ```text
504: left wrist
505: right wrist
506: left elbow
507: right elbow
508: ```
509: 
510: Compare weapon location against hand/forearm regions.
511: 
512: Conceptually:
513: 
514: ```text
515: Person
516:  |
517:  ├── left wrist
518:  ├── right wrist
519:  ├── left elbow
520:  └── right elbow
521: 
522: Weapon
523:  |
524:  ↓
525: Distance to wrist
526: +
527: Overlap with hand/forearm region
528:  ↓
529: Holding probability
530: ```
531: 
532: This distinguishes:
533: 
534: ```text
535: knife near person
536: ```
537: 
538: from:
539: 
540: ```text
541: knife being held by person
542: ```
543: 
544: ---
545: 
546: # 13. P1 — Fix LOW_CONFIDENCE
547: 
548: ### Problem
549: 
550: The tracker currently filters detections before RiskEngine receives them.
551: 
552: Therefore RiskEngine cannot properly classify low-confidence detections.
553: 
554: ### Fix
555: 
556: Separate detection and risk thresholds:
557: 
558: ```text
559: Model detection threshold
560:         ↓
561:        0.15
562:         ↓
563: Risk threshold
564:         ↓
565:        0.30
566: ```
567: 
568: Example:
569: 
570: ```text
571: confidence < 0.30
572:         ↓
573: LOW_CONFIDENCE
574: ```
575: 
576: Keep low-confidence detections available for risk semantics while limiting their contribution to the actual risk score.
577: 
578: ---
579: 
580: # 14. P1 — Streaming Lifecycle
581: 
582: ### Problems
583: 
584: * Camera may remain locked
585: * WebSocket disconnects don't always stop sessions
586: * Multiple WebSockets can use one session
587: * Uploaded videos loop forever
588: 
589: ### Fix
590: 
591: Use a session state machine:
592: 
593: ```text
594: created
595:    ↓
596: running
597:    ↓
598: stopping
599:    ↓
600: stopped
601: ```
602: 
603: Always release the camera:
604: 
605: ```python
606: try:
607:     while running:
608:         ...
609: finally:
610:     cap.release()
611: ```
612: 
613: Use one capture loop per session.
614: 
615: ### Uploaded videos
616: 
617: ```text
618: loop = false
619: ```
620: 
621: At the end:
622: 
623: ```text
624: END_OF_STREAM
625: ```
626: 
627: ---
628: 
629: # 15. P1 — Latency & Frame Handling
630: 
631: ### Problems
632: 
633: * Camera buffer can grow
634: * Old frames are processed
635: * Frame skipping can make playback choppy
636: * Fixed 640×480 can distort sources
637: * JPEG + Base64 + JSON is expensive
638: * Logging occurs every frame
639: * GPU settings aren't explicit
640: 
641: ### Recommended backend architecture
642: 
643: ```text
644: Camera
645:   ↓
646: Latest-frame buffer
647:   ↓
648: YOLO worker
649:   ↓
650: Latest detection
651:   ↓
652: Streaming layer
653: ```
654: 
655: Always process the **latest available frame** rather than building a backlog.
656: 
657: ---
658: 
659: # 16. Frame Skipping
660: 
661: Do not discard frames from the display pipeline just because YOLO isn't processing them.
662: 
663: Better architecture:
664: 
665: ```text
666: Camera FPS = 30
667: YOLO FPS   = 10
668: ```
669: 
670: ```text
671: Frame 1 → YOLO inference
672: Frame 2 → use latest detection
673: Frame 3 → YOLO inference
674: Frame 4 → use latest detection
675: ...
676: ```
677: 
678: This allows smooth video while reducing inference load.
679: 
680: ---
681: 
682: # 17. Preserve Source Resolution
683: 
684: Do not force every input to 640×480.
685: 
686: Backend should preserve:
687: 
688: ```json
689: {
690:   "width": 1280,
691:   "height": 720
692: }
693: ```
694: 
695: YOLO can still use:
696: 
697: ```text
698: imgsz=640
699: ```
700: 
701: for inference initially.
702: 
703: ---
704: 
705: # 18. P1 — Evidence System
706: 
707: ### Problem
708: 
709: Incidents should not exist only temporarily in memory.
710: 
711: ### Fix
712: 
713: Create an incident whenever HIGH transitions:
714: 
715: ```text
716: MEDIUM → HIGH
717: ```
718: 
719: Save:
720: 
721: ```text
722: incident_001.jpg
723: incident_001.json
724: ```
725: 
726: Example:
727: 
728: ```json
729: {
730:   "timestamp": "...",
731:   "risk": "HIGH",
732:   "score": 0.87,
733:   "reasons": [
734:     "weapon_detected",
735:     "weapon_near_person",
736:     "holding_detected"
737:   ],
738:   "objects": [],
739:   "config": {}
740: }
741: ```
742: 
743: Backend endpoints:
744: 
745: ```text
746: GET /api/incidents
747: GET /api/incidents/{id}
748: GET /api/incidents/{id}/image
749: ```
750: 
751: Define a retention period.
752: 
753: ---
754: 
755: # 19. Authentication & API Security
756: 
757: ## Local college demo
758: 
759: Bind to:
760: 
761: ```text
762: 127.0.0.1
763: ```
764: 
765: ## Network deployment
766: 
767: Add:
768: 
769: ```text
770: API key
771: ```
772: 
773: or:
774: 
775: ```text
776: JWT authentication
777: ```
778: 
779: Make CORS configurable through environment variables.
780: 
781: Mount API routes once under:
782: 
783: ```text
784: /api
785: ```
786: 
787: ---
788: 
789: # 20. Config Handling
790: 
791: ### Problem
792: 
793: Partial updates can replace the entire weights dictionary.
794: 
795: For example:
796: 
797: ```json
798: {
799:   "unsafe_object": 0.9
800: }
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.
