# Probe results

Every requirement was checked twice: on the intact sources, and on a copy in which `test/probes/<ID>.patch` breaks that one requirement. A rubric belongs in the gate when it passes the first and fails the second.

- Date: 2026-09-29
- Model: jev-1.13.0
- jev-spec: 0.3.0 at 2ab4b40
- Caught: 23 of 23

| Requirement | Target | Rubric | Intact | Broken | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-ANSWER-01 | answers | REQ-ANSWER-01 | 0.95 | 0.29 | caught |
| REQ-ANSWER-03 | answers | REQ-ANSWER-03 | 0.97 | 0.07 | caught |
| REQ-API-01 | apiAnswers | REQ-API-01 | 0.96 | 0.05 | caught |
| REQ-CONFIG-01 | configuration | REQ-CONFIG-01 | 0.97 | 0.52 | caught |
| REQ-CONFIG-02 | configuration | REQ-CONFIG-02 | 0.96 | 0.09 | caught |
| REQ-CONFIG-03 | configuration | REQ-CONFIG-03 | 0.93 | 0.77 | caught |
| REQ-CONFIG-04 | configuration | REQ-CONFIG-04 | 0.98 | 0.53 | caught |
| REQ-CONFIG-05 | configuration | REQ-CONFIG-05 | 0.92 | 0.07 | caught |
| REQ-DIFF-01 | diffRuns | REQ-DIFF-01 | 0.94 | 0.35 | caught |
| REQ-DIFF-02 | diffRuns | REQ-DIFF-02 | 0.11 | 0.92 | caught |
| REQ-DIFF-03 | diffRuns | REQ-DIFF-03 | 0.90 | 0.16 | caught |
| REQ-EXIT-01 | exitCodes | REQ-EXIT-01 | 0.96 | 0.03 | caught |
| REQ-EXIT-02 | exitCodes | REQ-EXIT-02 | 0.92 | 0.15 | caught |
| REQ-EXIT-03 | exitCodes | REQ-EXIT-03 | 0.97 | 0.08 | caught |
| REQ-EXIT-04 | exitCodes | REQ-EXIT-04 | 0.91 | 0.10 | caught |
| REQ-GIT-01 | git | REQ-GIT-01 | 0.04 | 0.93 | caught |
| REQ-GIT-03 | git | REQ-GIT-03 | 0.97 | 0.03 | caught |
| REQ-PATH-01 | paths | REQ-PATH-01 | 0.96 | 0.35 | caught |
| REQ-PATH-02 | paths | REQ-PATH-02 | 0.96 | 0.23 | caught |
| REQ-PATH-03 | paths | REQ-PATH-03 | 0.06 | 0.94 | caught |
| REQ-PATH-04 | paths | REQ-PATH-04 | 0.98 | 0.37 | caught |
| REQ-READ-02 | diffContent | REQ-READ-02 | 0.95 | 0.06 | caught |
| REQ-RUN-01 | run | REQ-RUN-01 | 0.96 | 0.09 | caught |
