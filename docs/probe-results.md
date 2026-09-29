# Probe results

Every requirement was checked twice: on the intact sources, and on a copy in which `test/probes/<ID>.patch` breaks that one requirement. A rubric belongs in the gate when it passes the first and fails the second. The Intact and Broken columns give the probability of "yes": for a question that correct code answers "no", such as whether git is started through a shell, intact code scores low and broken code high.

- Date: 2026-09-29
- Model: jev-1.13.0
- jev-spec: 0.3.0 at 79da962
- Caught: 29 of 29

| Requirement | Target | Rubric | Intact | Broken | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-ANSWER-01 | answers | REQ-ANSWER-01 | 0.96 | 0.39 | caught |
| REQ-ANSWER-03 | answers | REQ-ANSWER-03 | 0.97 | 0.09 | caught |
| REQ-ANSWER-04 | answers | REQ-ANSWER-04 | 0.96 | 0.41 | caught |
| REQ-API-01 | apiAnswers | REQ-API-01 | 0.96 | 0.07 | caught |
| REQ-API-02 | apiAnswers | REQ-API-02 | 0.91 | 0.09 | caught |
| REQ-CONFIG-01 | configuration | REQ-CONFIG-01 | 0.98 | 0.59 | caught |
| REQ-CONFIG-02 | configuration | REQ-CONFIG-02 | 0.97 | 0.09 | caught |
| REQ-CONFIG-03 | configuration | REQ-CONFIG-03 | 0.93 | 0.63 | caught |
| REQ-CONFIG-04 | configuration | REQ-CONFIG-04 | 0.98 | 0.56 | caught |
| REQ-CONFIG-05 | configuration | REQ-CONFIG-05 | 0.93 | 0.07 | caught |
| REQ-CONFIG-06 | configuration | REQ-CONFIG-06 | 0.97 | 0.12 | caught |
| REQ-DIFF-01 | diffRuns | REQ-DIFF-01 | 0.94 | 0.23 | caught |
| REQ-DIFF-02 | diffRuns | REQ-DIFF-02 | 0.08 | 0.87 | caught |
| REQ-DIFF-03 | diffRuns | REQ-DIFF-03 | 0.89 | 0.21 | caught |
| REQ-EXIT-01 | exitCodes | REQ-EXIT-01 | 0.93 | 0.07 | caught |
| REQ-EXIT-02 | exitCodes | REQ-EXIT-02 | 0.92 | 0.28 | caught |
| REQ-EXIT-03 | exitCodes | REQ-EXIT-03 | 0.96 | 0.10 | caught |
| REQ-EXIT-04 | exitCodes | REQ-EXIT-04 | 0.94 | 0.10 | caught |
| REQ-EXIT-05 | exitCodes | REQ-EXIT-05 | 0.93 | 0.10 | caught |
| REQ-GIT-01 | git | REQ-GIT-01 | 0.05 | 0.93 | caught |
| REQ-GIT-03 | git | REQ-GIT-03 | 0.96 | 0.03 | caught |
| REQ-PATH-01 | paths | REQ-PATH-01 | 0.96 | 0.31 | caught |
| REQ-PATH-02 | paths | REQ-PATH-02 | 0.96 | 0.25 | caught |
| REQ-PATH-03 | paths | REQ-PATH-03 | 0.06 | 0.94 | caught |
| REQ-PATH-04 | paths | REQ-PATH-04 | 0.98 | 0.32 | caught |
| REQ-READ-02 | diffContent | REQ-READ-02 | 0.96 | 0.05 | caught |
| REQ-RUN-01 | run | REQ-RUN-01 | 0.95 | 0.20 | caught |
| REQ-RUN-02 | run | REQ-RUN-02 | 0.93 | 0.33 | caught |
| REQ-RUN-03 | run | REQ-RUN-03 | 0.90 | 0.21 | caught |
