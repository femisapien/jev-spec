# Fail closed

jev-spec is a gate. A mistake in the setup stops the run, and an answer that cannot be read fails the check. Neither may turn into a check that passes without having checked anything.

## Configuration

### REQ-CONFIG-01: A configuration declares at least one target

A configuration that declares no target is rejected.

### REQ-CONFIG-02: An assertion belongs to a rubric

An assertion whose key is not the name of a rubric of the same target is rejected. A misspelled key would otherwise leave that rubric without any condition.

### REQ-CONFIG-03: Assertion options fit the type of the rubric

An assertion option that does not belong to the type of its rubric is rejected, for example a score threshold on a yes/no rubric.

### REQ-CONFIG-04: Thresholds are in range

A probability threshold or a confidence threshold outside the range from 0 to 1 is rejected. A score threshold outside the levels of its rubric is rejected as well.

### REQ-CONFIG-05: Validation reports every problem at once

Validation collects every problem it finds and reports them together, each with the path of the offending entry in the configuration.

### REQ-CONFIG-06: Client options have the type they are read as

A client option of the wrong type is rejected. `allowCustomBaseUrl` and `mock` must be `true` or `false`, `baseUrl` an http or https URL, `timeoutMs` a positive number, and `apiKey` and `model` non-empty strings. A string such as `"false"` would otherwise read as true and enable a custom endpoint or the mock evaluator.

## Runs

### REQ-RUN-01: A run validates the configuration first

A run validates the configuration before it reads a spec, reads code or creates the client of the API.

### REQ-RUN-02: Code that does not fit in one request stops the run

A run reads the code of every target it checks before it sends anything. When a code file of such a target is larger than the size limit, or the code of such a target is longer than the character budget, the run stops with an error that names each target and file concerned, and no target is evaluated. A dry run stops the same way. A target that a diff run skips is not concerned.

## Answers

### REQ-ANSWER-01: A value outside its range fails

When the probability or the confidence of an answer is not a number from 0 to 1, or the score of an answer is not a number from 0 to the highest level of its rubric, the assertion on that answer fails. The levels of a rubric are numbered from 0, and NaN lies outside every range.

### REQ-API-01: A value the API did not return as a number is not converted

The live evaluator takes the probability, the confidence and the score of an answer only when the API returned them as numbers. Any other value, such as `null` or the string `"0.99"`, is replaced by NaN, which fails its assertion, and is never converted into a number.

### REQ-ANSWER-03: A rubric without an assertion is informational

A rubric that has no assertion does not affect whether the check passes.
