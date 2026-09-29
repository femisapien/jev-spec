# Probe results

Every requirement was checked twice: on the intact sources, and on a copy in which `test/probes/<ID>.patch` breaks that one requirement. A rubric belongs in the gate when it passes the first and fails the second. The Intact and Broken columns give the probability of "yes": for a question that correct code answers "no", such as whether git is started through a shell, intact code scores low and broken code high.

- Date: 2026-09-29
- Model: jev-1.13.0
- jev-spec: 0.4.0 at e27c59d
- Caught: 29 of 29

| Requirement | Target | Rubric | Intact | Broken | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-ANSWER-01 | answers | REQ-ANSWER-01 | 0.96 | 0.36 | caught |
| REQ-ANSWER-03 | answers | REQ-ANSWER-03 | 0.97 | 0.08 | caught |
| REQ-ANSWER-04 | answers | REQ-ANSWER-04 | 0.96 | 0.38 | caught |
| REQ-API-01 | apiAnswers | REQ-API-01 | 0.97 | 0.08 | caught |
| REQ-API-02 | apiAnswers | REQ-API-02 | 0.92 | 0.07 | caught |
| REQ-CONFIG-01 | configuration | REQ-CONFIG-01 | 0.98 | 0.52 | caught |
| REQ-CONFIG-02 | configuration | REQ-CONFIG-02 | 0.97 | 0.10 | caught |
| REQ-CONFIG-03 | configuration | REQ-CONFIG-03 | 0.94 | 0.59 | caught |
| REQ-CONFIG-04 | configuration | REQ-CONFIG-04 | 0.98 | 0.47 | caught |
| REQ-CONFIG-05 | configuration | REQ-CONFIG-05 | 0.93 | 0.07 | caught |
| REQ-CONFIG-06 | configuration | REQ-CONFIG-06 | 0.97 | 0.11 | caught |
| REQ-DIFF-01 | diffRuns | REQ-DIFF-01 | 0.93 | 0.39 | caught |
| REQ-DIFF-02 | diffRuns | REQ-DIFF-02 | 0.11 | 0.92 | caught |
| REQ-DIFF-03 | diffRuns | REQ-DIFF-03 | 0.90 | 0.15 | caught |
| REQ-EXIT-01 | exitCodes | REQ-EXIT-01 | 0.94 | 0.07 | caught |
| REQ-EXIT-02 | exitCodes | REQ-EXIT-02 | 0.92 | 0.25 | caught |
| REQ-EXIT-03 | exitCodes | REQ-EXIT-03 | 0.96 | 0.12 | caught |
| REQ-EXIT-04 | exitCodes | REQ-EXIT-04 | 0.93 | 0.10 | caught |
| REQ-EXIT-05 | exitCodes | REQ-EXIT-05 | 0.94 | 0.12 | caught |
| REQ-GIT-01 | git | REQ-GIT-01 | 0.05 | 0.92 | caught |
| REQ-GIT-03 | git | REQ-GIT-03 | 0.96 | 0.03 | caught |
| REQ-PATH-01 | paths | REQ-PATH-01 | 0.96 | 0.49 | caught |
| REQ-PATH-02 | paths | REQ-PATH-02 | 0.96 | 0.23 | caught |
| REQ-PATH-03 | paths | REQ-PATH-03 | 0.06 | 0.94 | caught |
| REQ-PATH-04 | paths | REQ-PATH-04 | 0.98 | 0.49 | caught |
| REQ-READ-02 | diffContent | REQ-READ-02 | 0.95 | 0.06 | caught |
| REQ-RUN-01 | run | REQ-RUN-01 | 0.95 | 0.22 | caught |
| REQ-RUN-02 | run | REQ-RUN-02 | 0.92 | 0.19 | caught |
| REQ-RUN-03 | run | REQ-RUN-03 | 0.87 | 0.21 | caught |
