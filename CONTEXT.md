# Domain glossary

**Publication**: An EPUB package and its linked resources treated as one structured document.

**Target reader**: The pinned reader build whose behavior is being investigated.

**Scenario**: The ordered user actions and expected outcome used to exercise a publication in a target reader.

**Oracle**: The rule that turns observations from a scenario into a verdict.

**Observation**: Raw evidence captured from an executed scenario, such as the active section, visible heading, element geometry, console errors, or screenshots.

**Verdict**: One of `PRESERVED`, `LOST`, `BLOCKED`, or `INCONCLUSIVE`.

**PRESERVED**: The candidate still exhibits the reported failure under the oracle.

**LOST**: The candidate no longer exhibits the reported failure under the oracle.

**BLOCKED**: The scenario could not reach the point where the oracle can judge it.

**INCONCLUSIVE**: The scenario ran, but the observations are insufficient or contradictory.

**Candidate**: A publication variant being evaluated during sanitization or reduction.

**Sanitization**: Replacing or removing identifying, private, copyrighted, or remote content while retaining structure that may be relevant to the failure.

**Reduction**: Removing publication structure that is unnecessary for preserving the failure.

**Witness run**: An independent execution of a candidate against the target reader that captures observations and a verdict.

**Repro bundle**: The shareable output containing the reduced publication, scenario, receipt, reduction history, privacy findings, and evidence.

**Receipt**: A machine-readable record of the exact inputs, environment, hashes, verdict, artifacts, and cleanup state for a witness run.
